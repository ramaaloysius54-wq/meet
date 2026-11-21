"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  ConnectionState,
  Participant,
  Room,
  RoomEvent,
  Track
} from "livekit-client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { LiveParticipantTile } from "@/types";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { createClient } from "@/lib/supabase/client";

interface UseLiveKitRoomOptions {
  meetingCode: string;
  token: string | null;
  serverUrl: string | null;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  isHost: boolean;
  enabled: boolean;
}

interface MeshPeerMeta {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];

function mapQuality(q: ConnectionQuality): LiveParticipantTile["connectionQuality"] {
  if (q === ConnectionQuality.Excellent) return "excellent";
  if (q === ConnectionQuality.Good) return "good";
  if (q === ConnectionQuality.Poor) return "poor";
  return "unknown";
}

export function useLiveKitRoom({
  meetingCode,
  token,
  serverUrl,
  userId,
  userName,
  avatarUrl,
  isHost,
  enabled
}: UseLiveKitRoomOptions) {
  const setTiles = useMeetingStore((s) => s.setTiles);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const roomRef = useRef<Room | null>(null);
  const localMediaStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);

  // Lazy-initialized Map refs (aman terhadap React Fast Refresh / HMR & tidak recreate tiap render)
  const meshChannelRef = useRef<RealtimeChannel | null>(null);
  const peerConnectionsRef = useRef | null>(null);
  const remoteStreamsRef = useRef | null>(null);
  const peerMetaRef = useRef | null>(null);
  const pendingIceRef = useRef | null>(null);

  const getPeerConnections = useCallback(() => {
    if (!(peerConnectionsRef.current instanceof Map)) {
      peerConnectionsRef.current = new Map();
    }
    return peerConnectionsRef.current;
  }, []);

  const getRemoteStreams = useCallback(() => {
    if (!(remoteStreamsRef.current instanceof Map)) {
      remoteStreamsRef.current = new Map();
    }
    return remoteStreamsRef.current;
  }, []);

  const getPeerMeta = useCallback(() => {
    if (!(peerMetaRef.current instanceof Map)) {
      peerMetaRef.current = new Map();
    }
    return peerMetaRef.current;
  }, []);

  const getPendingIce = useCallback(() => {
    if (!(pendingIceRef.current instanceof Map)) {
      pendingIceRef.current = new Map();
    }
    return pendingIceRef.current;
  }, []);

  const [connectionState, setConnectionState] = useState<string>("disconnected");
  const [isSFUConnected, setIsSFUConnected] = useState(false);
  const [sfuNotice, setSfuNotice] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");

  const isMutedRef = useRef<boolean>(isMuted);
  const isVideoOffRef = useRef<boolean>(isVideoOff);
  const isScreenSharingRef = useRef<boolean>(isScreenSharing);

  if (typeof isMutedRef.current !== "boolean") isMutedRef.current = isMuted;
  if (typeof isVideoOffRef.current !== "boolean") isVideoOffRef.current = isVideoOff;
  if (typeof isScreenSharingRef.current !== "boolean") isScreenSharingRef.current = isScreenSharing;

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isVideoOffRef.current = isVideoOff;
  }, [isVideoOff]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === "audioinput");
      const videos = devices.filter((d) => d.kind === "videoinput");
      setAudioDevices(audios);
      setVideoDevices(videos);
      if (!selectedAudioId && audios[0]) setSelectedAudioId(audios[0].deviceId);
      if (!selectedVideoId && videos[0]) setSelectedVideoId(videos[0].deviceId);
    } catch {
      // Ignore permission errors before prompt
    }
  }, [selectedAudioId, selectedVideoId]);

  const syncLiveKitTiles = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const mapParticipant = (p: Participant, local: boolean): LiveParticipantTile => {
      let meta: { isHost?: boolean; avatarUrl?: string | null } = {};
      try {
        meta = p.metadata ? JSON.parse(p.metadata) : {};
      } catch {
        meta = {};
      }

      const camPub = p.getTrackPublication(Track.Source.Camera);
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const scrPub = p.getTrackPublication(Track.Source.ScreenShare);
      const scrAudioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);

      const hasActiveScreen = Boolean(
        scrPub?.track?.mediaStreamTrack &&
          scrPub.track.mediaStreamTrack.readyState === "live" &&
          !scrPub.isMuted
      );

      return {
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: local ? avatarUrl : meta.avatarUrl || null,
        isLocal: local,
        isHost: local ? isHost : Boolean(meta.isHost),
        isMuted: micPub ? micPub.isMuted : true,
        isVideoOff: camPub ? camPub.isMuted || !camPub.track : true,
        isSpeaking: p.isSpeaking,
        isScreenSharing: hasActiveScreen,
        connectionQuality: mapQuality(p.connectionQuality),
        videoTrack: camPub?.track?.mediaStreamTrack || null,
        audioTrack: micPub?.track?.mediaStreamTrack || null,
        screenTrack: hasActiveScreen ? scrPub?.track?.mediaStreamTrack || null : null,
        screenAudioTrack: hasActiveScreen ? scrAudioPub?.track?.mediaStreamTrack || null : null
      };
    };

    const localTile = mapParticipant(room.localParticipant, true);
    setIsScreenSharing(localTile.isScreenSharing);

    const allTiles: LiveParticipantTile[] = [
      localTile,
      ...Array.from(room.remoteParticipants.values()).map((rp) => mapParticipant(rp, false))
    ];
    setTiles(allTiles);
  }, [avatarUrl, isHost, setTiles]);

  // Sinkronisasi Tile Local + Semua Remote Peer di mode WebRTC Mesh
  const syncMeshTiles = useCallback(() => {
    const stream = localMediaStreamRef.current;
    const screen = localScreenStreamRef.current;
    const vTrack = stream?.getVideoTracks()[0] || null;
    const aTrack = stream?.getAudioTracks()[0] || null;
    const sTrack = screen?.getVideoTracks()[0] || null;
    const sAudioTrack = screen?.getAudioTracks()[0] || null;
    const screenActive =
      isScreenSharingRef.current && Boolean(sTrack) && sTrack?.readyState === "live";

    const localTile: LiveParticipantTile = {
      identity: userId,
      name: userName,
      avatarUrl,
      isLocal: true,
      isHost,
      isMuted: isMutedRef.current || !aTrack,
      isVideoOff: isVideoOffRef.current || !vTrack,
      isSpeaking: !isMutedRef.current && Boolean(aTrack),
      isScreenSharing: screenActive,
      connectionQuality: "excellent",
      videoTrack: isVideoOffRef.current ? null : vTrack,
      audioTrack: aTrack,
      screenTrack: screenActive ? sTrack : null,
      screenAudioTrack: screenActive ? sAudioTrack : null
    };

    const remoteStreams = getRemoteStreams();
    const remoteTiles: LiveParticipantTile[] = [];

    getPeerMeta().forEach((meta, peerId) => {
      if (peerId === userId) return;
      const rStream = remoteStreams.get(peerId);
      const rVideo = rStream?.getVideoTracks().find((t) => t.readyState === "live") || null;
      const rAudio = rStream?.getAudioTracks().find((t) => t.readyState === "live") || null;
      const peerSharing = meta.isScreenSharing && Boolean(rVideo);

      remoteTiles.push({
        identity: peerId,
        name: meta.name,
        avatarUrl: meta.avatarUrl,
        isLocal: false,
        isHost: meta.isHost,
        isMuted: meta.isMuted || !rAudio,
        isVideoOff: peerSharing ? false : meta.isVideoOff || !rVideo,
        isSpeaking: !meta.isMuted && Boolean(rAudio),
        isScreenSharing: peerSharing,
        connectionQuality: rStream ? "good" : "unknown",
        videoTrack: peerSharing || meta.isVideoOff ? null : rVideo,
        audioTrack: rAudio,
        screenTrack: peerSharing ? rVideo : null
      });
    });

    setTiles([localTile, ...remoteTiles]);
  }, [avatarUrl, getPeerMeta, getRemoteStreams, isHost, setTiles, userId, userName]);

  const trackMeshPresence = useCallback(async () => {
    const ch = meshChannelRef.current;
    if (!ch || typeof ch.track !== "function") return;
    await ch.track({
      userId,
      name: userName,
      avatarUrl: avatarUrl || null,
      isHost,
      isMuted: isMutedRef.current,
      isVideoOff: isVideoOffRef.current,
      isScreenSharing: isScreenSharingRef.current
    });
  }, [avatarUrl, isHost, userId, userName]);

  const replaceMeshTrack = useCallback(
    async (kind: "audio" | "video", nextTrack: MediaStreamTrack | null) => {
      for (const pc of getPeerConnections().values()) {
        const sender =
          pc.getSenders().find((s) => s.track?.kind === kind) ||
          pc.getTransceivers().find((t) => t.receiver.track?.kind === kind)?.sender;
        if (sender) {
          await sender.replaceTrack(nextTrack).catch(() => {});
        }
      }
    },
    [getPeerConnections]
  );

  const cleanupMesh = useCallback(() => {
    const pcs = getPeerConnections();
    pcs.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // Ignore close errors
      }
    });
    pcs.clear();
    getRemoteStreams().clear();
    getPeerMeta().clear();
    getPendingIce().clear();

    if (meshChannelRef.current && typeof meshChannelRef.current.unsubscribe === "function") {
      try {
        const supabase = createClient();
        supabase.removeChannel(meshChannelRef.current);
      } catch {
        // Ignore channel removal error
      }
    }
    meshChannelRef.current = null;
  }, [getPeerConnections, getPeerMeta, getPendingIce, getRemoteStreams]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const createMeshPeerConnection = (peerId: string): RTCPeerConnection => {
      const pcs = getPeerConnections();
      const existing = pcs.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.set(peerId, pc);

      const localStream = localMediaStreamRef.current;
      const screenStream = localScreenStreamRef.current;
      const activeAudio = localStream?.getAudioTracks()[0] || null;
      const activeVideo =
        isScreenSharingRef.current && screenStream?.getVideoTracks()[0]
          ? screenStream.getVideoTracks()[0]
          : localStream?.getVideoTracks()[0] || null;

      if (activeAudio) {
        pc.addTrack(activeAudio, localStream || new MediaStream([activeAudio]));
      } else {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      }

      if (activeVideo) {
        pc.addTrack(activeVideo, new MediaStream([activeVideo]));
      } else {
        pc.addTransceiver("video", { direction: "sendrecv" });
      }

      pc.onicecandidate = (event) => {
        const ch = meshChannelRef.current;
        if (event.candidate && ch && typeof ch.send === "function") {
          ch.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              to: peerId,
              from: userId,
              kind: "ice",
              candidate: event.candidate.toJSON()
            }
          });
        }
      };

      pc.ontrack = (event) => {
        const streams = getRemoteStreams();
        let remoteStream = streams.get(peerId);
        if (!remoteStream) {
          remoteStream = new MediaStream();
          streams.set(peerId, remoteStream);
        }
        remoteStream
          .getTracks()
          .filter((t) => t.kind === event.track.kind)
          .forEach((oldTrack) => remoteStream?.removeTrack(oldTrack));
        remoteStream.addTrack(event.track);
        syncMeshTiles();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          getPeerConnections().delete(peerId);
          getRemoteStreams().delete(peerId);
          syncMeshTiles();
        }
      };

      return pc;
    };

    const startMultiUserMeshFallback = async (reason: string) => {
      setIsSFUConnected(false);
      setSfuNotice(reason);
      setConnectionState("mesh-connected");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localMediaStreamRef.current = stream;
        await refreshDevices();
      } catch {
        setIsMuted(true);
        setIsVideoOff(true);
        isMutedRef.current = true;
        isVideoOffRef.current = true;
        pushNotification({
          title: "Mode Penonton (Tanpa Kamera/Mikrofon)",
          message: "Anda tetap dapat melihat dan mendengar peserta lain.",
          type: "info"
        });
      }

      syncMeshTiles();

      const supabase = createClient();
      const channel = supabase.channel(`ramameet-mesh:${meetingCode}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false }
        }
      });
      meshChannelRef.current = channel;

      channel
        .on("presence", { event: "sync" }, async () => {
          const state = channel.presenceState<MeshPeerMeta>();
          const activePeerIds = new Set<string>();
          const metaMap = getPeerMeta();
          const pcs = getPeerConnections();
          const streams = getRemoteStreams();

          Object.entries(state).forEach(([key, entries]) => {
            const latest = entries[entries.length - 1];
            if (!latest) return;
            activePeerIds.add(key);
            metaMap.set(key, latest);
          });

          for (const [peerId, pc] of pcs.entries()) {
            if (!activePeerIds.has(peerId)) {
              pc.close();
              pcs.delete(peerId);
              streams.delete(peerId);
              metaMap.delete(peerId);
            }
          }

          for (const peerId of activePeerIds) {
            if (peerId === userId) continue;
            if (userId < peerId && !pcs.has(peerId)) {
              const pc = createMeshPeerConnection(peerId);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await channel.send({
                  type: "broadcast",
                  event: "webrtc-signal",
                  payload: {
                    to: peerId,
                    from: userId,
                    kind: "offer",
                    sdp: offer
                  }
                });
              } catch {
                // Ignore transient negotiation error
              }
            }
          }

          syncMeshTiles();
        })
        .on("broadcast", { event: "webrtc-signal" }, async ({ payload }) => {
          if (!payload || payload.to !== userId) return;
          const fromId = payload.from as string;
          const iceMap = getPendingIce();

          if (payload.kind === "offer") {
            const pc = createMeshPeerConnection(fromId);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              const queued = iceMap.get(fromId) || [];
              for (const c of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              iceMap.delete(fromId);

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await channel.send({
                type: "broadcast",
                event: "webrtc-signal",
                payload: {
                  to: fromId,
                  from: userId,
                  kind: "answer",
                  sdp: answer
                }
              });
            } catch {
              // Ignore invalid SDP
            }
          } else if (payload.kind === "answer") {
            const pc = getPeerConnections().get(fromId);
            if (!pc) return;
            try {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const queued = iceMap.get(fromId) || [];
                for (const c of queued) {
                  await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                }
                iceMap.delete(fromId);
              }
            } catch {
              // Ignore duplicate answer
            }
          } else if (payload.kind === "ice" && payload.candidate) {
            const pc = getPeerConnections().get(fromId);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
            } else {
              const list = iceMap.get(fromId) || [];
              list.push(payload.candidate);
              iceMap.set(fromId, list);
            }
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            await trackMeshPresence();
          }
        });
    };

    const connectLiveKit = async () => {
      if (!token || !serverUrl) {
        await startMultiUserMeshFallback(
          "Mode Multi-User WebRTC Mesh aktif (real-time peer-to-peer). Konfigurasi LiveKit SFU untuk kapasitas 100+ peserta."
        );
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true
        }
      });
      roomRef.current = room;

      const onUpdate = () => syncLiveKitTiles();

      room
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
          setIsSFUConnected(state === ConnectionState.Connected);
        })
        .on(RoomEvent.ParticipantConnected, onUpdate)
        .on(RoomEvent.ParticipantDisconnected, onUpdate)
        .on(RoomEvent.TrackSubscribed, onUpdate)
        .on(RoomEvent.TrackUnsubscribed, onUpdate)
        .on(RoomEvent.LocalTrackPublished, onUpdate)
        .on(RoomEvent.LocalTrackUnpublished, onUpdate)
        .on(RoomEvent.TrackMuted, onUpdate)
        .on(RoomEvent.TrackUnmuted, onUpdate)
        .on(RoomEvent.ActiveSpeakersChanged, onUpdate)
        .on(RoomEvent.ConnectionQualityChanged, onUpdate)
        .on(RoomEvent.Reconnecting, () => {
          pushNotification({
            title: "Menghubungkan Ulang",
            message: "Koneksi WebRTC sedang dipulihkan secara otomatis...",
            type: "warning"
          });
        })
        .on(RoomEvent.Reconnected, () => {
          pushNotification({
            title: "Terhubung Kembali",
            message: "Koneksi LiveKit SFU kembali stabil.",
            type: "success"
          });
          onUpdate();
        });

      try {
        setConnectionState("connecting");
        await room.connect(serverUrl, token);
        if (cancelled) {
          room.disconnect();
          return;
        }
        setSfuNotice(null);
        await room.localParticipant.enableCameraAndMicrophone().catch(() => {
          setIsVideoOff(true);
          setIsMuted(true);
        });
        await refreshDevices();
        syncLiveKitTiles();
      } catch {
        room.disconnect();
        roomRef.current = null;
        await startMultiUserMeshFallback(
          `Server LiveKit SFU (${serverUrl}) tidak merespons — beralih otomatis ke Mode Multi-User WebRTC Mesh.`
        );
      }
    };

    connectLiveKit();

    return () => {
      cancelled = true;
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      cleanupMesh();
      localMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      localMediaStreamRef.current = null;
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    };
  }, [
    enabled,
    meetingCode,
    token,
    serverUrl,
    userId,
    pushNotification,
    refreshDevices,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    cleanupMesh,
    getPeerConnections,
    getPeerMeta,
    getPendingIce,
    getRemoteStreams
  ]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);

    if (roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
      syncLiveKitTiles();
      return;
    }

    const audioTrack = localMediaStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !nextMuted;
    }
    syncMeshTiles();
    await trackMeshPresence();
  }, [syncLiveKitTiles, syncMeshTiles, trackMeshPresence]);

  const forceMute = useCallback(async () => {
    isMutedRef.current = true;
    setIsMuted(true);

    if (roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      syncLiveKitTiles();
      return;
    }

    const audioTrack = localMediaStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) audioTrack.enabled = false;
    syncMeshTiles();
    await trackMeshPresence();
  }, [syncLiveKitTiles, syncMeshTiles, trackMeshPresence]);

  const toggleVideo = useCallback(async () => {
    const nextVideoOff = !isVideoOffRef.current;
    isVideoOffRef.current = nextVideoOff;
    setIsVideoOff(nextVideoOff);

    if (roomRef.current) {
      await roomRef.current.localParticipant.setCameraEnabled(!nextVideoOff);
      syncLiveKitTiles();
      return;
    }

    const videoTrack = localMediaStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !nextVideoOff;
    } else if (!nextVideoOff) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!localMediaStreamRef.current) localMediaStreamRef.current = new MediaStream();
        const newTrack = s.getVideoTracks()[0];
        if (newTrack) {
          localMediaStreamRef.current.addTrack(newTrack);
          if (!isScreenSharingRef.current) {
            await replaceMeshTrack("video", newTrack);
          }
        }
      } catch {
        isVideoOffRef.current = true;
        setIsVideoOff(true);
        return;
      }
    }
    syncMeshTiles();
    await trackMeshPresence();
  }, [replaceMeshTrack, syncLiveKitTiles, syncMeshTiles, trackMeshPresence]);

  const stopLocalScreenStream = useCallback(async () => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      localScreenStreamRef.current = null;
    }
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);

    const camTrack = localMediaStreamRef.current?.getVideoTracks()[0] || null;
    await replaceMeshTrack("video", camTrack);
    syncMeshTiles();
    await trackMeshPresence();
  }, [replaceMeshTrack, syncMeshTiles, trackMeshPresence]);

  const toggleScreenShare = useCallback(async () => {
    const nextSharing = !isScreenSharingRef.current;

    if (nextSharing) {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        pushNotification({
          title: "HTTPS Diperlukan",
          message: "Fitur Share Screen hanya bisa dijalankan melalui HTTPS atau localhost.",
          type: "error"
        });
        return;
      }

      if (!navigator.mediaDevices?.getDisplayMedia) {
        pushNotification({
          title: "Browser Tidak Mendukung",
          message: "Perangkat/browser ini tidak mendukung Share Screen (getDisplayMedia).",
          type: "warning"
        });
        return;
      }
    }

    if (roomRef.current) {
      try {
        if (nextSharing) {
          try {
            await roomRef.current.localParticipant.setScreenShareEnabled(true, { audio: true });
          } catch (audioErr: any) {
            if (audioErr?.name === "NotAllowedError" || audioErr?.name === "AbortError") return;
            await roomRef.current.localParticipant.setScreenShareEnabled(true, { audio: false });
          }
          isScreenSharingRef.current = true;
          setIsScreenSharing(true);
          syncLiveKitTiles();
          pushNotification({
            title: "Share Screen Aktif",
            message: "Layar Anda sedang dibagikan ke seluruh peserta.",
            type: "success"
          });
        } else {
          await roomRef.current.localParticipant.setScreenShareEnabled(false);
          isScreenSharingRef.current = false;
          setIsScreenSharing(false);
          syncLiveKitTiles();
        }
      } catch (err: any) {
        if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
          pushNotification({
            title: "Share Screen Gagal",
            message: err?.message || "Tidak dapat memulai berbagi layar.",
            type: "error"
          });
        }
      }
      return;
    }

    if (nextSharing) {
      try {
        let displayStream: MediaStream;
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30, max: 60 } },
            audio: true
          });
        } catch (audioErr: any) {
          if (audioErr?.name === "NotAllowedError" || audioErr?.name === "AbortError") return;
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
        }

        localScreenStreamRef.current = displayStream;
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            stopLocalScreenStream();
          };
          await replaceMeshTrack("video", screenTrack);
        }

        isScreenSharingRef.current = true;
        setIsScreenSharing(true);
        syncMeshTiles();
        await trackMeshPresence();
        pushNotification({
          title: "Share Screen Aktif",
          message: "Layar Anda sedang dibagikan ke seluruh peserta.",
          type: "success"
        });
      } catch (err: any) {
        if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
          pushNotification({
            title: "Share Screen Gagal",
            message: err?.message || "Izin berbagi layar ditolak atau gagal dimulai.",
            type: "error"
          });
        }
      }
    } else {
      await stopLocalScreenStream();
    }
  }, [
    pushNotification,
    replaceMeshTrack,
    stopLocalScreenStream,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence
  ]);

  const switchAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioId(deviceId);
      if (roomRef.current) {
        await roomRef.current.switchActiveDevice("audioinput", deviceId);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        });
        const newTrack = stream.getAudioTracks()[0];
        if (newTrack) {
          localMediaStreamRef.current?.getAudioTracks().forEach((t) => {
            t.stop();
            localMediaStreamRef.current?.removeTrack(t);
          });
          localMediaStreamRef.current?.addTrack(newTrack);
          await replaceMeshTrack("audio", newTrack);
          syncMeshTiles();
        }
      }
    },
    [replaceMeshTrack, syncMeshTiles]
  );

  const switchVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoId(deviceId);
      if (roomRef.current) {
        await roomRef.current.switchActiveDevice("videoinput", deviceId);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } }
        });
        const newTrack = stream.getVideoTracks()[0];
        if (newTrack) {
          localMediaStreamRef.current?.getVideoTracks().forEach((t) => {
            t.stop();
            localMediaStreamRef.current?.removeTrack(t);
          });
          localMediaStreamRef.current?.addTrack(newTrack);
          if (!isScreenSharingRef.current) {
            await replaceMeshTrack("video", newTrack);
          }
          syncMeshTiles();
        }
      }
    },
    [replaceMeshTrack, syncMeshTiles]
  );

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    cleanupMesh();
    localMediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localMediaStreamRef.current = null;
    localScreenStreamRef.current = null;
    isScreenSharingRef.current = false;
    setIsScreenSharing(false);
    setTiles([]);
  }, [cleanupMesh, setTiles]);

  return {
    connectionState,
    isSFUConnected,
    sfuNotice,
    isMuted,
    isVideoOff,
    isScreenSharing,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    toggleMute,
    forceMute,
    toggleVideo,
    toggleScreenShare,
    switchAudioDevice,
    switchVideoDevice,
    disconnect
  };
}

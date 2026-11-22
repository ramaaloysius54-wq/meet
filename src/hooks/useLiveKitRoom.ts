"use client";
// @refresh reset

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
import { VideoEffectProcessor, type VideoEffectId } from "@/utils/videoEffects";

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

interface RemotePeerTracks {
  audioTrack: MediaStreamTrack | null;
  cameraTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" }
];

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user"
};

class MeshSession {
  room: Room | null = null;
  localMediaStream: MediaStream | null = null;
  localScreenStream: MediaStream | null = null;
  mediaInitPromise: Promise<void> | null = null;
  effectProcessor: VideoEffectProcessor | null = null;
  cameraEffect: VideoEffectId = "none";
  channel: RealtimeChannel | null = null;
  peerConnections = new Map<string, RTCPeerConnection>();
  remoteTracks = new Map<string, RemotePeerTracks>();
  peerMeta = new Map<string, MeshPeerMeta>();
  pendingIce = new Map<string, RTCIceCandidateInit[]>();
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  isScreenPaused = false;
  micLock = false;
  camLock = false;
  screenLock = false;

  getRawCameraTrack(): MediaStreamTrack | null {
    const t = this.localMediaStream?.getVideoTracks()[0] || null;
    return t && t.readyState === "live" ? t : null;
  }

  getRawAudioTrack(): MediaStreamTrack | null {
    const t = this.localMediaStream?.getAudioTracks()[0] || null;
    return t && t.readyState === "live" ? t : null;
  }

  getEffectiveCameraTrack(): MediaStreamTrack | null {
    if (this.effectProcessor) {
      const processed = this.effectProcessor.getTrack();
      if (processed && processed.readyState === "live") return processed;
    }
    return this.getRawCameraTrack();
  }

  destroyEffectProcessor() {
    if (this.effectProcessor) {
      this.effectProcessor.destroy();
      this.effectProcessor = null;
    }
  }

  cleanupMesh() {
    this.peerConnections.forEach((pc) => {
      try {
        pc.close();
      } catch {
        // Ignore close error
      }
    });
    this.peerConnections.clear();
    this.remoteTracks.clear();
    this.peerMeta.clear();
    this.pendingIce.clear();

    if (this.channel) {
      try {
        const supabase = createClient();
        supabase.removeChannel(this.channel);
      } catch {
        // Ignore removeChannel error
      }
      this.channel = null;
    }
  }

  cleanupTransport() {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.room = null;
    }
    this.cleanupMesh();
  }

  cleanupAll() {
    this.destroyEffectProcessor();
    this.cleanupTransport();
    this.localMediaStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.localMediaStream = null;
    this.localScreenStream = null;
    this.mediaInitPromise = null;
    this.isScreenSharing = false;
    this.isScreenPaused = false;
  }
}

const sessions = new Map<string, MeshSession>();

function getSession(key: string): MeshSession {
  let session = sessions.get(key);
  if (!session) {
    session = new MeshSession();
    sessions.set(key, session);
  }
  return session;
}

function mapQuality(q: ConnectionQuality): LiveParticipantTile["connectionQuality"] {
  if (q === ConnectionQuality.Excellent) return "excellent";
  if (q === ConnectionQuality.Good) return "good";
  if (q === ConnectionQuality.Poor) return "poor";
  return "unknown";
}

function getTransceiverByRole(
  pc: RTCPeerConnection,
  role: "audio" | "camera" | "screen"
): RTCRtpTransceiver | undefined {
  const transceivers = pc.getTransceivers();
  if (role === "audio") {
    return transceivers.find(
      (t) => t.receiver.track?.kind === "audio" || t.sender.track?.kind === "audio"
    );
  }
  const videoTransceivers = transceivers.filter(
    (t) => t.receiver.track?.kind === "video" || t.sender.track?.kind === "video"
  );
  return role === "camera" ? videoTransceivers[0] : videoTransceivers[1];
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
  const sessionKey = `${meetingCode}:${userId}`;
  const setTiles = useMeetingStore((s) => s.setTiles);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [connectionState, setConnectionState] = useState<string>("disconnected");
  const [isSFUConnected, setIsSFUConnected] = useState(false);
  const [sfuNotice, setSfuNotice] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isScreenPaused, setIsScreenPaused] = useState(false);
  const [cameraEffect, setCameraEffectState] = useState<VideoEffectId>("none");
  const [micBusy, setMicBusy] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");

  const unlockAudio = useCallback(() => {
    const session = getSession(sessionKey);
    if (session.room) {
      void session.room.startAudio().catch(() => {});
    }
    if (typeof document !== "undefined") {
      document.querySelectorAll("audio").forEach((el) => {
        if (el.srcObject && el.paused && !el.muted) {
          void el.play().catch(() => {});
        }
      });
    }
  }, [sessionKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleGesture = () => unlockAudio();
    window.addEventListener("pointerdown", handleGesture, { passive: true });
    window.addEventListener("keydown", handleGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handleGesture);
      window.removeEventListener("keydown", handleGesture);
    };
  }, [unlockAudio]);

  const acquireAudioTrack = useCallback(
    async (deviceId?: string): Promise<MediaStreamTrack | null> => {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const attempts: MediaStreamConstraints[] = [];
      if (deviceId) {
        attempts.push({ audio: { ...AUDIO_CONSTRAINTS, deviceId: { ideal: deviceId } } });
      }
      attempts.push({ audio: AUDIO_CONSTRAINTS });
      attempts.push({ audio: true });

      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getAudioTracks()[0] || null;
          if (track) {
            track.enabled = true;
            return track;
          }
        } catch {
          // Try next fallback constraint
        }
      }
      return null;
    },
    []
  );

  const acquireVideoTrack = useCallback(
    async (deviceId?: string): Promise<MediaStreamTrack | null> => {
      if (!navigator.mediaDevices?.getUserMedia) return null;
      const attempts: MediaStreamConstraints[] = [];
      if (deviceId) {
        attempts.push({
          video: {
            width: VIDEO_CONSTRAINTS.width,
            height: VIDEO_CONSTRAINTS.height,
            frameRate: VIDEO_CONSTRAINTS.frameRate,
            deviceId: { ideal: deviceId }
          }
        });
      }
      attempts.push({ video: VIDEO_CONSTRAINTS });
      attempts.push({ video: true });

      for (const constraints of attempts) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getVideoTracks()[0] || null;
          if (track) {
            track.enabled = true;
            return track;
          }
        } catch {
          // Try next fallback constraint
        }
      }
      return null;
    },
    []
  );

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter((d) => d.kind === "audioinput");
      const videos = devices.filter((d) => d.kind === "videoinput");
      setAudioDevices(audios);
      setVideoDevices(videos);
      setSelectedAudioId((prev) => prev || audios[0]?.deviceId || "");
      setSelectedVideoId((prev) => prev || videos[0]?.deviceId || "");
    } catch {
      // Ignore permission errors before prompt
    }
  }, []);

  const syncLiveKitTiles = useCallback(() => {
    const session = getSession(sessionKey);
    const room = session.room;
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

      const pubCamTrack = camPub?.track?.mediaStreamTrack || null;
      const camTrack =
        pubCamTrack && pubCamTrack.readyState === "live"
          ? pubCamTrack
          : local && !session.isVideoOff
          ? session.getEffectiveCameraTrack()
          : null;

      const pubMicTrack = micPub?.track?.mediaStreamTrack || null;
      const micTrack =
        pubMicTrack && pubMicTrack.readyState === "live"
          ? pubMicTrack
          : local
          ? session.getRawAudioTrack()
          : null;

      const scrTrack = scrPub?.track?.mediaStreamTrack || null;
      const hasActiveScreen = Boolean(
        scrTrack &&
          scrTrack.readyState === "live" &&
          !scrPub?.isMuted &&
          !(local && session.isScreenPaused)
      );

      const mutedState = local
        ? session.micLock
          ? session.isMuted
          : session.isMuted || !micTrack || !micTrack.enabled || Boolean(micPub?.isMuted)
        : micPub
        ? micPub.isMuted
        : true;

      const videoOffState = local
        ? session.camLock
          ? session.isVideoOff
          : session.isVideoOff || !camTrack || !camTrack.enabled || Boolean(camPub?.isMuted)
        : camPub
        ? camPub.isMuted || !camTrack
        : true;

      if (local) {
        if (!session.micLock) {
          session.isMuted = mutedState;
          setIsMuted(mutedState);
        }
        if (!session.camLock) {
          session.isVideoOff = videoOffState;
          setIsVideoOff(videoOffState);
        }
      }

      return {
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: local ? avatarUrl : meta.avatarUrl || null,
        isLocal: local,
        isHost: local ? isHost : Boolean(meta.isHost),
        isMuted: mutedState,
        isVideoOff: videoOffState,
        isSpeaking: p.isSpeaking,
        isScreenSharing: hasActiveScreen,
        connectionQuality: mapQuality(p.connectionQuality),
        videoTrack: !videoOffState ? camTrack : null,
        audioTrack: micTrack,
        screenTrack: hasActiveScreen ? scrTrack : null,
        screenAudioTrack: hasActiveScreen ? scrAudioPub?.track?.mediaStreamTrack || null : null
      };
    };

    const localTile = mapParticipant(room.localParticipant, true);
    const scrPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const liveScrExists = Boolean(
      scrPub?.track?.mediaStreamTrack && scrPub.track.mediaStreamTrack.readyState === "live"
    );
    session.isScreenSharing = liveScrExists;
    setIsScreenSharing(liveScrExists);
    if (!liveScrExists) {
      session.isScreenPaused = false;
      setIsScreenPaused(false);
    }

    const allTiles: LiveParticipantTile[] = [
      localTile,
      ...Array.from(room.remoteParticipants.values()).map((rp) => mapParticipant(rp, false))
    ];
    setTiles(allTiles);
  }, [avatarUrl, isHost, sessionKey, setTiles]);

  const syncMeshTiles = useCallback(() => {
    const session = getSession(sessionKey);
    const vTrack = session.getEffectiveCameraTrack();
    const aTrack = session.getRawAudioTrack();
    const sTrack = session.localScreenStream?.getVideoTracks()[0] || null;
    const sAudioTrack = session.localScreenStream?.getAudioTracks()[0] || null;

    const screenActive =
      session.isScreenSharing &&
      !session.isScreenPaused &&
      Boolean(sTrack) &&
      sTrack?.readyState === "live";

    const localTile: LiveParticipantTile = {
      identity: userId,
      name: userName,
      avatarUrl,
      isLocal: true,
      isHost,
      isMuted: session.isMuted || !aTrack || !aTrack.enabled,
      isVideoOff: session.isVideoOff || !vTrack || !vTrack.enabled,
      isSpeaking: !session.isMuted && Boolean(aTrack && aTrack.enabled),
      isScreenSharing: screenActive,
      connectionQuality: "excellent",
      videoTrack: session.isVideoOff ? null : vTrack,
      audioTrack: aTrack,
      screenTrack: screenActive ? sTrack : null,
      screenAudioTrack: screenActive ? sAudioTrack : null
    };

    const remoteTiles: LiveParticipantTile[] = [];
    session.peerMeta.forEach((meta, peerId) => {
      if (peerId === userId) return;
      const tracks = session.remoteTracks.get(peerId);
      const rAudio =
        tracks?.audioTrack && tracks.audioTrack.readyState === "live" ? tracks.audioTrack : null;
      const rCam =
        tracks?.cameraTrack && tracks.cameraTrack.readyState === "live" ? tracks.cameraTrack : null;
      const rScreen =
        tracks?.screenTrack && tracks.screenTrack.readyState === "live" ? tracks.screenTrack : null;

      const peerSharing = Boolean(meta.isScreenSharing && rScreen);

      remoteTiles.push({
        identity: peerId,
        name: meta.name,
        avatarUrl: meta.avatarUrl,
        isLocal: false,
        isHost: meta.isHost,
        isMuted: meta.isMuted || !rAudio,
        isVideoOff: meta.isVideoOff || !rCam,
        isSpeaking: !meta.isMuted && Boolean(rAudio),
        isScreenSharing: peerSharing,
        connectionQuality: rCam || rAudio || rScreen ? "good" : "unknown",
        videoTrack: meta.isVideoOff ? null : rCam,
        audioTrack: rAudio,
        screenTrack: peerSharing ? rScreen : null
      });
    });

    setTiles([localTile, ...remoteTiles]);
  }, [avatarUrl, isHost, sessionKey, setTiles, userId, userName]);

  const ensureLocalMedia = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.getRawCameraTrack() && session.getRawAudioTrack()) {
      return;
    }

    if (session.mediaInitPromise) {
      await session.mediaInitPromise;
      return;
    }

    session.mediaInitPromise = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;

      if (!session.getRawCameraTrack() && !session.getRawAudioTrack()) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS,
            video: VIDEO_CONSTRAINTS
          });
          stream.getAudioTracks().forEach((t) => {
            t.enabled = true;
          });
          stream.getVideoTracks().forEach((t) => {
            t.enabled = true;
          });
          session.localMediaStream = stream;
          session.isMuted = false;
          session.isVideoOff = false;
          setIsMuted(false);
          setIsVideoOff(false);
          await refreshDevices();
          return;
        } catch {
          // Fallback terpisah: kamera saja atau audio saja
        }
      }

      if (!session.localMediaStream) {
        session.localMediaStream = new MediaStream();
      }

      if (!session.getRawCameraTrack()) {
        const vTrack = await acquireVideoTrack();
        if (vTrack) {
          vTrack.enabled = !session.isVideoOff;
          session.localMediaStream.addTrack(vTrack);
        }
      }

      if (!session.getRawAudioTrack()) {
        const aTrack = await acquireAudioTrack();
        if (aTrack) {
          aTrack.enabled = !session.isMuted;
          session.localMediaStream.addTrack(aTrack);
        }
      }

      const gotAudio = Boolean(session.getRawAudioTrack());
      const gotVideo = Boolean(session.getRawCameraTrack());

      session.isMuted = !gotAudio;
      session.isVideoOff = !gotVideo;
      setIsMuted(!gotAudio);
      setIsVideoOff(!gotVideo);
      await refreshDevices();

      if (!gotAudio && !gotVideo) {
        pushNotification({
          title: "Mode Penonton",
          message: "Kamera/mikrofon tidak terdeteksi atau belum diizinkan. Anda tetap dapat bergabung.",
          type: "info"
        });
      }
    })();

    try {
      await session.mediaInitPromise;
    } finally {
      session.mediaInitPromise = null;
    }
  }, [acquireAudioTrack, acquireVideoTrack, pushNotification, refreshDevices, sessionKey]);

  const trackMeshPresence = useCallback(async () => {
    const session = getSession(sessionKey);
    if (!session.channel) return;
    await session.channel.track({
      userId,
      name: userName,
      avatarUrl: avatarUrl || null,
      isHost,
      isMuted: session.isMuted,
      isVideoOff: session.isVideoOff,
      isScreenSharing: session.isScreenSharing && !session.isScreenPaused
    });
  }, [avatarUrl, isHost, sessionKey, userId, userName]);

  const replaceMeshRoleTrack = useCallback(
    async (role: "audio" | "camera" | "screen", nextTrack: MediaStreamTrack | null) => {
      const session = getSession(sessionKey);
      for (const pc of Array.from(session.peerConnections.values())) {
        const transceiver = getTransceiverByRole(pc, role);
        if (transceiver?.sender) {
          if (nextTrack) {
            transceiver.direction = "sendrecv";
          }
          await transceiver.sender.replaceTrack(nextTrack).catch(() => {});
        }
      }
    },
    [sessionKey]
  );

  // Publikasikan ulang track kamera ke LiveKit atau Mesh (mis. saat ganti efek background)
  const applyCameraTrackToTransport = useCallback(
    async (nextTrack: MediaStreamTrack | null) => {
      const session = getSession(sessionKey);

      if (session.room) {
        const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
        if (camPub?.track) {
          await Promise.resolve(
            session.room.localParticipant.unpublishTrack(camPub.track, false)
          ).catch(() => {});
        }
        if (nextTrack && nextTrack.readyState === "live" && !session.isVideoOff) {
          nextTrack.enabled = true;
          await session.room.localParticipant
            .publishTrack(nextTrack, { source: Track.Source.Camera })
            .catch(() => {});
        }
        syncLiveKitTiles();
        return;
      }

      await replaceMeshRoleTrack("camera", session.isVideoOff ? null : nextTrack);
      syncMeshTiles();
    },
    [replaceMeshRoleTrack, sessionKey, syncLiveKitTiles, syncMeshTiles]
  );

  // Terapkan Background Kamera Effect (real-time Canvas -> WebRTC track)
  const setCameraEffect = useCallback(
    async (nextEffect: VideoEffectId) => {
      const session = getSession(sessionKey);
      if (session.camLock) return;
      session.camLock = true;
      setCamBusy(true);

      try {
        session.cameraEffect = nextEffect;
        setCameraEffectState(nextEffect);

        // Pastikan raw camera track tersedia
        let rawCam = session.getRawCameraTrack();
        if (!rawCam && session.room) {
          const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
          const existing = camPub?.track?.mediaStreamTrack || null;
          if (existing && existing.readyState === "live" && !session.effectProcessor) {
            if (!session.localMediaStream) session.localMediaStream = new MediaStream();
            session.localMediaStream.addTrack(existing);
            rawCam = existing;
          }
        }

        if (nextEffect === "none") {
          session.destroyEffectProcessor();
          await applyCameraTrackToTransport(rawCam);
          return;
        }

        if (!rawCam) {
          rawCam = await acquireVideoTrack(selectedVideoId);
          if (rawCam) {
            if (!session.localMediaStream) session.localMediaStream = new MediaStream();
            session.localMediaStream.addTrack(rawCam);
          } else {
            pushNotification({
              title: "Kamera Tidak Aktif",
              message: "Nyalakan kamera terlebih dahulu untuk menggunakan efek background.",
              type: "warning"
            });
            session.cameraEffect = "none";
            setCameraEffectState("none");
            return;
          }
        }

        if (rawCam) {
          if (session.effectProcessor) {
            session.effectProcessor.setEffect(nextEffect);
            session.effectProcessor.setPaused(session.isVideoOff);
            await applyCameraTrackToTransport(session.effectProcessor.getTrack());
          } else {
            session.effectProcessor = new VideoEffectProcessor(rawCam, nextEffect);
            session.effectProcessor.setPaused(session.isVideoOff);
            await applyCameraTrackToTransport(session.effectProcessor.getTrack());
          }
        }
      } finally {
        session.camLock = false;
        setCamBusy(false);
      }
    },
    [acquireVideoTrack, applyCameraTrackToTransport, pushNotification, selectedVideoId, sessionKey]
  );

  const callbacksRef = useRef({
    ensureLocalMedia,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    refreshDevices,
    pushNotification,
    unlockAudio,
    acquireAudioTrack,
    acquireVideoTrack
  });
  callbacksRef.current = {
    ensureLocalMedia,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    refreshDevices,
    pushNotification,
    unlockAudio,
    acquireAudioTrack,
    acquireVideoTrack
  };

  // Langsung buka kamera & tampilkan preview lokal sejak awal tanpa menunggu connect/klik
  useEffect(() => {
    if (!meetingCode || !userId) return;
    let unmounted = false;
    const session = getSession(sessionKey);

    const openCameraImmediately = async () => {
      await callbacksRef.current.ensureLocalMedia();
      if (unmounted) return;
      if (!session.room) {
        callbacksRef.current.syncMeshTiles();
      } else {
        callbacksRef.current.syncLiveKitTiles();
      }
    };

    void openCameraImmediately();

    return () => {
      unmounted = true;
      session.cleanupAll();
      sessions.delete(sessionKey);
    };
  }, [meetingCode, sessionKey, userId]);

  useEffect(() => {
    const session = getSession(sessionKey);
    if (session.room) {
      syncLiveKitTiles();
    } else if (session.localMediaStream) {
      syncMeshTiles();
      void trackMeshPresence();
    }
  }, [avatarUrl, isHost, sessionKey, syncLiveKitTiles, syncMeshTiles, trackMeshPresence, userName]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const session = getSession(sessionKey);

    const attachLocalTracksToTransceivers = async (pc: RTCPeerConnection) => {
      const audioTrack = session.getRawAudioTrack();
      const camTrack = session.getEffectiveCameraTrack();
      const screenTrack =
        session.isScreenSharing &&
        !session.isScreenPaused &&
        session.localScreenStream?.getVideoTracks()[0]
          ? session.localScreenStream.getVideoTracks()[0]
          : null;

      const audioT = getTransceiverByRole(pc, "audio");
      const camT = getTransceiverByRole(pc, "camera");
      const screenT = getTransceiverByRole(pc, "screen");

      if (audioT) {
        audioT.direction = "sendrecv";
        if (audioTrack) {
          audioTrack.enabled = !session.isMuted;
          await audioT.sender.replaceTrack(audioTrack).catch(() => {});
        }
      }
      if (camT) {
        camT.direction = "sendrecv";
        if (camTrack && !session.isVideoOff) {
          camTrack.enabled = true;
          await camT.sender.replaceTrack(camTrack).catch(() => {});
        }
      }
      if (screenT) {
        screenT.direction = "sendrecv";
        if (screenTrack) await screenT.sender.replaceTrack(screenTrack).catch(() => {});
      }
    };

    const createMeshPeerConnection = (
      peerId: string,
      isInitiator: boolean
    ): RTCPeerConnection => {
      const existing = session.peerConnections.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      session.peerConnections.set(peerId, pc);

      if (isInitiator) {
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && session.channel) {
          session.channel.send({
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
        const track = event.track;
        let record = session.remoteTracks.get(peerId);
        if (!record) {
          record = { audioTrack: null, cameraTrack: null, screenTrack: null };
          session.remoteTracks.set(peerId, record);
        }

        if (track.kind === "audio") {
          record.audioTrack = track;
        } else if (track.kind === "video") {
          const videoTransceivers = pc
            .getTransceivers()
            .filter((t) => t.receiver.track?.kind === "video");
          const videoIdx = videoTransceivers.findIndex((t) => t === event.transceiver);

          if (videoIdx === 1) {
            record.screenTrack = track;
          } else {
            record.cameraTrack = track;
          }
        }

        track.onunmute = () => {
          callbacksRef.current.syncMeshTiles();
          callbacksRef.current.unlockAudio();
        };
        track.onmute = () => callbacksRef.current.syncMeshTiles();
        track.onended = () => callbacksRef.current.syncMeshTiles();
        callbacksRef.current.syncMeshTiles();
        callbacksRef.current.unlockAudio();
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          session.peerConnections.delete(peerId);
          session.remoteTracks.delete(peerId);
          callbacksRef.current.syncMeshTiles();
        }
      };

      return pc;
    };

    const startMultiUserMeshFallback = async (reason: string) => {
      setIsSFUConnected(false);
      setSfuNotice(reason);
      setConnectionState("mesh-connected");

      await callbacksRef.current.ensureLocalMedia();
      if (cancelled) return;
      callbacksRef.current.syncMeshTiles();

      const supabase = createClient();
      const channel = supabase.channel(`ramameet-mesh:${meetingCode}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false }
        }
      });
      session.channel = channel;

      channel
        .on("presence", { event: "sync" }, async () => {
          const state = channel.presenceState<MeshPeerMeta>();
          const activePeerIds = new Set<string>();

          Object.entries(state).forEach(([key, entries]) => {
            const latest = entries[entries.length - 1];
            if (!latest) return;
            activePeerIds.add(key);
            session.peerMeta.set(key, latest);
          });

          for (const [peerId, pc] of Array.from(session.peerConnections.entries())) {
            if (!activePeerIds.has(peerId)) {
              pc.close();
              session.peerConnections.delete(peerId);
              session.remoteTracks.delete(peerId);
              session.peerMeta.delete(peerId);
            }
          }

          for (const peerId of Array.from(activePeerIds)) {
            if (peerId === userId) continue;
            if (userId < peerId && !session.peerConnections.has(peerId)) {
              const pc = createMeshPeerConnection(peerId, true);
              try {
                await attachLocalTracksToTransceivers(pc);
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

          callbacksRef.current.syncMeshTiles();
        })
        .on("broadcast", { event: "webrtc-signal" }, async ({ payload }) => {
          if (!payload || payload.to !== userId) return;
          const fromId = payload.from as string;

          if (payload.kind === "offer") {
            const pc = createMeshPeerConnection(fromId, false);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              await attachLocalTracksToTransceivers(pc);

              const queued = session.pendingIce.get(fromId) || [];
              for (const c of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              session.pendingIce.delete(fromId);

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
            const pc = session.peerConnections.get(fromId);
            if (!pc) return;
            try {
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const queued = session.pendingIce.get(fromId) || [];
                for (const c of queued) {
                  await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
                }
                session.pendingIce.delete(fromId);
              }
            } catch {
              // Ignore duplicate answer
            }
          } else if (payload.kind === "ice" && payload.candidate) {
            const pc = session.peerConnections.get(fromId);
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
            } else {
              const list = session.pendingIce.get(fromId) || [];
              list.push(payload.candidate);
              session.pendingIce.set(fromId, list);
            }
          }
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            await callbacksRef.current.trackMeshPresence();
          }
        });
    };

    const connectLiveKit = async () => {
      // Pastikan kamera sudah terbuka dan tampil sebelum proses koneksi selesai
      await callbacksRef.current.ensureLocalMedia();
      if (cancelled) return;
      callbacksRef.current.syncMeshTiles();

      if (!token || !serverUrl) {
        await startMultiUserMeshFallback(
          "Mode Multi-User WebRTC Mesh aktif (Kamera + Efek + Share Screen simultan)."
        );
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: AUDIO_CONSTRAINTS,
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 30 }
        },
        publishDefaults: {
          simulcast: true
        }
      });
      session.room = room;

      const onUpdate = () => {
        callbacksRef.current.syncLiveKitTiles();
        callbacksRef.current.unlockAudio();
      };

      room
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnectionState(state);
          setIsSFUConnected(state === ConnectionState.Connected);
        })
        .on(RoomEvent.ParticipantConnected, onUpdate)
        .on(RoomEvent.ParticipantDisconnected, onUpdate)
        .on(RoomEvent.TrackPublished, onUpdate)
        .on(RoomEvent.TrackUnpublished, onUpdate)
        .on(RoomEvent.TrackSubscribed, onUpdate)
        .on(RoomEvent.TrackUnsubscribed, onUpdate)
        .on(RoomEvent.LocalTrackPublished, onUpdate)
        .on(RoomEvent.LocalTrackUnpublished, onUpdate)
        .on(RoomEvent.TrackMuted, onUpdate)
        .on(RoomEvent.TrackUnmuted, onUpdate)
        .on(RoomEvent.ActiveSpeakersChanged, onUpdate)
        .on(RoomEvent.ConnectionQualityChanged, onUpdate)
        .on(RoomEvent.Reconnecting, () => {
          callbacksRef.current.pushNotification({
            title: "Menghubungkan Ulang",
            message: "Koneksi WebRTC sedang dipulihkan secara otomatis...",
            type: "warning"
          });
        })
        .on(RoomEvent.Reconnected, () => {
          callbacksRef.current.pushNotification({
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

        // Aktifkan playback suara remote di LiveKit
        void room.startAudio().catch(() => {});

        // Gunakan track kamera & mic yang sudah langsung terbuka sejak awal
        let existingAudio = session.getRawAudioTrack();
        if (!existingAudio && !session.isMuted) {
          existingAudio = await callbacksRef.current.acquireAudioTrack();
          if (existingAudio) {
            if (!session.localMediaStream) session.localMediaStream = new MediaStream();
            session.localMediaStream.addTrack(existingAudio);
          }
        }

        if (existingAudio && !session.isMuted) {
          existingAudio.enabled = true;
          await room.localParticipant
            .publishTrack(existingAudio, { source: Track.Source.Microphone })
            .catch(() => room.localParticipant.setMicrophoneEnabled(true).catch(() => {}));
        } else if (!session.isMuted) {
          await room.localParticipant.setMicrophoneEnabled(true).catch(() => {
            session.isMuted = true;
            setIsMuted(true);
          });
        }

        let existingCam = session.getEffectiveCameraTrack();
        if (!existingCam && !session.isVideoOff) {
          const freshCam = await callbacksRef.current.acquireVideoTrack();
          if (freshCam) {
            if (!session.localMediaStream) session.localMediaStream = new MediaStream();
            session.localMediaStream.addTrack(freshCam);
            existingCam = session.getEffectiveCameraTrack();
          }
        }

        if (existingCam && !session.isVideoOff) {
          existingCam.enabled = true;
          await room.localParticipant
            .publishTrack(existingCam, { source: Track.Source.Camera })
            .catch(() => room.localParticipant.setCameraEnabled(true).catch(() => {}));
        } else if (!session.isVideoOff) {
          await room.localParticipant.setCameraEnabled(true).catch(() => {
            session.isVideoOff = true;
            setIsVideoOff(true);
          });
        }

        await callbacksRef.current.refreshDevices();
        callbacksRef.current.syncLiveKitTiles();
      } catch {
        room.disconnect();
        session.room = null;
        await startMultiUserMeshFallback(
          `Server LiveKit SFU (${serverUrl}) tidak merespons — beralih otomatis ke Mode Multi-User WebRTC Mesh.`
        );
      }
    };

    void connectLiveKit();

    return () => {
      cancelled = true;
      session.cleanupTransport();
    };
  }, [enabled, meetingCode, token, serverUrl, userId, sessionKey]);

  // Toggle Microphone (bebas race-condition & auto-recover jika track ended)
  const toggleMute = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.micLock) return;
    session.micLock = true;
    setMicBusy(true);
    unlockAudio();

    try {
      const nextMuted = !session.isMuted;

      if (session.room) {
        if (nextMuted) {
          session.isMuted = true;
          setIsMuted(true);

          const rawAudio = session.getRawAudioTrack();
          if (rawAudio) rawAudio.enabled = false;

          const micPub = session.room.localParticipant.getTrackPublication(Track.Source.Microphone);
          if (micPub?.track) {
            micPub.track.mediaStreamTrack.enabled = false;
            await micPub.track.mute().catch(() => {});
          } else {
            await session.room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          }
          syncLiveKitTiles();
          return;
        }

        // Unmute kembali dengan aman (aktifkan track live atau buat track baru jika sudah ended)
        const micPub = session.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const pubTrack = micPub?.track?.mediaStreamTrack || null;

        if (micPub?.track && pubTrack && pubTrack.readyState === "live") {
          pubTrack.enabled = true;
          await micPub.track.unmute().catch(() => {});
          const rawAudio = session.getRawAudioTrack();
          if (rawAudio) rawAudio.enabled = true;
        } else {
          if (micPub?.track) {
            await Promise.resolve(
              session.room.localParticipant.unpublishTrack(micPub.track, true)
            ).catch(() => {});
          }

          let audioTrack = session.getRawAudioTrack();
          if (!audioTrack) {
            audioTrack = await acquireAudioTrack(selectedAudioId);
          }

          if (!audioTrack) {
            pushNotification({
              title: "Mikrofon Gagal Diaktifkan",
              message: "Periksa izin mikrofon di browser atau perangkat audio Anda.",
              type: "error"
            });
            return;
          }

          audioTrack.enabled = true;
          if (!session.localMediaStream) session.localMediaStream = new MediaStream();
          session.localMediaStream.getAudioTracks().forEach((t) => {
            if (t !== audioTrack) {
              t.stop();
              session.localMediaStream?.removeTrack(t);
            }
          });
          if (!session.localMediaStream.getAudioTracks().includes(audioTrack)) {
            session.localMediaStream.addTrack(audioTrack);
          }

          await session.room.localParticipant
            .publishTrack(audioTrack, { source: Track.Source.Microphone })
            .catch(() => session.room?.localParticipant.setMicrophoneEnabled(true).catch(() => {}));
          await refreshDevices();
        }

        session.isMuted = false;
        setIsMuted(false);
        syncLiveKitTiles();
        return;
      }

      let audioTrack = session.getRawAudioTrack();

      if (!nextMuted && !audioTrack) {
        audioTrack = await acquireAudioTrack(selectedAudioId);
        if (!audioTrack) {
          pushNotification({
            title: "Izin Mikrofon Ditolak",
            message: "Aktifkan izin mikrofon di pengaturan browser untuk berbicara.",
            type: "warning"
          });
          return;
        }
        if (!session.localMediaStream) session.localMediaStream = new MediaStream();
        session.localMediaStream.getAudioTracks().forEach((t) => {
          t.stop();
          session.localMediaStream?.removeTrack(t);
        });
        session.localMediaStream.addTrack(audioTrack);
        await refreshDevices();
      }

      if (audioTrack) {
        audioTrack.enabled = !nextMuted;
        if (!nextMuted) {
          await replaceMeshRoleTrack("audio", audioTrack);
        }
      }
      session.isMuted = nextMuted;
      setIsMuted(nextMuted);
      syncMeshTiles();
      await trackMeshPresence();
    } finally {
      session.micLock = false;
      setMicBusy(false);
    }
  }, [
    acquireAudioTrack,
    pushNotification,
    refreshDevices,
    replaceMeshRoleTrack,
    selectedAudioId,
    sessionKey,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    unlockAudio
  ]);

  const forceMute = useCallback(async () => {
    const session = getSession(sessionKey);
    session.isMuted = true;
    setIsMuted(true);

    const audioTrack = session.getRawAudioTrack();
    if (audioTrack) audioTrack.enabled = false;

    if (session.room) {
      const micPub = session.room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (micPub?.track) {
        micPub.track.mediaStreamTrack.enabled = false;
        await micPub.track.mute().catch(() => {});
      } else {
        await session.room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      }
      syncLiveKitTiles();
      return;
    }

    syncMeshTiles();
    await trackMeshPresence();
  }, [sessionKey, syncLiveKitTiles, syncMeshTiles, trackMeshPresence]);

  // Toggle Camera (sinkron dengan Background Effect + auto-recover)
  const toggleVideo = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.camLock) return;
    session.camLock = true;
    setCamBusy(true);
    unlockAudio();

    try {
      const nextVideoOff = !session.isVideoOff;

      if (nextVideoOff) {
        session.isVideoOff = true;
        setIsVideoOff(true);
        session.destroyEffectProcessor();

        if (session.room) {
          const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
          if (camPub?.track) {
            await Promise.resolve(
              session.room.localParticipant.unpublishTrack(camPub.track, true)
            ).catch(() => {});
          }
        } else {
          await replaceMeshRoleTrack("camera", null);
        }

        if (session.localMediaStream) {
          session.localMediaStream.getVideoTracks().forEach((t) => {
            t.stop();
            session.localMediaStream?.removeTrack(t);
          });
        }

        if (session.room) {
          syncLiveKitTiles();
        } else {
          syncMeshTiles();
          await trackMeshPresence();
        }
        return;
      }

      // Nyalakan kembali kamera (ON)
      let rawCam = session.getRawCameraTrack();

      if (!rawCam) {
        rawCam = await acquireVideoTrack(selectedVideoId);
        if (!rawCam) {
          pushNotification({
            title: "Kamera Gagal Diaktifkan",
            message: "Pastikan kamera tidak sedang dipakai aplikasi lain dan izin browser aktif.",
            type: "warning"
          });
          return;
        }
        if (!session.localMediaStream) session.localMediaStream = new MediaStream();
        session.localMediaStream.getVideoTracks().forEach((t) => {
          t.stop();
          session.localMediaStream?.removeTrack(t);
        });
        session.localMediaStream.addTrack(rawCam);
        await refreshDevices();
      }

      rawCam.enabled = true;

      if (session.cameraEffect !== "none") {
        session.destroyEffectProcessor();
        session.effectProcessor = new VideoEffectProcessor(rawCam, session.cameraEffect);
        session.effectProcessor.setPaused(false);
      }

      session.isVideoOff = false;
      setIsVideoOff(false);

      const effectiveTrack = session.getEffectiveCameraTrack();
      await applyCameraTrackToTransport(effectiveTrack);
      if (!session.room) {
        await trackMeshPresence();
      }
    } finally {
      session.camLock = false;
      setCamBusy(false);
    }
  }, [
    acquireVideoTrack,
    applyCameraTrackToTransport,
    pushNotification,
    refreshDevices,
    replaceMeshRoleTrack,
    selectedVideoId,
    sessionKey,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    unlockAudio
  ]);

  const stopLocalScreenStream = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.localScreenStream) {
      session.localScreenStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      session.localScreenStream = null;
    }
    session.isScreenSharing = false;
    session.isScreenPaused = false;
    setIsScreenSharing(false);
    setIsScreenPaused(false);

    await replaceMeshRoleTrack("screen", null);
    syncMeshTiles();
    await trackMeshPresence();
  }, [replaceMeshRoleTrack, sessionKey, syncMeshTiles, trackMeshPresence]);

  // Pause / Resume Share Screen
  const togglePauseScreenShare = useCallback(async () => {
    const session = getSession(sessionKey);
    if (!session.isScreenSharing) return;

    const nextPaused = !session.isScreenPaused;
    session.isScreenPaused = nextPaused;
    setIsScreenPaused(nextPaused);

    if (session.room) {
      const scrPub = session.room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
      if (scrPub?.track) {
        if (nextPaused) {
          await scrPub.track.mute().catch(() => {});
        } else {
          await scrPub.track.unmute().catch(() => {});
        }
      }
      syncLiveKitTiles();
      return;
    }

    const screenTrack = session.localScreenStream?.getVideoTracks()[0] || null;
    if (screenTrack) {
      screenTrack.enabled = !nextPaused;
      await replaceMeshRoleTrack("screen", nextPaused ? null : screenTrack);
    }
    syncMeshTiles();
    await trackMeshPresence();
  }, [replaceMeshRoleTrack, sessionKey, syncLiveKitTiles, syncMeshTiles, trackMeshPresence]);

  // Share Screen 1-Klik ON / 1-Klik OFF langsung
  const toggleScreenShare = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.screenLock) return;
    unlockAudio();

    session.screenLock = true;
    try {
      // 1-KLIK OFF: jika sedang share screen (termasuk saat pause), langsung matikan total
      if (session.isScreenSharing) {
        if (session.room) {
          await session.room.localParticipant.setScreenShareEnabled(false).catch(() => {});
          for (const pub of Array.from(session.room.localParticipant.trackPublications.values())) {
            if (
              pub.source === Track.Source.ScreenShare ||
              pub.source === Track.Source.ScreenShareAudio
            ) {
              if (pub.track) {
                await Promise.resolve(
                  session.room.localParticipant.unpublishTrack(pub.track, true)
                ).catch(() => {});
                pub.track.stop();
              }
            }
          }
          session.isScreenSharing = false;
          session.isScreenPaused = false;
          setIsScreenSharing(false);
          setIsScreenPaused(false);
          syncLiveKitTiles();
        } else {
          await stopLocalScreenStream();
        }
        return;
      }

      // 1-KLIK ON
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
          message: "Perangkat/browser ini tidak mendukung Share Screen.",
          type: "warning"
        });
        return;
      }

      // 1. LiveKit SFU
      if (session.room) {
        try {
          let pub: Awaited<
            ReturnType<typeof session.room.localParticipant.setScreenShareEnabled>
          > | null = null;
          try {
            pub = await session.room.localParticipant.setScreenShareEnabled(true, {
              audio: true,
              contentHint: "detail",
              systemAudio: "include",
              selfBrowserSurface: "exclude",
              surfaceSwitching: "include"
            } as any);
          } catch (audioErr: any) {
            if (audioErr?.name === "NotAllowedError" || audioErr?.name === "AbortError") return;
            pub = await session.room.localParticipant.setScreenShareEnabled(true, {
              audio: false,
              contentHint: "detail",
              selfBrowserSurface: "exclude",
              surfaceSwitching: "include"
            } as any);
          }

          const publishedTrack = pub?.track?.mediaStreamTrack;
          if (publishedTrack) {
            publishedTrack.onended = () => {
              session.room?.localParticipant.setScreenShareEnabled(false).catch(() => {});
              session.isScreenSharing = false;
              session.isScreenPaused = false;
              setIsScreenSharing(false);
              setIsScreenPaused(false);
              syncLiveKitTiles();
            };
          }

          session.isScreenSharing = true;
          session.isScreenPaused = false;
          setIsScreenSharing(true);
          setIsScreenPaused(false);
          syncLiveKitTiles();
          pushNotification({
            title: "Share Screen Aktif",
            message: "Klik tombol Share Screen sekali lagi untuk mematikan.",
            type: "success"
          });
        } catch (err: any) {
          if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
            pushNotification({
              title: "Share Screen Gagal",
              message: err?.message || "Tidak dapat memulai berbagi layar di LiveKit.",
              type: "error"
            });
          }
        }
        return;
      }

      // 2. WebRTC Mesh
      try {
        let displayStream: MediaStream;
        const displayOptions: DisplayMediaStreamOptions & Record<string, unknown> = {
          video: {
            frameRate: { ideal: 30, max: 60 },
            width: { ideal: 1920, max: 2560 },
            height: { ideal: 1080, max: 1440 }
          },
          audio: true,
          systemAudio: "include",
          selfBrowserSurface: "exclude",
          surfaceSwitching: "include"
        };

        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia(
            displayOptions as DisplayMediaStreamOptions
          );
        } catch (audioErr: any) {
          if (audioErr?.name === "NotAllowedError" || audioErr?.name === "AbortError") return;
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false
          });
        }

        session.localScreenStream = displayStream;
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          if ("contentHint" in screenTrack) {
            try {
              (screenTrack as MediaStreamTrack & { contentHint?: string }).contentHint = "detail";
            } catch {
              // Ignore unsupported hint
            }
          }
          screenTrack.onended = () => {
            void stopLocalScreenStream();
          };
          await replaceMeshRoleTrack("screen", screenTrack);
        }

        session.isScreenSharing = true;
        session.isScreenPaused = false;
        setIsScreenSharing(true);
        setIsScreenPaused(false);
        syncMeshTiles();
        await trackMeshPresence();
        pushNotification({
          title: "Share Screen Aktif",
          message: "Klik tombol Share Screen sekali lagi untuk mematikan.",
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
    } finally {
      session.screenLock = false;
    }
  }, [
    pushNotification,
    replaceMeshRoleTrack,
    sessionKey,
    stopLocalScreenStream,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    unlockAudio
  ]);

  const switchAudioDevice = useCallback(
    async (deviceId: string) => {
      const session = getSession(sessionKey);
      setSelectedAudioId(deviceId);
      const newTrack = await acquireAudioTrack(deviceId);
      if (!newTrack) {
        pushNotification({
          title: "Gagal Ganti Mikrofon",
          message: "Perangkat audio yang dipilih tidak dapat diakses.",
          type: "error"
        });
        return;
      }

      newTrack.enabled = !session.isMuted;
      if (!session.localMediaStream) session.localMediaStream = new MediaStream();
      session.localMediaStream.getAudioTracks().forEach((t) => {
        t.stop();
        session.localMediaStream?.removeTrack(t);
      });
      session.localMediaStream.addTrack(newTrack);

      if (session.room) {
        const micPub = session.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          await Promise.resolve(
            session.room.localParticipant.unpublishTrack(micPub.track, true)
          ).catch(() => {});
        }
        if (!session.isMuted) {
          await session.room.localParticipant
            .publishTrack(newTrack, { source: Track.Source.Microphone })
            .catch(() => {});
        }
        syncLiveKitTiles();
      } else {
        await replaceMeshRoleTrack("audio", newTrack);
        syncMeshTiles();
      }
    },
    [acquireAudioTrack, pushNotification, replaceMeshRoleTrack, sessionKey, syncLiveKitTiles, syncMeshTiles]
  );

  const switchVideoDevice = useCallback(
    async (deviceId: string) => {
      const session = getSession(sessionKey);
      setSelectedVideoId(deviceId);
      const newTrack = await acquireVideoTrack(deviceId);
      if (!newTrack) {
        pushNotification({
          title: "Gagal Ganti Kamera",
          message: "Perangkat kamera yang dipilih tidak dapat diakses.",
          type: "error"
        });
        return;
      }

      newTrack.enabled = !session.isVideoOff;
      if (!session.localMediaStream) session.localMediaStream = new MediaStream();
      session.localMediaStream.getVideoTracks().forEach((t) => {
        t.stop();
        session.localMediaStream?.removeTrack(t);
      });
      session.localMediaStream.addTrack(newTrack);

      if (session.cameraEffect !== "none") {
        session.destroyEffectProcessor();
        session.effectProcessor = new VideoEffectProcessor(newTrack, session.cameraEffect);
        session.effectProcessor.setPaused(session.isVideoOff);
      }
      await applyCameraTrackToTransport(session.getEffectiveCameraTrack());
    },
    [acquireVideoTrack, applyCameraTrackToTransport, pushNotification, sessionKey]
  );

  const disconnect = useCallback(() => {
    const session = getSession(sessionKey);
    session.cleanupAll();
    sessions.delete(sessionKey);
    setIsScreenSharing(false);
    setIsScreenPaused(false);
    setCameraEffectState("none");
    setTiles([]);
  }, [sessionKey, setTiles]);

  return {
    connectionState,
    isSFUConnected,
    sfuNotice,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isScreenPaused,
    cameraEffect,
    micBusy,
    camBusy,
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    toggleMute,
    forceMute,
    toggleVideo,
    toggleScreenShare,
    togglePauseScreenShare,
    setCameraEffect,
    switchAudioDevice,
    switchVideoDevice,
    disconnect
  };
}

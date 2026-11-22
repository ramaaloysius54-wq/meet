"use client";
// @refresh reset

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CUSTOM_BG_STORAGE_KEY = "ramameet_custom_bg";
const MAX_BG_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

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
  peerId: string;
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

type MeetingSoundKind = "join" | "leave" | "toggle-on" | "toggle-off";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" }
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

let sharedAudioCtx: AudioContext | null = null;
let pendingJoinSound = false;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Gagal membaca file gambar."));
    };
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
}

function getClientPeerId(userId: string): string {
  if (typeof window === "undefined") return userId;
  const storageKey = `ramameet_peer_id_${userId}`;
  try {
    let tabId = window.sessionStorage.getItem(storageKey);
    if (!tabId) {
      tabId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      window.sessionStorage.setItem(storageKey, tabId);
    }
    return `${userId}__${tabId}`;
  } catch {
    return `${userId}__${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = "sine"
) {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function playMeetingSound(kind: MeetingSoundKind) {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const trigger = () => {
    try {
      if (kind === "join") {
        scheduleTone(ctx, 523.25, 0, 0.24, 0.32, "sine");
        scheduleTone(ctx, 659.25, 0.09, 0.28, 0.3, "sine");
        scheduleTone(ctx, 783.99, 0.19, 0.38, 0.28, "triangle");
      } else if (kind === "leave") {
        scheduleTone(ctx, 659.25, 0, 0.2, 0.26, "sine");
        scheduleTone(ctx, 440.0, 0.12, 0.3, 0.24, "sine");
      } else if (kind === "toggle-on") {
        scheduleTone(ctx, 680, 0, 0.085, 0.14, "sine");
      } else {
        scheduleTone(ctx, 420, 0, 0.085, 0.14, "sine");
      }
    } catch {
      // Ignore Web Audio errors
    }
  };

  if (ctx.state === "running") {
    trigger();
    return;
  }

  void ctx
    .resume()
    .then(() => {
      if (ctx.state === "running") {
        trigger();
      } else if (kind === "join") {
        pendingJoinSound = true;
      }
    })
    .catch(() => {
      if (kind === "join") pendingJoinSound = true;
    });
}

class MeshSession {
  room: Room | null = null;
  localMediaStream: MediaStream | null = null;
  localScreenStream: MediaStream | null = null;
  mediaInitPromise: Promise<void> | null = null;
  effectProcessor: VideoEffectProcessor | null = null;
  cameraEffect: VideoEffectId = "none";
  customBackgroundUrl: string | null = null;
  channel: RealtimeChannel | null = null;
  heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  peerConnections = new Map<string, RTCPeerConnection>();
  remoteTracks = new Map<string, RemotePeerTracks>();
  peerMeta = new Map<string, MeshPeerMeta>();
  peerLastSeen = new Map<string, number>();
  pendingIce = new Map<string, RTCIceCandidateInit[]>();
  knownRemotePeers = new Set<string>();
  hasPlayedJoinChime = false;
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  isScreenPaused = false;
  desiredMuted = false;
  desiredVideoOff = false;
  micProcessing = false;
  camProcessing = false;
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

  setRawAudioTrack(nextTrack: MediaStreamTrack | null) {
    if (!this.localMediaStream) this.localMediaStream = new MediaStream();
    this.localMediaStream.getAudioTracks().forEach((t) => {
      if (t !== nextTrack) {
        try {
          t.stop();
        } catch {
          // Ignore stop error
        }
        this.localMediaStream?.removeTrack(t);
      }
    });
    if (nextTrack && !this.localMediaStream.getAudioTracks().includes(nextTrack)) {
      this.localMediaStream.addTrack(nextTrack);
    }
  }

  setRawVideoTrack(nextTrack: MediaStreamTrack | null) {
    if (!this.localMediaStream) this.localMediaStream = new MediaStream();
    this.localMediaStream.getVideoTracks().forEach((t) => {
      if (t !== nextTrack) {
        try {
          t.stop();
        } catch {
          // Ignore stop error
        }
        this.localMediaStream?.removeTrack(t);
      }
    });
    if (nextTrack && !this.localMediaStream.getVideoTracks().includes(nextTrack)) {
      this.localMediaStream.addTrack(nextTrack);
    }
  }

  destroyEffectProcessor() {
    if (this.effectProcessor) {
      this.effectProcessor.destroy();
      this.effectProcessor = null;
    }
  }

  cleanupMesh(localPeerId?: string) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.channel && localPeerId) {
      try {
        void this.channel.send({
          type: "broadcast",
          event: "peer-leave",
          payload: { peerId: localPeerId }
        });
      } catch {
        // Ignore send error on cleanup
      }
    }

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
    this.peerLastSeen.clear();
    this.pendingIce.clear();
    this.knownRemotePeers.clear();

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

  cleanupTransport(localPeerId?: string) {
    if (this.room) {
      try {
        this.room.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.room = null;
    }
    this.cleanupMesh(localPeerId);
  }

  cleanupAll(localPeerId?: string) {
    this.destroyEffectProcessor();
    this.cleanupTransport(localPeerId);
    this.localMediaStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.localMediaStream = null;
    this.localScreenStream = null;
    this.mediaInitPromise = null;
    this.hasPlayedJoinChime = false;
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
  const normalizedCode = useMemo(() => meetingCode.trim().toLowerCase(), [meetingCode]);
  const localPeerId = useMemo(() => getClientPeerId(userId), [userId]);
  const sessionKey = `${normalizedCode}:${localPeerId}`;

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
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [micBusy, setMicBusy] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");

  // Muat custom background yang sebelumnya pernah di-upload
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(CUSTOM_BG_STORAGE_KEY);
      if (saved) {
        const session = getSession(sessionKey);
        session.customBackgroundUrl = saved;
        setCustomBackgroundUrl(saved);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [sessionKey]);

  const unlockAudio = useCallback(() => {
    const session = getSession(sessionKey);
    if (session.room) {
      void session.room.startAudio().catch(() => {});
    }
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx
        .resume()
        .then(() => {
          if (pendingJoinSound && ctx.state === "running") {
            pendingJoinSound = false;
            playMeetingSound("join");
          }
        })
        .catch(() => {});
    } else if (pendingJoinSound && ctx?.state === "running") {
      pendingJoinSound = false;
      playMeetingSound("join");
    }

    if (typeof document !== "undefined") {
      document.querySelectorAll("audio").forEach((el) => {
        if (el.srcObject && el.paused) {
          void el.play().catch(() => {});
        }
      });
    }
  }, [sessionKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleGesture = () => unlockAudio();
    window.addEventListener("touchstart", handleGesture, { passive: true, capture: true });
    window.addEventListener("touchend", handleGesture, { passive: true, capture: true });
    window.addEventListener("pointerdown", handleGesture, { passive: true, capture: true });
    window.addEventListener("click", handleGesture, { passive: true, capture: true });
    window.addEventListener("keydown", handleGesture, { passive: true, capture: true });
    return () => {
      window.removeEventListener("touchstart", handleGesture, true);
      window.removeEventListener("touchend", handleGesture, true);
      window.removeEventListener("pointerdown", handleGesture, true);
      window.removeEventListener("click", handleGesture, true);
      window.removeEventListener("keydown", handleGesture, true);
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

  const buildLocalMeshMeta = useCallback((): MeshPeerMeta => {
    const session = getSession(sessionKey);
    return {
      peerId: localPeerId,
      userId,
      name: userName,
      avatarUrl: avatarUrl || null,
      isHost,
      isMuted: session.isMuted,
      isVideoOff: session.isVideoOff,
      isScreenSharing: session.isScreenSharing && !session.isScreenPaused
    };
  }, [avatarUrl, isHost, localPeerId, sessionKey, userId, userName]);

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
      const pubMicTrack = micPub?.track?.mediaStreamTrack || null;

      const camTrack = local
        ? session.getEffectiveCameraTrack() ||
          (pubCamTrack && pubCamTrack.readyState === "live" ? pubCamTrack : null)
        : pubCamTrack && pubCamTrack.readyState === "live"
        ? pubCamTrack
        : null;

      const micTrack = local
        ? session.getRawAudioTrack() ||
          (pubMicTrack && pubMicTrack.readyState === "live" ? pubMicTrack : null)
        : pubMicTrack && pubMicTrack.readyState === "live"
        ? pubMicTrack
        : null;

      const scrTrack = scrPub?.track?.mediaStreamTrack || null;
      const hasActiveScreen = Boolean(
        scrTrack &&
          scrTrack.readyState === "live" &&
          !scrPub?.isMuted &&
          !(local && session.isScreenPaused)
      );

      const mutedState = local
        ? session.isMuted
        : micPub
        ? micPub.isMuted || !micTrack
        : true;

      const videoOffState = local
        ? session.isVideoOff || !camTrack
        : camPub
        ? camPub.isMuted || !camTrack
        : true;

      return {
        identity: p.identity,
        name: p.name || p.identity,
        avatarUrl: local ? avatarUrl : meta.avatarUrl || null,
        isLocal: local,
        isHost: local ? isHost : Boolean(meta.isHost),
        isMuted: mutedState,
        isVideoOff: videoOffState,
        isSpeaking: !mutedState && p.isSpeaking,
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

    const localMuted = session.isMuted || !aTrack;
    const localVideoOff = session.isVideoOff || !vTrack;

    const localTile: LiveParticipantTile = {
      identity: localPeerId,
      name: userName,
      avatarUrl,
      isLocal: true,
      isHost,
      isMuted: localMuted,
      isVideoOff: localVideoOff,
      isSpeaking: !localMuted && Boolean(aTrack && aTrack.enabled),
      isScreenSharing: screenActive,
      connectionQuality: "excellent",
      videoTrack: localVideoOff ? null : vTrack,
      audioTrack: aTrack,
      screenTrack: screenActive ? sTrack : null,
      screenAudioTrack: screenActive ? sAudioTrack : null
    };

    const remoteTiles: LiveParticipantTile[] = [];
    session.peerMeta.forEach((meta, peerId) => {
      if (peerId === localPeerId) return;
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
  }, [avatarUrl, isHost, localPeerId, sessionKey, setTiles, userName]);

  const replaceMeshRoleTrack = useCallback(
    async (role: "audio" | "camera" | "screen", nextTrack: MediaStreamTrack | null) => {
      const session = getSession(sessionKey);
      const tasks: Promise<void>[] = [];
      for (const pc of Array.from(session.peerConnections.values())) {
        const transceiver = getTransceiverByRole(pc, role);
        if (transceiver?.sender) {
          if (nextTrack) {
            transceiver.direction = "sendrecv";
          }
          if (transceiver.sender.track !== nextTrack) {
            tasks.push(transceiver.sender.replaceTrack(nextTrack).catch(() => {}));
          }
        }
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
    [sessionKey]
  );

  const broadcastMeshState = useCallback(() => {
    const session = getSession(sessionKey);
    if (!session.channel) return;
    const meta = buildLocalMeshMeta();

    void session.channel
      .send({
        type: "broadcast",
        event: "peer-state",
        payload: meta
      })
      .catch(() => {});

    void session.channel.track(meta).catch(() => {});
  }, [buildLocalMeshMeta, sessionKey]);

  const trackMeshPresence = useCallback(async () => {
    const session = getSession(sessionKey);
    if (!session.channel) return;
    await session.channel.track(buildLocalMeshMeta()).catch(() => {});
  }, [buildLocalMeshMeta, sessionKey]);

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
            t.enabled = !session.desiredMuted;
          });
          stream.getVideoTracks().forEach((t) => {
            t.enabled = !session.desiredVideoOff;
          });
          session.localMediaStream = stream;
          session.isMuted = session.desiredMuted;
          session.isVideoOff = session.desiredVideoOff;
          setIsMuted(session.isMuted);
          setIsVideoOff(session.isVideoOff);
          await refreshDevices();
          return;
        } catch {
          // Fallback terpisah: kamera saja atau audio saja
        }
      }

      if (!session.getRawCameraTrack()) {
        const vTrack = await acquireVideoTrack();
        if (vTrack) {
          vTrack.enabled = !session.desiredVideoOff;
          session.setRawVideoTrack(vTrack);
        }
      }

      if (!session.getRawAudioTrack()) {
        const aTrack = await acquireAudioTrack();
        if (aTrack) {
          aTrack.enabled = !session.desiredMuted;
          session.setRawAudioTrack(aTrack);
        }
      }

      const gotAudio = Boolean(session.getRawAudioTrack());
      const gotVideo = Boolean(session.getRawCameraTrack());

      session.isMuted = !gotAudio || session.desiredMuted;
      session.desiredMuted = session.isMuted;
      session.isVideoOff = !gotVideo || session.desiredVideoOff;
      session.desiredVideoOff = session.isVideoOff;
      setIsMuted(session.isMuted);
      setIsVideoOff(session.isVideoOff);
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
      if (!session.room && session.peerConnections.size > 0) {
        const aTrack = session.getRawAudioTrack();
        const cTrack = session.getEffectiveCameraTrack();
        if (aTrack) await replaceMeshRoleTrack("audio", aTrack);
        if (cTrack) await replaceMeshRoleTrack("camera", cTrack);
      }
    } finally {
      session.mediaInitPromise = null;
    }
  }, [
    acquireAudioTrack,
    acquireVideoTrack,
    pushNotification,
    refreshDevices,
    replaceMeshRoleTrack,
    sessionKey
  ]);

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

      if (nextTrack) {
        nextTrack.enabled = !session.isVideoOff;
        await replaceMeshRoleTrack("camera", nextTrack);
      }
      syncMeshTiles();
    },
    [replaceMeshRoleTrack, sessionKey, syncLiveKitTiles, syncMeshTiles]
  );

  const setCameraEffect = useCallback(
    async (nextEffect: VideoEffectId) => {
      const session = getSession(sessionKey);
      if (session.camLock) return;
      session.camLock = true;
      setCamBusy(true);

      try {
        session.cameraEffect = nextEffect;
        setCameraEffectState(nextEffect);

        let rawCam = session.getRawCameraTrack();
        if (!rawCam && session.room) {
          const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
          const existing = camPub?.track?.mediaStreamTrack || null;
          if (existing && existing.readyState === "live" && !session.effectProcessor) {
            session.setRawVideoTrack(existing);
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
            session.setRawVideoTrack(rawCam);
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
            if (session.customBackgroundUrl) {
              session.effectProcessor.setCustomBackground(session.customBackgroundUrl);
            }
            session.effectProcessor.setEffect(nextEffect);
            session.effectProcessor.setPaused(session.isVideoOff);
            await applyCameraTrackToTransport(session.effectProcessor.getTrack());
          } else {
            session.effectProcessor = new VideoEffectProcessor(
              rawCam,
              nextEffect,
              session.customBackgroundUrl
            );
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

  // Upload & langsung terapkan background gambar custom
  const uploadBackgroundImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        pushNotification({
          title: "Format File Tidak Didukung",
          message: "Pilih file gambar dengan format PNG, JPG, atau WEBP.",
          type: "warning"
        });
        return;
      }

      if (file.size > MAX_BG_FILE_SIZE_BYTES) {
        pushNotification({
          title: "Ukuran Gambar Terlalu Besar",
          message: "Ukuran maksimal background gambar adalah 5 MB.",
          type: "warning"
        });
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const session = getSession(sessionKey);
        session.customBackgroundUrl = dataUrl;
        setCustomBackgroundUrl(dataUrl);

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(CUSTOM_BG_STORAGE_KEY, dataUrl);
          } catch {
            // Abaikan jika melebihi kuota localStorage
          }
        }

        session.effectProcessor?.setCustomBackground(dataUrl);
        await setCameraEffect("custom");

        pushNotification({
          title: "Background Terpasang",
          message: "Foto background berhasil di-upload dan diterapkan ke kamera.",
          type: "success"
        });
      } catch {
        pushNotification({
          title: "Upload Gagal",
          message: "Gagal memproses file gambar background.",
          type: "error"
        });
      }
    },
    [pushNotification, sessionKey, setCameraEffect]
  );

  // Hapus background gambar custom
  const clearCustomBackground = useCallback(async () => {
    const session = getSession(sessionKey);
    session.customBackgroundUrl = null;
    setCustomBackgroundUrl(null);
    session.effectProcessor?.setCustomBackground(null);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(CUSTOM_BG_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    }

    if (session.cameraEffect === "custom") {
      await setCameraEffect("none");
    }
  }, [sessionKey, setCameraEffect]);

  const callbacksRef = useRef({
    ensureLocalMedia,
    syncLiveKitTiles,
    syncMeshTiles,
    trackMeshPresence,
    broadcastMeshState,
    buildLocalMeshMeta,
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
    broadcastMeshState,
    buildLocalMeshMeta,
    refreshDevices,
    pushNotification,
    unlockAudio,
    acquireAudioTrack,
    acquireVideoTrack
  };

  // Langsung buka kamera & preview lokal sejak awal
  useEffect(() => {
    if (!normalizedCode || !userId) return;
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

    const onBeforeUnload = () => {
      session.cleanupMesh(localPeerId);
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unmounted = true;
      window.removeEventListener("beforeunload", onBeforeUnload);
      session.cleanupAll(localPeerId);
      sessions.delete(sessionKey);
    };
  }, [localPeerId, normalizedCode, sessionKey, userId]);

  useEffect(() => {
    const session = getSession(sessionKey);
    if (session.room) {
      syncLiveKitTiles();
    } else if (session.localMediaStream) {
      syncMeshTiles();
      broadcastMeshState();
    }
  }, [avatarUrl, broadcastMeshState, isHost, sessionKey, syncLiveKitTiles, syncMeshTiles, userName]);

  useEffect(() => {
    if (!enabled || !normalizedCode) return;
    let cancelled = false;
    const session = getSession(sessionKey);

    const triggerJoinChimeOnce = () => {
      if (!session.hasPlayedJoinChime) {
        session.hasPlayedJoinChime = true;
        playMeetingSound("join");
      }
    };

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
        if (camTrack) {
          camTrack.enabled = !session.isVideoOff;
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
      if (existing && existing.connectionState !== "failed" && existing.connectionState !== "closed") {
        return existing;
      }

      if (existing) {
        try {
          existing.close();
        } catch {
          // Ignore close error
        }
        session.peerConnections.delete(peerId);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      session.peerConnections.set(peerId, pc);

      if (isInitiator) {
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && session.channel) {
          void session.channel.send({
            type: "broadcast",
            event: "webrtc-signal",
            payload: {
              to: peerId,
              from: localPeerId,
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

          if (
            !cancelled &&
            pc.connectionState === "failed" &&
            session.peerMeta.has(peerId) &&
            localPeerId < peerId
          ) {
            setTimeout(() => {
              if (!cancelled && session.peerMeta.has(peerId) && !session.peerConnections.has(peerId)) {
                void initiateOfferToPeer(peerId);
              }
            }, 1500);
          }
        }
      };

      return pc;
    };

    const initiateOfferToPeer = async (peerId: string) => {
      if (cancelled || peerId === localPeerId || localPeerId >= peerId) return;
      if (session.peerConnections.has(peerId) || !session.channel) return;

      const pc = createMeshPeerConnection(peerId, true);
      try {
        await attachLocalTracksToTransceivers(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await session.channel.send({
          type: "broadcast",
          event: "webrtc-signal",
          payload: {
            to: peerId,
            from: localPeerId,
            kind: "offer",
            sdp: offer
          }
        });
      } catch {
        // Ignore transient negotiation error
      }
    };

    const registerDiscoveredPeer = (meta: MeshPeerMeta, playChimeIfNew: boolean) => {
      const peerId = meta.peerId || meta.userId;
      if (!peerId || peerId === localPeerId) return;

      const isNewPeer = !session.knownRemotePeers.has(peerId);
      session.peerMeta.set(peerId, { ...meta, peerId });
      session.peerLastSeen.set(peerId, Date.now());
      session.knownRemotePeers.add(peerId);

      if (isNewPeer && playChimeIfNew) {
        playMeetingSound("join");
      }

      if (localPeerId < peerId && !session.peerConnections.has(peerId)) {
        void initiateOfferToPeer(peerId);
      }

      callbacksRef.current.syncMeshTiles();
      callbacksRef.current.unlockAudio();
    };

    const removePeer = (peerId: string, playChime: boolean) => {
      if (!peerId || peerId === localPeerId) return;
      const existed = session.peerMeta.has(peerId) || session.knownRemotePeers.has(peerId);

      const pc = session.peerConnections.get(peerId);
      if (pc) {
        try {
          pc.close();
        } catch {
          // Ignore close error
        }
        session.peerConnections.delete(peerId);
      }
      session.remoteTracks.delete(peerId);
      session.peerMeta.delete(peerId);
      session.peerLastSeen.delete(peerId);
      session.pendingIce.delete(peerId);
      session.knownRemotePeers.delete(peerId);

      if (existed) {
        if (playChime) playMeetingSound("leave");
        callbacksRef.current.syncMeshTiles();
      }
    };

    const startMultiUserMeshFallback = async (reason: string) => {
      setIsSFUConnected(false);
      setSfuNotice(reason);
      setConnectionState("mesh-connected");

      await callbacksRef.current.ensureLocalMedia();
      if (cancelled) return;
      callbacksRef.current.syncMeshTiles();

      const supabase = createClient();
      const channel = supabase.channel(`ramameet-mesh:${normalizedCode}`, {
        config: {
          presence: { key: localPeerId },
          broadcast: { self: false }
        }
      });
      session.channel = channel;

      let initialPresenceSynced = false;

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState<MeshPeerMeta>();
          const presenceIds = new Set<string>();

          Object.entries(state).forEach(([key, entries]) => {
            const latest = entries[entries.length - 1];
            if (!latest) return;
            const peerId = latest.peerId || key;
            presenceIds.add(peerId);
            registerDiscoveredPeer({ ...latest, peerId }, initialPresenceSynced);
          });

          const now = Date.now();
          for (const peerId of Array.from(session.peerMeta.keys())) {
            if (peerId === localPeerId) continue;
            const lastSeen = session.peerLastSeen.get(peerId) || 0;
            if (!presenceIds.has(peerId) && now - lastSeen > 12000) {
              removePeer(peerId, initialPresenceSynced);
            }
          }

          initialPresenceSynced = true;
          callbacksRef.current.syncMeshTiles();
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
          const firstLeft = leftPresences?.[0] as unknown as Partial<MeshPeerMeta> | undefined;
          const peerId = firstLeft?.peerId || key;
          if (peerId && peerId !== localPeerId) {
            removePeer(peerId, true);
          }
        })
        .on("broadcast", { event: "peer-join" }, ({ payload }) => {
          const meta = payload as unknown as MeshPeerMeta | undefined;
          if (!meta) return;
          const peerId = meta.peerId || meta.userId;
          if (!peerId || peerId === localPeerId) return;

          registerDiscoveredPeer({ ...meta, peerId }, true);

          void channel.send({
            type: "broadcast",
            event: "peer-welcome",
            payload: {
              to: peerId,
              meta: callbacksRef.current.buildLocalMeshMeta()
            }
          });
        })
        .on("broadcast", { event: "peer-welcome" }, ({ payload }) => {
          if (!payload || (payload.to && payload.to !== localPeerId)) return;
          const meta = payload.meta as unknown as MeshPeerMeta | undefined;
          if (!meta) return;
          const peerId = meta.peerId || meta.userId;
          if (!peerId || peerId === localPeerId) return;

          registerDiscoveredPeer({ ...meta, peerId }, false);
        })
        .on("broadcast", { event: "peer-state" }, ({ payload }) => {
          const meta = payload as unknown as MeshPeerMeta | undefined;
          if (!meta) return;
          const peerId = meta.peerId || meta.userId;
          if (!peerId || peerId === localPeerId) return;

          registerDiscoveredPeer({ ...meta, peerId }, true);
        })
        .on("broadcast", { event: "peer-leave" }, ({ payload }) => {
          const peerId = (payload?.peerId || payload?.userId) as string | undefined;
          if (peerId && peerId !== localPeerId) {
            removePeer(peerId, true);
          }
        })
        .on("broadcast", { event: "webrtc-signal" }, async ({ payload }) => {
          if (!payload || payload.to !== localPeerId) return;
          const fromId = payload.from as string;
          if (!fromId || fromId === localPeerId) return;

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
                  from: localPeerId,
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
            triggerJoinChimeOnce();
            const myMeta = callbacksRef.current.buildLocalMeshMeta();
            await callbacksRef.current.trackMeshPresence();

            void channel.send({
              type: "broadcast",
              event: "peer-join",
              payload: myMeta
            });

            if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
            session.heartbeatTimer = setInterval(() => {
              if (cancelled || !session.channel) return;
              void session.channel
                .send({
                  type: "broadcast",
                  event: "peer-state",
                  payload: callbacksRef.current.buildLocalMeshMeta()
                })
                .catch(() => {});

              const now = Date.now();
              for (const [peerId, lastSeen] of Array.from(session.peerLastSeen.entries())) {
                if (now - lastSeen > 20000) {
                  removePeer(peerId, true);
                }
              }
            }, 5000);
          }
        });
    };

    const connectLiveKit = async () => {
      await callbacksRef.current.ensureLocalMedia();
      if (cancelled) return;
      callbacksRef.current.syncMeshTiles();

      if (!token || !serverUrl) {
        await startMultiUserMeshFallback(
          "Mode Multi-User WebRTC Mesh aktif (Kamera + Suara + Share Screen simultan)."
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
        .on(RoomEvent.ParticipantConnected, () => {
          playMeetingSound("join");
          onUpdate();
        })
        .on(RoomEvent.ParticipantDisconnected, () => {
          playMeetingSound("leave");
          onUpdate();
        })
        .on(RoomEvent.TrackPublished, onUpdate)
        .on(RoomEvent.TrackUnpublished, onUpdate)
        .on(RoomEvent.TrackSubscribed, onUpdate)
        .on(RoomEvent.TrackUnsubscribed, onUpdate)
        .on(RoomEvent.LocalTrackPublished, onUpdate)
        .on(RoomEvent.LocalTrackUnpublished, onUpdate)
        .on(RoomEvent.TrackMuted, onUpdate)
        .on(RoomEvent.TrackUnmuted, onUpdate)
        .on(RoomEvent.TrackStreamStateChanged, onUpdate)
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
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const connectPromise = room.connect(serverUrl, token);
        connectPromise.catch(() => {});

        await Promise.race([
          connectPromise,
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("LiveKit connect timeout")), 5000);
          })
        ]).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });

        if (cancelled) {
          room.disconnect();
          return;
        }
        setSfuNotice(null);

        void room.startAudio().catch(() => {});
        triggerJoinChimeOnce();

        let existingAudio = session.getRawAudioTrack();
        if (!existingAudio && !session.isMuted) {
          existingAudio = await callbacksRef.current.acquireAudioTrack();
          if (existingAudio) session.setRawAudioTrack(existingAudio);
        }

        if (existingAudio) {
          existingAudio.enabled = !session.isMuted;
          const micPub = await room.localParticipant
            .publishTrack(existingAudio, { source: Track.Source.Microphone })
            .catch(() => null);
          if (session.isMuted && micPub?.track) {
            await micPub.track.mute().catch(() => {});
          }
        } else {
          session.isMuted = true;
          session.desiredMuted = true;
          setIsMuted(true);
        }

        let existingCam = session.getEffectiveCameraTrack();
        if (!existingCam && !session.isVideoOff) {
          const freshCam = await callbacksRef.current.acquireVideoTrack();
          if (freshCam) {
            session.setRawVideoTrack(freshCam);
            existingCam = session.getEffectiveCameraTrack();
          }
        }

        if (existingCam) {
          existingCam.enabled = !session.isVideoOff;
          const camPub = await room.localParticipant
            .publishTrack(existingCam, { source: Track.Source.Camera })
            .catch(() => null);
          if (session.isVideoOff && camPub?.track) {
            await camPub.track.mute().catch(() => {});
          }
        } else {
          session.isVideoOff = true;
          session.desiredVideoOff = true;
          setIsVideoOff(true);
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
      session.cleanupTransport(localPeerId);
    };
  }, [enabled, localPeerId, normalizedCode, token, serverUrl, sessionKey]);

  const syncDesiredMicState = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.micProcessing) return;
    session.micProcessing = true;
    session.micLock = true;

    try {
      while (true) {
        const wantMuted = session.desiredMuted;

        if (wantMuted) {
          const rawAudio = session.getRawAudioTrack();
          if (rawAudio) rawAudio.enabled = false;

          if (session.room) {
            const micPub = session.room.localParticipant.getTrackPublication(
              Track.Source.Microphone
            );
            if (micPub?.track) {
              micPub.track.mediaStreamTrack.enabled = false;
              if (!micPub.isMuted) {
                await micPub.track.mute().catch(() => {});
              }
            }
            syncLiveKitTiles();
          } else {
            syncMeshTiles();
            broadcastMeshState();
          }
        } else {
          let audioTrack = session.getRawAudioTrack();
          if (!audioTrack) {
            setMicBusy(true);
            audioTrack = await acquireAudioTrack(selectedAudioId);
            setMicBusy(false);

            if (!audioTrack) {
              session.isMuted = true;
              session.desiredMuted = true;
              setIsMuted(true);
              pushNotification({
                title: "Mikrofon Tidak Dapat Diaktifkan",
                message: "Aktifkan izin mikrofon di browser atau periksa perangkat audio Anda.",
                type: "warning"
              });
              if (session.room) syncLiveKitTiles();
              else {
                syncMeshTiles();
                broadcastMeshState();
              }
              break;
            }
            session.setRawAudioTrack(audioTrack);
            void refreshDevices();
          }

          audioTrack.enabled = true;

          if (session.room) {
            const micPub = session.room.localParticipant.getTrackPublication(
              Track.Source.Microphone
            );
            const pubTrack = micPub?.track?.mediaStreamTrack || null;

            if (micPub?.track && pubTrack && pubTrack.readyState === "live") {
              pubTrack.enabled = true;
              if (micPub.isMuted) {
                await micPub.track.unmute().catch(() => {});
              }
            } else {
              if (micPub?.track) {
                await Promise.resolve(
                  session.room.localParticipant.unpublishTrack(micPub.track, false)
                ).catch(() => {});
              }
              await session.room.localParticipant
                .publishTrack(audioTrack, { source: Track.Source.Microphone })
                .catch(() => {});
            }
            syncLiveKitTiles();
          } else {
            await replaceMeshRoleTrack("audio", audioTrack);
            syncMeshTiles();
            broadcastMeshState();
          }
        }

        if (session.desiredMuted === wantMuted) break;
      }
    } finally {
      session.micProcessing = false;
      session.micLock = false;
      setMicBusy(false);
    }
  }, [
    acquireAudioTrack,
    broadcastMeshState,
    pushNotification,
    refreshDevices,
    replaceMeshRoleTrack,
    selectedAudioId,
    sessionKey,
    syncLiveKitTiles,
    syncMeshTiles
  ]);

  const toggleMute = useCallback(async () => {
    const session = getSession(sessionKey);
    unlockAudio();

    const nextMuted = !session.desiredMuted;
    session.desiredMuted = nextMuted;
    session.isMuted = nextMuted;
    setIsMuted(nextMuted);

    const rawAudio = session.getRawAudioTrack();
    if (rawAudio) rawAudio.enabled = !nextMuted;
    playMeetingSound(nextMuted ? "toggle-off" : "toggle-on");

    if (session.room) syncLiveKitTiles();
    else {
      syncMeshTiles();
      broadcastMeshState();
    }

    await syncDesiredMicState();
  }, [
    broadcastMeshState,
    sessionKey,
    syncDesiredMicState,
    syncLiveKitTiles,
    syncMeshTiles,
    unlockAudio
  ]);

  const forceMute = useCallback(async () => {
    const session = getSession(sessionKey);
    session.desiredMuted = true;
    session.isMuted = true;
    setIsMuted(true);

    const rawAudio = session.getRawAudioTrack();
    if (rawAudio) rawAudio.enabled = false;

    if (session.room) syncLiveKitTiles();
    else {
      syncMeshTiles();
      broadcastMeshState();
    }

    await syncDesiredMicState();
  }, [broadcastMeshState, sessionKey, syncDesiredMicState, syncLiveKitTiles, syncMeshTiles]);

  const syncDesiredVideoState = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.camProcessing) return;
    session.camProcessing = true;
    session.camLock = true;

    try {
      while (true) {
        const wantVideoOff = session.desiredVideoOff;

        if (wantVideoOff) {
          const rawCam = session.getRawCameraTrack();
          if (rawCam) rawCam.enabled = false;
          if (session.effectProcessor) session.effectProcessor.setPaused(true);

          if (session.room) {
            const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camPub?.track) {
              camPub.track.mediaStreamTrack.enabled = false;
              if (!camPub.isMuted) {
                await camPub.track.mute().catch(() => {});
              }
            }
            syncLiveKitTiles();
          } else {
            syncMeshTiles();
            broadcastMeshState();
          }
        } else {
          let rawCam = session.getRawCameraTrack();
          if (!rawCam) {
            setCamBusy(true);
            rawCam = await acquireVideoTrack(selectedVideoId);
            setCamBusy(false);

            if (!rawCam) {
              session.isVideoOff = true;
              session.desiredVideoOff = true;
              setIsVideoOff(true);
              pushNotification({
                title: "Kamera Gagal Diaktifkan",
                message: "Pastikan kamera tidak sedang dipakai aplikasi lain dan izin browser aktif.",
                type: "warning"
              });
              if (session.room) syncLiveKitTiles();
              else {
                syncMeshTiles();
                broadcastMeshState();
              }
              break;
            }
            session.setRawVideoTrack(rawCam);
            void refreshDevices();
          }

          rawCam.enabled = true;

          if (session.cameraEffect !== "none") {
            const processedTrack = session.effectProcessor?.getTrack();
            if (!session.effectProcessor || !processedTrack || processedTrack.readyState !== "live") {
              session.destroyEffectProcessor();
              session.effectProcessor = new VideoEffectProcessor(
                rawCam,
                session.cameraEffect,
                session.customBackgroundUrl
              );
            }
            session.effectProcessor.setPaused(false);
          }

          const effectiveTrack = session.getEffectiveCameraTrack();
          if (effectiveTrack) effectiveTrack.enabled = true;

          if (session.room) {
            const camPub = session.room.localParticipant.getTrackPublication(Track.Source.Camera);
            const pubTrack = camPub?.track?.mediaStreamTrack || null;

            if (
              camPub?.track &&
              pubTrack &&
              pubTrack.readyState === "live" &&
              (!effectiveTrack || pubTrack === effectiveTrack)
            ) {
              pubTrack.enabled = true;
              if (camPub.isMuted) {
                await camPub.track.unmute().catch(() => {});
              }
              if (camPub.track.mediaStreamTrack.readyState !== "live" && effectiveTrack) {
                await Promise.resolve(
                  session.room.localParticipant.unpublishTrack(camPub.track, false)
                ).catch(() => {});
                await session.room.localParticipant
                  .publishTrack(effectiveTrack, { source: Track.Source.Camera })
                  .catch(() => {});
              }
            } else if (effectiveTrack) {
              if (camPub?.track) {
                await Promise.resolve(
                  session.room.localParticipant.unpublishTrack(camPub.track, false)
                ).catch(() => {});
              }
              await session.room.localParticipant
                .publishTrack(effectiveTrack, { source: Track.Source.Camera })
                .catch(() => {});
            }
            syncLiveKitTiles();
          } else {
            if (effectiveTrack) {
              await replaceMeshRoleTrack("camera", effectiveTrack);
            }
            syncMeshTiles();
            broadcastMeshState();
          }
        }

        if (session.desiredVideoOff === wantVideoOff) break;
      }
    } finally {
      session.camProcessing = false;
      session.camLock = false;
      setCamBusy(false);
    }
  }, [
    acquireVideoTrack,
    broadcastMeshState,
    pushNotification,
    refreshDevices,
    replaceMeshRoleTrack,
    selectedVideoId,
    sessionKey,
    syncLiveKitTiles,
    syncMeshTiles
  ]);

  const toggleVideo = useCallback(async () => {
    const session = getSession(sessionKey);
    unlockAudio();

    const nextVideoOff = !session.desiredVideoOff;
    session.desiredVideoOff = nextVideoOff;
    session.isVideoOff = nextVideoOff;
    setIsVideoOff(nextVideoOff);

    const rawCam = session.getRawCameraTrack();
    if (rawCam) rawCam.enabled = !nextVideoOff;
    if (session.effectProcessor) session.effectProcessor.setPaused(nextVideoOff);
    playMeetingSound(nextVideoOff ? "toggle-off" : "toggle-on");

    if (session.room) syncLiveKitTiles();
    else {
      syncMeshTiles();
      broadcastMeshState();
    }

    await syncDesiredVideoState();
  }, [
    broadcastMeshState,
    sessionKey,
    syncDesiredVideoState,
    syncLiveKitTiles,
    syncMeshTiles,
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
    broadcastMeshState();
  }, [broadcastMeshState, replaceMeshRoleTrack, sessionKey, syncMeshTiles]);

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
    broadcastMeshState();
  }, [broadcastMeshState, replaceMeshRoleTrack, sessionKey, syncLiveKitTiles, syncMeshTiles]);

  const toggleScreenShare = useCallback(async () => {
    const session = getSession(sessionKey);
    if (session.screenLock) return;
    unlockAudio();

    session.screenLock = true;
    try {
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
        playMeetingSound("toggle-off");
        return;
      }

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
          message: "Share Screen di web hanya didukung di Desktop atau Chrome Android terbaru.",
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
              audio: false
            });
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
          playMeetingSound("toggle-on");
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
        broadcastMeshState();
        playMeetingSound("toggle-on");
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
    broadcastMeshState,
    pushNotification,
    replaceMeshRoleTrack,
    sessionKey,
    stopLocalScreenStream,
    syncLiveKitTiles,
    syncMeshTiles,
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
      session.setRawAudioTrack(newTrack);

      if (session.room) {
        const micPub = session.room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          await Promise.resolve(
            session.room.localParticipant.unpublishTrack(micPub.track, true)
          ).catch(() => {});
        }
        const published = await session.room.localParticipant
          .publishTrack(newTrack, { source: Track.Source.Microphone })
          .catch(() => null);
        if (session.isMuted && published?.track) {
          await published.track.mute().catch(() => {});
        }
        syncLiveKitTiles();
      } else {
        await replaceMeshRoleTrack("audio", newTrack);
        syncMeshTiles();
        broadcastMeshState();
      }
    },
    [
      acquireAudioTrack,
      broadcastMeshState,
      pushNotification,
      replaceMeshRoleTrack,
      sessionKey,
      syncLiveKitTiles,
      syncMeshTiles
    ]
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
      session.setRawVideoTrack(newTrack);

      if (session.cameraEffect !== "none") {
        session.destroyEffectProcessor();
        session.effectProcessor = new VideoEffectProcessor(
          newTrack,
          session.cameraEffect,
          session.customBackgroundUrl
        );
        session.effectProcessor.setPaused(session.isVideoOff);
      }
      await applyCameraTrackToTransport(session.getEffectiveCameraTrack());
      if (!session.room) broadcastMeshState();
    },
    [
      acquireVideoTrack,
      applyCameraTrackToTransport,
      broadcastMeshState,
      pushNotification,
      sessionKey
    ]
  );

  const disconnect = useCallback(() => {
    const session = getSession(sessionKey);
    playMeetingSound("leave");
    session.cleanupAll(localPeerId);
    sessions.delete(sessionKey);
    setIsScreenSharing(false);
    setIsScreenPaused(false);
    setCameraEffectState("none");
    setTiles([]);
  }, [localPeerId, sessionKey, setTiles]);

  return {
    connectionState,
    isSFUConnected,
    sfuNotice,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isScreenPaused,
    cameraEffect,
    customBackgroundUrl,
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
    uploadBackgroundImage,
    clearCustomBackground,
    switchAudioDevice,
    switchVideoDevice,
    disconnect
  };
}

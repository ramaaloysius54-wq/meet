"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Copy,
  Check,
  Lock,
  Mic,
  MicOff,
  Monitor,
  Send,
  ShieldCheck,
  Users,
  VideoOff,
  Wifi,
  X,
  Disc,
  Crown
} from "lucide-react";
import { MeetingControls } from "@/components/meeting/MeetingControls";
import { Modal } from "@/components/ui/Modal";
import { useLiveKitRoom } from "@/hooks/useLiveKitRoom";
import { createClient } from "@/lib/supabase/client";
import { useMeetingStore } from "@/stores/useMeetingStore";
import type { LiveParticipantTile, Meeting } from "@/types";
import { cn } from "@/utils/format";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: string;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  senderName: string;
}

function MediaTrackVideo({
  track,
  mirror = false,
  contain = false,
  className
}: {
  track: MediaStreamTrack | null;
  mirror?: boolean;
  contain?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!track) {
      el.srcObject = null;
      return;
    }

    const stream = new MediaStream([track]);
    el.srcObject = stream;
    void el.play().catch(() => {});

    return () => {
      if (el.srcObject === stream) {
        el.srcObject = null;
      }
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={cn(
        "h-full w-full",
        contain ? "object-contain bg-black" : "object-cover",
        mirror && "scale-x-[-1]",
        className
      )}
    />
  );
}

function RemoteAudioPlayer({ track }: { track: MediaStreamTrack | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    if (!track) {
      el.srcObject = null;
      return;
    }

    const stream = new MediaStream([track]);
    el.srcObject = stream;
    el.volume = 1;
    void el.play().catch(() => {});

    return () => {
      if (el.srcObject === stream) {
        el.srcObject = null;
      }
    };
  }, [track]);

  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
}

function ParticipantTileCard({
  tile,
  compact = false
}: {
  tile: LiveParticipantTile;
  compact?: boolean;
}) {
  const initials = useMemo(() => {
    const parts = (tile.name || "U").trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [tile.name]);

  const qualityColor =
    tile.connectionQuality === "excellent"
      ? "text-emerald-400"
      : tile.connectionQuality === "good"
      ? "text-sky-400"
      : tile.connectionQuality === "poor"
      ? "text-amber-400"
      : "text-rm-muted";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl border bg-[#0C1733] transition-all",
        tile.isSpeaking
          ? "border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.35)]"
          : "border-blue-400/15",
        compact ? "aspect-video min-h-[110px]" : "h-full min-h-[200px] w-full"
      )}
    >
      {/* Audio jarak jauh (jangan putar audio lokal agar tidak echo) */}
      {!tile.isLocal && tile.audioTrack && <RemoteAudioPlayer track={tile.audioTrack} />}
      {!tile.isLocal && tile.screenAudioTrack && (
        <RemoteAudioPlayer track={tile.screenAudioTrack} />
      )}

      {/* Video Kamera atau Avatar Fallback */}
      {!tile.isVideoOff && tile.videoTrack ? (
        <MediaTrackVideo track={tile.videoTrack} mirror={tile.isLocal} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-4">
          {tile.avatarUrl ? (
            <img
              src={tile.avatarUrl}
              alt={tile.name}
              className={cn(
                "rounded-full border-2 border-blue-400/40 object-cover",
                compact ? "h-12 w-12" : "h-20 w-20"
              )}
            />
          ) : (
            <div
              className={cn(
                "flex items-center justify-center rounded-full border border-sky-400/30 bg-gradient-to-br from-[#2589FF] to-[#1649B8] font-bold text-white shadow-lg",
                compact ? "h-12 w-12 text-sm" : "h-20 w-20 text-2xl"
              )}
            >
              {initials}
            </div>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-rm-muted">
            <VideoOff className="h-3 w-3" />
            Kamera mati
          </span>
        </div>
      )}

      {/* Badge Kualitas Koneksi */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 backdrop-blur-md">
        <Wifi className={cn("h-3 w-3", qualityColor)} />
      </div>

      {/* Label Nama & Status Mic */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
          {tile.isMuted ? (
            <MicOff className="h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : (
            <Mic className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          )}
          <span className="truncate">
            {tile.name}
            {tile.isLocal ? " (Anda)" : ""}
          </span>
          {tile.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
        </div>
      </div>
    </div>
  );
}

export default function MeetingRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const rawCode = Array.isArray(params?.code) ? params.code[0] : params?.code || "";
  const meetingCode = useMemo(() => decodeURIComponent(rawCode).trim(), [rawCode]);
  const normalizedCode = useMemo(() => meetingCode.toLowerCase(), [meetingCode]);

  const profile = useMeetingStore((s) => s.profile);
  const tiles = useMeetingStore((s) => s.tiles);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [authUser, setAuthUser] = useState<{
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null>(null);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [lkServerUrl, setLkServerUrl] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false);

  const [isLocked, setIsLocked] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [sidePanel, setSidePanel] = useState<"chat" | "participants" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<"code" | "link" | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef(sidePanel);
  sidePanelRef.current = sidePanel;

  // 1. Resolusi user login + metadata meeting + token LiveKit (fallback aman ke WebRTC Mesh)
  useEffect(() => {
    if (!meetingCode) return;
    let cancelled = false;

    const bootstrapRoom = async () => {
      const supabase = createClient();

      // Ambil identitas user
      let resolvedId = profile?.id || "";
      let resolvedName = profile?.full_name || "";
      let resolvedAvatar: string | null =
        ((profile as unknown as { avatar_url?: string | null } | null)?.avatar_url) ?? null;

      if (!resolvedId) {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user) {
          resolvedId = user.id;
          resolvedName =
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split("@")[0] ||
            "Peserta";
          resolvedAvatar = (user.user_metadata?.avatar_url as string | undefined) || null;
        } else {
          resolvedId = `guest-${Math.random().toString(36).slice(2, 10)}`;
          resolvedName = "Tamu RamaMeet";
        }
      }

      if (cancelled) return;
      setAuthUser({
        id: resolvedId,
        name: resolvedName || "Peserta",
        avatarUrl: resolvedAvatar
      });

      // Ambil info meeting dari Supabase (jika ditemukan)
      try {
        const { data } = await supabase
          .from("meetings")
          .select("*")
          .eq("meeting_code", meetingCode)
          .maybeSingle();
        if (!cancelled && data) {
          setMeeting(data as Meeting);
        }
      } catch {
        // Tetap lanjutkan masuk room meskipun query metadata dibatasi RLS
      }

      // Coba ambil LiveKit token dari backend API (jika tidak tersedia, useLiveKitRoom otomatis pakai Mesh)
      try {
        const res = await fetch(
          `/api/livekit/token?room=${encodeURIComponent(meetingCode)}&username=${encodeURIComponent(
            resolvedName || "Peserta"
          )}`
        );
        if (res.ok) {
          const json = (await res.json()) as { token?: string; url?: string; serverUrl?: string };
          if (!cancelled && json.token) {
            setLkToken(json.token);
            setLkServerUrl(
              json.serverUrl || json.url || process.env.NEXT_PUBLIC_LIVEKIT_URL || null
            );
          }
        }
      } catch {
        // Fallback otomatis ke WebRTC Mesh
      }

      if (!cancelled) {
        setRoomReady(true);
      }
    };

    void bootstrapRoom();

    return () => {
      cancelled = true;
    };
  }, [meetingCode, profile]);

  const isHost = Boolean(authUser && meeting && meeting.host_id === authUser.id);

  // 2. Hook LiveKit SFU + WebRTC Mesh + HD Voice + Upload Background
  const lk = useLiveKitRoom({
    meetingCode,
    token: lkToken,
    serverUrl: lkServerUrl,
    userId: authUser?.id || "",
    userName: authUser?.name || "Peserta",
    avatarUrl: authUser?.avatarUrl || null,
    isHost,
    enabled: roomReady && Boolean(authUser?.id)
  });

  // 3. Timer durasi meeting
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDuration = useMemo(() => {
    const hrs = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  }, [elapsedSec]);

  // 4. Realtime Channel untuk Chat, Reactions, Lock, & End Meeting for All
  const spawnReaction = useCallback((emoji: string, senderName: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setReactions((prev) => [...prev.slice(-8), { id, emoji, senderName }]);
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  }, []);

  useEffect(() => {
    if (!roomReady || !normalizedCode || !authUser?.id) return;

    const supabase = createClient();
    const channel = supabase.channel(`ramameet-room:${normalizedCode}`, {
      config: { broadcast: { self: false } }
    });
    roomChannelRef.current = channel;

    channel
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const msg = payload as ChatMessage | undefined;
        if (!msg?.id) return;
        setMessages((prev) => [...prev, msg]);
        if (sidePanelRef.current !== "chat") {
          setUnreadChatCount((c) => c + 1);
        }
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        if (!payload?.emoji) return;
        spawnReaction(String(payload.emoji), String(payload.senderName || "Peserta"));
      })
      .on("broadcast", { event: "room-lock" }, ({ payload }) => {
        const nextLocked = Boolean(payload?.locked);
        setIsLocked(nextLocked);
        pushNotification({
          title: nextLocked ? "Meeting Dikunci" : "Kunci Dibuka",
          message: nextLocked
            ? "Host mengunci ruang meeting."
            : "Host membuka kembali akses ruang meeting.",
          type: "info"
        });
      })
      .on("broadcast", { event: "end-meeting" }, () => {
        pushNotification({
          title: "Meeting Berakhir",
          message: "Host telah mengakhiri meeting untuk semua peserta.",
          type: "info"
        });
        lk.disconnect();
        router.push("/");
      })
      .subscribe();

    return () => {
      roomChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [authUser?.id, lk, normalizedCode, pushNotification, roomReady, router, spawnReaction]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sidePanel]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !authUser) return;

    const msg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: authUser.id,
      senderName: authUser.name,
      text,
      sentAt: new Date().toISOString()
    };

    setMessages((prev) => [...prev, msg]);
    setChatInput("");

    void roomChannelRef.current?.send({
      type: "broadcast",
      event: "chat",
      payload: msg
    });
  };

  const handleSendReaction = (emoji: string) => {
    const senderName = authUser?.name || "Anda";
    spawnReaction(emoji, senderName);
    void roomChannelRef.current?.send({
      type: "broadcast",
      event: "reaction",
      payload: { emoji, senderName }
    });
  };

  const handleToggleLock = () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    void roomChannelRef.current?.send({
      type: "broadcast",
      event: "room-lock",
      payload: { locked: nextLocked }
    });
    pushNotification({
      title: nextLocked ? "Meeting Dikunci" : "Kunci Dibuka",
      message: nextLocked
        ? "Peserta baru tidak dapat bergabung saat ruang dikunci."
        : "Ruang meeting dibuka kembali.",
      type: "info"
    });
  };

  const handleToggleRecording = () => {
    const next = !isRecording;
    setIsRecording(next);
    pushNotification({
      title: next ? "Recording Dimulai" : "Recording Dihentikan",
      message: next
        ? "Status rekaman meeting aktif."
        : "Rekaman meeting telah dihentikan.",
      type: next ? "warning" : "info"
    });
  };

  const handleLeave = () => {
    lk.disconnect();
    router.push("/");
  };

  const handleEndForAll = async () => {
    void roomChannelRef.current?.send({
      type: "broadcast",
      event: "end-meeting",
      payload: { endedBy: authUser?.id }
    });

    if (meeting?.id) {
      try {
        const supabase = createClient();
        await supabase.from("meetings").update({ status: "ended" }).eq("id", meeting.id);
      } catch {
        // Abaikan jika update status gagal
      }
    }

    lk.disconnect();
    router.push("/");
  };

  const copyText = (kind: "code" | "link") => {
    const value =
      kind === "link" ? `${window.location.origin}/meeting/${meetingCode}` : meetingCode;
    navigator.clipboard.writeText(value);
    setCopiedKey(kind);
    pushNotification({
      title: kind === "link" ? "Link Undangan Disalin" : "Meeting Code Disalin",
      message: value,
      type: "success"
    });
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // Cari peserta yang sedang Share Screen untuk tampilan spotlight
  const activeScreenTile = useMemo(
    () => tiles.find((t) => t.isScreenSharing && t.screenTrack),
    [tiles]
  );

  const gridClass = useMemo(() => {
    const count = Math.max(1, tiles.length);
    if (count === 1) return "grid-cols-1 max-w-4xl mx-auto";
    if (count === 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
    if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
    return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  }, [tiles.length]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#060C1D] text-white">
      {/* Top Room Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-400/15 bg-[#0A132A]/90 px-3 py-2.5 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2589FF] to-[#1668E8] shadow-[0_0_14px_rgba(37,137,255,0.45)]">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">
                {meeting?.title || "RamaMeet Room"}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              )}
              {isRecording && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  <Disc className="h-3 w-3 animate-pulse" />
                  REC
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-rm-muted">
              <button
                type="button"
                onClick={() => copyText("code")}
                className="inline-flex items-center gap-1 font-mono transition hover:text-sky-300"
                title="Klik untuk salin Meeting ID"
              >
                <span>ID: {meetingCode}</span>
                {copiedKey === "code" ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
              <span>•</span>
              <span className="font-mono text-sky-300">{formattedDuration}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
              lk.isSFUConnected
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                : "border-sky-400/30 bg-sky-500/10 text-sky-300"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                lk.isSFUConnected ? "bg-emerald-400" : "bg-sky-400"
              )}
            />
            {lk.isSFUConnected ? "LiveKit HD SFU" : "HD WebRTC Mesh"}
          </span>

          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-blue-400/25 bg-blue-500/15 px-3 text-xs font-semibold text-sky-300 transition hover:bg-blue-500/25"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Invite</span>
          </button>
        </div>
      </header>

      {/* Main Stage + Optional Side Panel */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden p-2.5 sm:p-4">
        {/* Video Stage */}
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {lk.sfuNotice && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-200">
              <span className="truncate">{lk.sfuNotice}</span>
            </div>
          )}

          {activeScreenTile && activeScreenTile.screenTrack ? (
            /* Mode Spotlight Share Screen */
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 lg:flex-row">
              <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-emerald-400/35 bg-black">
                <MediaTrackVideo track={activeScreenTile.screenTrack} contain />
                <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md">
                  <Monitor className="h-3.5 w-3.5" />
                  <span>{activeScreenTile.name} sedang berbagi layar</span>
                </div>
              </div>

              <div className="grid max-h-36 shrink-0 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:max-h-none lg:w-64 lg:grid-cols-1">
                {tiles.map((tile) => (
                  <ParticipantTileCard key={tile.identity} tile={tile} compact />
                ))}
              </div>
            </div>
          ) : (
            /* Mode Grid Kamera */
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className={cn("grid h-full w-full gap-2.5 sm:gap-3", gridClass)}>
                {tiles.length === 0 ? (
                  <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-blue-400/15 bg-[#0C1733]/70 text-sm text-rm-muted">
                    Menyiapkan kamera dan audio HD...
                  </div>
                ) : (
                  tiles.map((tile) => <ParticipantTileCard key={tile.identity} tile={tile} />)
                )}
              </div>
            </div>
          )}

          {/* Floating Reactions Overlay */}
          {reactions.length > 0 && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-30 flex flex-wrap gap-2">
              {reactions.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-3 py-1 text-sm shadow-lg backdrop-blur-md animate-bounce"
                >
                  <span className="text-lg">{r.emoji}</span>
                  <span className="text-[11px] font-medium text-blue-100">{r.senderName}</span>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Side Drawer: Chat / Participants */}
        {sidePanel && (
          <aside className="absolute inset-y-2.5 right-2.5 z-30 flex w-[calc(100%-1.25rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-blue-400/20 bg-[#0A132A]/95 shadow-2xl backdrop-blur-xl lg:static lg:ml-3 lg:w-80">
            <div className="flex items-center justify-between border-b border-blue-400/15 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                {sidePanel === "chat" ? (
                  <>
                    <span>In-Meeting Chat</span>
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 text-sky-400" />
                    <span>Participants ({tiles.length})</span>
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setSidePanel(null)}
                className="rounded-lg p-1 text-rm-muted transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sidePanel === "participants" ? (
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {tiles.map((tile) => (
                  <div
                    key={tile.identity}
                    className="flex items-center justify-between gap-2 rounded-xl border border-blue-400/15 bg-[#0F1B3A]/80 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-white">
                        <span className="truncate">{tile.name}</span>
                        {tile.isLocal && (
                          <span className="text-[10px] text-sky-400">(Anda)</span>
                        )}
                        {tile.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-400" />}
                      </p>
                      <p className="text-[10px] text-rm-muted">
                        {tile.isScreenSharing ? "Berbagi layar" : "Terhubung"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {tile.isMuted ? (
                        <MicOff className="h-4 w-4 text-red-400" />
                      ) : (
                        <Mic className="h-4 w-4 text-emerald-400" />
                      )}
                      {tile.isVideoOff && <VideoOff className="h-4 w-4 text-rm-muted" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                  {messages.length === 0 ? (
                    <p className="py-10 text-center text-xs text-rm-muted">
                      Belum ada pesan. Mulai percakapan dengan peserta meeting.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === authUser?.id;
                      return (
                        <div
                          key={m.id}
                          className={cn("flex flex-col", mine ? "items-end" : "items-start")}
                        >
                          <span className="mb-0.5 text-[10px] text-rm-muted">
                            {mine ? "Anda" : m.senderName} •{" "}
                            {new Date(m.sentAt).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                          <div
                            className={cn(
                              "max-w-[85%] break-words rounded-2xl px-3 py-2 text-xs",
                              mine
                                ? "bg-gradient-to-r from-[#2589FF] to-[#1668E8] text-white"
                                : "border border-blue-400/15 bg-[#111E3E] text-blue-50"
                            )}
                          >
                            {m.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="flex items-center gap-2 border-t border-blue-400/15 p-3"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ketik pesan..."
                    className="h-9 flex-1 rounded-xl border border-blue-400/20 bg-[#060C1D] px-3 text-xs text-white placeholder:text-rm-muted focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-[#2589FF] to-[#1668E8] text-white transition hover:brightness-110"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="shrink-0 px-2.5 pb-2.5 sm:px-4 sm:pb-4">
        <MeetingControls
          isHost={isHost}
          isMuted={lk.isMuted}
          isVideoOff={lk.isVideoOff}
          isScreenSharing={lk.isScreenSharing}
          isScreenPaused={lk.isScreenPaused}
          cameraEffect={lk.cameraEffect}
          customBackgroundUrl={lk.customBackgroundUrl}
          micBusy={lk.micBusy}
          camBusy={lk.camBusy}
          isLocked={isLocked}
          isRecording={isRecording}
          participantCount={tiles.length}
          unreadChatCount={unreadChatCount}
          audioDevices={lk.audioDevices}
          videoDevices={lk.videoDevices}
          selectedAudioId={lk.selectedAudioId}
          selectedVideoId={lk.selectedVideoId}
          onToggleMute={() => void lk.toggleMute()}
          onToggleVideo={() => void lk.toggleVideo()}
          onToggleScreenShare={() => void lk.toggleScreenShare()}
          onTogglePauseScreenShare={() => void lk.togglePauseScreenShare()}
          onChangeCameraEffect={(fx) => void lk.setCameraEffect(fx)}
          onUploadBackgroundImage={(file) => void lk.uploadBackgroundImage(file)}
          onClearCustomBackground={() => void lk.clearCustomBackground()}
          onSelectAudio={(id) => void lk.switchAudioDevice(id)}
          onSelectVideo={(id) => void lk.switchVideoDevice(id)}
          onOpenParticipants={() =>
            setSidePanel((prev) => (prev === "participants" ? null : "participants"))
          }
          onOpenChat={() => {
            setUnreadChatCount(0);
            setSidePanel((prev) => (prev === "chat" ? null : "chat"));
          }}
          onOpenInvite={() => setInviteOpen(true)}
          onSendReaction={handleSendReaction}
          onToggleLock={handleToggleLock}
          onToggleRecording={handleToggleRecording}
          onLeave={handleLeave}
          onEndForAll={() => void handleEndForAll()}
        />
      </div>

      {/* Modal Bagikan Undangan Meeting */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Bagikan Undangan Meeting"
      >
        <div className="space-y-4">
          <p className="text-xs text-rm-muted">
            Kirimkan <strong>Meeting ID</strong> atau <strong>Link Undangan</strong> di bawah ini
            kepada peserta tim Anda untuk bergabung ke ruang meeting ini.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">Meeting ID</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={meetingCode}
                className="h-10 flex-1 rounded-xl border border-rm-border bg-rm-bg px-3 font-mono text-sm text-white"
              />
              <button
                type="button"
                onClick={() => copyText("code")}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rm-border bg-rm-surface px-3 text-xs font-semibold text-white hover:border-rm-primary"
              >
                {copiedKey === "code" ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>Salin</span>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">Link Undangan</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={
                  typeof window !== "undefined"
                    ? `${window.location.origin}/meeting/${meetingCode}`
                    : `/meeting/${meetingCode}`
                }
                className="h-10 flex-1 rounded-xl border border-rm-border bg-rm-bg px-3 text-xs text-rm-text"
              />
              <button
                type="button"
                onClick={() => copyText("link")}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#2589FF] to-[#1668E8] px-3.5 text-xs font-semibold text-white hover:brightness-110"
              >
                {copiedKey === "link" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>Salin Link</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

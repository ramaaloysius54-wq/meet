"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Shield,
  Users,
  MessageSquare,
  MonitorUp,
  Smile,
  MoreHorizontal,
  ChevronDown,
  Lock,
  Disc,
  PhoneOff,
  Sparkles,
  UserPlus,
  Pause,
  Play,
  Upload,
  Trash2
} from "lucide-react";
import { cn } from "@/utils/format";
import { VIDEO_EFFECT_OPTIONS, type VideoEffectId } from "@/utils/videoEffects";

interface MeetingControlsProps {
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isScreenPaused: boolean;
  cameraEffect: VideoEffectId;
  customBackgroundUrl?: string | null;
  micBusy?: boolean;
  camBusy?: boolean;
  isLocked: boolean;
  isRecording: boolean;
  participantCount: number;
  unreadChatCount: number;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioId: string;
  selectedVideoId: string;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onTogglePauseScreenShare: () => void;
  onChangeCameraEffect: (effect: VideoEffectId) => void;
  onUploadBackgroundImage?: (file: File) => void;
  onClearCustomBackground?: () => void;
  onSelectAudio: (id: string) => void;
  onSelectVideo: (id: string) => void;
  onOpenParticipants: () => void;
  onOpenChat: () => void;
  onOpenInvite: () => void;
  onSendReaction: (emoji: string) => void;
  onToggleLock: () => void;
  onToggleRecording: () => void;
  onLeave: () => void;
  onEndForAll: () => void;
}

const REACTIONS = ["👍", "👏", "❤️", "😂", "🔥", "🎉"];

export function MeetingControls({
  isHost,
  isMuted,
  isVideoOff,
  isScreenSharing,
  isScreenPaused,
  cameraEffect,
  customBackgroundUrl = null,
  micBusy = false,
  camBusy = false,
  isLocked,
  isRecording,
  participantCount,
  unreadChatCount,
  audioDevices,
  videoDevices,
  selectedAudioId,
  selectedVideoId,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onTogglePauseScreenShare,
  onChangeCameraEffect,
  onUploadBackgroundImage,
  onClearCustomBackground,
  onSelectAudio,
  onSelectVideo,
  onOpenParticipants,
  onOpenChat,
  onOpenInvite,
  onSendReaction,
  onToggleLock,
  onToggleRecording,
  onLeave,
  onEndForAll
}: MeetingControlsProps) {
  const [openMenu, setOpenMenu] = useState<
    "devices" | "effects" | "security" | "reactions" | "more" | null
  >(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const handleBgFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadBackgroundImage) {
      onUploadBackgroundImage(file);
      setOpenMenu(null);
    }
    e.target.value = "";
  };

  const activeEffectLabel =
    cameraEffect === "custom"
      ? "Foto Custom"
      : VIDEO_EFFECT_OPTIONS.find((e) => e.id === cameraEffect)?.label || "Normal";

  return (
    <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rm-border/50 bg-[#0D1526]/95 px-3 py-2.5 sm:px-5">
      <input
        ref={bgFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleBgFileChange}
        className="hidden"
      />

      {/* Left/Center Controls */}
      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2.5">
        {/* Mute */}
        <button
          type="button"
          disabled={micBusy}
          onClick={onToggleMute}
          className={cn(
            "flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-60",
            isMuted
              ? "bg-rm-danger/15 text-rm-danger"
              : "text-rm-text hover:bg-rm-surface"
          )}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span>{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Video + Device & Background Effects Chevron */}
        <div className="relative flex items-center">
          <button
            type="button"
            disabled={camBusy}
            onClick={onToggleVideo}
            className={cn(
              "flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition disabled:opacity-60",
              isVideoOff
                ? "bg-rm-danger/15 text-rm-danger"
                : "text-rm-text hover:bg-rm-surface"
            )}
          >
            {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            <span>{isVideoOff ? "Start Video" : "Stop Video"}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "devices" ? null : "devices")}
            className={cn(
              "rounded-lg p-1 text-rm-muted hover:bg-rm-surface hover:text-white",
              cameraEffect !== "none" && "text-sky-400"
            )}
            title="Pilih Kamera, Mikrofon & Background Effect"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {openMenu === "devices" && (
            <div className="absolute bottom-16 left-0 z-40 w-72 rounded-xl border border-rm-border bg-rm-sidebar p-3 shadow-panel">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                <Sparkles className="h-3.5 w-3.5" />
                Background Kamera Effect
              </p>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {VIDEO_EFFECT_OPTIONS.map((fx) => (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => {
                      onChangeCameraEffect(fx.id);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition",
                      cameraEffect === fx.id
                        ? "border-rm-primary bg-rm-primary text-white"
                        : "border-rm-border/70 bg-rm-bg/70 text-rm-text hover:border-rm-primary/60"
                    )}
                  >
                    {fx.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 space-y-1.5">
                {customBackgroundUrl && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCameraEffect("custom");
                        setOpenMenu(null);
                      }}
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition",
                        cameraEffect === "custom"
                          ? "border-rm-primary bg-rm-primary text-white"
                          : "border-rm-border/70 bg-rm-bg/70 text-rm-text hover:border-rm-primary/60"
                      )}
                    >
                      <img
                        src={customBackgroundUrl}
                        alt="Custom Background"
                        className="h-6 w-9 shrink-0 rounded object-cover"
                      />
                      <span className="truncate">Foto Custom</span>
                    </button>
                    {onClearCustomBackground && (
                      <button
                        type="button"
                        onClick={() => onClearCustomBackground()}
                        title="Hapus Background Custom"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rm-border/70 bg-rm-bg/70 text-rm-danger transition hover:bg-rm-danger/15"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {onUploadBackgroundImage && (
                  <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-sky-400/50 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{customBackgroundUrl ? "Ganti Foto Background" : "Upload Background Image"}</span>
                  </button>
                )}
              </div>

              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rm-muted">
                Mikrofon
              </p>
              <div className="mb-2.5 max-h-24 space-y-1 overflow-y-auto">
                {audioDevices.map((d) => (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => {
                      onSelectAudio(d.deviceId);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "w-full truncate rounded-lg px-2 py-1 text-left text-xs",
                      selectedAudioId === d.deviceId
                        ? "bg-rm-primary text-white"
                        : "text-rm-text hover:bg-rm-surface"
                    )}
                  >
                    {d.label || "Default Microphone"}
                  </button>
                ))}
              </div>

              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-rm-muted">
                Kamera
              </p>
              <div className="max-h-24 space-y-1 overflow-y-auto">
                {videoDevices.map((d) => (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => {
                      onSelectVideo(d.deviceId);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "w-full truncate rounded-lg px-2 py-1 text-left text-xs",
                      selectedVideoId === d.deviceId
                        ? "bg-rm-primary text-white"
                        : "text-rm-text hover:bg-rm-surface"
                    )}
                  >
                    {d.label || "Default Camera"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden h-7 w-px bg-rm-border/60 lg:block" />

        {/* Security */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "security" ? null : "security")}
            className="flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
          >
            <Shield className={cn("h-5 w-5", isLocked && "text-amber-400")} />
            <span>Security</span>
          </button>

          {openMenu === "security" && (
            <div className="absolute bottom-16 left-0 z-40 w-56 rounded-xl border border-rm-border bg-rm-sidebar p-2 shadow-panel">
              <div className="mb-1 border-b border-rm-border/60 px-2.5 py-1.5 text-xs text-rm-success">
                Enkripsi DTLS-SRTP Aktif
              </div>
              {isHost ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggleLock();
                    setOpenMenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rm-text hover:bg-rm-surface"
                >
                  <Lock className="h-4 w-4 text-rm-primary" />
                  <span>{isLocked ? "Buka Kunci Meeting" : "Kunci Meeting"}</span>
                </button>
              ) : (
                <p className="px-2.5 py-2 text-xs text-rm-muted">
                  Kontrol keamanan dikelola oleh Host.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Participants */}
        <button
          type="button"
          onClick={onOpenParticipants}
          className="relative flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
        >
          <div className="relative">
            <Users className="h-5 w-5" />
            <span className="absolute -right-3 -top-1.5 text-[10px] font-bold text-rm-muted">
              {participantCount}
            </span>
          </div>
          <span>Participants</span>
        </button>

        {/* Chat */}
        <button
          type="button"
          onClick={onOpenChat}
          className="relative flex min-w-[52px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
        >
          <div className="relative">
            <MessageSquare className="h-5 w-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rm-danger px-1 text-[10px] font-bold text-white">
                {unreadChatCount}
              </span>
            )}
          </div>
          <span>Chat</span>
        </button>

        {/* Share Screen + Pause/Resume */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={cn(
              "flex min-w-[76px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition",
              isScreenSharing && !isScreenPaused
                ? "bg-rm-success/20 text-rm-success ring-1 ring-rm-success/60"
                : isScreenPaused
                  ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/50"
                  : "text-rm-success hover:bg-rm-success/10"
            )}
          >
            <MonitorUp className="h-5 w-5" />
            <span>
              {isScreenPaused ? "Resume Share" : isScreenSharing ? "Stop Share" : "Share Screen"}
            </span>
          </button>

          {isScreenSharing && (
            <button
              type="button"
              onClick={onTogglePauseScreenShare}
              title={
                isScreenPaused
                  ? "Lanjutkan Share Screen tanpa izin ulang"
                  : "Pause sementara (lanjut lagi tanpa klik Allow)"
              }
              className="flex h-10 w-8 items-center justify-center rounded-xl border border-rm-border bg-rm-surface text-rm-text transition hover:border-rm-primary hover:text-white"
            >
              {isScreenPaused ? (
                <Play className="h-4 w-4 text-rm-success" />
              ) : (
                <Pause className="h-4 w-4 text-amber-300" />
              )}
            </button>
          )}
        </div>

        {/* Reactions */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "reactions" ? null : "reactions")}
            className="flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
          >
            <Smile className="h-5 w-5" />
            <span>Reactions</span>
          </button>

          {openMenu === "reactions" && (
            <div className="absolute bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-rm-border bg-rm-sidebar px-3 py-2 shadow-panel">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onSendReaction(emoji);
                    setOpenMenu(null);
                  }}
                  className="rounded-full p-1.5 text-lg transition hover:scale-125 hover:bg-rm-surface"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* More */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "more" ? null : "more")}
            className="flex min-w-[48px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>

          {openMenu === "more" && (
            <div className="absolute bottom-16 right-0 z-40 w-60 rounded-xl border border-rm-border bg-rm-sidebar p-1.5 shadow-panel">
              <button
                type="button"
                onClick={() => {
                  onOpenInvite();
                  setOpenMenu(null);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <UserPlus className="h-4 w-4 text-rm-primary" />
                <span>Bagikan Meeting (Link & Code)</span>
              </button>

              <button
                type="button"
                onClick={() => setOpenMenu("effects")}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  <span>Background Kamera</span>
                </span>
                <span className="rounded bg-rm-bg px-1.5 py-0.5 text-[10px] text-rm-muted">
                  {activeEffectLabel}
                </span>
              </button>

              {isHost && (
                <>
                  <div className="my-1 border-t border-rm-border/60" />
                  <button
                    type="button"
                    onClick={() => {
                      onToggleRecording();
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-rm-text hover:bg-rm-surface"
                  >
                    <Disc className={cn("h-4 w-4", isRecording ? "text-rm-danger" : "text-rm-muted")} />
                    <span>{isRecording ? "Hentikan Recording" : "Mulai Recording"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onEndForAll();
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-rm-danger hover:bg-rm-danger/10"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>End Meeting for All</span>
                  </button>
                </>
              )}
            </div>
          )}

          {openMenu === "effects" && (
            <div className="absolute bottom-16 right-0 z-40 w-64 rounded-xl border border-rm-border bg-rm-sidebar p-2.5 shadow-panel">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  Background Kamera
                </span>
                <button
                  type="button"
                  onClick={() => setOpenMenu("more")}
                  className="text-[11px] text-rm-muted hover:text-white"
                >
                  Kembali
                </button>
              </div>

              <div className="mb-2 space-y-1.5 border-b border-rm-border/60 pb-2">
                {customBackgroundUrl && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onChangeCameraEffect("custom");
                        setOpenMenu(null);
                      }}
                      className={cn(
                        "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition",
                        cameraEffect === "custom"
                          ? "bg-rm-primary text-white"
                          : "bg-rm-bg/60 text-rm-text hover:bg-rm-surface"
                      )}
                    >
                      <img
                        src={customBackgroundUrl}
                        alt="Custom Background"
                        className="h-7 w-10 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">Foto Custom</p>
                        <p
                          className={cn(
                            "truncate text-[10px]",
                            cameraEffect === "custom" ? "text-blue-100" : "text-rm-muted"
                          )}
                        >
                          Gambar pilihan Anda
                        </p>
                      </div>
                    </button>
                    {onClearCustomBackground && (
                      <button
                        type="button"
                        onClick={() => onClearCustomBackground()}
                        title="Hapus Foto Background"
                        className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg bg-rm-bg/60 text-rm-danger transition hover:bg-rm-danger/15"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                {onUploadBackgroundImage && (
                  <button
                    type="button"
                    onClick={() => bgFileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-sky-400/50 bg-sky-500/10 px-2.5 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>{customBackgroundUrl ? "Ganti Foto Background" : "Upload Background Image"}</span>
                  </button>
                )}
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto">
                {VIDEO_EFFECT_OPTIONS.map((fx) => (
                  <button
                    key={fx.id}
                    type="button"
                    onClick={() => {
                      onChangeCameraEffect(fx.id);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition",
                      cameraEffect === fx.id
                        ? "bg-rm-primary text-white"
                        : "text-rm-text hover:bg-rm-surface"
                    )}
                  >
                    <span className="text-xs font-semibold">{fx.label}</span>
                    <span
                      className={cn(
                        "text-[10px]",
                        cameraEffect === fx.id ? "text-blue-100" : "text-rm-muted"
                      )}
                    >
                      {fx.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Red Leave Button */}
      <button
        type="button"
        onClick={onLeave}
        className="h-10 rounded-xl bg-rm-danger px-6 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-600"
      >
        Leave
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
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
  PhoneOff
} from "lucide-react";
import { cn } from "@/utils/format";

interface MeetingControlsProps {
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
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
  onSelectAudio: (id: string) => void;
  onSelectVideo: (id: string) => void;
  onOpenParticipants: () => void;
  onOpenChat: () => void;
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
  onSelectAudio,
  onSelectVideo,
  onOpenParticipants,
  onOpenChat,
  onSendReaction,
  onToggleLock,
  onToggleRecording,
  onLeave,
  onEndForAll
}: MeetingControlsProps) {
  const [openMenu, setOpenMenu] = useState<"devices" | "security" | "reactions" | "more" | null>(null);

  return (
    <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rm-border/50 bg-[#0D1526]/95 px-3 py-2.5 sm:px-5">
      {/* Left/Center Controls */}
      <div className="flex flex-1 flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-3">
        {/* Mute */}
        <button
          type="button"
          onClick={onToggleMute}
          className={cn(
            "flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition",
            isMuted
              ? "bg-rm-danger/15 text-rm-danger"
              : "text-rm-text hover:bg-rm-surface"
          )}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span>{isMuted ? "Unmute" : "Mute"}</span>
        </button>

        {/* Video + Device Selector Chevron */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={onToggleVideo}
            className={cn(
              "flex min-w-[68px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition",
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
            className="rounded-lg p-1 text-rm-muted hover:bg-rm-surface hover:text-white"
            title="Pilih Kamera & Mikrofon"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          {openMenu === "devices" && (
            <div className="absolute bottom-16 left-0 z-40 w-64 rounded-xl border border-rm-border bg-rm-sidebar p-3 shadow-panel">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rm-muted">
                Mikrofon
              </p>
              <div className="mb-3 space-y-1">
                {audioDevices.map((d) => (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => {
                      onSelectAudio(d.deviceId);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "w-full truncate rounded-lg px-2 py-1.5 text-left text-xs",
                      selectedAudioId === d.deviceId
                        ? "bg-rm-primary text-white"
                        : "text-rm-text hover:bg-rm-surface"
                    )}
                  >
                    {d.label || "Default Microphone"}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rm-muted">
                Kamera
              </p>
              <div className="space-y-1">
                {videoDevices.map((d) => (
                  <button
                    key={d.deviceId}
                    type="button"
                    onClick={() => {
                      onSelectVideo(d.deviceId);
                      setOpenMenu(null);
                    }}
                    className={cn(
                      "w-full truncate rounded-lg px-2 py-1.5 text-left text-xs",
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
            className="flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
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
          className="relative flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
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
          className="relative flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
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

        {/* Share Screen (Green Highlight persis referensi) */}
        <button
          type="button"
          onClick={onToggleScreenShare}
          className={cn(
            "flex min-w-[78px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition",
            isScreenSharing
              ? "bg-rm-success/20 text-rm-success ring-1 ring-rm-success/60"
              : "text-rm-success hover:bg-rm-success/10"
          )}
        >
          <MonitorUp className="h-5 w-5" />
          <span>{isScreenSharing ? "Stop Share" : "Share Screen"}</span>
        </button>

        {/* Reactions */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "reactions" ? null : "reactions")}
            className="flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-rm-text transition hover:bg-rm-surface"
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
            <div className="absolute bottom-16 right-0 z-40 w-52 rounded-xl border border-rm-border bg-rm-sidebar p-1.5 shadow-panel">
              {isHost && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleRecording();
                      setOpenMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rm-text hover:bg-rm-surface"
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
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rm-danger hover:bg-rm-danger/10"
                  >
                    <PhoneOff className="h-4 w-4" />
                    <span>End Meeting for All</span>
                  </button>
                </>
              )}
              {!isHost && (
                <p className="px-3 py-2 text-xs text-rm-muted">Tidak ada aksi tambahan.</p>
              )}
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

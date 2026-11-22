"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, MonitorUp, Wifi } from "lucide-react";
import type { LiveParticipantTile } from "@/types";
import { cn } from "@/utils/format";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface VideoTileProps {
  tile: LiveParticipantTile;
  forceCameraOnly?: boolean;
  compact?: boolean;
}

export function VideoTile({
  tile,
  forceCameraOnly = false,
  compact = false
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const screenAudioRef = useRef<HTMLAudioElement>(null);

  const showingScreen = !forceCameraOnly && tile.isScreenSharing && Boolean(tile.screenTrack);
  const activeVideoTrack = showingScreen ? tile.screenTrack : tile.videoTrack;
  const showVideo = Boolean(activeVideoTrack) && (!tile.isVideoOff || showingScreen);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!showVideo || !activeVideoTrack) {
      el.srcObject = null;
      return;
    }

    const currentStream = el.srcObject instanceof MediaStream ? el.srcObject : null;
    const currentTrack = currentStream?.getVideoTracks()[0] || null;

    if (currentTrack !== activeVideoTrack) {
      el.srcObject = new MediaStream([activeVideoTrack]);
    }

    const tryPlay = () => {
      if (el.paused) {
        void el.play().catch(() => {});
      }
    };

    tryPlay();
    el.addEventListener("loadedmetadata", tryPlay);
    activeVideoTrack.addEventListener("unmute", tryPlay);

    return () => {
      el.removeEventListener("loadedmetadata", tryPlay);
      activeVideoTrack.removeEventListener("unmute", tryPlay);
    };
  }, [activeVideoTrack, showVideo]);

  // Tetap pasang stream audio remote dan atur mute lewat el.muted (anti blokir autoplay Android)
  useEffect(() => {
    const el = audioRef.current;
    if (!el || tile.isLocal) return;

    const track = tile.audioTrack;
    if (!track) {
      el.srcObject = null;
      return;
    }

    const currentStream = el.srcObject instanceof MediaStream ? el.srcObject : null;
    const currentTrack = currentStream?.getAudioTracks()[0] || null;

    if (currentTrack !== track) {
      el.srcObject = new MediaStream([track]);
    }

    el.volume = 1;
    el.muted = tile.isMuted;

    const tryPlay = () => {
      el.muted = tile.isMuted;
      void el.play().catch(() => {});
    };

    tryPlay();
    track.addEventListener("unmute", tryPlay);
    window.addEventListener("touchstart", tryPlay, { once: true, passive: true });
    window.addEventListener("pointerdown", tryPlay, { once: true, passive: true });

    return () => {
      track.removeEventListener("unmute", tryPlay);
      window.removeEventListener("touchstart", tryPlay);
      window.removeEventListener("pointerdown", tryPlay);
    };
  }, [tile.audioTrack, tile.isLocal, tile.isMuted]);

  useEffect(() => {
    const el = screenAudioRef.current;
    if (!el || tile.isLocal) return;

    const track = showingScreen ? tile.screenAudioTrack || null : null;
    if (!track) {
      el.srcObject = null;
      return;
    }

    const currentStream = el.srcObject instanceof MediaStream ? el.srcObject : null;
    const currentTrack = currentStream?.getAudioTracks()[0] || null;

    if (currentTrack !== track) {
      el.srcObject = new MediaStream([track]);
    }

    el.volume = 1;
    el.muted = false;

    const tryPlay = () => {
      el.muted = false;
      void el.play().catch(() => {});
    };

    tryPlay();
    track.addEventListener("unmute", tryPlay);
    window.addEventListener("touchstart", tryPlay, { once: true, passive: true });
    window.addEventListener("pointerdown", tryPlay, { once: true, passive: true });

    return () => {
      track.removeEventListener("unmute", tryPlay);
      window.removeEventListener("touchstart", tryPlay);
      window.removeEventListener("pointerdown", tryPlay);
    };
  }, [showingScreen, tile.isLocal, tile.screenAudioTrack]);

  useEffect(() => {
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;
      if (screenAudioRef.current) screenAudioRef.current.srcObject = null;
    };
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border bg-[#121D34] transition-all duration-200",
        tile.isSpeaking ? "border-[#38BDF8] shadow-speaker-glow" : "border-rm-border/70"
      )}
    >
      {/* Real MediaStream Video */}
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "h-full w-full",
            showingScreen ? "bg-black object-contain" : "object-cover",
            tile.isLocal && !showingScreen && "-scale-x-100"
          )}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-3">
          <UserAvatar
            name={tile.name}
            src={tile.avatarUrl}
            size={compact || forceCameraOnly ? "md" : "xl"}
            ring={tile.isSpeaking ? "blue" : "none"}
          />
          {!compact && !forceCameraOnly && (
            <p className="text-xs font-medium text-rm-muted">Kamera dimatikan</p>
          )}
        </div>
      )}

      {/* Remote Audio */}
      {!tile.isLocal && <audio ref={audioRef} autoPlay playsInline />}
      {!tile.isLocal && showingScreen && <audio ref={screenAudioRef} autoPlay playsInline />}

      {/* Top-Right HOST & Screen Badges */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
        {tile.isScreenSharing && !compact && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-rm-success/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <MonitorUp className="h-3 w-3" />
            Screen
          </span>
        )}
        {tile.isHost && (
          <span className="rounded-lg bg-rm-primary px-2 py-0.5 text-[11px] font-semibold text-white shadow">
            Host
          </span>
        )}
      </div>

      {/* Bottom-Left Name & Mic Indicator Pill */}
      <div className="glass-pill absolute bottom-2.5 left-2.5 flex max-w-[85%] items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1">
        {tile.isMuted ? (
          <MicOff className="h-3.5 w-3.5 shrink-0 text-rm-danger" />
        ) : (
          <Mic
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              tile.isSpeaking ? "text-rm-success" : "text-white"
            )}
          />
        )}
        <span className="truncate text-[11px] font-medium text-white">
          {tile.name} {tile.isHost ? "(Host)" : ""}
        </span>
      </div>

      {/* Bottom-Right Network Quality */}
      {!compact && (
        <div className="glass-pill absolute bottom-2.5 right-2.5 rounded-md p-1">
          <Wifi
            className={cn(
              "h-3.5 w-3.5",
              tile.connectionQuality === "excellent" && "text-rm-success",
              tile.connectionQuality === "good" && "text-amber-400",
              tile.connectionQuality === "poor" && "text-rm-danger",
              tile.connectionQuality === "unknown" && "text-rm-muted"
            )}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, MonitorUp, Wifi } from "lucide-react";
import type { LiveParticipantTile } from "@/types";
import { cn } from "@/utils/format";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface VideoTileProps {
  tile: LiveParticipantTile;
  forceCameraOnly?: boolean;
}

export function VideoTile({ tile, forceCameraOnly = false }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const showingScreen = !forceCameraOnly && tile.isScreenSharing && Boolean(tile.screenTrack);
  const activeVideoTrack = showingScreen ? tile.screenTrack : tile.videoTrack;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (activeVideoTrack) {
      el.srcObject = new MediaStream([activeVideoTrack]);
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [activeVideoTrack]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || tile.isLocal) return;
    if (tile.audioTrack) {
      el.srcObject = new MediaStream([tile.audioTrack]);
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [tile.audioTrack, tile.isLocal]);

  const showVideo = Boolean(activeVideoTrack) && (!tile.isVideoOff || showingScreen);

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
        <div className="flex flex-col items-center justify-center gap-3 p-4">
          <UserAvatar
            name={tile.name}
            src={tile.avatarUrl}
            size={forceCameraOnly ? "md" : "xl"}
            ring={tile.isSpeaking ? "blue" : "none"}
          />
          {!forceCameraOnly && <p className="text-xs font-medium text-rm-muted">Kamera dimatikan</p>}
        </div>
      )}

      {/* Remote Audio */}
      {!tile.isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {/* Top-Right HOST & Screen Badges */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {tile.isScreenSharing && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-rm-success/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <MonitorUp className="h-3 w-3" />
            Screen
          </span>
        )}
        {tile.isHost && (
          <span className="rounded-lg bg-rm-primary px-2.5 py-0.5 text-xs font-semibold text-white shadow">
            Host
          </span>
        )}
      </div>

      {/* Bottom-Left Name & Mic Indicator Pill */}
      <div className="glass-pill absolute bottom-3 left-3 flex max-w-[85%] items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
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
        <span className="truncate text-xs font-medium text-white">
          {tile.name} {tile.isHost ? "(Host)" : ""}
        </span>
      </div>

      {/* Bottom-Right Network Quality */}
      <div className="glass-pill absolute bottom-3 right-3 rounded-md p-1">
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
    </div>
  );
}

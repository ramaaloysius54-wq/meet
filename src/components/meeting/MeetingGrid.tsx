"use client";

import { useEffect, useRef } from "react";
import { MonitorUp, ScreenShareOff } from "lucide-react";
import type { LiveParticipantTile } from "@/types";
import { VideoTile } from "./VideoTile";
import { cn } from "@/utils/format";

interface MeetingGridProps {
  tiles: LiveParticipantTile[];
  viewMode: "grid" | "speaker";
  onStopScreenShare?: () => void;
}

function ScreenShareStage({
  tile,
  onStopScreenShare
}: {
  tile: LiveParticipantTile;
  onStopScreenShare?: () => void;
}) {
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const screenAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = screenVideoRef.current;
    if (!el) return;
    if (tile.screenTrack) {
      el.srcObject = new MediaStream([tile.screenTrack]);
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [tile.screenTrack]);

  useEffect(() => {
    const el = screenAudioRef.current;
    if (!el || tile.isLocal) return;
    if (tile.screenAudioTrack) {
      el.srcObject = new MediaStream([tile.screenAudioTrack]);
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [tile.screenAudioTrack, tile.isLocal]);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-rm-success/60 bg-[#050914] shadow-panel">
      <video
        ref={screenVideoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />
      {!tile.isLocal && <audio ref={screenAudioRef} autoPlay playsInline />}

      {/* Top Overlay Banner */}
      <div className="glass-pill absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-rm-success/40 px-3 py-1.5 text-xs font-semibold text-white">
        <MonitorUp className="h-4 w-4 text-rm-success" />
        <span>
          {tile.isLocal ? "Anda sedang membagikan layar" : `${tile.name} sedang membagikan layar`}
        </span>
      </div>

      {tile.isLocal && onStopScreenShare && (
        <button
          type="button"
          onClick={onStopScreenShare}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-xl bg-rm-danger px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-red-600"
        >
          <ScreenShareOff className="h-3.5 w-3.5" />
          <span>Stop Share</span>
        </button>
      )}
    </div>
  );
}

export function MeetingGrid({ tiles, viewMode, onStopScreenShare }: MeetingGridProps) {
  if (tiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-rm-border/50 bg-[#0D1526] text-sm text-rm-muted">
        Menghubungkan stream kamera dan mikrofon...
      </div>
    );
  }

  // Jika ada peserta yang sedang Share Screen -> tampilkan stage presentasi penuh + strip kamera
  const sharingTile = tiles.find((t) => t.isScreenSharing && Boolean(t.screenTrack));
  if (sharingTile) {
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="min-h-0 flex-1">
          <ScreenShareStage tile={sharingTile} onStopScreenShare={onStopScreenShare} />
        </div>
        <div className="grid h-28 shrink-0 grid-cols-2 gap-3 sm:h-32 sm:grid-cols-4">
          {tiles.map((tile) => (
            <VideoTile key={tile.identity} tile={tile} forceCameraOnly />
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === "speaker" && tiles.length > 1) {
    const primary = tiles.find((t) => t.isSpeaking) || tiles[0];
    const others = tiles.filter((t) => t.identity !== primary.identity);
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="min-h-0 flex-1">
          <VideoTile tile={primary} />
        </div>
        <div className="grid h-32 shrink-0 grid-cols-3 gap-3 sm:grid-cols-4">
          {others.map((tile) => (
            <VideoTile key={tile.identity} tile={tile} />
          ))}
        </div>
      </div>
    );
  }

  // Default 2x2 Grid layout persis referensi RamaMeet
  const gridCols =
    tiles.length === 1
      ? "grid-cols-1"
      : tiles.length === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : tiles.length <= 4
          ? "grid-cols-1 sm:grid-cols-2 grid-rows-2"
          : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className={cn("grid h-full w-full gap-3.5", gridCols)}>
      {tiles.map((tile) => (
        <VideoTile key={tile.identity} tile={tile} />
      ))}
    </div>
  );
}

"use client";

import { Mic, MicOff, Video, VideoOff, UserPlus, VolumeX, MoreHorizontal, UserX, Check } from "lucide-react";
import type { LiveParticipantTile, MeetingParticipant } from "@/types";
import { UserAvatar } from "@/components/ui/UserAvatar";

interface ParticipantPanelProps {
  tiles: LiveParticipantTile[];
  waitingList: MeetingParticipant[];
  isHost: boolean;
  onInvite: () => void;
  onMuteAll: () => void;
  onMuteUser: (userId: string) => void;
  onRemoveUser: (userId: string) => void;
  onAdmitUser: (userId: string) => void;
}

export function ParticipantPanel({
  tiles,
  waitingList,
  isHost,
  onInvite,
  onMuteAll,
  onMuteUser,
  onRemoveUser,
  onAdmitUser
}: ParticipantPanelProps) {
  return (
    <div className="flex flex-col">
      {/* Waiting Room (Host only) */}
      {isHost && waitingList.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Waiting Room ({waitingList.length})
          </p>
          <div className="space-y-2">
            {waitingList.map((wp) => (
              <div key={wp.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-rm-text">{wp.profile?.full_name || "Guest"}</span>
                <button
                  type="button"
                  onClick={() => onAdmitUser(wp.user_id)}
                  className="inline-flex items-center gap-1 rounded-lg bg-rm-success px-2 py-1 text-[11px] font-semibold text-white"
                >
                  <Check className="h-3 w-3" />
                  Admit
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Participants List */}
      <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
        {tiles.map((p) => (
          <div
            key={p.identity}
            className="group flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 transition hover:bg-rm-surface/70"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar
                name={p.name}
                src={p.avatarUrl}
                size="sm"
                ring={p.isHost ? "green" : "none"}
              />
              <span className="truncate text-sm font-medium text-rm-text">
                {p.name} {p.isHost ? "(Host)" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isHost && !p.isLocal && (
                <div className="hidden items-center gap-1 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => onMuteUser(p.identity)}
                    title="Mute Peserta"
                    className="rounded-md p-1 text-rm-muted hover:bg-rm-bg hover:text-amber-400"
                  >
                    <VolumeX className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveUser(p.identity)}
                    title="Keluarkan Peserta"
                    className="rounded-md p-1 text-rm-muted hover:bg-rm-bg hover:text-rm-danger"
                  >
                    <UserX className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {p.isMuted ? (
                <MicOff className="h-4 w-4 text-rm-danger" />
              ) : (
                <Mic className="h-4 w-4 text-rm-success" />
              )}

              {p.isVideoOff ? (
                <VideoOff className="h-4 w-4 text-rm-muted/60" />
              ) : (
                <Video className="h-4 w-4 text-rm-muted" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons: Invite | Mute All | ... */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onInvite}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rm-border bg-rm-surface/90 py-2 text-xs font-medium text-rm-text transition hover:border-rm-primary/60 hover:bg-rm-surface"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>Invite</span>
        </button>

        {isHost && (
          <button
            type="button"
            onClick={onMuteAll}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rm-border bg-rm-surface/90 py-2 text-xs font-medium text-rm-text transition hover:border-rm-primary/60 hover:bg-rm-surface"
          >
            <span>Mute All</span>
          </button>
        )}

        <button
          type="button"
          onClick={onInvite}
          className="flex h-8 w-9 items-center justify-center rounded-xl border border-rm-border bg-rm-surface/90 text-rm-muted hover:text-white"
          title="Salin Link Meeting"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

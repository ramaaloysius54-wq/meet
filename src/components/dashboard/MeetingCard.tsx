"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Copy, Lock, Trash2, Video } from "lucide-react";
import type { Meeting } from "@/types";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { deleteMeeting } from "@/services/meetingService";
import { Modal } from "@/components/ui/Modal";

interface MeetingCardProps {
  meeting: Meeting;
  onDeleted?: (meetingCode: string) => void;
}

export function MeetingCard({ meeting, onDeleted }: MeetingCardProps) {
  const profile = useMeetingStore((s) => s.profile);
  const pushNotification = useMeetingStore((s) => s.pushNotification);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isHost = Boolean(profile && profile.id === meeting.host_id);
  const canDelete = isHost || meeting.status === "ended";

  const copyInvite = () => {
    const url = `${window.location.origin}/meeting/${meeting.meeting_code}`;
    navigator.clipboard.writeText(url);
    pushNotification({
      title: "Link Disalin",
      message: `Undangan ${meeting.meeting_code} disalin ke clipboard.`,
      type: "success"
    });
  };

  const handleConfirmDelete = async () => {
    try {
      setDeleting(true);
      await deleteMeeting(meeting.meeting_code);
      setConfirmOpen(false);
      onDeleted?.(meeting.meeting_code);
      pushNotification({
        title: "Meeting Dihapus",
        message: `"${meeting.title}" berhasil dihapus dari daftar.`,
        type: "success"
      });
    } catch (err: any) {
      pushNotification({
        title: "Gagal Menghapus",
        message: err.message || "Tidak dapat menghapus meeting",
        type: "error"
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-rm-border/70 bg-rm-sidebar/90 p-4 transition hover:border-rm-primary/60">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                meeting.status === "live"
                  ? "bg-rm-success/15 text-rm-success"
                  : meeting.status === "scheduled"
                    ? "bg-rm-primary/15 text-sky-400"
                    : "bg-rm-surface text-rm-muted"
              }`}
            >
              {meeting.status === "live" && (
                <span className="h-1.5 w-1.5 rounded-full bg-rm-success animate-pulse" />
              )}
              {meeting.status.toUpperCase()}
            </span>

            {meeting.has_password && (
              <span className="inline-flex items-center gap-1 text-xs text-rm-muted">
                <Lock className="h-3.5 w-3.5" /> Protected
              </span>
            )}
          </div>

          <h4 className="truncate text-base font-semibold text-rm-text">{meeting.title}</h4>
          <p className="mt-1 text-xs text-rm-muted">ID: {meeting.meeting_code}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-rm-muted">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(meeting.scheduled_at || meeting.created_at).toLocaleDateString("id-ID")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(meeting.scheduled_at || meeting.created_at).toLocaleTimeString("id-ID", {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/meeting/${meeting.meeting_code}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rm-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-rm-secondary"
          >
            <Video className="h-3.5 w-3.5" />
            <span>{meeting.status === "ended" ? "Lihat Detail" : "Join Meeting"}</span>
          </Link>
          <button
            type="button"
            onClick={copyInvite}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rm-border bg-rm-surface text-rm-muted transition hover:text-white"
            title="Salin Link Undangan"
          >
            <Copy className="h-4 w-4" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rm-border bg-rm-surface text-rm-muted transition hover:border-rm-danger/60 hover:bg-rm-danger/15 hover:text-rm-danger"
              title="Hapus Meeting"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        title="Hapus Riwayat Meeting"
      >
        <div className="space-y-4">
          <p className="text-sm text-rm-muted">
            Yakin ingin menghapus <strong className="text-white">{meeting.title}</strong> (ID:{" "}
            {meeting.meeting_code})?{" "}
            {isHost
              ? "Seluruh riwayat chat dan data peserta di meeting ini juga akan ikut terhapus permanen."
              : "Meeting ini akan dihapus dari daftar riwayat Anda."}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmOpen(false)}
              className="h-9 rounded-xl border border-rm-border bg-rm-surface px-4 text-xs font-semibold text-rm-text hover:text-white"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleConfirmDelete}
              className="h-9 rounded-xl bg-rm-danger px-4 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {deleting ? "Menghapus..." : "Hapus Permanen"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

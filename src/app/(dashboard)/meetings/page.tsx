"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MeetingCard } from "@/components/dashboard/MeetingCard";
import { Modal } from "@/components/ui/Modal";
import { clearMeetingHistory, listMeetings } from "@/services/meetingService";
import { useMeetingStore } from "@/stores/useMeetingStore";
import type { Meeting } from "@/types";

export default function MeetingsPage() {
  const searchQuery = useMeetingStore((s) => s.searchQuery);
  const pushNotification = useMeetingStore((s) => s.pushNotification);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    listMeetings().then(setMeetings).catch(() => {});
  }, []);

  const endedCount = meetings.filter((m) => m.status === "ended").length;

  const displayed = meetings.filter((m) => {
    const matchSearch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.meeting_code.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (filter === "active") return m.status === "live" || m.status === "scheduled";
    if (filter === "ended") return m.status === "ended";
    return true;
  });

  const handleClearHistory = async () => {
    try {
      setClearing(true);
      await clearMeetingHistory();
      setMeetings((prev) => prev.filter((m) => m.status !== "ended"));
      setConfirmClear(false);
      pushNotification({
        title: "Riwayat Dihapus",
        message: "Semua riwayat meeting selesai berhasil dibersihkan.",
        type: "success"
      });
    } catch (err: any) {
      pushNotification({ title: "Gagal", message: err.message, type: "error" });
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-white">Semua Meetings</h2>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-rm-border bg-rm-sidebar p-1 text-xs">
              {[
                { key: "all", label: "Semua" },
                { key: "active", label: "Aktif & Terjadwal" },
                { key: "ended", label: `Riwayat (${endedCount})` }
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key as any)}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                    filter === tab.key
                      ? "bg-rm-primary text-white"
                      : "text-rm-muted hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {endedCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rm-danger/40 bg-rm-danger/10 px-3.5 text-xs font-semibold text-rm-danger transition hover:bg-rm-danger hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Semua Riwayat
              </button>
            )}
          </div>
        </div>

        {displayed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rm-border bg-rm-sidebar/50 p-10 text-center text-sm text-rm-muted">
            Tidak ada meeting pada kategori ini.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayed.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                onDeleted={(code) =>
                  setMeetings((prev) => prev.filter((item) => item.meeting_code !== code))
                }
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        open={confirmClear}
        onClose={() => !clearing && setConfirmClear(false)}
        title="Hapus Semua Riwayat Meeting"
      >
        <div className="space-y-4">
          <p className="text-sm text-rm-muted">
            Anda yakin ingin menghapus <strong>{endedCount}</strong> riwayat meeting yang sudah
            berakhir? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={clearing}
              onClick={() => setConfirmClear(false)}
              className="h-9 rounded-xl border border-rm-border bg-rm-surface px-4 text-xs font-semibold text-rm-text"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={handleClearHistory}
              className="h-9 rounded-xl bg-rm-danger px-4 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {clearing ? "Menghapus..." : "Hapus Semua"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  Plus,
  CalendarPlus,
  LogIn,
  Users,
  Clock,
  Activity,
  Trash2,
  RefreshCw,
  Copy
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { MeetingCard } from "@/components/dashboard/MeetingCard";
import { Modal } from "@/components/ui/Modal";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { clearMeetingHistory, createMeeting, listMeetings } from "@/services/meetingService";
import { generateMeetingCode } from "@/utils/format";
import type { Meeting } from "@/types";

export default function DashboardHomePage() {
  const router = useRouter();
  const profile = useMeetingStore((s) => s.profile);
  const searchQuery = useMeetingStore((s) => s.searchQuery);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalMode, setModalMode] = useState<"new" | "join" | "schedule" | "clear-history" | null>(null);
  const [title, setTitle] = useState("RamaMeet Meeting");
  const [meetingCode, setMeetingCode] = useState("");
  const [password, setPassword] = useState("");
  const [waitingRoom, setWaitingRoom] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listMeetings()
      .then(setMeetings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openCreateModal = (mode: "new" | "schedule") => {
    setMeetingCode(generateMeetingCode());
    setModalMode(mode);
  };

  const handleCopyCode = () => {
    if (!meetingCode.trim()) return;
    navigator.clipboard.writeText(meetingCode.trim());
    pushNotification({
      title: "Kode Disalin",
      message: `Meeting code ${meetingCode.trim()} disalin ke clipboard.`,
      type: "success"
    });
  };

  const filtered = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.meeting_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcoming = filtered.filter((m) => m.status === "scheduled" || m.status === "live");
  const recent = filtered.filter((m) => m.status === "ended");

  const handleMeetingDeleted = (code: string) => {
    setMeetings((prev) => prev.filter((m) => m.meeting_code !== code));
  };

  const handleClearAllHistory = async () => {
    try {
      setSubmitting(true);
      await clearMeetingHistory();
      setMeetings((prev) => prev.filter((m) => m.status !== "ended"));
      setModalMode(null);
      pushNotification({
        title: "Riwayat Dibersihkan",
        message: "Semua riwayat meeting yang telah selesai berhasil dihapus.",
        type: "success"
      });
    } catch (err: any) {
      pushNotification({ title: "Gagal", message: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async (e: React.FormEvent, isSchedule: boolean) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const m = await createMeeting({
        title,
        meeting_code: meetingCode.trim() || undefined,
        password: password || undefined,
        waiting_room_enabled: waitingRoom,
        scheduled_at: isSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      });
      setModalMode(null);
      if (isSchedule) {
        setMeetings((prev) => [m, ...prev]);
        pushNotification({
          title: "Meeting Dijadwalkan",
          message: `${m.title} (${m.meeting_code}) berhasil dibuat.`,
          type: "success"
        });
      } else {
        router.push(`/meeting/${m.meeting_code}`);
      }
    } catch (err: any) {
      pushNotification({ title: "Error", message: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().split("/").pop();
    if (!cleaned) return;
    router.push(`/meeting/${cleaned}`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
        {/* Welcome Banner */}
        <section className="rounded-2xl border border-rm-border/70 bg-gradient-to-r from-rm-sidebar via-[#132240] to-rm-card/80 p-6 shadow-panel">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Selamat datang, {profile?.full_name || "RamaMeet User"}
              </h2>
              <p className="mt-1 text-sm text-rm-muted">
                Mulai rapat video HD, kelola jadwal tim, dan kolaborasi aman dalam satu platform.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => openCreateModal("new")}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rm-primary to-rm-secondary px-4 py-2.5 text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110"
              >
                <Video className="h-4 w-4" />
                New Meeting
              </button>
              <button
                type="button"
                onClick={() => setModalMode("join")}
                className="inline-flex items-center gap-2 rounded-xl border border-rm-border bg-rm-surface px-4 py-2.5 text-sm font-semibold text-rm-text hover:border-rm-primary"
              >
                <LogIn className="h-4 w-4" />
                Join Meeting
              </button>
              <button
                type="button"
                onClick={() => openCreateModal("schedule")}
                className="inline-flex items-center gap-2 rounded-xl border border-rm-border bg-rm-surface px-4 py-2.5 text-sm font-semibold text-rm-text hover:border-rm-primary"
              >
                <CalendarPlus className="h-4 w-4" />
                Schedule
              </button>
            </div>
          </div>
        </section>

        {/* Meeting Statistics */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-rm-border/70 bg-rm-sidebar p-4">
            <div className="flex items-center justify-between text-rm-muted">
              <span className="text-xs font-medium">Total Meetings</span>
              <Activity className="h-4 w-4 text-rm-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{meetings.length}</p>
          </div>
          <div className="rounded-2xl border border-rm-border/70 bg-rm-sidebar p-4">
            <div className="flex items-center justify-between text-rm-muted">
              <span className="text-xs font-medium">Aktif & Mendatang</span>
              <Clock className="h-4 w-4 text-rm-success" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{upcoming.length}</p>
          </div>
          <div className="rounded-2xl border border-rm-border/70 bg-rm-sidebar p-4">
            <div className="flex items-center justify-between text-rm-muted">
              <span className="text-xs font-medium">Selesai</span>
              <Users className="h-4 w-4 text-sky-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{recent.length}</p>
          </div>
        </section>

        {/* Upcoming & Live Meetings */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">Upcoming & Live Meetings</h3>
            <button
              type="button"
              onClick={() => openCreateModal("new")}
              className="inline-flex items-center gap-1 text-xs font-medium text-rm-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Buat Baru
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-rm-border/60 bg-rm-sidebar p-8 text-center text-sm text-rm-muted">
              Memuat daftar meeting...
            </div>
          ) : upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rm-border bg-rm-sidebar/50 p-8 text-center text-sm text-rm-muted">
              Belum ada meeting aktif atau terjadwal. Klik <strong>New Meeting</strong> untuk memulai.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((m) => (
                <MeetingCard key={m.id} meeting={m} onDeleted={handleMeetingDeleted} />
              ))}
            </div>
          )}
        </section>

        {/* Recent Meetings (History) */}
        {recent.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Recent Meetings</h3>
              <button
                type="button"
                onClick={() => setModalMode("clear-history")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rm-danger/40 bg-rm-danger/10 px-3 py-1.5 text-xs font-semibold text-rm-danger transition hover:bg-rm-danger hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Hapus Semua Riwayat
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {recent.slice(0, 6).map((m) => (
                <MeetingCard key={m.id} meeting={m} onDeleted={handleMeetingDeleted} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Modal New / Schedule Meeting */}
      <Modal
        open={modalMode === "new" || modalMode === "schedule"}
        onClose={() => setModalMode(null)}
        title={modalMode === "schedule" ? "Jadwalkan Meeting" : "Mulai Meeting Baru"}
      >
        <form onSubmit={(e) => handleCreate(e, modalMode === "schedule")} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">Nama Meeting</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-xl border border-rm-border bg-rm-bg px-3 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">Meeting Code</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                value={meetingCode}
                onChange={(e) => setMeetingCode(e.target.value)}
                placeholder="contoh: 482-910-3341"
                className="h-10 flex-1 rounded-xl border border-rm-border bg-rm-bg px-3 font-mono text-sm text-rm-text focus:border-rm-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setMeetingCode(generateMeetingCode())}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rm-border bg-rm-surface px-3 text-xs font-semibold text-rm-text transition hover:border-rm-primary hover:text-white"
                title="Generate Kode Baru"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Generate</span>
              </button>
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-rm-border bg-rm-surface text-rm-muted transition hover:border-rm-primary hover:text-white"
                title="Salin Kode"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {modalMode === "schedule" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-rm-muted">Tanggal & Jam</label>
              <input
                type="datetime-local"
                required
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="h-10 w-full rounded-xl border border-rm-border bg-rm-bg px-3 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">
              Password Meeting (Opsional)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kosongkan jika tanpa password"
              className="h-10 w-full rounded-xl border border-rm-border bg-rm-bg px-3 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-rm-text">
            <input
              type="checkbox"
              checked={waitingRoom}
              onChange={(e) => setWaitingRoom(e.target.checked)}
              className="h-4 w-4 rounded border-rm-border bg-rm-bg text-rm-primary"
            />
            Aktifkan Waiting Room (Host menyetujui peserta masuk)
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-xl bg-rm-primary text-sm font-semibold text-white hover:bg-rm-secondary disabled:opacity-60"
          >
            {submitting
              ? "Memproses..."
              : modalMode === "schedule"
                ? "Simpan Jadwal"
                : "Mulai Sekarang"}
          </button>
        </form>
      </Modal>

      {/* Modal Join Meeting */}
      <Modal
        open={modalMode === "join"}
        onClose={() => setModalMode(null)}
        title="Gabung Meeting"
      >
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-rm-muted">
              Meeting ID atau Link Undangan
            </label>
            <input
              type="text"
              required
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="contoh: 482-910-3341"
              className="h-10 w-full rounded-xl border border-rm-border bg-rm-bg px-3 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="h-10 w-full rounded-xl bg-rm-primary text-sm font-semibold text-white hover:bg-rm-secondary"
          >
            Masuk ke Ruang Meeting
          </button>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Semua Riwayat */}
      <Modal
        open={modalMode === "clear-history"}
        onClose={() => !submitting && setModalMode(null)}
        title="Hapus Semua Riwayat Meeting"
      >
        <div className="space-y-4">
          <p className="text-sm text-rm-muted">
            Semua riwayat meeting yang berstatus <strong className="text-white">ENDED</strong> akan
            dihapus secara permanen. Meeting yang sedang aktif atau terjadwal tidak akan terhapus.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setModalMode(null)}
              className="h-9 rounded-xl border border-rm-border bg-rm-surface px-4 text-xs font-semibold text-rm-text"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleClearAllHistory}
              className="h-9 rounded-xl bg-rm-danger px-4 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {submitting ? "Menghapus..." : "Hapus Semua"}
            </button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

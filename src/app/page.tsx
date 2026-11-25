"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Video,
  Calendar,
  CalendarPlus,
  MonitorUp,
  Users,
  MoreHorizontal,
  Clock,
  TrendingUp,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Trash2,
  Copy,
  RefreshCw,
  HelpCircle,
  PlayCircle,
  Settings,
  Link2,
  Lock,
  Sparkles
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useMeetingStore } from "@/stores/useMeetingStore";
import {
  clearMeetingHistory,
  createMeeting,
  deleteMeeting,
  listMeetings
} from "@/services/meetingService";
import { generateMeetingCode } from "@/utils/format";
import type { Meeting } from "@/types";

const THUMBNAIL_GRADIENTS = [
  "from-sky-500 via-blue-600 to-indigo-900",
  "from-indigo-500 via-blue-600 to-cyan-700",
  "from-blue-500 via-cyan-500 to-slate-900",
  "from-violet-600 via-blue-700 to-slate-900"
];

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(isoDate).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short"
  });
}

function formatScheduleLabel(meeting: Meeting): string {
  const date = new Date(meeting.scheduled_at || meeting.created_at);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const timeStr = date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });

  if (meeting.status === "live") {
    return `Live Now • ${timeStr}`;
  }
  if (date.toDateString() === today.toDateString()) {
    return `Today • ${timeStr}`;
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return `Tomorrow • ${timeStr}`;
  }
  return `${date.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} • ${timeStr}`;
}

export default function DashboardHomePage() {
  const router = useRouter();
  const profile = useMeetingStore((s) => s.profile);
  const searchQuery = useMeetingStore((s) => s.searchQuery);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalMode, setModalMode] = useState<
    "new" | "join" | "schedule" | "clear-history" | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
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

  const firstName = useMemo(() => {
    const raw = (profile?.full_name || "Rama").trim();
    return raw.split(/\s+/)[0] || "Rama";
  }, [profile?.full_name]);

  const openCreateModal = (mode: "new" | "schedule", defaultTitle = "RamaMeet Meeting") => {
    setTitle(defaultTitle);
    setMeetingCode(generateMeetingCode());
    setModalMode(mode);
  };

  const handleCopyCode = (codeToCopy?: string) => {
    const target = (codeToCopy ?? meetingCode).trim();
    if (!target) return;
    navigator.clipboard.writeText(target);
    pushNotification({
      title: "Kode Disalin",
      message: `Meeting ID ${target} disalin ke clipboard.`,
      type: "success"
    });
  };

  const handleCopyInviteLink = (code: string) => {
    const url = `${window.location.origin}/meeting/${code}`;
    navigator.clipboard.writeText(url);
    pushNotification({
      title: "Link Undangan Disalin",
      message: `Link meeting ${code} siap dibagikan.`,
      type: "success"
    });
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return meetings;
    return meetings.filter(
      (m) =>
        m.title.toLowerCase().includes(q) || m.meeting_code.toLowerCase().includes(q)
    );
  }, [meetings, searchQuery]);

  const upcoming = useMemo(
    () => filtered.filter((m) => m.status === "scheduled" || m.status === "live"),
    [filtered]
  );

  const recent = useMemo(
    () => filtered.filter((m) => m.status === "ended"),
    [filtered]
  );

  // Hitung 7 bar statistik aktivitas meeting 7 hari terakhir (fallback visual rapi jika data sedikit)
  const weeklyBars = useMemo(() => {
    const baseHeights = [30, 44, 58, 76, 48, 66, 90];
    if (meetings.length === 0) return baseHeights;

    const counts = Array(7).fill(0);
    const now = new Date();
    meetings.forEach((m) => {
      const created = new Date(m.scheduled_at || m.created_at);
      const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays < 7) {
        counts[6 - diffDays] += 1;
      }
    });

    const maxCount = Math.max(...counts, 1);
    const hasRecent = counts.some((c) => c > 0);
    if (!hasRecent) return baseHeights;

    return counts.map((count, i) =>
      Math.max(24, Math.round((count / maxCount) * 85) + (count === 0 ? Math.round(baseHeights[i] * 0.25) : 15))
    );
  }, [meetings]);

  const activeRate = useMemo(() => {
    if (meetings.length === 0) return "HD Ready";
    const pct = Math.round(((upcoming.length + recent.length) / Math.max(meetings.length, 1)) * 100);
    return `+${pct}%`;
  }, [meetings.length, recent.length, upcoming.length]);

  const handleConfirmSingleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      await deleteMeeting(deleteTarget.meeting_code);
      setMeetings((prev) =>
        prev.filter((m) => m.meeting_code !== deleteTarget.meeting_code)
      );
      pushNotification({
        title: "Meeting Dihapus",
        message: `"${deleteTarget.title}" berhasil dihapus dari daftar.`,
        type: "success"
      });
      setDeleteTarget(null);
    } catch (err: unknown) {
      pushNotification({
        title: "Gagal Menghapus",
        message: err instanceof Error ? err.message : "Tidak dapat menghapus meeting",
        type: "error"
      });
    } finally {
      setSubmitting(false);
    }
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
    } catch (err: unknown) {
      pushNotification({
        title: "Gagal",
        message: err instanceof Error ? err.message : "Gagal membersihkan riwayat",
        type: "error"
      });
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
    } catch (err: unknown) {
      pushNotification({
        title: "Error",
        message: err instanceof Error ? err.message : "Gagal membuat meeting",
        type: "error"
      });
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
      <div className="relative min-h-full overflow-x-hidden pb-28 md:pb-8">
        {/* Ambient Blue Neon Glow Background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/4 h-72 w-96 rounded-full bg-blue-600/20 blur-[120px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-10 right-10 h-64 w-80 rounded-full bg-cyan-500/15 blur-[120px]"
        />

        <div className="relative mx-auto max-w-7xl space-y-5 p-4 lg:p-6">
          {/* TOP ROW: Hero Banner (Left) + Upcoming Meetings (Right) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* Left Column: Hero Banner + Quick Action Bar */}
            <div className="space-y-5 xl:col-span-7">
              {/* Hero Banner */}
              <section className="relative overflow-hidden rounded-3xl border border-blue-400/30 bg-gradient-to-br from-[#0F2463] via-[#13389C] to-[#0A1944] p-6 shadow-[0_20px_50px_-15px_rgba(22,119,255,0.45)] sm:p-7">
                {/* Diagonal Light Beams */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-sky-400/25 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-72 rounded-full bg-blue-500/25 blur-3xl"
                />

                <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                  <div className="max-w-md space-y-3">
                    <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl leading-tight">
                      Welcome back,
                      <span className="mt-0.5 block italic">
                        <span className="text-white">{firstName}</span>
                        <span className="text-[#38BDF8]">!</span>
                      </span>
                    </h2>
                    <p className="text-sm text-blue-100/85">
                      Ready for your next meeting?
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => openCreateModal("new")}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2589FF] to-[#1668E8] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(37,137,255,0.55)] transition hover:brightness-110 active:scale-95"
                      >
                        <Video className="h-4 w-4 fill-white/25" />
                        <span>Start Meeting</span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openCreateModal("schedule")}
                        className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                      >
                        <span>Schedule</span>
                      </button>
                    </div>
                  </div>

                  {/* Stylized 3D Camera Pedestal Graphic */}
                  <div className="relative mx-auto hidden h-44 w-48 shrink-0 items-center justify-center sm:flex">
                    {/* Orbit ring */}
                    <div className="absolute h-36 w-44 -rotate-12 rounded-full border border-sky-300/35 shadow-[0_0_20px_rgba(56,189,248,0.25)]" />
                    {/* Floating mini cubes */}
                    <div className="absolute left-3 top-4 h-4 w-4 rotate-12 rounded-md border border-sky-200/40 bg-gradient-to-br from-sky-300/50 to-blue-600/50 backdrop-blur-sm" />
                    <div className="absolute right-2 bottom-12 h-5 w-5 -rotate-12 rounded-md border border-sky-200/40 bg-gradient-to-br from-blue-300/40 to-indigo-600/50 backdrop-blur-sm" />

                    {/* Glowing 3D App Tile */}
                    <div className="relative z-10 -mt-5 flex h-24 w-24 items-center justify-center rounded-3xl border border-sky-200/45 bg-gradient-to-br from-[#3B9EFF] via-[#1D6BFF] to-[#1342C4] shadow-[0_14px_35px_rgba(37,137,255,0.75)]">
                      <Video className="h-11 w-11 text-white fill-white/90 drop-shadow" />
                    </div>

                    {/* Glowing Circular Pedestal */}
                    <div className="absolute bottom-2 h-8 w-36 rounded-full border border-sky-400/50 bg-gradient-to-b from-blue-950/90 to-[#050C24] shadow-[0_0_25px_rgba(56,189,248,0.5)]">
                      <div className="mx-auto mt-1.5 h-3 w-28 rounded-full border border-cyan-300/60 bg-cyan-400/15" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Action Icon Row */}
              <section className="rounded-3xl border border-blue-400/15 bg-[#0C1733]/85 p-4 shadow-panel backdrop-blur-xl sm:px-6 sm:py-5">
                <div className="grid grid-cols-5 gap-2 sm:gap-4">
                  {/* New Meeting (Orange) */}
                  <button
                    type="button"
                    onClick={() => openCreateModal("new")}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF9F43] to-[#F96D1C] text-white shadow-[0_8px_20px_rgba(249,109,28,0.4)] transition group-hover:-translate-y-0.5 group-hover:brightness-110 sm:h-14 sm:w-14">
                      <Video className="h-6 w-6 fill-white/90" />
                    </div>
                    <span className="text-[11px] font-medium text-blue-100/90 sm:text-xs">
                      New Meeting
                    </span>
                  </button>

                  {/* Schedule (Blue) */}
                  <button
                    type="button"
                    onClick={() => openCreateModal("schedule")}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4AA8FF] to-[#1D63FF] text-white shadow-[0_8px_20px_rgba(29,99,255,0.4)] transition group-hover:-translate-y-0.5 group-hover:brightness-110 sm:h-14 sm:w-14">
                      <CalendarPlus className="h-6 w-6" />
                    </div>
                    <span className="text-[11px] font-medium text-blue-100/90 sm:text-xs">
                      Schedule
                    </span>
                  </button>

                  {/* Share Screen (Green) */}
                  <button
                    type="button"
                    onClick={() => openCreateModal("new", "Screen Share Session")}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2EE58D] to-[#10B981] text-white shadow-[0_8px_20px_rgba(16,185,129,0.4)] transition group-hover:-translate-y-0.5 group-hover:brightness-110 sm:h-14 sm:w-14">
                      <MonitorUp className="h-6 w-6" />
                    </div>
                    <span className="text-[11px] font-medium text-blue-100/90 sm:text-xs">
                      Share Screen
                    </span>
                  </button>

                  {/* Join (Purple) */}
                  <button
                    type="button"
                    onClick={() => setModalMode("join")}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9D6BFF] to-[#6C3BF5] text-white shadow-[0_8px_20px_rgba(108,59,245,0.4)] transition group-hover:-translate-y-0.5 group-hover:brightness-110 sm:h-14 sm:w-14">
                      <Users className="h-6 w-6" />
                    </div>
                    <span className="text-[11px] font-medium text-blue-100/90 sm:text-xs">
                      Join
                    </span>
                  </button>

                  {/* More (Slate Glass -> Settings) */}
                  <Link
                    href="/settings"
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-[#233252] to-[#15203B] text-blue-100 shadow-lg transition group-hover:-translate-y-0.5 group-hover:border-blue-400/40 sm:h-14 sm:w-14">
                      <MoreHorizontal className="h-6 w-6" />
                    </div>
                    <span className="text-[11px] font-medium text-blue-100/90 sm:text-xs">
                      More
                    </span>
                  </Link>
                </div>
              </section>
            </div>

            {/* Right Column: Upcoming Meetings Panel */}
            <section className="flex flex-col rounded-3xl border border-blue-400/15 bg-[#0C1733]/85 p-5 shadow-panel backdrop-blur-xl xl:col-span-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-[#38BDF8]">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-bold text-white">Upcoming Meetings</h3>
                </div>
                <Link
                  href="/meetings"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#38BDF8] transition hover:text-sky-300"
                >
                  <span>View All</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {loading ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-blue-400/10 bg-[#0A132A]/70 p-8 text-sm text-rm-muted">
                  Memuat jadwal meeting...
                </div>
              ) : upcoming.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-blue-400/20 bg-[#0A132A]/50 p-7 text-center">
                  <p className="text-sm text-rm-muted">
                    Belum ada meeting aktif atau terjadwal.
                  </p>
                  <button
                    type="button"
                    onClick={() => openCreateModal("schedule")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-4 py-1.5 text-xs font-semibold text-[#38BDF8] transition hover:bg-blue-500/30"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Buat Jadwal Meeting
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.slice(0, 3).map((m, idx) => {
                    const dotColor =
                      m.status === "live"
                        ? "bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse"
                        : idx === 0
                        ? "bg-sky-400"
                        : idx === 1
                        ? "bg-violet-400"
                        : "bg-emerald-400";
                    const canDelete = Boolean(profile && profile.id === m.host_id);

                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-blue-400/15 bg-[#0A132A]/85 p-3.5 transition hover:border-blue-400/35"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[11px] font-medium text-blue-200/75">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                            <span className="truncate">{formatScheduleLabel(m)}</span>
                            {m.has_password && (
                              <Lock className="h-3 w-3 shrink-0 text-amber-300" />
                            )}
                          </div>
                          <h4 className="mt-1 truncate text-sm font-bold text-white">
                            {m.title}
                          </h4>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-rm-muted">
                            Meeting ID: {m.meeting_code}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyInviteLink(m.meeting_code)}
                            title="Salin Link Undangan"
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/15 bg-[#111E3E] text-blue-200/75 transition hover:text-white"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(m)}
                              title="Hapus Meeting"
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-blue-400/15 bg-[#111E3E] text-blue-200/75 transition hover:border-red-500/50 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <Link
                            href={`/meeting/${m.meeting_code}`}
                            className={`inline-flex h-8 items-center justify-center rounded-xl px-4 text-xs font-semibold transition ${
                              m.status === "live" || idx < 2
                                ? "bg-gradient-to-r from-[#2589FF] to-[#1668E8] text-white shadow-[0_0_14px_rgba(37,137,255,0.45)] hover:brightness-110"
                                : "border border-blue-300/20 bg-[#18284D] text-white hover:bg-[#223664]"
                            }`}
                          >
                            {m.status === "live" ? "Join" : idx < 2 ? "Join" : "View"}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* BOTTOM ROW: Recent Meetings (Left) + Meeting Stats (Center) + Studio & Quick Links (Right) */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* Recent Meetings */}
            <section className="rounded-3xl border border-blue-400/15 bg-[#0C1733]/85 p-5 shadow-panel backdrop-blur-xl xl:col-span-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/15 text-[#38BDF8]">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-bold text-white">Recent Meetings</h3>
                </div>

                <div className="flex items-center gap-3">
                  {recent.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setModalMode("clear-history")}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400 transition hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Hapus Semua</span>
                    </button>
                  )}
                  <Link
                    href="/meetings"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#38BDF8] transition hover:text-sky-300"
                  >
                    <span>View All</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-blue-400/10 bg-[#0A132A]/70 p-8 text-center text-sm text-rm-muted">
                  Memuat riwayat meeting...
                </div>
              ) : recent.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-blue-400/20 bg-[#0A132A]/50 p-8 text-center text-sm text-rm-muted">
                  Belum ada riwayat meeting yang selesai.
                </div>
              ) : (
                <div className="space-y-3">
                  {recent.slice(0, 5).map((m, idx) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-blue-400/15 bg-[#0A132A]/85 p-3 transition hover:border-blue-400/35"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {/* Mini Visual Cover */}
                        <div
                          className={`relative flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${
                            THUMBNAIL_GRADIENTS[idx % THUMBNAIL_GRADIENTS.length]
                          } shadow-inner`}
                        >
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_60%)]" />
                          <Video className="relative h-4 w-4 text-white/90" />
                        </div>

                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-white">
                            {m.title}
                          </h4>
                          <p className="mt-0.5 truncate text-[11px] text-rm-muted">
                            {formatRelativeTime(m.scheduled_at || m.created_at)} • ID:{" "}
                            {m.meeting_code}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link
                          href={`/meeting/${m.meeting_code}`}
                          className="inline-flex h-8 items-center justify-center rounded-full border border-blue-300/20 bg-[#17264A] px-3.5 text-xs font-semibold text-white transition hover:border-blue-400/50 hover:bg-[#1E3260]"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(m)}
                          title="Hapus Riwayat Meeting"
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-400/15 bg-[#111E3E] text-rm-muted transition hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Meeting Stats */}
            <section className="flex flex-col justify-between rounded-3xl border border-blue-400/15 bg-[#0C1733]/85 p-5 shadow-panel backdrop-blur-xl xl:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#38BDF8]" />
                  <h3 className="text-base font-bold text-white">Meeting Stats</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                  {activeRate}
                </span>
              </div>

              {/* Glowing Bar Chart */}
              <div className="my-5 flex h-32 items-end justify-between gap-2 px-1">
                {weeklyBars.map((height, idx) => (
                  <div
                    key={idx}
                    className="flex h-full flex-1 flex-col justify-end"
                  >
                    <div
                      style={{ height: `${height}%` }}
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        idx === weeklyBars.length - 1 || idx === 3
                          ? "bg-gradient-to-t from-[#1668E8] via-[#2589FF] to-[#5EEAD4] shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                          : "bg-gradient-to-t from-[#12398A] via-[#1D63FF] to-[#38BDF8]"
                      }`}
                    />
                  </div>
                ))}
              </div>

              {/* 3 Stat Tiles */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-blue-400/15 bg-[#0A132A]/90 p-2.5 text-center">
                  <Users className="mx-auto mb-1 h-4 w-4 text-[#38BDF8]" />
                  <p className="text-base font-bold text-white">{meetings.length}</p>
                  <p className="text-[10px] text-rm-muted">Total</p>
                </div>
                <div className="rounded-2xl border border-blue-400/15 bg-[#0A132A]/90 p-2.5 text-center">
                  <Clock className="mx-auto mb-1 h-4 w-4 text-sky-300" />
                  <p className="text-base font-bold text-white">{upcoming.length}</p>
                  <p className="text-[10px] text-rm-muted">Upcoming</p>
                </div>
                <div className="rounded-2xl border border-blue-400/15 bg-[#0A132A]/90 p-2.5 text-center">
                  <Calendar className="mx-auto mb-1 h-4 w-4 text-violet-400" />
                  <p className="text-base font-bold text-white">{recent.length}</p>
                  <p className="text-[10px] text-rm-muted">Selesai</p>
                </div>
              </div>
            </section>

            {/* Right Stack: Smart Studio Banner + Quick Links */}
            <div className="flex flex-col gap-5 xl:col-span-3">
              {/* Feature Highlight Card (No Upgrade Pro) */}
              <section className="relative overflow-hidden rounded-3xl border border-blue-300/30 bg-gradient-to-br from-[#1C49D8] via-[#2B64F5] to-[#12266B] p-5 shadow-[0_14px_32px_rgba(29,99,255,0.4)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -bottom-6 h-28 w-28 rounded-full bg-cyan-300/30 blur-2xl"
                />
                <div className="relative z-10 pr-10">
                  <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-sky-100 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3" />
                    <span>HD Audio & BG</span>
                  </div>
                  <h3 className="text-sm font-bold text-white">RamaMeet Studio</h3>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100/90">
                    48kHz HD Voice & Custom Background siap pakai.
                  </p>
                  <button
                    type="button"
                    onClick={() => openCreateModal("new")}
                    className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#38BDF8] to-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:brightness-110"
                  >
                    <span>Coba Sekarang</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Decorative Glowing Badge */}
                <div className="pointer-events-none absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/30 bg-white/15 backdrop-blur-md shadow-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
              </section>

              {/* Quick Links */}
              <section className="flex-1 rounded-3xl border border-blue-400/15 bg-[#0C1733]/85 p-5 shadow-panel backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-[#38BDF8]" />
                  <h3 className="text-sm font-bold text-white">Quick Links</h3>
                </div>

                <div className="space-y-1.5">
                  <Link
                    href="/help"
                    className="flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-blue-100/90 transition hover:bg-blue-500/15 hover:text-white"
                  >
                    <span className="flex items-center gap-2.5">
                      <HelpCircle className="h-4 w-4 text-[#38BDF8]" />
                      <span>Get Help</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-rm-muted" />
                  </Link>

                  <Link
                    href="/recordings"
                    className="flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-blue-100/90 transition hover:bg-blue-500/15 hover:text-white"
                  >
                    <span className="flex items-center gap-2.5">
                      <PlayCircle className="h-4 w-4 text-[#38BDF8]" />
                      <span>Recordings</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-rm-muted" />
                  </Link>

                  <Link
                    href="/settings"
                    className="flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-blue-100/90 transition hover:bg-blue-500/15 hover:text-white"
                  >
                    <span className="flex items-center gap-2.5">
                      <Settings className="h-4 w-4 text-[#38BDF8]" />
                      <span>Audio & Account Settings</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-rm-muted" />
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
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
                onClick={() => handleCopyCode()}
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
            className="h-10 w-full rounded-xl bg-gradient-to-r from-[#2589FF] to-[#1668E8] text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110 disabled:opacity-60"
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
      <Modal open={modalMode === "join"} onClose={() => setModalMode(null)} title="Gabung Meeting">
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
            className="h-10 w-full rounded-xl bg-gradient-to-r from-[#2589FF] to-[#1668E8] text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110"
          >
            Masuk ke Ruang Meeting
          </button>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus 1 Meeting */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => !submitting && setDeleteTarget(null)}
        title="Hapus Riwayat Meeting"
      >
        <div className="space-y-4">
          <p className="text-sm text-rm-muted">
            Yakin ingin menghapus <strong className="text-white">{deleteTarget?.title}</strong> (ID:{" "}
            {deleteTarget?.meeting_code}) secara permanen?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setDeleteTarget(null)}
              className="h-9 rounded-xl border border-rm-border bg-rm-surface px-4 text-xs font-semibold text-rm-text"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmSingleDelete}
              className="h-9 rounded-xl bg-rm-danger px-4 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
            >
              {submitting ? "Menghapus..." : "Hapus Permanen"}
            </button>
          </div>
        </div>
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

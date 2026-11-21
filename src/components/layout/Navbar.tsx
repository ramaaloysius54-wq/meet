"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Video, ChevronDown, Menu } from "lucide-react";
import { NotificationBell } from "@/components/ui/Notification";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { createMeeting } from "@/services/meetingService";
import { createClient } from "@/lib/supabase/client";
import type { UserStatus } from "@/types";

interface NavbarProps {
  onOpenMobileMenu?: () => void;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; dot: string }[] = [
  { value: "online", label: "Online", dot: "bg-rm-success" },
  { value: "busy", label: "Busy", dot: "bg-rm-danger" },
  { value: "away", label: "Away", dot: "bg-amber-400" }
];

export function Navbar({ onOpenMobileMenu }: NavbarProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const profile = useMeetingStore((s) => s.profile);
  const setProfile = useMeetingStore((s) => s.setProfile);
  const searchQuery = useMeetingStore((s) => s.searchQuery);
  const setSearchQuery = useMeetingStore((s) => s.setSearchQuery);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [statusOpen, setStatusOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const currentStatus =
    STATUS_OPTIONS.find((s) => s.value === (profile?.status || "online")) || STATUS_OPTIONS[0];

  const handleStatusChange = async (next: UserStatus) => {
    setStatusOpen(false);
    if (!profile) return;
    setProfile({ ...profile, status: next });
    const supabase = createClient();
    await supabase.from("profiles").update({ status: next }).eq("id", profile.id);
  };

  const handleQuickNewMeeting = async () => {
    try {
      setCreating(true);
      const meeting = await createMeeting({
        title: `RamaMeet - ${profile?.full_name || "Instant Meeting"}`
      });
      router.push(`/meeting/${meeting.meeting_code}`);
    } catch (err: any) {
      pushNotification({
        title: "Gagal Membuat Meeting",
        message: err.message,
        type: "error"
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-rm-border/60 bg-rm-bg/95 px-4 lg:px-6">
      {/* Left: Mobile menu + Search bar */}
      <div className="flex flex-1 items-center gap-3">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-rm-border bg-rm-sidebar text-rm-text md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rm-muted" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings... (Ctrl + K)"
            className="h-10 w-full rounded-xl border border-rm-border/80 bg-rm-sidebar/90 pl-10 pr-4 text-sm text-rm-text placeholder:text-rm-muted focus:border-rm-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Right: Online Status + Bell + New Meeting */}
      <div className="flex items-center gap-2.5 sm:gap-3.5">
        <div className="relative hidden sm:block">
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className="flex h-10 items-center gap-2 rounded-full border border-rm-border/80 bg-rm-sidebar px-3.5 text-xs font-medium text-rm-text transition hover:border-rm-primary/60"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${currentStatus.dot}`} />
            <span>{currentStatus.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-rm-muted" />
          </button>

          {statusOpen && (
            <div className="absolute right-0 top-12 z-50 w-36 rounded-xl border border-rm-border bg-rm-sidebar p-1 shadow-panel">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleStatusChange(opt.value)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rm-text hover:bg-rm-surface"
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden h-6 w-px bg-rm-border/70 sm:block" />

        <NotificationBell />

        <button
          type="button"
          disabled={creating}
          onClick={handleQuickNewMeeting}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-rm-primary to-rm-secondary px-4 text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110 disabled:opacity-60"
        >
          <Video className="h-4 w-4 fill-white/20" />
          <span className="hidden sm:inline">{creating ? "Membuat..." : "New Meeting"}</span>
        </button>
      </div>
    </header>
  );
}

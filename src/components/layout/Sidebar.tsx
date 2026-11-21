"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Video,
  Home,
  Calendar,
  Users,
  PlayCircle,
  Settings,
  HelpCircle,
  Rocket,
  ArrowRight,
  ChevronDown,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/utils/format";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { createClient } from "@/lib/supabase/client";

const MENU_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Meetings", href: "/meetings", icon: Calendar },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Recordings", href: "/recordings", icon: PlayCircle },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useMeetingStore((s) => s.profile);
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col justify-between border-r border-rm-border/70 bg-rm-sidebar transition-all duration-200 select-none shrink-0",
        collapsed ? "w-20 px-2.5" : "w-60 px-4",
        "py-5"
      )}
    >
      {/* Top: Brand + Nav */}
      <div>
        <div className="mb-7 flex items-center justify-between gap-2 px-1">
          <Link href="/" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#38BDF8] via-rm-primary to-rm-secondary shadow-blue-glow">
              <Video className="h-5 w-5 text-white fill-white/20" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold tracking-tight text-white leading-tight">
                  RamaMeet
                </h1>
                <p className="truncate text-[10px] font-medium text-rm-muted">
                  Connect • Collaborate • Grow
                </p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex lg:hidden h-7 w-7 items-center justify-center rounded-lg text-rm-muted hover:bg-rm-surface hover:text-white"
            title="Toggle Sidebar"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="space-y-1.5">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname.startsWith("/meeting/")
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-gradient-to-r from-rm-primary to-rm-secondary text-white shadow-blue-glow"
                    : "text-rm-muted hover:bg-rm-surface/80 hover:text-rm-text"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Upgrade Card + User Profile */}
      <div className="space-y-4">
        {!collapsed && (
          <div className="upgrade-card-bg relative overflow-hidden rounded-2xl border border-blue-400/25 p-4 text-center shadow-panel">
            <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <h3 className="text-sm font-bold text-white">Upgrade to Pro</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-blue-100/85">
              Dapatkan fitur lebih lengkap untuk pengalaman meeting terbaik!
            </p>
            <Link
              href="/settings?tab=billing"
              className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-rm-bg transition hover:bg-blue-50"
            >
              <span>Upgrade Sekarang</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <div className="relative border-t border-rm-border/60 pt-3.5">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-rm-surface/70"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <UserAvatar
                name={profile?.full_name || "RamaMeet User"}
                src={profile?.avatar_url}
                size="md"
              />
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rm-text">
                    {profile?.full_name || "RamaMeet User"}
                  </p>
                  <p className="truncate text-xs text-rm-muted">
                    {profile?.plan || "Free Account"}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && <ChevronDown className="h-4 w-4 shrink-0 text-rm-muted" />}
          </button>

          {dropdownOpen && (
            <div className="absolute bottom-14 left-0 z-50 w-52 rounded-xl border border-rm-border bg-rm-bg p-1.5 shadow-panel">
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <User className="h-4 w-4 text-rm-muted" />
                <span>Profil & Akun</span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rm-danger hover:bg-rm-danger/10"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

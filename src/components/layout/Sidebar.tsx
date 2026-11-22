"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Video,
  Home,
  Calendar,
  PlayCircle,
  Settings,
  HelpCircle,
  ChevronDown,
  LogOut,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  RefreshCw
} from "lucide-react";
import { cn } from "@/utils/format";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { createClient } from "@/lib/supabase/client";

const MENU_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Meetings", href: "/meetings", icon: Calendar },
  { label: "Recordings", href: "/recordings", icon: PlayCircle },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle }
];

const MOBILE_NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Meetings", href: "/meetings", icon: Calendar },
  { label: "Recordings", href: "/recordings", icon: PlayCircle }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const profile = useMeetingStore((s) => s.profile);
  const [collapsed, setCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isInMeeting = pathname.startsWith("/meeting/");

  const handleLogout = async () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleSwitchAccount = async () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?switch=1");
    router.refresh();
  };

  return (
    <>
      {/* Desktop Sidebar */}
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
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
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

        {/* Bottom: User Profile */}
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
                onClick={handleSwitchAccount}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <RefreshCw className="h-4 w-4 text-rm-muted" />
                <span>Ganti Akun</span>
              </button>
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
      </aside>

      {/* Mobile / Android Bottom Navigation Bar */}
      {!isInMeeting && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-rm-border/80 bg-rm-sidebar/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden select-none">
          <div className="grid grid-cols-4 items-center px-1 py-1.5">
            {MOBILE_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                    isActive ? "text-[#38BDF8]" : "text-rm-muted hover:text-rm-text"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                mobileMenuOpen ? "text-[#38BDF8]" : "text-rm-muted hover:text-rm-text"
              )}
            >
              <User className="h-5 w-5 shrink-0" />
              <span className="truncate">Akun</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile / Android Account & Menu Sheet */}
      {mobileMenuOpen && !isInMeeting && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-rm-border/80 bg-rm-sidebar px-5 pb-7 pt-4 shadow-2xl select-none">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-rm-border" />

            {/* User Info + Close */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <UserAvatar
                  name={profile?.full_name || "RamaMeet User"}
                  src={profile?.avatar_url}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rm-text">
                    {profile?.full_name || "RamaMeet User"}
                  </p>
                  <p className="truncate text-xs text-rm-muted">
                    {profile?.plan || "Free Account"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup Menu Akun"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-rm-muted hover:bg-rm-surface hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Menu Tambahan */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              {MENU_ITEMS.filter((item) => ["/settings", "/help"].includes(item.href)).map(
                (item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 rounded-xl border border-rm-border/60 py-3 text-xs font-medium transition",
                        isActive
                          ? "bg-gradient-to-r from-rm-primary to-rm-secondary text-white border-transparent"
                          : "bg-rm-surface/50 text-rm-muted hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                }
              )}
            </div>

            {/* Aksi Akun */}
            <div className="space-y-2 border-t border-rm-border/60 pt-3">
              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-xl bg-rm-surface/60 px-3.5 py-2.5 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <User className="h-4 w-4 text-rm-muted" />
                <span>Profil & Akun</span>
              </Link>

              <button
                type="button"
                onClick={handleSwitchAccount}
                className="flex w-full items-center gap-2.5 rounded-xl bg-rm-surface/60 px-3.5 py-2.5 text-xs font-medium text-rm-text hover:bg-rm-surface"
              >
                <RefreshCw className="h-4 w-4 text-rm-muted" />
                <span>Ganti Akun</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-xl bg-rm-danger/10 px-3.5 py-2.5 text-xs font-semibold text-rm-danger hover:bg-rm-danger/20"
              >
                <LogOut className="h-4 w-4" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
  PanelLeftOpen,
  Menu,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const isInMeeting = pathname.startsWith("/meeting/");

  const handleLogout = async () => {
    setDropdownOpen(false);
    setMobileOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleSwitchAccount = async () => {
    setDropdownOpen(false);
    setMobileOpen(false);
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
        </div>
      </aside>

      {/* Mobile / Android Floating Trigger Button (Upgrade, Ganti Akun, Keluar, Menu) */}
      {!isInMeeting && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Buka Menu & Akun"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full border border-blue-400/35 bg-gradient-to-r from-rm-primary to-rm-secondary px-3.5 py-2.5 text-xs font-semibold text-white shadow-blue-glow active:scale-95 transition md:hidden"
        >
          <Menu className="h-4 w-4" />
          <span>Menu & Akun</span>
        </button>
      )}

      {/* Mobile / Android Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col justify-between overflow-y-auto border-r border-rm-border/70 bg-rm-sidebar px-4 py-5 shadow-2xl select-none">
            {/* Top: Brand + Close + Nav */}
            <div>
              <div className="mb-6 flex items-center justify-between gap-2 px-1">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 overflow-hidden"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#38BDF8] via-rm-primary to-rm-secondary shadow-blue-glow">
                    <Video className="h-5 w-5 text-white fill-white/20" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-bold tracking-tight text-white leading-tight">
                      RamaMeet
                    </h1>
                    <p className="truncate text-[10px] font-medium text-rm-muted">
                      Connect • Collaborate • Grow
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Tutup Menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-rm-muted hover:bg-rm-surface hover:text-white"
                >
                  <X className="h-5 w-5" />
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
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "bg-gradient-to-r from-rm-primary to-rm-secondary text-white shadow-blue-glow"
                          : "text-rm-muted hover:bg-rm-surface/80 hover:text-rm-text"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom: Upgrade Card + Akun + Ganti Akun + Keluar */}
            <div className="mt-6 space-y-4">
              <div className="upgrade-card-bg relative overflow-hidden rounded-2xl border border-blue-400/25 p-4 text-center shadow-panel">
                <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-md">
                  <Rocket className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-white">Upgrade to Pro</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-blue-100/85">
                  Dapatkan fitur lebih lengkap untuk pengalaman meeting terbaik!
                </p>
                <Link
                  href="/settings?tab=billing"
                  onClick={() => setMobileOpen(false)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 text-xs font-semibold text-rm-bg transition hover:bg-blue-50"
                >
                  <span>Upgrade Sekarang</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="space-y-2 border-t border-rm-border/60 pt-3.5">
                <div className="flex items-center gap-2.5 px-1.5 pb-1">
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

                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-rm-surface/60 px-3 py-2.5 text-xs font-medium text-rm-text hover:bg-rm-surface"
                >
                  <User className="h-4 w-4 text-rm-muted" />
                  <span>Profil & Akun</span>
                </Link>

                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-rm-surface/60 px-3 py-2.5 text-xs font-medium text-rm-text hover:bg-rm-surface"
                >
                  <RefreshCw className="h-4 w-4 text-rm-muted" />
                  <span>Ganti Akun</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-rm-danger/10 px-3 py-2.5 text-xs font-semibold text-rm-danger hover:bg-rm-danger/20"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

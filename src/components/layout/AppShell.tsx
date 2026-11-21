"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { createClient } from "@/lib/supabase/client";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { X, Home, Calendar, Users, PlayCircle, Settings, HelpCircle, Video } from "lucide-react";

const MOBILE_LINKS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Meetings", href: "/meetings", icon: Calendar },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Recordings", href: "/recordings", icon: PlayCircle },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Help", href: "/help", icon: HelpCircle }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const setProfile = useMeetingStore((s) => s.setProfile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", auth.user.id)
          .single();
        if (data) setProfile(data);
      } catch {
        // Ignore if env not yet configured
      }
    };
    loadProfile();
  }, [setProfile]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-rm-bg text-rm-text">
      <Sidebar />

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 border-r border-rm-border bg-rm-sidebar p-4 shadow-panel">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rm-primary">
                  <Video className="h-5 w-5 text-white" />
                </div>
                <span className="font-bold text-white">RamaMeet</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1 text-rm-muted hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-1.5">
              {MOBILE_LINKS.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      active ? "bg-rm-primary text-white" : "text-rm-muted hover:bg-rm-surface"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

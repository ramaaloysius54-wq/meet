"use client";

import { Bell, CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { formatTime } from "@/utils/format";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const notifications = useMeetingStore((s) => s.notifications);
  const markAllRead = useMeetingStore((s) => s.markAllNotificationsRead);
  const removeNotification = useMeetingStore((s) => s.removeNotification);
  const clearNotifications = useMeetingStore((s) => s.clearNotifications);

  // Auto-clear notifikasi awal (welcome-1) setelah 5 detik
  useEffect(() => {
    const timer = setTimeout(() => {
      removeNotification("welcome-1");
    }, 5000);
    return () => clearTimeout(timer);
  }, [removeNotification]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-rm-muted transition hover:bg-rm-surface hover:text-white"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rm-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-rm-border bg-rm-sidebar p-3 shadow-panel">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-rm-text">Notifikasi</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-rm-muted">{notifications.length} item</span>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="text-[11px] font-medium text-rm-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-rm-muted">Tidak ada notifikasi</p>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-xl border border-rm-border/60 bg-rm-bg/70 p-2.5"
                >
                  {item.type === "success" && (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-rm-success" />
                  )}
                  {item.type === "info" && (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-rm-primary" />
                  )}
                  {item.type === "warning" && (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  {item.type === "error" && (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rm-danger" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-rm-text">{item.title}</p>
                      <span className="text-[10px] text-rm-muted">
                        {formatTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-rm-muted">{item.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

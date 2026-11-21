"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Profile[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data }) => {
        if (data) setContacts(data as Profile[]);
      });
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <h2 className="text-xl font-bold text-white">Contacts</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-2xl border border-rm-border/70 bg-rm-sidebar p-4"
            >
              <div className="flex items-center gap-3">
                <UserAvatar name={c.full_name} src={c.avatar_url} size="md" />
                <div>
                  <p className="text-sm font-semibold text-white">{c.full_name}</p>
                  <p className="text-xs text-rm-muted">{c.email}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rm-surface px-2.5 py-1 text-[11px] capitalize text-rm-text">
                <span
                  className={`h-2 w-2 rounded-full ${
                    c.status === "online" ? "bg-rm-success" : "bg-rm-muted"
                  }`}
                />
                {c.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

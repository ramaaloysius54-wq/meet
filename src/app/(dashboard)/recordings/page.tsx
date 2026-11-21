"use client";

import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/client";

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<any[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("meeting_recordings")
      .select("*, meeting:meetings(title, meeting_code)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRecordings(data || []));
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <h2 className="text-xl font-bold text-white">Recordings</h2>
        {recordings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rm-border bg-rm-sidebar/60 p-10 text-center text-sm text-rm-muted">
            Belum ada rekaman meeting. Aktifkan LiveKit Egress untuk menyimpan rekaman otomatis ke cloud storage.
          </div>
        ) : (
          <div className="space-y-3">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between rounded-2xl border border-rm-border bg-rm-sidebar p-4"
              >
                <div className="flex items-center gap-3">
                  <PlayCircle className="h-8 w-8 text-rm-primary" />
                  <div>
                    <p className="text-sm font-semibold text-white">{rec.file_name}</p>
                    <p className="text-xs text-rm-muted">{rec.meeting?.title}</p>
                  </div>
                </div>
                <a
                  href={rec.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-rm-primary px-4 py-2 text-xs font-semibold text-white"
                >
                  Putar / Unduh
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { Upload, Save } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useMeetingStore } from "@/stores/useMeetingStore";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const profile = useMeetingStore((s) => s.profile);
  const setProfile = useMeetingStore((s) => s.setProfile);
  const pushNotification = useMeetingStore((s) => s.pushNotification);

  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", profile.id)
      .select("*")
      .single();

    setSaving(false);
    if (error) {
      pushNotification({ title: "Gagal", message: error.message, type: "error" });
    } else if (data) {
      setProfile(data);
      pushNotification({ title: "Profil Disimpan", message: "Nama profil diperbarui.", type: "success" });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bucket", "avatars");
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok && data.url) {
      const supabase = createClient();
      const { data: updated } = await supabase
        .from("profiles")
        .update({ avatar_url: data.url })
        .eq("id", profile.id)
        .select("*")
        .single();
      if (updated) setProfile(updated);
      pushNotification({ title: "Foto Diperbarui", message: "Avatar berhasil diunggah.", type: "success" });
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-6">
        <h2 className="text-xl font-bold text-white">Pengaturan Profil & Akun</h2>

        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-2xl border border-rm-border bg-rm-sidebar p-6"
        >
          <div className="flex items-center gap-4">
            <UserAvatar
              name={profile?.full_name || "User"}
              src={profile?.avatar_url}
              size="lg"
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rm-border bg-rm-surface px-4 py-2 text-xs font-semibold text-rm-text hover:border-rm-primary">
              <Upload className="h-4 w-4" />
              <span>Upload Foto Profil</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-rm-muted">Nama Lengkap</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11 w-full rounded-xl border border-rm-border bg-rm-bg px-3.5 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-rm-muted">Email</label>
            <input
              type="email"
              disabled
              value={profile?.email || ""}
              className="h-11 w-full rounded-xl border border-rm-border/50 bg-rm-bg/60 px-3.5 text-sm text-rm-muted"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-rm-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-rm-secondary"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
          </button>
        </form>
      </div>
    </AppShell>
  );
}

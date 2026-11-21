"use client";

import { useState } from "react";
import { Check, Copy, Hash, Link2, Lock, Share2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  meetingCode: string;
  meetingTitle: string;
  hasPassword?: boolean;
  onCopied?: (label: string) => void;
}

export function InviteModal({
  open,
  onClose,
  meetingCode,
  meetingTitle,
  hasPassword = false,
  onCopied
}: InviteModalProps) {
  const [copiedKey, setCopiedKey] = useState<"link" | "code" | "all" | null>(null);

  const meetingUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/meeting/${meetingCode}`
      : `/meeting/${meetingCode}`;

  const copyText = async (value: string, key: "link" | "code" | "all", label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      onCopied?.(label);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback jika clipboard API diblokir
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      setCopiedKey(key);
      onCopied?.(label);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const fullInviteText = [
    `Undangan RamaMeet: ${meetingTitle}`,
    `Link Meeting: ${meetingUrl}`,
    `Meeting Code: ${meetingCode}`,
    hasPassword ? "Catatan: Meeting ini memerlukan password dari Host." : ""
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Modal open={open} onClose={onClose} title="Bagikan Undangan Meeting">
      <div className="space-y-4">
        <p className="text-xs text-rm-muted">
          Pilih salah satu cara di bawah untuk mengundang peserta masuk ke{" "}
          <strong className="text-white">{meetingTitle}</strong>.
        </p>

        {hasPassword && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Meeting dilindungi password. Sertakan password secara terpisah kepada peserta.</span>
          </div>
        )}

        {/* Opsi 1: Bagikan Link Meeting */}
        <div className="rounded-xl border border-rm-border/80 bg-rm-bg/80 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
            <Link2 className="h-4 w-4 text-rm-primary" />
            <span>Opsi 1: Bagikan Link Meeting</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={meetingUrl}
              className="h-9 flex-1 truncate rounded-lg border border-rm-border bg-rm-sidebar px-2.5 text-xs text-rm-text focus:outline-none"
            />
            <button
              type="button"
              onClick={() => copyText(meetingUrl, "link", "Link meeting")}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-rm-primary px-3 text-xs font-semibold text-white transition hover:bg-rm-secondary"
            >
              {copiedKey === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === "link" ? "Disalin" : "Salin Link"}</span>
            </button>
          </div>
        </div>

        {/* Opsi 2: Bagikan Meeting Code (ala Zoom ID) */}
        <div className="rounded-xl border border-rm-border/80 bg-rm-bg/80 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
            <Hash className="h-4 w-4 text-sky-400" />
            <span>Opsi 2: Bagikan Meeting Code (ID)</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-rm-border bg-rm-sidebar px-3 py-2">
            <span className="font-mono text-base font-bold tracking-wider text-white">
              {meetingCode}
            </span>
            <button
              type="button"
              onClick={() => copyText(meetingCode, "code", "Meeting code")}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-rm-border bg-rm-surface px-3 text-xs font-semibold text-rm-text transition hover:border-rm-primary hover:text-white"
            >
              {copiedKey === "code" ? <Check className="h-3.5 w-3.5 text-rm-success" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedKey === "code" ? "Disalin" : "Salin Code"}</span>
            </button>
          </div>
        </div>

        {/* Salin Paket Undangan Lengkap */}
        <button
          type="button"
          onClick={() => copyText(fullInviteText, "all", "Undangan lengkap (Link & Code)")}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rm-primary/50 bg-rm-primary/15 text-xs font-semibold text-sky-200 transition hover:bg-rm-primary hover:text-white"
        >
          {copiedKey === "all" ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          <span>
            {copiedKey === "all"
              ? "Undangan Lengkap Disalin!"
              : "Salin Undangan Lengkap (Link + Code)"}
          </span>
        </button>
      </div>
    </Modal>
  );
}
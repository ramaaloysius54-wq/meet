import { AppShell } from "@/components/layout/AppShell";

export default function HelpPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-6">
        <h2 className="text-xl font-bold text-white">Pusat Bantuan RamaMeet</h2>
        <div className="space-y-3 rounded-2xl border border-rm-border bg-rm-sidebar p-6 text-sm text-rm-muted">
          <p>
            <strong className="text-white">Shortcut Keyboard:</strong> Tekan{" "}
            <code className="rounded bg-rm-bg px-1.5 py-0.5 text-sky-400">Ctrl + K</code> untuk
            fokus cepat ke pencarian meeting.
          </p>
          <p>
            <strong className="text-white">Izin Kamera & Mikrofon:</strong> Pastikan situs diakses
            melalui <code className="text-sky-400">HTTPS</code> atau{" "}
            <code className="text-sky-400">localhost</code> agar WebRTC{" "}
            <code>getUserMedia</code> dan <code>getDisplayMedia</code> diizinkan browser.
          </p>
          <p>
            <strong className="text-white">Kualitas Video SFU:</strong> LiveKit SFU secara otomatis
            mengatur simulcast dan adaptive bitrate berdasarkan koneksi masing-masing peserta.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

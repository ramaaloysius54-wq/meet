"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Video,
  User,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: normalizedEmail,
          password
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mendaftar akun");

      if (data.requiresClickVerify && data.verifyToken) {
        setVerifyToken(data.verifyToken);
        setNeedsVerification(true);
        return;
      }

      if (data.autoConfirmed) {
        const supabase = createClient();
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (loginErr) throw loginErr;
        router.push("/");
        router.refresh();
        return;
      }

      setNeedsVerification(true);
    } catch (err: any) {
      setError(err.message || "Gagal mendaftar akun");
    } finally {
      setLoading(false);
    }
  };

  // Tombol Verifikasi Langsung 1-Klik -> Verifikasi + Auto Login ke Dashboard
  const handleInstantVerify = async () => {
    setError(null);
    setInfo(null);
    setVerifying(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch("/api/auth/verify-instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verifyToken: verifyToken || undefined,
          email: normalizedEmail
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verifikasi email gagal");

      setInfo("Email berhasil diverifikasi! Mengarahkan ke RamaMeet...");

      const supabase = createClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (loginErr) throw loginErr;

      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Gagal memverifikasi email");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { error: resendErr } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
      });
      if (resendErr) throw resendErr;
      setInfo("Email verifikasi baru telah dikirim.");
    } catch (err: any) {
      setError(err.message || "Gagal mengirim ulang email verifikasi");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-rm-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-rm-border bg-rm-sidebar p-7 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#38BDF8] via-rm-primary to-rm-secondary shadow-blue-glow">
            <Video className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">RamaMeet</h1>
            <p className="text-xs text-rm-muted">Buat Akun Baru</p>
          </div>
        </div>

        {needsVerification ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rm-success/15 text-rm-success">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-white">Verifikasi Email Sekarang</h2>
            <p className="text-xs leading-relaxed text-rm-muted">
              Akun untuk <strong className="text-white">{email}</strong> sudah siap. Pencet tombol
              di bawah ini untuk langsung memverifikasi email dan masuk ke RamaMeet.
            </p>

            {info && (
              <div className="rounded-xl border border-rm-success/40 bg-rm-success/10 p-3 text-xs text-rm-success">
                {info}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-rm-danger/40 bg-rm-danger/10 p-3 text-xs text-rm-danger">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={verifying}
              onClick={handleInstantVerify}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rm-success to-emerald-600 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:brightness-110 disabled:opacity-60"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>{verifying ? "Memverifikasi & Masuk..." : "Verifikasi Email Sekarang"}</span>
            </button>

            {!verifyToken && (
              <button
                type="button"
                disabled={resending}
                onClick={handleResend}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rm-border bg-rm-surface text-xs font-semibold text-rm-text transition hover:border-rm-primary disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                <span>{resending ? "Mengirim..." : "Kirim Ulang Link ke Inbox"}</span>
              </button>
            )}

            <Link
              href="/login"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-rm-border bg-rm-bg text-xs font-semibold text-rm-muted hover:text-white"
            >
              Kembali ke Halaman Login
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-xl border border-rm-danger/40 bg-rm-danger/10 p-3 text-xs text-rm-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-rm-muted">Nama Lengkap</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rm-muted" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Rama Alosi"
                    className="h-11 w-full rounded-xl border border-rm-border bg-rm-bg pl-10 pr-4 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-rm-muted">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rm-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@perusahaan.com"
                    className="h-11 w-full rounded-xl border border-rm-border bg-rm-bg pl-10 pr-4 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-rm-muted">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-rm-muted" />
                  <input
                    type="password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="h-11 w-full rounded-xl border border-rm-border bg-rm-bg pl-10 pr-4 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rm-primary to-rm-secondary text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110 disabled:opacity-60"
              >
                <span>{loading ? "Mendaftar..." : "Daftar & Lanjut Verifikasi"}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-rm-muted">
              Sudah punya akun?{" "}
              <Link href="/login" className="font-semibold text-rm-primary hover:underline">
                Masuk di sini
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

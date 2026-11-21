"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Video, Mail, Lock, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const callbackError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    callbackError === "verifikasi_gagal"
      ? "Link verifikasi sudah kedaluwarsa. Masukkan email Anda lalu klik Verifikasi."
      : null
  );
  const [info, setInfo] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setUnconfirmed(false);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (authErr) throw authErr;
      router.push(redirect);
      router.refresh();
    } catch (err: any) {
      const msg = String(err?.message || "Email atau password salah");
      if (msg.toLowerCase().includes("email not confirmed")) {
        setUnconfirmed(true);
        setError("Email Anda belum diverifikasi. Klik tombol di bawah untuk langsung verifikasi.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInstantVerifyAndLogin = async () => {
    if (!email.trim()) return;
    setVerifying(true);
    setError(null);
    setInfo(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const res = await fetch("/api/auth/verify-instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memverifikasi email");

      setInfo("Email berhasil diverifikasi! Sedang masuk...");
      setUnconfirmed(false);

      if (password) {
        const supabase = createClient();
        const { error: loginErr } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (loginErr) throw loginErr;
        router.push(redirect);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Gagal memverifikasi email");
    } finally {
      setVerifying(false);
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
            <p className="text-xs text-rm-muted">Connect • Collaborate • Grow</p>
          </div>
        </div>

        <h2 className="text-lg font-semibold text-rm-text">Masuk ke Akun Anda</h2>
        <p className="mt-1 text-xs text-rm-muted">
          Kelola rapat video HD dan kolaborasi tim secara real-time.
        </p>

        {info && (
          <div className="mt-4 rounded-xl border border-rm-success/40 bg-rm-success/10 p-3 text-xs text-rm-success">
            {info}
          </div>
        )}

        {error && (
          <div className="mt-4 space-y-2 rounded-xl border border-rm-danger/40 bg-rm-danger/10 p-3 text-xs text-rm-danger">
            <p>{error}</p>
            {unconfirmed && (
              <button
                type="button"
                disabled={verifying}
                onClick={handleInstantVerifyAndLogin}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rm-success px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{verifying ? "Memverifikasi..." : "Verifikasi Email Sekarang"}</span>
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-5 space-y-4">
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 w-full rounded-xl border border-rm-border bg-rm-bg pl-10 pr-4 text-sm text-rm-text focus:border-rm-primary focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rm-primary to-rm-secondary text-sm font-semibold text-white shadow-blue-glow transition hover:brightness-110 disabled:opacity-60"
          >
            <span>{loading ? "Memproses..." : "Masuk"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-rm-muted">
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-rm-primary hover:underline">
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-rm-bg" />}>
      <LoginForm />
    </Suspense>
  );
}

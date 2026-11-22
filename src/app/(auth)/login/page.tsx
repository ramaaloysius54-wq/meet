"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const callbackError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(
    callbackError ? "Login dengan Google gagal. Silakan coba lagi." : null
  );
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          const lowerMsg = error.message.toLowerCase();
          if (lowerMsg.includes("email not confirmed")) {
            setErrorMsg("Email belum diverifikasi. Silakan cek kotak masuk email Anda.");
          } else {
            setErrorMsg("Email dan password salah");
          }
          return;
        }

        router.push(redirectTo);
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split("@")[0],
            },
          },
        });

        if (error) {
          const lowerMsg = error.message.toLowerCase();
          if (lowerMsg.includes("already registered")) {
            setErrorMsg("Email sudah terdaftar. Silakan masuk menggunakan akun Anda.");
          } else {
            setErrorMsg(error.message);
          }
          return;
        }

        if (data.session) {
          router.push(redirectTo);
          router.refresh();
        } else {
          setSuccessMsg(
            "Akun berhasil dibuat. Silakan cek email untuk verifikasi atau langsung login."
          );
          setMode("login");
        }
      }
    } catch {
      setErrorMsg(
        mode === "login"
          ? "Email dan password salah"
          : "Terjadi kesalahan saat mendaftar. Silakan coba lagi."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const supabase = createClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal terhubung ke Google. Silakan coba lagi.";
      setErrorMsg(message);
      setGoogleLoading(false);
    }
  };

  const isBusy = loading || googleLoading;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-blue-700 via-blue-500 to-white flex items-center justify-center p-4 sm:p-6">
      {/* Aksen latar belakang biru-putih lembut */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-400/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-white/70 blur-3xl" />

      {/* Satu Card Utuh: Judul sampai Footer */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white/95 p-6 sm:p-8 shadow-2xl shadow-blue-950/15 backdrop-blur-md border border-blue-100">
        {/* Header Brand di dalam Card */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-lg shadow-blue-600/25">
            <svg
              className="h-7 w-7 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-blue-700">
            Rama Meet
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Platform video conference pribadi untuk kolaborasi tim
          </p>
        </div>

        {/* Tab Masuk / Daftar */}
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-blue-50 p-1">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode("login");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition-all ${
              mode === "login"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-blue-700 hover:bg-blue-100/70"
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              setMode("register");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`rounded-lg py-2 text-sm font-semibold transition-all ${
              mode === "register"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-blue-700 hover:bg-blue-100/70"
            }`}
          >
            Daftar
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama Anda"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                {showPassword ? "Tutup" : "Lihat"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="mt-1 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? "Memproses..."
              : mode === "login"
              ? "Masuk ke Rama Meet"
              : "Buat Akun Rama Meet"}
          </button>
        </form>

        {/* Pemisah */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            atau
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Tombol Login Google */}
        <button
          type="button"
          disabled={isBusy}
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          {googleLoading ? "Menghubungkan ke Google..." : "Masuk dengan Google"}
        </button>

        {/* Footer di dalam Card */}
        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs font-medium text-slate-400">
          © {new Date().getFullYear()} Rama Meet
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-gradient-to-br from-blue-700 via-blue-500 to-white flex items-center justify-center">
          <div className="text-white font-semibold">Memuat Rama Meet...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

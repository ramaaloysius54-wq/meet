import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { createVerifyToken } from "@/lib/verifyToken";

const registerSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter").max(100),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter").max(128)
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!checkRateLimit(`register:${ip}`, 60, 60_000)) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan pendaftaran. Coba lagi sebentar." },
        { status: 429 }
      );
    }

    const parsed = registerSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const fullName = parsed.data.fullName.trim();
    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    const admin = createAdminSupabase();

    if (admin) {
      // Buat user dengan email_confirm: false agar user menekan tombol Verifikasi Email
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { full_name: fullName }
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("already") || msg.includes("registered")) {
          // Cek apakah akun lama belum terverifikasi -> izinkan langsung verifikasi ulang
          const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email);
          if (existing && !existing.email_confirmed_at) {
            const verifyToken = createVerifyToken(existing.id, email);
            return NextResponse.json(
              {
                ok: true,
                requiresClickVerify: true,
                verifyToken,
                email
              },
              { status: 200 }
            );
          }

          return NextResponse.json(
            { error: "Email sudah terdaftar dan aktif. Silakan langsung login." },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (data.user) {
        await admin.from("profiles").upsert(
          {
            id: data.user.id,
            full_name: fullName,
            email
          },
          { onConflict: "id" }
        );

        const verifyToken = createVerifyToken(data.user.id, email);
        return NextResponse.json(
          {
            ok: true,
            requiresClickVerify: true,
            verifyToken,
            email
          },
          { status: 201 }
        );
      }
    }

    // Fallback jika SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di .env
    const origin =
      req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${origin}/auth/callback`
      }
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        ok: true,
        autoConfirmed: Boolean(data.session),
        requiresClickVerify: false
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Terjadi kesalahan saat mendaftar" },
      { status: 500 }
    );
  }
}

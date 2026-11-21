import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { parseVerifyToken } from "@/lib/verifyToken";
import { checkRateLimit } from "@/lib/rateLimit";

const verifySchema = z.object({
  verifyToken: z.string().optional(),
  email: z.string().email().optional()
});

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!checkRateLimit(`verify-instant:${ip}`, 40, 60_000)) {
      return NextResponse.json({ error: "Terlalu banyak permintaan verifikasi." }, { status: 429 });
    }

    const parsed = verifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Permintaan verifikasi tidak valid" }, { status: 400 });
    }

    const admin = createAdminSupabase();
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server (.env / Kubernetes Secret)."
        },
        { status: 500 }
      );
    }

    let userId: string | null = null;
    let userEmail: string | null = null;
    let fullName = "RamaMeet User";

    // Jalur 1: Token terverifikasi langsung dari halaman Register
    if (parsed.data.verifyToken) {
      const decoded = parseVerifyToken(parsed.data.verifyToken);
      if (!decoded) {
        return NextResponse.json(
          { error: "Token verifikasi tidak valid atau kedaluwarsa. Silakan daftar ulang." },
          { status: 400 }
        );
      }
      userId = decoded.uid;
      userEmail = decoded.email;
    } else if (parsed.data.email) {
      // Jalur 2: Konfirmasi akun belum aktif dari halaman Login (password tetap divalidasi saat login)
      const normalized = parsed.data.email.trim().toLowerCase();
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000
      });
      if (listErr) {
        return NextResponse.json({ error: listErr.message }, { status: 500 });
      }
      const found = listed?.users?.find((u) => u.email?.toLowerCase() === normalized);
      if (!found) {
        return NextResponse.json({ error: "Akun dengan email tersebut tidak ditemukan." }, { status: 404 });
      }
      userId = found.id;
      userEmail = normalized;
      fullName =
        (found.user_metadata?.full_name as string | undefined) || normalized.split("@")[0];
    } else {
      return NextResponse.json({ error: "Data verifikasi kosong" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const metaName =
      (updated?.user?.user_metadata?.full_name as string | undefined) ||
      fullName ||
      userEmail.split("@")[0];

    await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: metaName,
        email: userEmail
      },
      { onConflict: "id" }
    );

    return NextResponse.json({ ok: true, verified: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Gagal memverifikasi email" },
      { status: 500 }
    );
  }
}

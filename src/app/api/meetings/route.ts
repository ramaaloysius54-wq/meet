import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateMeetingCode } from "@/utils/format";
import { checkRateLimit } from "@/lib/rateLimit";

const createMeetingSchema = z.object({
  title: z.string().min(2).max(120),
  meeting_code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{4,32}$/, "Kode meeting hanya boleh huruf, angka, dan tanda hubung (4-32 karakter)")
    .optional(),
  description: z.string().max(500).optional(),
  password: z.string().max(64).optional(),
  waiting_room_enabled: z.boolean().optional().default(false),
  scheduled_at: z.string().nullable().optional()
});

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select(
      `
      id, meeting_code, title, description, host_id, has_password,
      waiting_room_enabled, is_locked, is_recording, status,
      scheduled_at, started_at, ended_at, created_at,
      host:profiles!meetings_host_id_fkey(id, full_name, avatar_url)
    `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meetings: meetings || [] });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`create-meeting:${user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Rate limit tercapai" }, { status: 429 });
  }

  const parsed = createMeetingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Data meeting tidak valid" },
      { status: 400 }
    );
  }

  const { title, meeting_code, description, password, waiting_room_enabled, scheduled_at } =
    parsed.data;
  const passwordHash =
    password && password.trim().length > 0 ? await bcrypt.hash(password, 10) : null;
  const isScheduled = Boolean(scheduled_at);

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      meeting_code: meeting_code || generateMeetingCode(),
      title: title.trim(),
      description: description?.trim() || null,
      host_id: user.id,
      password_hash: passwordHash,
      has_password: Boolean(passwordHash),
      waiting_room_enabled,
      status: isScheduled ? "scheduled" : "live",
      scheduled_at: scheduled_at || null,
      started_at: isScheduled ? null : new Date().toISOString()
    })
    .select("*")
    .single();

  if (error || !meeting) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "Kode meeting sudah dipakai, silakan klik Generate untuk kode baru" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error?.message || "Gagal membuat meeting" }, { status: 500 });
  }

  await supabase.from("meeting_participants").insert({
    meeting_id: meeting.id,
    user_id: user.id,
    role: "host",
    status: "joined"
  });

  return NextResponse.json({ meeting }, { status: 201 });
}

export async function DELETE() {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: hostErr } = await supabase
    .from("meetings")
    .delete()
    .eq("host_id", user.id)
    .eq("status", "ended");

  if (hostErr) {
    return NextResponse.json({ error: hostErr.message }, { status: 500 });
  }

  const { data: endedJoined } = await supabase
    .from("meetings")
    .select("id")
    .eq("status", "ended")
    .neq("host_id", user.id);

  const endedIds = (endedJoined || []).map((m) => m.id);
  if (endedIds.length > 0) {
    await supabase
      .from("meeting_participants")
      .delete()
      .eq("user_id", user.id)
      .in("meeting_id", endedIds);
  }

  return NextResponse.json({ ok: true });
}

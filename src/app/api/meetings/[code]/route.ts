import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

const updateSchema = z.object({
  status: z.enum(["scheduled", "live", "ended"]).optional(),
  is_locked: z.boolean().optional(),
  waiting_room_enabled: z.boolean().optional(),
  is_recording: z.boolean().optional()
});

export async function GET(_req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Lookup berdasarkan kode meeting eksak (tidak pernah mengembalikan password_hash)
  const lookupClient = createAdminSupabase() || supabase;

  const { data: meeting, error } = await lookupClient
    .from("meetings")
    .select(
      `
      id, meeting_code, title, description, host_id, has_password,
      waiting_room_enabled, is_locked, is_recording, status,
      scheduled_at, started_at, ended_at, created_at,
      host:profiles!meetings_host_id_fkey(id, full_name, avatar_url)
    `
    )
    .eq("meeting_code", context.params.code)
    .single();

  if (error || !meeting) {
    return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });
  }

  const { data: participants } = await lookupClient
    .from("meeting_participants")
    .select(
      `
      id, meeting_id, user_id, role, status, is_muted, is_video_off, joined_at,
      profile:profiles(id, full_name, email, avatar_url, plan, status)
    `
    )
    .eq("meeting_id", meeting.id)
    .in("status", ["joined", "waiting"]);

  return NextResponse.json({ meeting, participants: participants || [] });
}

export async function PATCH(req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("meetings")
    .select("id, host_id")
    .eq("meeting_code", context.params.code)
    .single();

  if (!existing) return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });
  if (existing.host_id !== user.id) {
    return NextResponse.json(
      { error: "Hanya Host yang dapat mengubah status meeting" },
      { status: 403 }
    );
  }

  const updatePayload: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "ended") {
    updatePayload.ended_at = new Date().toISOString();
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .update(updatePayload)
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ meeting });
}

export async function DELETE(_req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("meetings")
    .select("id, host_id, status")
    .eq("meeting_code", context.params.code)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });
  }

  if (existing.host_id === user.id) {
    const { error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", existing.id)
      .eq("host_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "deleted_meeting" });
  }

  if (existing.status !== "ended") {
    return NextResponse.json(
      { error: "Hanya Host yang dapat menghapus meeting yang masih aktif/terjadwal" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("meeting_participants")
    .delete()
    .eq("meeting_id", existing.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mode: "removed_from_history" });
}
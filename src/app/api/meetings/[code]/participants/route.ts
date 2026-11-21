import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { getRoomServiceClient } from "@/lib/livekit";

const actionSchema = z.object({
  action: z.enum(["mute", "mute_all", "remove", "admit"]),
  targetUserId: z.string().uuid().optional()
});

export async function PATCH(req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, host_id, meeting_code")
    .eq("meeting_code", context.params.code)
    .single();

  if (!meeting) return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });
  if (meeting.host_id !== user.id) {
    return NextResponse.json({ error: "Akses ditolak: Khusus Host" }, { status: 403 });
  }

  const { action, targetUserId } = parsed.data;
  const lkClient = getRoomServiceClient();

  if (action === "mute_all") {
    await supabase
      .from("meeting_participants")
      .update({ is_muted: true })
      .eq("meeting_id", meeting.id)
      .neq("user_id", user.id);

    if (lkClient) {
      const lkParticipants = await lkClient.listParticipants(meeting.meeting_code).catch(() => []);
      for (const p of lkParticipants) {
        if (p.identity !== user.id) {
          for (const t of p.tracks) {
            if (t.type === 0) {
              await lkClient.mutePublishedTrack(meeting.meeting_code, p.identity, t.sid, true).catch(() => {});
            }
          }
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId wajib diisi" }, { status: 400 });
  }

  if (action === "mute") {
    await supabase
      .from("meeting_participants")
      .update({ is_muted: true })
      .eq("meeting_id", meeting.id)
      .eq("user_id", targetUserId);
  } else if (action === "remove") {
    await supabase
      .from("meeting_participants")
      .update({ status: "removed", left_at: new Date().toISOString() })
      .eq("meeting_id", meeting.id)
      .eq("user_id", targetUserId);

    if (lkClient) {
      await lkClient.removeParticipant(meeting.meeting_code, targetUserId).catch(() => {});
    }
  } else if (action === "admit") {
    await supabase
      .from("meeting_participants")
      .update({ status: "joined" })
      .eq("meeting_id", meeting.id)
      .eq("user_id", targetUserId);
  }

  return NextResponse.json({ ok: true });
}

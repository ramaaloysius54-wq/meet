import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateLiveKitToken, isLiveKitServerConfigured } from "@/lib/livekit";
import { checkRateLimit } from "@/lib/rateLimit";

const tokenSchema = z.object({
  meetingCode: z.string().min(4).max(32),
  password: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(`lk:${user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Terlalu banyak permintaan token" }, { status: 429 });
    }

    const parsed = tokenSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Kode meeting tidak valid" }, { status: 400 });
    }

    const { meetingCode, password } = parsed.data;
    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .select("*")
      .eq("meeting_code", meetingCode)
      .single();

    if (mErr || !meeting) {
      return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });
    }

    if (meeting.status === "ended") {
      return NextResponse.json({ error: "Meeting ini telah berakhir" }, { status: 410 });
    }

    const isHost = meeting.host_id === user.id;

    if (!isHost && meeting.is_locked) {
      return NextResponse.json({ error: "Meeting dikunci oleh Host" }, { status: 403 });
    }

    if (!isHost && meeting.has_password && meeting.password_hash) {
      const ok = password ? await bcrypt.compare(password, meeting.password_hash) : false;
      if (!ok) {
        return NextResponse.json({ error: "Password meeting salah" }, { status: 403 });
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .single();

    const participantStatus = !isHost && meeting.waiting_room_enabled ? "waiting" : "joined";

    await supabase.from("meeting_participants").upsert(
      {
        meeting_id: meeting.id,
        user_id: user.id,
        role: isHost ? "host" : "participant",
        status: participantStatus,
        joined_at: new Date().toISOString()
      },
      { onConflict: "meeting_id,user_id" }
    );

    if (isHost && meeting.status === "scheduled") {
      await supabase
        .from("meetings")
        .update({ status: "live", started_at: new Date().toISOString() })
        .eq("id", meeting.id);
    }

    if (participantStatus === "waiting") {
      return NextResponse.json({
        token: null,
        livekitUrl: null,
        configured: isLiveKitServerConfigured(),
        role: "participant",
        status: "waiting"
      });
    }

    if (!isLiveKitServerConfigured()) {
      return NextResponse.json({
        token: null,
        livekitUrl: null,
        configured: false,
        role: isHost ? "host" : "participant",
        status: "joined"
      });
    }

    const token = await generateLiveKitToken({
      roomName: meeting.meeting_code,
      identity: user.id,
      name: profile?.full_name || user.email || "Participant",
      isHost,
      metadata: { avatarUrl: profile?.avatar_url || null }
    });

    return NextResponse.json({
      token,
      livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL,
      configured: true,
      role: isHost ? "host" : "participant",
      status: "joined"
    });
  } catch (err) {
    console.error("LiveKit Token Error:", err);
    return NextResponse.json({ error: "Gagal memproses token meeting" }, { status: 500 });
  }
}

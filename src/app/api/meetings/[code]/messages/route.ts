import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

const messageSchema = z.object({
  content: z.string().min(1).max(2000),
  attachment_url: z.string().url().optional(),
  attachment_name: z.string().max(255).optional(),
  attachment_type: z.string().max(120).optional()
});

export async function GET(_req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id")
    .eq("meeting_code", context.params.code)
    .single();
  if (!meeting) return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });

  const { data: rows, error } = await supabase
    .from("meeting_messages")
    .select(
      `
      id, meeting_id, sender_id, content, attachment_url, attachment_name, attachment_type, created_at,
      sender:profiles!meeting_messages_sender_id_fkey(full_name, avatar_url)
    `
    )
    .eq("meeting_id", meeting.id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (rows || []).map((r: any) => ({
    id: r.id,
    meeting_id: r.meeting_id,
    sender_id: r.sender_id,
    sender_name: r.sender?.full_name || "User",
    sender_avatar: r.sender?.avatar_url || null,
    content: r.content,
    attachment_url: r.attachment_url,
    attachment_name: r.attachment_name,
    attachment_type: r.attachment_type,
    created_at: r.created_at
  }));

  return NextResponse.json({ messages });
}

export async function POST(req: Request, context: { params: { code: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(`chat:${user.id}`, 45, 60_000)) {
    return NextResponse.json({ error: "Terlalu cepat mengirim pesan" }, { status: 429 });
  }

  const parsed = messageSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Pesan tidak valid" }, { status: 400 });

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id")
    .eq("meeting_code", context.params.code)
    .single();
  if (!meeting) return NextResponse.json({ error: "Meeting tidak ditemukan" }, { status: 404 });

  const { data: inserted, error } = await supabase
    .from("meeting_messages")
    .insert({
      meeting_id: meeting.id,
      sender_id: user.id,
      content: parsed.data.content.trim(),
      attachment_url: parsed.data.attachment_url || null,
      attachment_name: parsed.data.attachment_name || null,
      attachment_type: parsed.data.attachment_type || null
    })
    .select(
      `
      id, meeting_id, sender_id, content, attachment_url, attachment_name, attachment_type, created_at,
      sender:profiles!meeting_messages_sender_id_fkey(full_name, avatar_url)
    `
    )
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || "Gagal menyimpan pesan" }, { status: 500 });
  }

  const sender = (inserted as any).sender;
  return NextResponse.json({
    message: {
      id: inserted.id,
      meeting_id: inserted.meeting_id,
      sender_id: inserted.sender_id,
      sender_name: sender?.full_name || "User",
      sender_avatar: sender?.avatar_url || null,
      content: inserted.content,
      attachment_url: inserted.attachment_url,
      attachment_name: inserted.attachment_name,
      attachment_type: inserted.attachment_type,
      created_at: inserted.created_at
    }
  });
}

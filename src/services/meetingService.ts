import type { ChatMessage, Meeting, MeetingParticipant } from "@/types";

export async function createMeeting(payload: {
  title: string;
  meeting_code?: string;
  description?: string;
  password?: string;
  waiting_room_enabled?: boolean;
  scheduled_at?: string | null;
}): Promise<Meeting> {
  const res = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal membuat meeting");
  return data.meeting;
}

export async function listMeetings(): Promise<Meeting[]> {
  const res = await fetch("/api/meetings", { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal memuat daftar meeting");
  return data.meetings || [];
}

export async function getMeetingByCode(code: string): Promise<{
  meeting: Meeting;
  participants: MeetingParticipant[];
}> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Meeting tidak ditemukan");
  return data;
}

export async function deleteMeeting(code: string): Promise<void> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}`, {
    method: "DELETE"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal menghapus meeting");
}

export async function clearMeetingHistory(): Promise<void> {
  const res = await fetch("/api/meetings", {
    method: "DELETE"
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal menghapus riwayat meeting");
}

export async function requestLiveKitToken(code: string, password?: string): Promise<{
  token: string | null;
  livekitUrl: string | null;
  configured: boolean;
  role: "host" | "participant";
  status: "joined" | "waiting";
}> {
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingCode: code, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Akses meeting ditolak");
  return data;
}

export async function fetchMessages(code: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/messages`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) return [];
  return data.messages || [];
}

export async function sendChatMessage(
  code: string,
  payload: {
    content: string;
    attachment_url?: string;
    attachment_name?: string;
    attachment_type?: string;
  }
): Promise<ChatMessage> {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal mengirim pesan");
  return data.message;
}

export async function hostActionParticipant(
  code: string,
  payload: {
    action: "mute" | "mute_all" | "remove" | "admit";
    targetUserId?: string;
  }
) {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}/participants`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Aksi host gagal");
  return data;
}

export async function updateMeetingState(
  code: string,
  payload: Partial<Pick<Meeting, "status" | "is_locked" | "waiting_room_enabled" | "is_recording">>
) {
  const res = await fetch(`/api/meetings/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal memperbarui meeting");
  return data.meeting;
}

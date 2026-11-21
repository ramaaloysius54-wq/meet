export type UserStatus = "online" | "busy" | "away" | "offline";
export type ParticipantRole = "host" | "co-host" | "participant";
export type ParticipantStatus = "waiting" | "joined" | "left" | "removed";
export type MeetingStatus = "scheduled" | "live" | "ended";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  plan: "Free Account" | "Pro Account" | "Enterprise";
  status: UserStatus;
  created_at?: string;
}

export interface Meeting {
  id: string;
  meeting_code: string;
  title: string;
  description: string | null;
  host_id: string;
  has_password: boolean;
  waiting_room_enabled: boolean;
  is_locked: boolean;
  is_recording: boolean;
  status: MeetingStatus;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participant_count?: number;
  host?: Pick<Profile, "id" | "full_name" | "avatar_url">;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  is_muted: boolean;
  is_video_off: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface ChatMessage {
  id: string;
  meeting_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string | null;
  content: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  created_at: string;
}

export interface LiveParticipantTile {
  identity: string;
  name: string;
  avatarUrl?: string | null;
  isLocal: boolean;
  isHost: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  connectionQuality: "excellent" | "good" | "poor" | "unknown";
  videoTrack?: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  screenTrack?: MediaStreamTrack | null;
  screenAudioTrack?: MediaStreamTrack | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  createdAt: string;
  read: boolean;
}

export interface ReactionBurst {
  id: string;
  emoji: string;
  senderName: string;
}

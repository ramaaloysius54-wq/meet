-- ============================================================
-- RAMAMEET SUPABASE POSTGRESQL SCHEMA + ROW LEVEL SECURITY
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Terhubung ke Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'RamaMeet User',
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'Free Account' CHECK (plan IN ('Free Account', 'Pro Account', 'Enterprise')),
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'busy', 'away', 'offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. MEETINGS TABLE
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT 'RamaMeet Meeting',
  description TEXT,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  password_hash TEXT,
  has_password BOOLEAN NOT NULL DEFAULT FALSE,
  waiting_room_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_recording BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  max_participants INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. MEETING PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'co-host', 'participant')),
  status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('waiting', 'joined', 'left', 'removed')),
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_video_off BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(meeting_id, user_id)
);

-- 4. MEETING MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. MEETING INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.meeting_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MEETING RECORDINGS TABLE
CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_meetings_code ON public.meetings(meeting_code);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON public.meetings(host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON public.meeting_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_meeting_created ON public.meeting_messages(meeting_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_invitations_meeting ON public.meeting_invitations(meeting_id);
CREATE INDEX IF NOT EXISTS idx_recordings_meeting ON public.meeting_recordings(meeting_id);

-- AUTO-CREATE PROFILE ON SUPABASE AUTH SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_meetings_updated ON public.meetings;
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY "Profiles readable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- MEETINGS POLICIES
CREATE POLICY "Authenticated users can read active/scheduled meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR status IN ('scheduled', 'live')
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meetings.id AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create meetings"
  ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Only host can update meeting"
  ON public.meetings FOR UPDATE TO authenticated
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

CREATE POLICY "Only host can delete meeting"
  ON public.meetings FOR DELETE TO authenticated
  USING (host_id = auth.uid());

-- MEETING PARTICIPANTS POLICIES
CREATE POLICY "Participants can view roster of their meeting"
  ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants self_mp
      WHERE self_mp.meeting_id = meeting_participants.meeting_id
        AND self_mp.user_id = auth.uid()
        AND self_mp.status = 'joined'
    )
  );

CREATE POLICY "Users can join meeting as themselves"
  ON public.meeting_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update self or host manages participants"
  ON public.meeting_participants FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = meeting_participants.meeting_id AND m.host_id = auth.uid()
    )
  );

-- MEETING MESSAGES POLICIES
CREATE POLICY "Joined participants and host can read messages"
  ON public.meeting_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = meeting_messages.meeting_id AND m.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meeting_messages.meeting_id
        AND mp.user_id = auth.uid()
        AND mp.status = 'joined'
    )
  );

CREATE POLICY "Joined participants and host can send messages"
  ON public.meeting_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_messages.meeting_id AND m.host_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.meeting_participants mp
        WHERE mp.meeting_id = meeting_messages.meeting_id
          AND mp.user_id = auth.uid()
          AND mp.status = 'joined'
      )
    )
  );

-- INVITATIONS POLICIES
CREATE POLICY "Host or invitee can view invitations"
  ON public.meeting_invitations FOR SELECT TO authenticated
  USING (
    inviter_id = auth.uid()
    OR invitee_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Host can create invitations"
  ON public.meeting_invitations FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_invitations.meeting_id AND m.host_id = auth.uid())
  );

-- RECORDINGS POLICIES
CREATE POLICY "Host and meeting participants can view recordings"
  ON public.meeting_recordings FOR SELECT TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meeting_recordings.meeting_id AND mp.user_id = auth.uid()
    )
  );

CREATE POLICY "Host can insert recordings"
  ON public.meeting_recordings FOR INSERT TO authenticated
  WITH CHECK (recorded_by = auth.uid());

-- STORAGE BUCKETS (Jalankan jika storage aktif di Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true), ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- REALTIME PUBLICATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;

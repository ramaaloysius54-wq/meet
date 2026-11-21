CREATE OR REPLACE FUNCTION public.is_meeting_host(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings
    WHERE id = p_meeting_id AND host_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_participant(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_joined_participant(p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id
      AND user_id = auth.uid()
      AND status = 'joined'
  );
$$;

DROP POLICY IF EXISTS "Authenticated users can read active/scheduled meetings" ON public.meetings;
CREATE POLICY "Authenticated users can read active/scheduled meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR status IN ('scheduled', 'live')
    OR public.is_meeting_participant(id)
  );

DROP POLICY IF EXISTS "Participants can view roster of their meeting" ON public.meeting_participants;
CREATE POLICY "Participants can view roster of their meeting"
  ON public.meeting_participants FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_meeting_host(meeting_id)
    OR public.is_joined_participant(meeting_id)
  );

DROP POLICY IF EXISTS "Users update self or host manages participants" ON public.meeting_participants;
CREATE POLICY "Users update self or host manages participants"
  ON public.meeting_participants FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_meeting_host(meeting_id)
  );

DROP POLICY IF EXISTS "Joined participants and host can read messages" ON public.meeting_messages;
CREATE POLICY "Joined participants and host can read messages"
  ON public.meeting_messages FOR SELECT TO authenticated
  USING (
    public.is_meeting_host(meeting_id)
    OR public.is_joined_participant(meeting_id)
  );

DROP POLICY IF EXISTS "Joined participants and host can send messages" ON public.meeting_messages;
CREATE POLICY "Joined participants and host can send messages"
  ON public.meeting_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.is_meeting_host(meeting_id)
      OR public.is_joined_participant(meeting_id)
    )
  );

DROP POLICY IF EXISTS "Host can create invitations" ON public.meeting_invitations;
CREATE POLICY "Host can create invitations"
  ON public.meeting_invitations FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND public.is_meeting_host(meeting_id)
  );

DROP POLICY IF EXISTS "Host and meeting participants can view recordings" ON public.meeting_recordings;
CREATE POLICY "Host and meeting participants can view recordings"
  ON public.meeting_recordings FOR SELECT TO authenticated
  USING (
    recorded_by = auth.uid()
    OR public.is_meeting_participant(meeting_id)
  );

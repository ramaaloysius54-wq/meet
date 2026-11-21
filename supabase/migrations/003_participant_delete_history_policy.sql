DROP POLICY IF EXISTS "Users can remove own participant history" ON public.meeting_participants;
CREATE POLICY "Users can remove own participant history"
  ON public.meeting_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

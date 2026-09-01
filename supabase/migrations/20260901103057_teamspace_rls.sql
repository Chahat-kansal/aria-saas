-- Applied to nxfzippunqvqsvkmwtjv on 1 Sep 2026 via Supabase MCP after founder approval.
-- Committed as the repo-side record; already live. Do not re-run.

-- ============================================================
-- PART C — RLS. Owner clause verbatim OR the ACCESS-MODEL-1 predicate.
-- ============================================================

ALTER TABLE team_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_kudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_shift_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_mood ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_poll_votes_rw ON team_poll_votes FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

CREATE POLICY team_predictions_rw ON team_predictions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

CREATE POLICY team_kudos_rw ON team_kudos FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

CREATE POLICY team_shift_notes_rw ON team_shift_notes FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

CREATE POLICY message_translations_rw ON message_translations FOR ALL
  USING (EXISTS (SELECT 1 FROM staff_messages m WHERE m.id = message_translations.message_id
    AND (m.business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(m.business_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_messages m WHERE m.id = message_translations.message_id
    AND (m.business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(m.business_id))));

CREATE POLICY staff_message_reads_rw ON staff_message_reads FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

-- team_mood: insert-only for members, NO member select policy at all.
-- Anonymity is enforced by the absence of a read path, not by a filter.
CREATE POLICY team_mood_insert ON team_mood FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()) OR is_business_member(business_id));

-- translation_cache: no client policy, so RLS denies all client access by default.
-- Written and read through the service role only.

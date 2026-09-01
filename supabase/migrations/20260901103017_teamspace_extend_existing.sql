-- Applied to nxfzippunqvqsvkmwtjv on 1 Sep 2026 via Supabase MCP after founder approval.
-- Committed as the repo-side record; already live. Do not re-run.

-- ============================================================
-- PART A — extend existing tables. Extend-only; nothing removed.
-- ============================================================

-- THE BLOCKER: staff must be a legal actor on the event spine.
-- Without this every team-originated event throws — same class as bookings.source='public_form'.
ALTER TABLE business_events DROP CONSTRAINT business_events_actor_check;
ALTER TABLE business_events ADD CONSTRAINT business_events_actor_check
  CHECK (actor = ANY (ARRAY['aria'::text,'owner'::text,'cron'::text,'staff'::text]));

-- Labels that expire and can carry a rule.
ALTER TABLE pos_tags
  ADD COLUMN subject_type text,
  ADD COLUMN subject_id   uuid,
  ADD COLUMN expires_at   timestamptz,
  ADD COLUMN rule         jsonb,
  ADD COLUMN source       text NOT NULL DEFAULT 'owner',
  ADD COLUMN created_by   uuid;
ALTER TABLE pos_tags ADD CONSTRAINT pos_tags_source_check
  CHECK (source = ANY (ARRAY['owner'::text,'aria'::text]));
CREATE UNIQUE INDEX pos_tags_unique_subject ON pos_tags
  (business_id, name, subject_type, COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid));

-- Messages: threads, audience, scheduling, holds, language, safety class.
ALTER TABLE staff_messages
  ADD COLUMN thread_id       uuid,
  ADD COLUMN audience_tag_id uuid REFERENCES pos_tags(id),
  ADD COLUMN scheduled_for   timestamptz,
  ADD COLUMN sent_at         timestamptz,
  ADD COLUMN held_reason     text,
  ADD COLUMN override_reason text,
  ADD COLUMN source_lang     text,
  ADD COLUMN safety_class    text;
ALTER TABLE staff_messages ADD CONSTRAINT staff_messages_safety_class_check
  CHECK (safety_class IS NULL OR safety_class = ANY (ARRAY['allergen'::text,'chemical'::text,'food_safety'::text]));

ALTER TABLE staff_members ADD COLUMN preferred_language text;

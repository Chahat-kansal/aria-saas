-- Applied to nxfzippunqvqsvkmwtjv on 1 Sep 2026 via Supabase MCP after founder approval.
-- Committed as the repo-side record; already live. Do not re-run.

-- ============================================================
-- PART B — new tables. Constraints carry the rules, not app code.
-- ============================================================

CREATE TABLE team_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  poll_id uuid NOT NULL REFERENCES aria_autopilot_actions(id) ON DELETE CASCADE,
  staff_member_id uuid NOT NULL REFERENCES staff_members(id),
  option_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, staff_member_id)
);

CREATE TABLE team_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  outlet_id uuid,
  target_date date NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id),
  predicted_covers integer,
  aria_predicted integer,
  actual integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, target_date, staff_member_id)
);

CREATE TABLE team_kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  from_staff_id uuid NOT NULL REFERENCES staff_members(id),
  to_staff_id uuid NOT NULL REFERENCES staff_members(id),
  shift_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, from_staff_id, shift_date),
  CHECK (from_staff_id <> to_staff_id)
);

CREATE TABLE team_shift_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  shift_id uuid,
  author_staff_id uuid NOT NULL REFERENCES staff_members(id),
  counterpart_staff_id uuid REFERENCES staff_members(id),
  body text NOT NULL,
  sealed_until timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Anonymity by schema: there is no staff column here to leak.
CREATE TABLE team_mood (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  week_start date NOT NULL,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES staff_messages(id) ON DELETE CASCADE,
  lang text NOT NULL,
  body text NOT NULL,
  engine text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, lang)
);

CREATE TABLE translation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash text NOT NULL,
  target_lang text NOT NULL,
  body text NOT NULL,
  engine text NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_hash, target_lang)
);

CREATE TABLE staff_message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  message_id uuid NOT NULL REFERENCES staff_messages(id) ON DELETE CASCADE,
  staff_member_id uuid NOT NULL REFERENCES staff_members(id),
  lang_delivered text,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, staff_member_id)
);

CREATE INDEX team_poll_votes_poll_idx ON team_poll_votes (poll_id);
CREATE INDEX team_predictions_date_idx ON team_predictions (business_id, target_date);
CREATE INDEX team_kudos_to_idx ON team_kudos (business_id, to_staff_id, shift_date);
CREATE INDEX team_shift_notes_shift_idx ON team_shift_notes (business_id, shift_id);
CREATE INDEX staff_message_reads_msg_idx ON staff_message_reads (message_id);

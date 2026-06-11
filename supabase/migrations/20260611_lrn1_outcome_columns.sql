-- LRN-1: Learning & Outcome Tracking — new columns
ALTER TABLE aria_autopilot_actions
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS founder_feedback text,
  ADD COLUMN IF NOT EXISTS action_id uuid REFERENCES aria_actions(id) ON DELETE SET NULL;

ALTER TABLE aria_ai_calls
  ADD COLUMN IF NOT EXISTS learning_signal text;

CREATE INDEX IF NOT EXISTS idx_apa_outcome
  ON aria_autopilot_actions(business_id, outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_calls_learning
  ON aria_ai_calls(business_id, agent_key, created_at DESC)
  WHERE learning_signal IS NOT NULL;

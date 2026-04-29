ALTER TABLE aria_actions
  ADD COLUMN IF NOT EXISTS outcome_status text,
  ADD COLUMN IF NOT EXISTS outcome_notes text,
  ADD COLUMN IF NOT EXISTS actual_impact numeric,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

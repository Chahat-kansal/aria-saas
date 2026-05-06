ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS actual_cash_cents integer DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS expected_cash_cents integer DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS variance_cents integer DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS closure_note text;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS closed_by text;

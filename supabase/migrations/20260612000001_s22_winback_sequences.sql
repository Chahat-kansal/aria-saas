-- S22: multi-step SMS sequences + A/B test infrastructure
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_steps jsonb;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sequence_step integer NOT NULL DEFAULT 0;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS sequence_skip_reason text;

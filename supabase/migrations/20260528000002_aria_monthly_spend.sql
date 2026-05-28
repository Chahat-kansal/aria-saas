-- Aria monthly spend tracking: per-business, per-model-family cents, auto-accumulated
-- from aria_ai_calls via trigger. Single source of truth for budget-based routing.

CREATE TABLE IF NOT EXISTS aria_monthly_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  year_month text NOT NULL,             -- e.g. '2026-05'
  sonnet_cents int DEFAULT 0,
  haiku_cents int DEFAULT 0,
  opus_cents int DEFAULT 0,
  other_cents int DEFAULT 0,
  total_cents int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, year_month)
);

ALTER TABLE aria_monthly_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monthly_spend_owner" ON aria_monthly_spend;
CREATE POLICY "monthly_spend_owner" ON aria_monthly_spend
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_monthly_spend_business_month ON aria_monthly_spend(business_id, year_month);

-- Per-business Sonnet budget (one-size default; per-plan defaults applied at the route).
ALTER TABLE business_subscriptions
  ADD COLUMN IF NOT EXISTS sonnet_monthly_budget_cents int DEFAULT 3000;  -- $30 default

-- Cheap automatic aggregation: every aria_ai_calls insert with a cost rolls up here.
CREATE OR REPLACE FUNCTION accumulate_monthly_spend()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  ym text := to_char(NEW.created_at, 'YYYY-MM');
  model_family text;
BEGIN
  IF NEW.business_id IS NULL OR NEW.cost_usd_cents IS NULL OR NEW.cost_usd_cents = 0 THEN
    RETURN NEW;
  END IF;
  model_family := CASE
    WHEN NEW.model_id LIKE '%sonnet%' THEN 'sonnet'
    WHEN NEW.model_id LIKE '%haiku%' THEN 'haiku'
    WHEN NEW.model_id LIKE '%opus%' THEN 'opus'
    ELSE 'other'
  END;
  INSERT INTO aria_monthly_spend (business_id, year_month, sonnet_cents, haiku_cents, opus_cents, other_cents, total_cents)
  VALUES (
    NEW.business_id, ym,
    CASE WHEN model_family = 'sonnet' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'haiku' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'opus' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'other' THEN NEW.cost_usd_cents ELSE 0 END,
    NEW.cost_usd_cents
  )
  ON CONFLICT (business_id, year_month) DO UPDATE SET
    sonnet_cents = aria_monthly_spend.sonnet_cents + CASE WHEN model_family = 'sonnet' THEN NEW.cost_usd_cents ELSE 0 END,
    haiku_cents = aria_monthly_spend.haiku_cents + CASE WHEN model_family = 'haiku' THEN NEW.cost_usd_cents ELSE 0 END,
    opus_cents = aria_monthly_spend.opus_cents + CASE WHEN model_family = 'opus' THEN NEW.cost_usd_cents ELSE 0 END,
    other_cents = aria_monthly_spend.other_cents + CASE WHEN model_family = 'other' THEN NEW.cost_usd_cents ELSE 0 END,
    total_cents = aria_monthly_spend.total_cents + NEW.cost_usd_cents,
    updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_accumulate_spend ON aria_ai_calls;
CREATE TRIGGER trg_accumulate_spend
  AFTER INSERT ON aria_ai_calls
  FOR EACH ROW EXECUTE FUNCTION accumulate_monthly_spend();

-- One-time backfill of historical spend.
INSERT INTO aria_monthly_spend (business_id, year_month, sonnet_cents, haiku_cents, opus_cents, other_cents, total_cents)
SELECT
  business_id,
  to_char(created_at, 'YYYY-MM') AS year_month,
  SUM(CASE WHEN model_id LIKE '%sonnet%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id LIKE '%haiku%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id LIKE '%opus%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id NOT LIKE '%sonnet%' AND model_id NOT LIKE '%haiku%' AND model_id NOT LIKE '%opus%' THEN cost_usd_cents ELSE 0 END),
  SUM(cost_usd_cents)
FROM aria_ai_calls
WHERE business_id IS NOT NULL AND cost_usd_cents > 0
GROUP BY business_id, to_char(created_at, 'YYYY-MM')
ON CONFLICT (business_id, year_month) DO NOTHING;
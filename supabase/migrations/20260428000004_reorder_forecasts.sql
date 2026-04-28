CREATE TABLE IF NOT EXISTS reorder_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  forecast jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, date)
);
ALTER TABLE reorder_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_forecasts" ON reorder_forecasts;
CREATE POLICY "own_forecasts" ON reorder_forecasts FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_reorder_forecasts_business
  ON reorder_forecasts(business_id, date DESC);

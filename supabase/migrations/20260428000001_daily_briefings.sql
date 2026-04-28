-- Daily briefings table for Milestone 2
CREATE TABLE IF NOT EXISTS daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  recommendations jsonb NOT NULL DEFAULT '[]',
  data_snapshot jsonb DEFAULT '{}',
  generated_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  remind_at timestamptz,
  UNIQUE(business_id, date)
);
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_briefings" ON daily_briefings;
CREATE POLICY "own_briefings" ON daily_briefings FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_daily_briefings_business_date
  ON daily_briefings(business_id, date DESC);

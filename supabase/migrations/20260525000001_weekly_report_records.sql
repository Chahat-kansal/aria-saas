CREATE TABLE IF NOT EXISTS weekly_report_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  pdf_url text,
  email_sent bool DEFAULT false,
  email_sent_at timestamptz,
  suspicious_count int DEFAULT 0,
  total_revenue numeric,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_records_bid
  ON weekly_report_records(business_id, week_start DESC);

ALTER TABLE weekly_report_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "own_weekly_report_records" ON weekly_report_records FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

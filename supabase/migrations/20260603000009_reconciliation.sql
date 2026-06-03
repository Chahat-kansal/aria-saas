CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  recon_date date NOT NULL DEFAULT CURRENT_DATE,
  pos_sales_count integer DEFAULT 0,
  pos_sales_total numeric DEFAULT 0,
  pos_cash_total numeric DEFAULT 0,
  pos_card_total numeric DEFAULT 0,
  pos_other_total numeric DEFAULT 0,
  bank_deposits_total numeric DEFAULT 0,
  bank_data_source text DEFAULT 'manual' CHECK (bank_data_source IN ('basiq','manual','not_available')),
  variance_amount numeric DEFAULT 0,
  variance_pct numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('balanced','variance','pending','explained')),
  explanation text,
  expected_settlement_date date,
  settlement_confirmed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, recon_date)
);
ALTER TABLE daily_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_daily_recons" ON daily_reconciliations
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON daily_reconciliations (business_id, recon_date DESC);

CREATE TABLE IF NOT EXISTS expense_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  detected_at timestamptz DEFAULT now(),
  source text NOT NULL CHECK (source IN ('bank_feed','supplier_invoice','manual')),
  expense_category text,
  expense_description text,
  amount numeric NOT NULL,
  expected_range_low numeric,
  expected_range_high numeric,
  deviation_pct numeric,
  possible_causes text[],
  status text DEFAULT 'open' CHECK (status IN ('open','explained','error','accepted')),
  explanation text,
  resolved_at timestamptz
);
ALTER TABLE expense_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_expense_anomalies" ON expense_anomalies
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON expense_anomalies (business_id, status, detected_at DESC);

CREATE TABLE IF NOT EXISTS monthly_pl_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  period_month integer NOT NULL,
  period_year integer NOT NULL,
  gross_revenue numeric DEFAULT 0,
  refunds_total numeric DEFAULT 0,
  net_revenue numeric DEFAULT 0,
  cogs_from_supplier_invoices numeric DEFAULT 0,
  gross_profit numeric DEFAULT 0,
  gross_margin_pct numeric DEFAULT 0,
  labour_cost numeric DEFAULT 0,
  rent_utilities numeric DEFAULT 0,
  marketing_cost numeric DEFAULT 0,
  other_expenses numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  ebitda numeric DEFAULT 0,
  revenue_vs_last_month_pct numeric DEFAULT 0,
  margin_vs_last_month_pct numeric DEFAULT 0,
  summary_narrative text,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, period_year, period_month)
);
ALTER TABLE monthly_pl_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_pl_reports" ON monthly_pl_reports
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

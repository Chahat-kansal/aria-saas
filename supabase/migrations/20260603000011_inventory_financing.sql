CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  forecast_week date NOT NULL,
  week_number integer NOT NULL,
  predicted_pos_revenue numeric DEFAULT 0,
  predicted_online_revenue numeric DEFAULT 0,
  pending_invoice_payments numeric DEFAULT 0,
  expected_rebates numeric DEFAULT 0,
  predicted_supplier_payments numeric DEFAULT 0,
  predicted_payroll numeric DEFAULT 0,
  predicted_rent_utilities numeric DEFAULT 0,
  predicted_other_fixed numeric DEFAULT 0,
  opening_cash_position numeric DEFAULT 0,
  closing_cash_position numeric DEFAULT 0,
  reorder_events jsonb DEFAULT '[]',
  reorder_total_cost numeric DEFAULT 0,
  risk_level text DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  risk_reason text,
  actions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, forecast_week, week_number)
);
ALTER TABLE cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_cash_forecasts" ON cash_flow_forecasts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON cash_flow_forecasts (business_id, forecast_week DESC);

CREATE TABLE IF NOT EXISTS financing_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  opportunity_type text NOT NULL CHECK (opportunity_type IN (
    'supplier_terms_extension',
    'flash_promo_revenue',
    'payment_timing_shift',
    'invoice_factoring',
    'bnpl_stock',
    'early_payment_discount'
  )),
  description text NOT NULL,
  potential_benefit numeric,
  effort_level text CHECK (effort_level IN ('automatic','one_tap','phone_call','application')),
  urgency text CHECK (urgency IN ('urgent','this_week','this_month')),
  trigger_week date,
  expires_at date,
  status text DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  actioned_at timestamptz,
  supplier_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE financing_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_financing_ops" ON financing_opportunities
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON financing_opportunities (business_id, urgency, status);

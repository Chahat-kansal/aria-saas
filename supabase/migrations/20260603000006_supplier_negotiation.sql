-- Prerequisite tables (if not already created by prompts 220-221)
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  invoice_number text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  total numeric NOT NULL DEFAULT 0,
  paid_at timestamptz,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','overdue','disputed')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "owner_supplier_invoices" ON supplier_invoices
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_biz ON supplier_invoices (business_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE CASCADE NOT NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "owner_supplier_invoice_items" ON supplier_invoice_items
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS supplier_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  start_date date,
  end_date date,
  terms text,
  auto_renews boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "owner_supplier_contracts" ON supplier_contracts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS supplier_price_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  product_name text NOT NULL,
  contract_price numeric,
  invoiced_price numeric NOT NULL,
  variance_amount numeric NOT NULL DEFAULT 0,
  total_variance numeric NOT NULL DEFAULT 0,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_price_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "owner_supplier_price_variances" ON supplier_price_variances
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Negotiation Agent tables
CREATE TABLE IF NOT EXISTS supplier_negotiation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  total_spend_12m numeric DEFAULT 0,
  total_orders_12m integer DEFAULT 0,
  avg_order_value_12m numeric DEFAULT 0,
  payment_on_time_pct numeric DEFAULT 100,
  price_creep_pct numeric DEFAULT 0,
  price_creep_products jsonb DEFAULT '[]',
  overcharge_count_12m integer DEFAULT 0,
  total_overcharge_12m numeric DEFAULT 0,
  invoice_accuracy_pct numeric DEFAULT 100,
  on_time_delivery_pct numeric DEFAULT 100,
  damaged_goods_count integer DEFAULT 0,
  credit_notes_issued integer DEFAULT 0,
  vs_market_avg_pct numeric DEFAULT 0,
  vs_competitor_supplier_pct numeric DEFAULT 0,
  leverage_score numeric DEFAULT 50,
  leverage_factors jsonb DEFAULT '[]',
  contract_renewal_date date,
  relationship_years numeric DEFAULT 0,
  key_products text[],
  next_negotiation_trigger text,
  negotiation_priority text DEFAULT 'low' CHECK (negotiation_priority IN ('urgent','high','medium','low')),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, supplier_name)
);
ALTER TABLE supplier_negotiation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_neg_profiles" ON supplier_negotiation_profiles
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS supplier_negotiation_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  profile_id uuid REFERENCES supplier_negotiation_profiles(id) ON DELETE SET NULL,
  trigger_reason text NOT NULL,
  negotiation_goal text NOT NULL,
  leverage_arguments jsonb NOT NULL DEFAULT '[]',
  expected_outcome text NOT NULL,
  success_probability numeric DEFAULT 0.5,
  draft_email_subject text,
  draft_email_body text,
  draft_talking_points text[],
  annual_saving_if_successful numeric DEFAULT 0,
  monthly_saving_if_successful numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','won','lost','deferred')),
  outcome_notes text,
  actual_saving_achieved numeric,
  negotiation_started_at timestamptz,
  negotiation_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_negotiation_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_neg_briefs" ON supplier_negotiation_briefs
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_neg_briefs_biz_status ON supplier_negotiation_briefs (business_id, status, created_at DESC);

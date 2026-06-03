-- BAS/Tax Compliance Agent tables

CREATE TABLE IF NOT EXISTS product_tax_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  gst_treatment text NOT NULL DEFAULT 'taxable' CHECK (gst_treatment IN ('taxable','gst_free','input_taxed','out_of_scope')),
  ato_tax_code text DEFAULT '1A',
  classification_source text DEFAULT 'manual' CHECK (classification_source IN ('manual','ai_suggested','confirmed')),
  ai_confidence numeric,
  notes text,
  classified_at timestamptz DEFAULT now(),
  classified_by text DEFAULT 'owner',
  UNIQUE(business_id, product_id)
);
ALTER TABLE product_tax_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_tax_classifications" ON product_tax_classifications
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_tax_class_biz_treatment ON product_tax_classifications (business_id, gst_treatment);

CREATE TABLE IF NOT EXISTS bas_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  quarter text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','reviewed','lodged','amended')),
  g1_total_sales numeric DEFAULT 0,
  g2_export_sales numeric DEFAULT 0,
  g3_gst_free_sales numeric DEFAULT 0,
  g4_input_taxed_sales numeric DEFAULT 0,
  g8_adjustments numeric DEFAULT 0,
  field_1a_gst_on_sales numeric DEFAULT 0,
  field_1b_gst_credits numeric DEFAULT 0,
  g10_capital_purchases numeric DEFAULT 0,
  g11_noncapital_purchases numeric DEFAULT 0,
  net_gst numeric DEFAULT 0,
  w1_total_salary_wages numeric DEFAULT 0,
  w2_amounts_withheld numeric DEFAULT 0,
  t1_instalment_income numeric DEFAULT 0,
  t4_instalment_rate numeric DEFAULT 0,
  t7_credit_from_ato numeric DEFAULT 0,
  total_payable numeric DEFAULT 0,
  unclassified_sales_count integer DEFAULT 0,
  unclassified_purchases_count integer DEFAULT 0,
  reconciliation_gaps jsonb DEFAULT '[]',
  handover_generated_at timestamptz,
  handover_summary text,
  generated_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  lodged_at timestamptz,
  UNIQUE(business_id, period_start)
);
ALTER TABLE bas_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_bas_drafts" ON bas_drafts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_bas_drafts_biz_period ON bas_drafts (business_id, period_end DESC);

CREATE TABLE IF NOT EXISTS super_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  quarter text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  ordinary_time_earnings numeric DEFAULT 0,
  super_rate_pct numeric DEFAULT 11.5,
  super_amount_owed numeric DEFAULT 0,
  super_fund_name text,
  super_fund_usi text,
  payment_due_date date,
  paid_at timestamptz,
  payment_amount numeric,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','partial')),
  UNIQUE(business_id, staff_member_id, period_start)
);
ALTER TABLE super_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_super_obligations" ON super_obligations
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Add ABN and GST registration fields to businesses if not present
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS abn text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS gst_registration_date date;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS bas_frequency text DEFAULT 'quarterly' CHECK (bas_frequency IN ('quarterly','monthly'));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS accountant_email text;

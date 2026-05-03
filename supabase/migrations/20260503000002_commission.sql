-- Commission tracking for POS staff

CREATE TABLE IF NOT EXISTS pos_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text DEFAULT 'percentage'
    CHECK (rule_type IN ('percentage','fixed_per_sale','tiered')),
  rate numeric DEFAULT 5.0,
  min_sale_cents integer DEFAULT 0,
  applies_to_categories text[],
  applies_to_pos_users text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_commission_rules" ON pos_commission_rules;
CREATE POLICY "own_commission_rules" ON pos_commission_rules FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS pos_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE CASCADE,
  pos_user_name text NOT NULL,
  rule_id uuid REFERENCES pos_commission_rules(id) ON DELETE SET NULL,
  sale_total_cents integer NOT NULL,
  commission_rate numeric NOT NULL,
  commission_cents integer NOT NULL,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','voided')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_commissions" ON pos_commissions;
CREATE POLICY "own_commissions" ON pos_commissions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pos_commissions_biz ON pos_commissions(business_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_commission_rules_biz ON pos_commission_rules(business_id, is_active);

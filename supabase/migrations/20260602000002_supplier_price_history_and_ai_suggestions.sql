-- Migration 3: Product price history table
CREATE TABLE IF NOT EXISTS supplier_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  supplier_code text,
  cost_price numeric NOT NULL,
  recorded_at timestamptz DEFAULT now(),
  source text DEFAULT 'manual' CHECK (source IN ('manual','po_confirmed','ai_detected'))
);
ALTER TABLE supplier_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_prices" ON supplier_product_prices FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_spp_supplier_product ON supplier_product_prices(supplier_id, product_id, recorded_at DESC);

-- Migration 4: AI order suggestions table
CREATE TABLE IF NOT EXISTS supplier_ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  po_id uuid REFERENCES warehouse_purchase_orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name text,
  suggested_qty numeric,
  current_qty numeric,
  reason text,
  trend text CHECK (trend IN ('up','down','same')),
  velocity_per_week numeric,
  stock_days_remaining numeric,
  price_change_pct numeric,
  accepted boolean,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_ai_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_suggestions" ON supplier_ai_suggestions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  movement_type text NOT NULL DEFAULT 'receipt_scan',
  quantity_added integer NOT NULL,
  new_stock integer NOT NULL,
  notes text,
  scanned_at timestamptz DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_movements" ON stock_movements;
CREATE POLICY "own_movements" ON stock_movements FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_stock_movements_business
  ON stock_movements(business_id, scanned_at DESC);

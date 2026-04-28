-- Compliance checklist persistence
CREATE TABLE IF NOT EXISTS compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  key text NOT NULL,
  checked boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, key)
);

ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_compliance_items" ON compliance_items;
CREATE POLICY "own_compliance_items" ON compliance_items FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

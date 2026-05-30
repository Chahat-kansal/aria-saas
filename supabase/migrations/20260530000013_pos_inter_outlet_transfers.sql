CREATE TABLE IF NOT EXISTS pos_inter_outlet_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  from_outlet_id uuid REFERENCES pos_outlets(id),
  to_outlet_id uuid REFERENCES pos_outlets(id) NOT NULL,
  product_id uuid REFERENCES pos_products(id) NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_transit','completed','cancelled')),
  notes text,
  created_by uuid,
  transferred_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pos_inter_outlet_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_outlet_transfers" ON pos_inter_outlet_transfers FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
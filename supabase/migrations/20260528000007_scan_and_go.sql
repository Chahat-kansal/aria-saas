-- Scan-and-Go self-checkout: customer-built carts redeemed at the POS by short token.
CREATE TABLE IF NOT EXISTS pos_self_checkout_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,                -- 8-char URL-safe, the customer-facing barcode
  items jsonb NOT NULL DEFAULT '[]',         -- [{product_id, name, price, qty, age_restricted}]
  subtotal_cents int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'shopping' CHECK (status IN ('shopping','finished','redeemed','expired','cancelled')),
  customer_session_token text,
  loyalty_customer_id uuid REFERENCES pos_customers(id),
  finished_at timestamptz,
  expires_at timestamptz,                    -- finished_at + 15 min
  redeemed_at timestamptz,
  redeemed_sale_id uuid REFERENCES pos_sales(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checkout_carts_token ON pos_self_checkout_carts(token) WHERE status IN ('finished','shopping');
CREATE INDEX IF NOT EXISTS idx_checkout_carts_business_status ON pos_self_checkout_carts(business_id, status);

ALTER TABLE pos_self_checkout_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carts_owner" ON pos_self_checkout_carts;
CREATE POLICY "carts_owner" ON pos_self_checkout_carts
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS age_restricted boolean DEFAULT false;
ALTER TABLE instore_kiosk_configs ADD COLUMN IF NOT EXISTS scan_and_go_enabled boolean DEFAULT false;
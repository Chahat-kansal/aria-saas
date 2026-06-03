-- Track Stripe metered billing for Reels per business
ALTER TABLE business_subscriptions
  ADD COLUMN IF NOT EXISTS reels_stripe_item_id TEXT,
  ADD COLUMN IF NOT EXISTS reels_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reels_meter_id TEXT;

-- Monthly Reel invoice summary
CREATE TABLE IF NOT EXISTS reel_monthly_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  reel_count INTEGER NOT NULL DEFAULT 0,
  total_cost_aud NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_invoice_item_id TEXT,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','billed','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, billing_month)
);
ALTER TABLE reel_monthly_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_invoices" ON reel_monthly_invoices
  FOR SELECT USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );

-- Upsert + increment function for monthly invoice
CREATE OR REPLACE FUNCTION increment_reel_invoice(
  p_business_id UUID, p_billing_month TEXT, p_cost NUMERIC
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reel_monthly_invoices (business_id, billing_month, reel_count, total_cost_aud, status)
  VALUES (p_business_id, p_billing_month, 1, p_cost, 'pending')
  ON CONFLICT (business_id, billing_month)
  DO UPDATE SET
    reel_count = reel_monthly_invoices.reel_count + 1,
    total_cost_aud = reel_monthly_invoices.total_cost_aud + p_cost;
END;
$$;

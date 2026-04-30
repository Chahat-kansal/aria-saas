-- POS promotions and offers
CREATE TABLE IF NOT EXISTS pos_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  promotion_type TEXT NOT NULL CHECK (promotion_type IN (
    'multibuy', 'percentage_discount', 'fixed_discount', 'bundle', 'bogo'
  )),
  product_ids JSONB NOT NULL DEFAULT '[]',
  category_ids JSONB NOT NULL DEFAULT '[]',
  buy_quantity INT,
  get_quantity INT,
  discount_amount NUMERIC,
  discount_percent NUMERIC,
  bundle_price NUMERIC,
  min_spend NUMERIC,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_promotions_owner" ON pos_promotions FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS pos_promotions_business_idx ON pos_promotions (business_id);
CREATE INDEX IF NOT EXISTS pos_promotions_active_idx ON pos_promotions (business_id, active);

-- Add columns to widget_configs for expanded settings (safe: won't fail if column exists)
DO $$ BEGIN
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS assistant_role TEXT DEFAULT 'sales';
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'friendly';
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS answer_length TEXT DEFAULT 'normal';
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS show_prices BOOLEAN DEFAULT true;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS stock_visibility TEXT DEFAULT 'in_out';
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS show_out_of_stock BOOLEAN DEFAULT false;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS escalation_phone TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS escalation_email TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS show_talk_to_staff BOOLEAN DEFAULT true;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS delivery_policy TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS pickup_policy TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS returns_policy TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS age_restricted_policy TEXT;
  ALTER TABLE widget_configs ADD COLUMN IF NOT EXISTS custom_rules TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

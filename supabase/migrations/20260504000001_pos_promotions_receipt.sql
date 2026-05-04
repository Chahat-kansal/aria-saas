-- =====================================================================
-- pos_promotions table + receipt settings columns on pos_settings
-- =====================================================================

-- pos_promotions
CREATE TABLE IF NOT EXISTS pos_promotions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  discount_type         text DEFAULT 'percentage'
                          CHECK (discount_type IN ('percentage','fixed','bxgy','free_item')),
  -- backwards-compat alias so existing code using "type" also works
  type                  text GENERATED ALWAYS AS (discount_type) STORED,
  discount_value        numeric NOT NULL DEFAULT 0,
  applies_to            text DEFAULT 'all'
                          CHECK (applies_to IN ('all','category','product')),
  category              text,
  product_id            uuid,
  minimum_purchase_cents integer DEFAULT 0,
  start_date            timestamptz,
  end_date              timestamptz,
  is_active             boolean DEFAULT true,
  usage_count           integer DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE pos_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_promotions" ON pos_promotions;
CREATE POLICY "own_promotions" ON pos_promotions FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));

-- Add receipt + ABN columns to pos_settings (safe IF NOT EXISTS)
ALTER TABLE pos_settings
  ADD COLUMN IF NOT EXISTS receipt_header    text,
  ADD COLUMN IF NOT EXISTS receipt_footer    text DEFAULT 'Thank you for your business!',
  ADD COLUMN IF NOT EXISTS receipt_show_gst  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_cashier boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_loyalty boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_logo_url  text,
  ADD COLUMN IF NOT EXISTS business_abn      text,
  ADD COLUMN IF NOT EXISTS business_address  text,
  ADD COLUMN IF NOT EXISTS business_phone    text,
  ADD COLUMN IF NOT EXISTS business_website  text;

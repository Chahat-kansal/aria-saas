-- Product import source tracking columns + new integration tables
-- Run in Supabase SQL Editor — idempotent

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS square_item_id text,
  ADD COLUMN IF NOT EXISTS square_variation_id text,
  ADD COLUMN IF NOT EXISTS shopify_product_id text,
  ADD COLUMN IF NOT EXISTS shopify_variant_id text,
  ADD COLUMN IF NOT EXISTS lightspeed_product_id text,
  ADD COLUMN IF NOT EXISTS external_updated_at timestamptz;

-- Shopify connections (Square connections already exist from 20260428000000)
CREATE TABLE IF NOT EXISTS shopify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  store_url text NOT NULL,
  -- Token stored encrypted at application level; never returned in API responses
  access_token text NOT NULL,
  shop_name text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'connected' CHECK (sync_status IN ('connected','syncing','synced','error'))
);
ALTER TABLE shopify_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_shopify" ON shopify_connections;
CREATE POLICY "own_shopify" ON shopify_connections FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Lightspeed connections
CREATE TABLE IF NOT EXISTS lightspeed_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  account_id text NOT NULL,
  -- Token stored at application level; never returned in API responses
  access_token text NOT NULL,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'connected' CHECK (sync_status IN ('connected','syncing','synced','error'))
);
ALTER TABLE lightspeed_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_lightspeed" ON lightspeed_connections;
CREATE POLICY "own_lightspeed" ON lightspeed_connections FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Index for fast lookup during import
CREATE INDEX IF NOT EXISTS idx_pos_products_square_var ON pos_products(square_variation_id) WHERE square_variation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_products_shopify_var ON pos_products(shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_products_ls_product ON pos_products(lightspeed_product_id) WHERE lightspeed_product_id IS NOT NULL;

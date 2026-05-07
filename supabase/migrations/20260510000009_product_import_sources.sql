-- Product import source tracking columns
-- Used by Square, Shopify, and Lightspeed import routes
-- to upsert by external ID and track where each product came from.
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS source                 text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS square_item_id         text,
  ADD COLUMN IF NOT EXISTS square_variation_id    text,
  ADD COLUMN IF NOT EXISTS shopify_product_id     text,
  ADD COLUMN IF NOT EXISTS shopify_variant_id     text,
  ADD COLUMN IF NOT EXISTS lightspeed_product_id  text;

CREATE INDEX IF NOT EXISTS idx_pos_products_square_variation_id
  ON pos_products(square_variation_id) WHERE square_variation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_products_shopify_variant_id
  ON pos_products(shopify_variant_id) WHERE shopify_variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_products_lightspeed_product_id
  ON pos_products(lightspeed_product_id) WHERE lightspeed_product_id IS NOT NULL;

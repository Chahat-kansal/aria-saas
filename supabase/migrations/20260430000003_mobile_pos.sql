-- Mobile POS: ensure barcode/sku indexes exist for fast scan lookups

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS idx_pos_products_barcode
  ON pos_products(business_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_products_sku
  ON pos_products(business_id, sku)
  WHERE sku IS NOT NULL;

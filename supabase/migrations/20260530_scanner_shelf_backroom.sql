-- Add shelf capacity + backroom stock + expiry tracking to pos_products
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS shelf_capacity   integer   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qty_backroom     integer   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiry_date      date      DEFAULT NULL;

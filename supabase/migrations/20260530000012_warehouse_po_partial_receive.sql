-- Add partial status + received_items tracking to warehouse POs
ALTER TABLE warehouse_purchase_orders
  DROP CONSTRAINT IF EXISTS warehouse_purchase_orders_status_check;

ALTER TABLE warehouse_purchase_orders
  ADD CONSTRAINT warehouse_purchase_orders_status_check
    CHECK (status IN ('draft','sent','confirmed','partial','received','cancelled'));

ALTER TABLE warehouse_purchase_orders
  ADD COLUMN IF NOT EXISTS received_items jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
-- Migration 1: Extend pos_suppliers with delivery schedule + custom columns
ALTER TABLE pos_suppliers
  ADD COLUMN IF NOT EXISTS delivery_days integer[] DEFAULT ARRAY[]::integer[],
  ADD COLUMN IF NOT EXISTS order_cutoff_days integer[] DEFAULT ARRAY[]::integer[],
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS short_code text,
  ADD COLUMN IF NOT EXISTS order_email text,
  ADD COLUMN IF NOT EXISTS custom_columns jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes text;

-- delivery_days: array of weekday ints 0=Mon..6=Sun
-- order_cutoff_days: days owner must place order to get next delivery
-- custom_columns: [{key, label, type}] per-supplier column config
-- short_code: e.g. "ALM", "ILG", "HFW"

-- Migration 2: Extend warehouse_purchase_orders with AI fields
ALTER TABLE warehouse_purchase_orders
  ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_reasoning jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_accepted_pct numeric,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email text,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz;
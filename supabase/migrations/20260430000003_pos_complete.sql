-- ============================================================
-- Aria POS — completion migration
-- Adds missing tables from spec + safe column additions
-- All statements use IF NOT EXISTS / safe guards
-- ============================================================

-- pos_modifier_groups (spec's preferred schema — group-based modifiers)
CREATE TABLE IF NOT EXISTS pos_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean DEFAULT false,
  min_selections integer DEFAULT 0,
  max_selections integer DEFAULT 1,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_modifier_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "own_modifier_groups" ON pos_modifier_groups FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_modifier_groups_business_idx ON pos_modifier_groups (business_id);

-- pos_timesheets (spec schema with generated columns)
CREATE TABLE IF NOT EXISTS pos_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  break_minutes integer DEFAULT 0,
  pay_rate_cents integer,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "own_timesheets" ON pos_timesheets FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_timesheets_business_idx ON pos_timesheets (business_id);
CREATE INDEX IF NOT EXISTS pos_timesheets_clock_in_idx ON pos_timesheets (business_id, clock_in);

-- ── Safe column additions ─────────────────────────────────────────

-- pos_sales
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS table_id uuid;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS kds_sent boolean DEFAULT false;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS modifiers_data jsonb DEFAULT '[]';

-- pos_sale_items
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]';
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS variant_label text;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS item_notes text;

-- pos_settings (add all missing columns)
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS receipt_prefix text DEFAULT 'RCP';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS gst_inclusive boolean DEFAULT true;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS cash_rounding boolean DEFAULT true;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar integer DEFAULT 1;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar_value integer DEFAULT 100;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_min_redemption integer DEFAULT 500;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS accepted_payment_methods jsonb DEFAULT '["cash","eftpos","gift_card"]';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Australia/Melbourne';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_pin_for_refunds boolean DEFAULT false;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS manager_approval_discount_pct integer DEFAULT 20;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS abn text;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS receipt_footer text DEFAULT 'Thank you for your business!';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS receipt_header text;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS show_gst_breakdown boolean DEFAULT true;

-- pos_products (ensure cost_price exists as integer cents)
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS cost_price_cents integer;

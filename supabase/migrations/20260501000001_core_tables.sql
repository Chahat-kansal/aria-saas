-- Core tables: POS sessions, product variants, modifiers, table management, KDS, timesheets
-- Safe: all use IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS

ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_industry_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_industry_check
  CHECK (industry = ANY (ARRAY['retail','cafe','restaurant','tradie','realestate','salon','visa','gym','professional','warehouse']));
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'aria_pos';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS square_connected boolean DEFAULT false;

-- POS session management (safe: IF NOT EXISTS throughout)
CREATE TABLE IF NOT EXISTS pos_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  opening_float_cents integer DEFAULT 0,
  closing_float_cents integer,
  actual_cash_cents integer,
  expected_cash_cents integer,
  variance_cents integer,
  total_cash_sales_cents integer DEFAULT 0,
  total_card_sales_cents integer DEFAULT 0,
  total_refunds_cents integer DEFAULT 0,
  transaction_count integer DEFAULT 0,
  opened_by text,
  closed_by text,
  handover_note text,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  status text DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes text
);
ALTER TABLE pos_cash_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_cash_sessions' AND policyname='own_sessions') THEN
    CREATE POLICY "own_sessions" ON pos_cash_sessions FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Also keep the old schema columns if the table was created differently
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS opening_float numeric DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS closing_float numeric;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS total_cash_sales numeric DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS total_card_sales numeric DEFAULT 0;
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS opened_by_user_id uuid;

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS table_id uuid;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS age_verified boolean DEFAULT false;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS kds_sent boolean DEFAULT false;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS modifiers jsonb DEFAULT '[]';
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS receipt_prefix text DEFAULT 'RCP';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS gst_inclusive boolean DEFAULT true;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS cash_rounding boolean DEFAULT true;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar integer DEFAULT 1;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar_value integer DEFAULT 100;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS loyalty_min_redemption integer DEFAULT 500;
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS accepted_payment_methods jsonb DEFAULT '["cash","card","gift_card"]';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Australia/Melbourne';
ALTER TABLE pos_settings ADD COLUMN IF NOT EXISTS require_pin_for_refunds boolean DEFAULT false;

-- Product variants
CREATE TABLE IF NOT EXISTS pos_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  name text NOT NULL, sku text, barcode text,
  price_cents integer, cost_cents integer,
  stock_quantity integer DEFAULT 0,
  track_inventory boolean DEFAULT true,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_product_variants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_product_variants' AND policyname='own_variants') THEN
    CREATE POLICY "own_variants" ON pos_product_variants FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Modifier groups
CREATE TABLE IF NOT EXISTS pos_modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL, required boolean DEFAULT false,
  min_selections integer DEFAULT 0, max_selections integer DEFAULT 1,
  applies_to_product_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_modifier_groups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_modifier_groups' AND policyname='own_modifier_groups') THEN
    CREATE POLICY "own_modifier_groups" ON pos_modifier_groups FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Modifiers
CREATE TABLE IF NOT EXISTS pos_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  group_id uuid REFERENCES pos_modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL, price_cents integer DEFAULT 0,
  is_active boolean DEFAULT true, sort_order integer DEFAULT 0
);
ALTER TABLE pos_modifiers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_modifiers' AND policyname='own_modifiers') THEN
    CREATE POLICY "own_modifiers" ON pos_modifiers FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Table management
CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  table_number text NOT NULL, name text, zone text DEFAULT 'Main',
  capacity integer DEFAULT 4,
  status text DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning')),
  current_sale_id uuid, occupied_since timestamptz, notes text,
  pos_x integer DEFAULT 0, pos_y integer DEFAULT 0,
  shape text DEFAULT 'rectangle', created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_tables ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_tables' AND policyname='own_tables') THEN
    CREATE POLICY "own_tables" ON pos_tables FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- KDS orders
CREATE TABLE IF NOT EXISTS pos_kds_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE CASCADE,
  table_number text, items jsonb NOT NULL DEFAULT '[]',
  status text DEFAULT 'new' CHECK (status IN ('new','in_progress','ready','bumped')),
  priority integer DEFAULT 0, notes text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz, completed_at timestamptz, bumped_at timestamptz
);
ALTER TABLE pos_kds_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_kds_orders' AND policyname='own_kds') THEN
    CREATE POLICY "own_kds" ON pos_kds_orders FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Timesheets
CREATE TABLE IF NOT EXISTS pos_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id uuid, staff_name text NOT NULL,
  clock_in timestamptz NOT NULL, clock_out timestamptz,
  break_minutes integer DEFAULT 0, pay_rate_cents integer, notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_timesheets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pos_timesheets' AND policyname='own_timesheets') THEN
    CREATE POLICY "own_timesheets" ON pos_timesheets FOR ALL
      USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
  END IF;
END $$;

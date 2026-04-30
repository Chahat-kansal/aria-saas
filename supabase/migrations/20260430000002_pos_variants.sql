-- ============================================================
-- Aria POS full feature migration
-- Part 1: Variants & Modifiers
-- Part 2: Table management
-- Part 4: Kitchen Display System
-- Part 7: Employee time tracking
-- Plus: schema column additions
-- ============================================================

-- 1. Product variants (e.g. Size, Colour, Strength)
CREATE TABLE IF NOT EXISTS pos_product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  values jsonb NOT NULL DEFAULT '[]',
  affects_price boolean DEFAULT false,
  price_map jsonb DEFAULT '{}',  -- {"Small": 4.50, "Large": 6.00}
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_variants" ON pos_product_variants FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_product_variants_product_idx ON pos_product_variants (product_id);

-- 2. Modifiers (e.g. Extra shot +$0.80, No onion)
CREATE TABLE IF NOT EXISTS pos_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_adjustment numeric DEFAULT 0,
  modifier_group text,
  available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_modifiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_modifiers" ON pos_modifiers FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_modifiers_business_idx ON pos_modifiers (business_id);

-- 3. Link modifiers to products
CREATE TABLE IF NOT EXISTS pos_product_modifiers (
  product_id uuid NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  modifier_id uuid NOT NULL REFERENCES pos_modifiers(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, modifier_id)
);

-- 4. Table management
CREATE TABLE IF NOT EXISTS pos_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  outlet_id uuid,
  table_number text NOT NULL,
  seats integer DEFAULT 4,
  zone text DEFAULT 'Main',
  status text DEFAULT 'available' CHECK (status IN ('available','occupied','reserved','cleaning')),
  current_sale_id uuid,
  x_position numeric DEFAULT 0,
  y_position numeric DEFAULT 0,
  shape text DEFAULT 'rectangle' CHECK (shape IN ('rectangle','circle')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tables" ON pos_tables FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_tables_business_idx ON pos_tables (business_id);

-- 5. Kitchen Display System
CREATE TABLE IF NOT EXISTS pos_kds_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE CASCADE,
  table_label text,
  items jsonb NOT NULL DEFAULT '[]',
  status text DEFAULT 'new' CHECK (status IN ('new','in_progress','ready','delivered','void')),
  ticket_number integer,
  created_at timestamptz DEFAULT now(),
  bumped_at timestamptz
);
ALTER TABLE pos_kds_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_kds" ON pos_kds_orders FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_kds_business_status_idx ON pos_kds_orders (business_id, status);

-- 6. Employee clock-in/out sessions
CREATE TABLE IF NOT EXISTS pos_employee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE CASCADE,
  staff_name text,
  clocked_in_at timestamptz DEFAULT now(),
  clocked_out_at timestamptz,
  break_minutes integer DEFAULT 0,
  total_minutes integer,
  outlet_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_employee_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_emp_sessions" ON pos_employee_sessions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS pos_employee_sessions_business_idx ON pos_employee_sessions (business_id);

-- ============================================================
-- Safe column additions (IF NOT EXISTS throughout)
-- ============================================================

-- pos_sale_items additions
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS modifiers_selected jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS special_instructions text,
  ADD COLUMN IF NOT EXISTS course text DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS kds_status text DEFAULT 'pending';

-- pos_sales additions
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS table_id uuid,
  ADD COLUMN IF NOT EXISTS cover_count integer,
  ADD COLUMN IF NOT EXISTS table_label text;

-- pos_customers additions
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS loyalty_tier text DEFAULT 'standard';

-- pos_cash_sessions additions
ALTER TABLE pos_cash_sessions
  ADD COLUMN IF NOT EXISTS cashier_name text,
  ADD COLUMN IF NOT EXISTS notes text;

-- pos_settings additions
ALTER TABLE pos_settings
  ADD COLUMN IF NOT EXISTS cash_rounding boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS eftpos_surcharge_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manager_pin text,
  ADD COLUMN IF NOT EXISTS loyalty_points_per_dollar integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS loyalty_redemption_rate integer DEFAULT 100,
  ADD COLUMN IF NOT EXISTS loyalty_min_redemption integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS receipt_footer text,
  ADD COLUMN IF NOT EXISTS show_abn_on_receipt boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_staff_pin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS abn text,
  ADD COLUMN IF NOT EXISTS receipt_header text,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS gst_rate numeric DEFAULT 10;

-- staff_members POS role additions
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS pos_role text DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS pos_pin text,
  ADD COLUMN IF NOT EXISTS can_void boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_discount boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_discount_pct numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pay_rate_cents integer DEFAULT 0;

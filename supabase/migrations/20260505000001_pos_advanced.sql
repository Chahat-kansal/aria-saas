-- ============================================================
-- AriaPOS Advanced Schema — Run in Supabase SQL Editor
-- ============================================================

-- Outlets
CREATE TABLE IF NOT EXISTS pos_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  address text,
  phone text,
  abn text,
  use_global_cost boolean DEFAULT true,
  email_receipt_template text,
  gift_cards_enabled boolean DEFAULT true,
  gift_card_expiry_years integer DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

-- Registers
CREATE TABLE IF NOT EXISTS pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Register',
  float_amount numeric(10,2) DEFAULT 200.00,
  receipt_template_id uuid,
  created_at timestamptz DEFAULT now()
);

-- Price Points (multi-quantity pricing — e.g. 1@$6.99, 4@$25.99, 10@$55.99)
CREATE TABLE IF NOT EXISTS pos_price_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  price_set_name text NOT NULL DEFAULT 'Default Price Set',
  quantity integer NOT NULL DEFAULT 1,
  price numeric(10,2) NOT NULL,
  cost numeric(10,2),
  margin_percent numeric(5,2),
  created_at timestamptz DEFAULT now()
);

-- Per-outlet product costs
CREATE TABLE IF NOT EXISTS pos_product_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  last_case_cost numeric(10,2) DEFAULT 0,
  last_item_cost numeric(10,2) DEFAULT 0,
  case_cost numeric(10,2) DEFAULT 0,
  item_cost numeric(10,2) DEFAULT 0,
  case_quantity integer DEFAULT 1,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, outlet_id)
);

-- Brands / Families / Tags
CREATE TABLE IF NOT EXISTS pos_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Receipt templates
CREATE TABLE IF NOT EXISTS pos_receipt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'normal' CHECK (type IN ('normal','email')),
  for_type text DEFAULT 'sale' CHECK (for_type IN ('sale','payment')),
  components jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- Customer groups
CREATE TABLE IF NOT EXISTS pos_customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_list_id uuid,
  discount_percent numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Company-wide POS settings
CREATE TABLE IF NOT EXISTS pos_company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  use_quantity_rate boolean DEFAULT false,
  sell_cases boolean DEFAULT true,
  cross_promotion_count boolean DEFAULT true,
  team_message text,
  single_text text DEFAULT 'Item',
  case_text text DEFAULT 'Case',
  sign_in_type text DEFAULT 'select_user',
  require_password boolean DEFAULT true,
  sell_screen_auto_logout integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Stock adjustments log
CREATE TABLE IF NOT EXISTS pos_stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id),
  outlet_id uuid REFERENCES pos_outlets(id),
  adjustment_qty numeric(10,2) NOT NULL,
  reason text,
  adjusted_by text,
  created_at timestamptz DEFAULT now()
);

-- Extend existing tables (safe — use IF NOT EXISTS)
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS margin_percent numeric(5,2);
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS price_point_id uuid;

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS outlet_id uuid;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS register_id uuid;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS tax_total numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS discount_total numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS savings_total numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS loyalty_value numeric(10,2) DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS payment_subtype text;

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS brand_id uuid;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS family_id uuid;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS cost numeric(10,2) DEFAULT 0;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS case_quantity integer DEFAULT 1;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS loyalty_earn_rate numeric(5,2) DEFAULT 1.0;

ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS group_id uuid;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS account_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS price_list_id uuid;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS loyalty_balance numeric(10,2) DEFAULT 0;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS total_spend numeric(10,2) DEFAULT 0;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS visit_count integer DEFAULT 0;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS last_visit timestamptz;

-- RLS
ALTER TABLE pos_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_receipt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent re-run)
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_outlets';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_registers';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_price_points';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_product_costs';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_brands';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_families';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_tags';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_receipt_templates';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_customer_groups';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_company_settings';
  EXECUTE 'DROP POLICY IF EXISTS "business_access" ON pos_stock_adjustments';
END $$;

CREATE POLICY "business_access" ON pos_outlets FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_registers FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_price_points FOR ALL USING (product_id IN (SELECT id FROM pos_products WHERE business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())));
CREATE POLICY "business_access" ON pos_product_costs FOR ALL USING (product_id IN (SELECT id FROM pos_products WHERE business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())));
CREATE POLICY "business_access" ON pos_brands FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_families FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_tags FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_receipt_templates FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_customer_groups FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_company_settings FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "business_access" ON pos_stock_adjustments FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- =============================================================================
-- Migration: Shopfront feature parity
-- Correct execution order: price_sets first, then price_points (FK dependency),
-- then all other tables, then ALTER TABLE statements last.
-- All statements use IF NOT EXISTS / DROP POLICY IF EXISTS so this is
-- safe to run on both a fresh instance and an existing database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. pos_price_sets  (must exist before pos_price_points references it)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_price_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name         text NOT NULL,
  is_default   boolean DEFAULT false,
  outlet_name  text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE pos_price_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_price_sets" ON pos_price_sets;
CREATE POLICY "own_price_sets" ON pos_price_sets FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. pos_price_points  (CREATE includes new columns + FK to pos_price_sets)
--    Also ALTER TABLE so existing instances gain the same columns.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_price_points (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL,
  price_set_id uuid REFERENCES pos_price_sets(id) ON DELETE CASCADE,
  quantity     integer DEFAULT 1,
  price_cents  integer NOT NULL DEFAULT 0,
  cost_cents   integer DEFAULT 0,
  margin_pct   numeric DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
-- For instances where pos_price_points already existed with old schema:
ALTER TABLE pos_price_points ADD COLUMN IF NOT EXISTS price_set_id uuid;
ALTER TABLE pos_price_points ADD COLUMN IF NOT EXISTS price_cents  integer DEFAULT 0;
ALTER TABLE pos_price_points ADD COLUMN IF NOT EXISTS cost_cents   integer DEFAULT 0;
ALTER TABLE pos_price_points ADD COLUMN IF NOT EXISTS margin_pct   numeric DEFAULT 0;
ALTER TABLE pos_price_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_price_points" ON pos_price_points;
CREATE POLICY "own_price_points" ON pos_price_points FOR ALL
  USING (price_set_id IN (
    SELECT id FROM pos_price_sets
    WHERE business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid())));

-- -----------------------------------------------------------------------------
-- 3. pos_customer_groups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_customer_groups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  discount_type  text DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage','fixed','price_list')),
  discount_value numeric DEFAULT 0,
  price_list_id  uuid,
  colour         text DEFAULT '#8B5CF6',
  is_active      boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);
ALTER TABLE pos_customer_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_customer_groups" ON pos_customer_groups;
CREATE POLICY "own_customer_groups" ON pos_customer_groups FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 4. pos_customer_transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_customer_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES pos_customers(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('charge','payment','credit','adjustment')),
  amount_cents     integer NOT NULL,
  description      text,
  sale_id          uuid,
  created_at       timestamptz DEFAULT now(),
  created_by       text
);
ALTER TABLE pos_customer_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_customer_tx" ON pos_customer_transactions;
CREATE POLICY "own_customer_tx" ON pos_customer_transactions FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. pos_product_outlet_costs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_product_outlet_costs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id          uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_id           uuid NOT NULL,
  outlet_name          text NOT NULL,
  case_cost_cents      integer DEFAULT 0,
  item_cost_cents      integer DEFAULT 0,
  last_case_cost_cents integer DEFAULT 0,
  last_item_cost_cents integer DEFAULT 0,
  updated_at           timestamptz DEFAULT now()
);
ALTER TABLE pos_product_outlet_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_outlet_costs" ON pos_product_outlet_costs;
CREATE POLICY "own_outlet_costs" ON pos_product_outlet_costs FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 6. pos_product_revisions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_product_revisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL,
  business_id   uuid REFERENCES businesses(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value     text,
  new_value     text,
  changed_by    text,
  changed_at    timestamptz DEFAULT now()
);
ALTER TABLE pos_product_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_revisions" ON pos_product_revisions;
CREATE POLICY "own_revisions" ON pos_product_revisions FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 7. pos_sale_keys
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_sale_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  label            text NOT NULL,
  colour           text DEFAULT '#6366F1',
  product_id       uuid,
  custom_price_cents integer,
  action           text DEFAULT 'add_product',
  position         integer DEFAULT 0,
  is_active        boolean DEFAULT true
);
ALTER TABLE pos_sale_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_sale_keys" ON pos_sale_keys;
CREATE POLICY "own_sale_keys" ON pos_sale_keys FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 8. pos_future_prices
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_future_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL,
  product_name    text,
  new_price_cents integer NOT NULL,
  effective_date  date NOT NULL,
  applied         boolean DEFAULT false,
  applied_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE pos_future_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_future_prices" ON pos_future_prices;
CREATE POLICY "own_future_prices" ON pos_future_prices FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 9. pos_surcharge_rules
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_surcharge_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name             text NOT NULL,
  payment_method   text NOT NULL,
  surcharge_type   text DEFAULT 'percentage',
  surcharge_value  numeric NOT NULL DEFAULT 0,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);
ALTER TABLE pos_surcharge_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_surcharge" ON pos_surcharge_rules;
CREATE POLICY "own_surcharge" ON pos_surcharge_rules FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 10. pos_action_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_action_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid REFERENCES businesses(id) ON DELETE CASCADE,
  action_type   text NOT NULL,
  description   text,
  amount_cents  integer,
  performed_by  text,
  sale_id       uuid,
  session_id    uuid,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE pos_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_action_log" ON pos_action_log;
CREATE POLICY "own_action_log" ON pos_action_log FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- 11. pos_customers — new columns
-- -----------------------------------------------------------------------------
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS group_id               uuid,
  ADD COLUMN IF NOT EXISTS group_name             text,
  ADD COLUMN IF NOT EXISTS credit_limit_cents     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_balance_cents  integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_number         text,
  ADD COLUMN IF NOT EXISTS notes                  text;

-- -----------------------------------------------------------------------------
-- 12. pos_products — new columns
-- -----------------------------------------------------------------------------
ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS brand                   text,
  ADD COLUMN IF NOT EXISTS family                  text,
  ADD COLUMN IF NOT EXISTS tags                    text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS case_quantity           integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cases_in_stock          integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_override integer;

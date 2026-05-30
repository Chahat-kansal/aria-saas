-- Task 1: pos_price_lists and pos_price_list_items (create if not present)
CREATE TABLE IF NOT EXISTS pos_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  customer_group_ids text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_price_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES pos_price_lists(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  override_price numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (price_list_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_price_lists_bid ON pos_price_lists(business_id);

-- Task 2: add customer_group_ids to existing pos_price_lists
ALTER TABLE pos_price_lists ADD COLUMN IF NOT EXISTS customer_group_ids text[] DEFAULT '{}';

-- Task 3: add reason to pos_scheduled_price_changes
ALTER TABLE pos_scheduled_price_changes ADD COLUMN IF NOT EXISTS reason text;

-- Task 4: create scheduled_price_changes (timed prices) table if not present
CREATE TABLE IF NOT EXISTS scheduled_price_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  category_id uuid REFERENCES pos_categories(id) ON DELETE CASCADE,
  product_name text,
  original_price numeric(10,2),
  timed_price numeric(10,2),
  discount_pct numeric(5,2),
  days_of_week integer[],
  start_time text,
  end_time text,
  label text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scheduled_price_changes ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2);
ALTER TABLE scheduled_price_changes ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES pos_categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_spc_bid ON scheduled_price_changes(business_id);
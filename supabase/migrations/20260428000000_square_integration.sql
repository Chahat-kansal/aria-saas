-- Square integration tables and business data source tracking
-- Run this in Supabase SQL Editor

-- Square OAuth connection per business
CREATE TABLE IF NOT EXISTS square_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  square_merchant_id text NOT NULL,
  square_location_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz,
  scope text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','synced','error')),
  sync_error text
);
ALTER TABLE square_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_square_connections" ON square_connections;
CREATE POLICY "own_square_connections" ON square_connections FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Synced Square catalogue items
CREATE TABLE IF NOT EXISTS square_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  square_item_id text NOT NULL,
  square_variation_id text,
  name text NOT NULL,
  description text,
  category text,
  price_cents integer,
  cost_cents integer,
  sku text,
  barcode text,
  track_inventory boolean DEFAULT true,
  current_stock integer DEFAULT 0,
  reorder_point integer DEFAULT 0,
  unit text DEFAULT 'unit',
  image_url text,
  last_updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, square_item_id)
);
ALTER TABLE square_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_square_items" ON square_items;
CREATE POLICY "own_square_items" ON square_items FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Synced Square sales / orders
CREATE TABLE IF NOT EXISTS square_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  square_order_id text NOT NULL,
  square_payment_id text,
  total_cents integer NOT NULL,
  tax_cents integer DEFAULT 0,
  discount_cents integer DEFAULT 0,
  customer_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  line_items jsonb DEFAULT '[]',
  payment_method text,
  sold_at timestamptz NOT NULL,
  location_id text,
  UNIQUE(business_id, square_order_id)
);
ALTER TABLE square_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_square_sales" ON square_sales;
CREATE POLICY "own_square_sales" ON square_sales FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Synced Square customers
CREATE TABLE IF NOT EXISTS square_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  square_customer_id text NOT NULL,
  name text,
  email text,
  phone text,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  visit_count integer DEFAULT 0,
  total_spent_cents integer DEFAULT 0,
  average_basket_cents integer DEFAULT 0,
  days_since_last_visit integer,
  visit_frequency_days integer,
  churn_risk text DEFAULT 'low' CHECK (churn_risk IN ('low','medium','high','churned')),
  tags text[],
  UNIQUE(business_id, square_customer_id)
);
ALTER TABLE square_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_square_customers" ON square_customers;
CREATE POLICY "own_square_customers" ON square_customers FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Cron run log
CREATE TABLE IF NOT EXISTS cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  businesses_processed integer DEFAULT 0,
  errors jsonb DEFAULT '[]',
  status text DEFAULT 'running' CHECK (status IN ('running','completed','failed'))
);

-- Add data_source and square_connected to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'aria_pos';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS square_connected boolean DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_square_items_business ON square_items(business_id);
CREATE INDEX IF NOT EXISTS idx_square_sales_business_sold ON square_sales(business_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_square_customers_business ON square_customers(business_id);
CREATE INDEX IF NOT EXISTS idx_square_connections_business ON square_connections(business_id);

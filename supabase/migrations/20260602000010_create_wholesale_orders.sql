CREATE TABLE wholesale_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  order_number text not null,
  customer_id uuid references customers(id) on delete restrict,
  status text not null default 'draft',
  source text not null default 'inventory_pick',
  po_ref text,
  delivery_date date,
  delivery_address text,
  delivery_notes text,
  payment_terms text default 'Net 14',
  subtotal numeric(12,2) default 0,
  discount_total numeric(12,2) default 0,
  freight numeric(12,2) default 0,
  gst_total numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text,
  invoice_id uuid references invoices(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text
);
CREATE INDEX wholesale_orders_business_status_idx ON wholesale_orders (business_id, status, created_at DESC);
CREATE INDEX wholesale_orders_customer_idx ON wholesale_orders (customer_id, created_at DESC);
ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_own_wholesale_orders" ON wholesale_orders
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE wholesale_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references wholesale_orders(id) on delete cascade not null,
  product_id uuid references pos_products(id) on delete restrict,
  sku text,
  name text not null,
  description text,
  quantity numeric(10,3) not null,
  unit_price numeric(12,2) not null,
  retail_price numeric(12,2),
  discount_pct numeric(5,2) default 0,
  discount_amount numeric(12,2) default 0,
  line_total numeric(12,2) not null,
  gst_amount numeric(12,2) default 0,
  position integer default 0
);
CREATE INDEX wholesale_order_items_order_idx ON wholesale_order_items (order_id);
ALTER TABLE wholesale_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_own_wholesale_order_items" ON wholesale_order_items
  FOR ALL USING (
    order_id IN (SELECT id FROM wholesale_orders WHERE business_id IN
      (SELECT id FROM businesses WHERE user_id = auth.uid()))
  );

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS abn text,
  ADD COLUMN IF NOT EXISTS wholesale_tier integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wholesale_discount_pct numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS payment_terms_default text DEFAULT 'Net 14';

CREATE SEQUENCE IF NOT EXISTS wholesale_order_seq START 318;
CREATE OR REPLACE FUNCTION generate_wholesale_order_number() RETURNS text AS $$
BEGIN
  RETURN 'WHL-' || LPAD(nextval('wholesale_order_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
-- Warehouse Module: Lot tracking, bin locations, GRNs, cycle counts, supplier performance, slotting

-- Lot and batch tracking
CREATE TABLE IF NOT EXISTS warehouse_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_name text NOT NULL,
  lot_number text NOT NULL,
  supplier_id uuid,
  supplier_name text,
  quantity_received integer NOT NULL DEFAULT 0,
  quantity_remaining integer NOT NULL DEFAULT 0,
  unit_cost_cents integer,
  received_at timestamptz DEFAULT now(),
  expiry_date date,
  notes text,
  status text DEFAULT 'active' CHECK (status IN ('active','depleted','expired','recalled')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, item_id, lot_number)
);
ALTER TABLE warehouse_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_lots" ON warehouse_lots;
CREATE POLICY "own_lots" ON warehouse_lots FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_warehouse_lots_business ON warehouse_lots(business_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_lots_expiry ON warehouse_lots(business_id, expiry_date) WHERE status = 'active';

-- Bin/shelf locations
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  outlet_id uuid,
  zone text NOT NULL DEFAULT 'A',
  aisle text,
  bay text NOT NULL,
  shelf text NOT NULL,
  bin text,
  label text,
  capacity integer,
  temperature_zone text DEFAULT 'ambient' CHECK (temperature_zone IN ('ambient','chilled','frozen','controlled')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_warehouse_locations" ON warehouse_locations;
CREATE POLICY "own_warehouse_locations" ON warehouse_locations FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Item-to-location assignments
CREATE TABLE IF NOT EXISTS warehouse_item_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  location_id uuid REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, item_id, location_id)
);
ALTER TABLE warehouse_item_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_item_locations" ON warehouse_item_locations;
CREATE POLICY "own_item_locations" ON warehouse_item_locations FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Goods Received Notes (GRN)
CREATE TABLE IF NOT EXISTS warehouse_grns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  grn_number text NOT NULL,
  purchase_order_id uuid,
  supplier_id uuid,
  supplier_name text,
  received_by text,
  received_at timestamptz DEFAULT now(),
  invoice_number text,
  invoice_total_cents integer,
  notes text,
  status text DEFAULT 'draft' CHECK (status IN ('draft','confirmed','discrepancy')),
  items jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, grn_number)
);
ALTER TABLE warehouse_grns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_grns" ON warehouse_grns;
CREATE POLICY "own_grns" ON warehouse_grns FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_warehouse_grns_business ON warehouse_grns(business_id, received_at DESC);

-- Cycle count schedule
CREATE TABLE IF NOT EXISTS warehouse_cycle_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  item_ids text[] NOT NULL DEFAULT '{}',
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','skipped')),
  counts jsonb DEFAULT '[]',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_cycle_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_cycle_counts" ON warehouse_cycle_counts;
CREATE POLICY "own_cycle_counts" ON warehouse_cycle_counts FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Supplier performance tracking
CREATE TABLE IF NOT EXISTS warehouse_supplier_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id uuid,
  supplier_name text,
  grn_id uuid REFERENCES warehouse_grns(id) ON DELETE CASCADE,
  promised_delivery_date date,
  actual_delivery_date date,
  days_variance integer,
  quantity_ordered integer,
  quantity_received integer,
  quantity_variance integer,
  invoice_total_cents integer,
  po_total_cents integer,
  price_variance_cents integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_supplier_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_supplier_perf" ON warehouse_supplier_performance;
CREATE POLICY "own_supplier_perf" ON warehouse_supplier_performance FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- AI slotting suggestions
CREATE TABLE IF NOT EXISTS warehouse_slotting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_name text NOT NULL,
  suggested_location_id uuid REFERENCES warehouse_locations(id),
  current_location_id uuid REFERENCES warehouse_locations(id),
  reason text,
  velocity_rank integer,
  generated_at timestamptz DEFAULT now(),
  applied boolean DEFAULT false,
  UNIQUE(business_id, item_id)
);
ALTER TABLE warehouse_slotting ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_slotting" ON warehouse_slotting;
CREATE POLICY "own_slotting" ON warehouse_slotting FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

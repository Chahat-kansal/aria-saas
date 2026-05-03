-- Warehouse Complete Migration: UOM, serials, quarantine, BOM, production, returns, pick lists, landed costs, despatches, LPN

-- Unit of measure conversions
CREATE TABLE IF NOT EXISTS warehouse_uom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_unit text NOT NULL,
  conversion_factor numeric NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_uom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_uom" ON warehouse_uom;
CREATE POLICY "own_uom" ON warehouse_uom FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Serial number tracking
CREATE TABLE IF NOT EXISTS warehouse_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_name text NOT NULL,
  serial_number text NOT NULL,
  lot_id uuid REFERENCES warehouse_lots(id) ON DELETE SET NULL,
  status text DEFAULT 'in_stock' CHECK (status IN ('in_stock','sold','returned','quarantine','lost')),
  received_at timestamptz DEFAULT now(),
  sold_at timestamptz,
  sale_id text,
  notes text,
  UNIQUE(business_id, serial_number)
);
ALTER TABLE warehouse_serials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_serials" ON warehouse_serials;
CREATE POLICY "own_serials" ON warehouse_serials FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Quarantine zones
CREATE TABLE IF NOT EXISTS warehouse_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_name text NOT NULL,
  lot_id uuid REFERENCES warehouse_lots(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  status text DEFAULT 'quarantined' CHECK (status IN ('quarantined','released','disposed','returned_to_supplier')),
  quarantined_by text,
  quarantined_at timestamptz DEFAULT now(),
  released_at timestamptz,
  resolution text,
  notes text
);
ALTER TABLE warehouse_quarantine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_quarantine" ON warehouse_quarantine;
CREATE POLICY "own_quarantine" ON warehouse_quarantine FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Bills of Materials
CREATE TABLE IF NOT EXISTS warehouse_bom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  finished_item_id text NOT NULL,
  finished_item_name text NOT NULL,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_bom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_bom" ON warehouse_bom;
CREATE POLICY "own_bom" ON warehouse_bom FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS warehouse_bom_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  bom_id uuid REFERENCES warehouse_bom(id) ON DELETE CASCADE,
  component_item_id text NOT NULL,
  component_item_name text NOT NULL,
  quantity_required numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'each',
  notes text
);
ALTER TABLE warehouse_bom_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_bom_components" ON warehouse_bom_components;
CREATE POLICY "own_bom_components" ON warehouse_bom_components FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Production / Assembly orders
CREATE TABLE IF NOT EXISTS warehouse_production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  bom_id uuid REFERENCES warehouse_bom(id) ON DELETE SET NULL,
  finished_item_id text NOT NULL,
  finished_item_name text NOT NULL,
  quantity_planned integer NOT NULL,
  quantity_produced integer DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','in_progress','completed','cancelled')),
  planned_start date,
  planned_end date,
  actual_start timestamptz,
  actual_end timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, order_number)
);
ALTER TABLE warehouse_production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_production" ON warehouse_production_orders;
CREATE POLICY "own_production" ON warehouse_production_orders FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Returns / RMA
CREATE TABLE IF NOT EXISTS warehouse_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  rma_number text NOT NULL,
  return_type text DEFAULT 'customer' CHECK (return_type IN ('customer','supplier')),
  supplier_id uuid,
  supplier_name text,
  customer_name text,
  customer_contact text,
  reason text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending','received','inspected','restocked','disposed','credit_issued')),
  items jsonb DEFAULT '[]',
  total_credit_cents integer DEFAULT 0,
  received_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, rma_number)
);
ALTER TABLE warehouse_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_returns" ON warehouse_returns;
CREATE POLICY "own_returns" ON warehouse_returns FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Pick lists
CREATE TABLE IF NOT EXISTS warehouse_pick_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  pick_number text NOT NULL,
  order_ids text[] DEFAULT '{}',
  pick_type text DEFAULT 'standard' CHECK (pick_type IN ('standard','wave','zone')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  assigned_to text,
  items jsonb DEFAULT '[]',
  started_at timestamptz,
  completed_at timestamptz,
  accuracy_pct numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, pick_number)
);
ALTER TABLE warehouse_pick_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_pick_lists" ON warehouse_pick_lists;
CREATE POLICY "own_pick_lists" ON warehouse_pick_lists FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Landed costs
CREATE TABLE IF NOT EXISTS warehouse_landed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  grn_id uuid REFERENCES warehouse_grns(id) ON DELETE CASCADE,
  cost_type text NOT NULL,
  description text,
  amount_cents integer NOT NULL,
  allocation_method text DEFAULT 'value' CHECK (allocation_method IN ('value','quantity','weight','volume')),
  allocated_to_items jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE warehouse_landed_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_landed_costs" ON warehouse_landed_costs;
CREATE POLICY "own_landed_costs" ON warehouse_landed_costs FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Despatch / Shipping
CREATE TABLE IF NOT EXISTS warehouse_despatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  despatch_number text NOT NULL,
  despatch_type text DEFAULT 'outbound' CHECK (despatch_type IN ('outbound','transfer','return')),
  carrier text,
  tracking_number text,
  consignment_note text,
  recipient_name text,
  recipient_address text,
  recipient_city text,
  recipient_state text,
  recipient_postcode text,
  items jsonb DEFAULT '[]',
  total_weight_kg numeric,
  total_cubic_m numeric,
  status text DEFAULT 'pending' CHECK (status IN ('pending','packed','despatched','delivered','failed')),
  packed_at timestamptz,
  despatched_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, despatch_number)
);
ALTER TABLE warehouse_despatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_despatches" ON warehouse_despatches;
CREATE POLICY "own_despatches" ON warehouse_despatches FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- LPN (Licence Plate Numbers / pallet tracking)
CREATE TABLE IF NOT EXISTS warehouse_lpn (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  lpn_number text NOT NULL,
  lpn_type text DEFAULT 'pallet' CHECK (lpn_type IN ('pallet','carton','tote','bin')),
  location_id uuid REFERENCES warehouse_locations(id) ON DELETE SET NULL,
  status text DEFAULT 'active' CHECK (status IN ('active','empty','despatched','quarantine')),
  items jsonb DEFAULT '[]',
  total_weight_kg numeric,
  received_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, lpn_number)
);
ALTER TABLE warehouse_lpn ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_lpn" ON warehouse_lpn;
CREATE POLICY "own_lpn" ON warehouse_lpn FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Product extensions
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS costing_method text DEFAULT 'average'
  CHECK (costing_method IN ('average','fifo','lifo','standard'));
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS purchase_uom text;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS purchase_uom_qty numeric DEFAULT 1;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS sell_uom text;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS serial_tracked boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS quality_hold boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS stocktake_frozen boolean DEFAULT false;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_warehouse_quarantine_biz ON warehouse_quarantine(business_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouse_returns_biz ON warehouse_returns(business_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouse_pick_lists_biz ON warehouse_pick_lists(business_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouse_despatches_biz ON warehouse_despatches(business_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouse_serials_biz ON warehouse_serials(business_id, status);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpn_biz ON warehouse_lpn(business_id, status);

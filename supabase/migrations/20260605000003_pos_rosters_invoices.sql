-- pos_rosters: staff scheduling rosters (Aria can draft these via Ask Aria)
CREATE TABLE IF NOT EXISTS pos_rosters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  week_start date NOT NULL,
  week_end date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published boolean NOT NULL DEFAULT false,
  generated_by_agent boolean NOT NULL DEFAULT false,
  notes text,
  total_cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pos_rosters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_pos_rosters" ON pos_rosters
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_pos_rosters_biz ON pos_rosters (business_id, week_start DESC);

-- pos_roster_shifts: individual shifts on a roster
CREATE TABLE IF NOT EXISTS pos_roster_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id uuid NOT NULL REFERENCES pos_rosters(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  role text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pos_roster_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_pos_roster_shifts" ON pos_roster_shifts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- invoices: client-facing invoices Aria can draft (amounts in DOLLARS)
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_number text,
  customer_name text,
  customer_email text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','cancelled')),
  notes text,
  ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_invoices" ON invoices
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_invoices_biz ON invoices (business_id, created_at DESC);

-- invoice_items: line items on an invoice (amounts in DOLLARS)
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_invoice_items" ON invoice_items
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

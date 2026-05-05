CREATE TABLE IF NOT EXISTS purchase_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  draft_type text DEFAULT 'ai_generated' CHECK (draft_type IN ('ai_generated','manual','hybrid')),
  status text DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent_to_supplier','received','cancelled')),
  supplier_id uuid,
  supplier_name text,
  supplier_email text,
  items jsonb DEFAULT '[]',
  total_cost_cents integer DEFAULT 0,
  aria_reasoning text,
  week_starting date,
  approved_at timestamptz,
  approved_by text,
  sent_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_order_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_po_drafts" ON purchase_order_drafts;
CREATE POLICY "own_po_drafts" ON purchase_order_drafts FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS mobile_inventory_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  session_type text DEFAULT 'count' CHECK (session_type IN ('count','order','receive')),
  status text DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  scanned_items jsonb DEFAULT '[]',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  submitted_by text,
  notes text
);
ALTER TABLE mobile_inventory_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_mobile_sessions" ON mobile_inventory_sessions;
CREATE POLICY "own_mobile_sessions" ON mobile_inventory_sessions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

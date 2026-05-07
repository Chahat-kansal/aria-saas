CREATE TABLE IF NOT EXISTS purchase_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  draft_type text DEFAULT 'ai_generated'
    CHECK (draft_type IN ('ai_generated','manual','hybrid')),
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','approved',
      'sent_to_supplier','received','cancelled')),
  supplier_name text,
  items jsonb DEFAULT '[]',
  total_cost_cents integer DEFAULT 0,
  aria_reasoning text,
  week_starting date,
  approved_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_order_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "own_po_drafts" ON purchase_order_drafts FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()));

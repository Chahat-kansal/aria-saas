CREATE TABLE IF NOT EXISTS pos_receipt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'New Receipt',
  type text NOT NULL DEFAULT 'normal' CHECK (type IN ('normal','email')),
  for_type text NOT NULL DEFAULT 'sale' CHECK (for_type IN ('sale','payment')),
  components jsonb NOT NULL DEFAULT '[]',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE pos_receipt_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_receipt_templates" ON pos_receipt_templates;
CREATE POLICY "own_receipt_templates" ON pos_receipt_templates FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS receipt_templates_business_idx ON pos_receipt_templates (business_id);

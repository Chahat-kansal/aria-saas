-- Aria co-owner actions and safe CSV import staging.

CREATE TABLE IF NOT EXISTS aria_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  priority text DEFAULT 'medium',
  recommendation text,
  reason text,
  expected_impact text,
  confidence text,
  status text DEFAULT 'pending',
  source text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT aria_actions_status_check CHECK (status IN ('pending', 'approved', 'ignored', 'completed', 'edited')),
  CONSTRAINT aria_actions_priority_check CHECK (priority IN ('high', 'medium', 'low'))
);

ALTER TABLE aria_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_aria_actions" ON aria_actions;
CREATE POLICY "own_aria_actions" ON aria_actions FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_aria_actions_business_status
  ON aria_actions(business_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_aria_actions_updated_at ON aria_actions;
CREATE TRIGGER set_aria_actions_updated_at
  BEFORE UPDATE ON aria_actions
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS imported_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  upload_type text NOT NULL,
  file_name text,
  columns jsonb DEFAULT '[]',
  rows jsonb DEFAULT '[]',
  row_count integer DEFAULT 0,
  mapping jsonb DEFAULT '{}',
  status text DEFAULT 'imported',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT imported_files_upload_type_check CHECK (upload_type IN ('products', 'sales', 'inventory', 'supplier_costs'))
);

ALTER TABLE imported_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_imported_files" ON imported_files;
CREATE POLICY "own_imported_files" ON imported_files FOR ALL
  USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ))
  WITH CHECK (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_imported_files_business_created
  ON imported_files(business_id, created_at DESC);

-- Aria custom feature builder

CREATE TABLE IF NOT EXISTS aria_custom_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  feature_name text NOT NULL,
  feature_request text NOT NULL,
  status text DEFAULT 'planned'
    CHECK (status IN ('planned','building','deployed','failed')),
  feature_plan jsonb,
  built_by text DEFAULT 'aria',
  created_at timestamptz DEFAULT now(),
  deployed_at timestamptz
);
ALTER TABLE aria_custom_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_custom_features" ON aria_custom_features;
CREATE POLICY "own_custom_features" ON aria_custom_features FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_aria_custom_features_biz ON aria_custom_features(business_id, status);

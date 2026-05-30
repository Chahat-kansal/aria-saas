-- Add missing columns needed by the recipe import feature
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS yield_qty numeric,
  ADD COLUMN IF NOT EXISTS yield_unit text,
  ADD COLUMN IF NOT EXISTS total_cost numeric,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- cost_per_unit on ingredients (dollar amount per unit)
ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS cost_per_unit numeric;

-- recipe_imports: audit log of file-based imports
CREATE TABLE IF NOT EXISTS recipe_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  rows_imported integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recipe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_imports_owner" ON recipe_imports FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS recipe_imports_business_idx ON recipe_imports (business_id, imported_at DESC);
-- Recipe management: designed for cafes, restaurants, bottle shops with custom blends
-- Recipes tie to products sold at POS; ingredients deduct from inventory when sold

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES pos_products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g. 'coffee', 'food', 'cocktail', 'juice'
  serves INT NOT NULL DEFAULT 1,
  prep_time_minutes INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  cost_cents INT, -- calculated from ingredients
  sell_price_cents INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES pos_products(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g', -- g, ml, each, tsp, tbsp, cup
  cost_cents INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Training assets: videos, docs, images for staff training on recipes
CREATE TABLE IF NOT EXISTS recipe_training_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('video', 'image', 'pdf', 'text', 'url')),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  content TEXT, -- for 'text' type assets
  duration_seconds INT, -- for video
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which staff have completed training for which recipes
CREATE TABLE IF NOT EXISTS staff_recipe_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_member_id UUID REFERENCES staff_members(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'needs_review')),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  signed_off_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_member_id, recipe_id)
);

-- RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_training_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recipe_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_owner" ON recipes FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

CREATE POLICY "recipe_ingredients_owner" ON recipe_ingredients FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

CREATE POLICY "recipe_training_assets_owner" ON recipe_training_assets FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

CREATE POLICY "staff_recipe_training_owner" ON staff_recipe_training FOR ALL USING (
  business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
);

-- Indexes
CREATE INDEX IF NOT EXISTS recipes_business_idx ON recipes (business_id);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_idx ON recipe_ingredients (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_training_assets_recipe_idx ON recipe_training_assets (recipe_id);
CREATE INDEX IF NOT EXISTS staff_recipe_training_staff_idx ON staff_recipe_training (staff_member_id);
CREATE INDEX IF NOT EXISTS staff_recipe_training_recipe_idx ON staff_recipe_training (recipe_id);

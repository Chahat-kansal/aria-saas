-- Menu Engineering Agent tables
-- UNIQUE(business_id, product_id) — one active score per product (upserted each run)

CREATE TABLE IF NOT EXISTS product_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  scored_at timestamptz DEFAULT now(),
  period_hours integer DEFAULT 4,

  units_sold_this_period numeric DEFAULT 0,
  units_sold_baseline_same_period numeric DEFAULT 0,
  velocity_vs_avg numeric DEFAULT 1.0,

  margin_pct numeric DEFAULT 0,
  margin_dollars_per_unit numeric DEFAULT 0,
  margin_score numeric DEFAULT 0.5,

  halo_score numeric DEFAULT 0,
  halo_products uuid[],
  halo_avg_copur_margin numeric DEFAULT 0,

  composite_score numeric DEFAULT 0,

  performance_tier text DEFAULT 'normal' CHECK (performance_tier IN
    ('star','plowhouse','puzzle','dog','normal')),

  recommended_grid_position integer,
  recommended_upsell_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  recommended_bundle_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  recommended_bundle_price numeric,

  revenue_4h_before_change numeric DEFAULT 0,
  revenue_4h_after_change numeric DEFAULT 0,
  recommendation_outcome text CHECK (recommendation_outcome IN ('positive','negative','neutral','unmeasured')),

  UNIQUE(business_id, product_id)
);

ALTER TABLE product_performance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_product_scores" ON product_performance_scores
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_pps_business_scored ON product_performance_scores (business_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_pps_business_score ON product_performance_scores (business_id, composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_pps_business_tier ON product_performance_scores (business_id, performance_tier);

CREATE TABLE IF NOT EXISTS menu_engineering_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'reorder_grid','hide_product','show_product',
    'activate_bundle','deactivate_bundle','set_upsell','remove_upsell',
    'activate_peak_mode','activate_quiet_mode','activate_margin_mode','restore_normal_mode'
  )),
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  previous_state jsonb,
  new_state jsonb,
  reasoning text,
  revenue_impact_actual numeric,
  executed_at timestamptz DEFAULT now(),
  reverted_at timestamptz,
  agent_run_id uuid
);

ALTER TABLE menu_engineering_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_menu_actions" ON menu_engineering_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_mea_business_executed ON menu_engineering_actions (business_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mea_business_type ON menu_engineering_actions (business_id, action_type, executed_at DESC);

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS grid_position integer;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_hidden boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_upsell_product_id uuid
  REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_product_id uuid
  REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_price numeric;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS performance_tier text DEFAULT 'normal'
  CHECK (performance_tier IN ('star','plowhouse','puzzle','dog','normal'));
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;

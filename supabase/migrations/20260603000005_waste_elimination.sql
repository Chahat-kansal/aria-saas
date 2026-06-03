-- Waste Elimination Agent tables
CREATE TABLE IF NOT EXISTS prep_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  prediction_date date NOT NULL,

  -- Prediction inputs
  day_of_week integer NOT NULL,
  weather_code integer,
  is_school_holiday boolean DEFAULT false,
  is_public_holiday boolean DEFAULT false,
  local_event text,
  competitor_promotion_active boolean DEFAULT false,

  -- Prediction outputs
  predicted_units_sold numeric NOT NULL,
  prediction_confidence numeric DEFAULT 0.5,
  recommended_prep_qty numeric NOT NULL,
  recommended_prep_time text,
  prep_guide_narrative text,

  -- Actual (filled at end of day)
  actual_units_sold numeric,
  actual_waste_units numeric,
  actual_waste_value numeric,
  waste_reason text,

  -- Model accuracy
  prediction_error_pct numeric,

  -- Actions taken
  promotion_triggered boolean DEFAULT false,
  promotion_id uuid REFERENCES pos_promotions(id) ON DELETE SET NULL,
  promotion_units_saved numeric DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, product_id, prediction_date)
);
ALTER TABLE prep_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_prep_predictions" ON prep_predictions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_prep_predictions_biz_date ON prep_predictions (business_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_prep_predictions_biz_prod_date ON prep_predictions (business_id, product_id, prediction_date DESC);

CREATE TABLE IF NOT EXISTS waste_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  waste_date date NOT NULL DEFAULT CURRENT_DATE,
  units_wasted numeric NOT NULL,
  cost_per_unit numeric DEFAULT 0,
  total_waste_value numeric DEFAULT 0,
  reason text CHECK (reason IN ('over_prepped','quality_degradation','event_cancelled','forecast_error','other')),
  prevented_by_agent boolean DEFAULT false,
  notes text,
  logged_by text DEFAULT 'agent',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE waste_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_waste_log" ON waste_log
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_waste_log_biz_date ON waste_log (business_id, waste_date DESC);

-- Add prep-related columns to pos_products
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS prep_time_minutes integer DEFAULT 0;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS shelf_life_hours numeric;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS waste_threshold_pct numeric DEFAULT 15;

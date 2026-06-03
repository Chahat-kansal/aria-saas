-- Add CLV-related columns to pos_customers (if not present)
ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS rfm_segment text,
  ADD COLUMN IF NOT EXISTS churn_risk_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS churn_risk_updated_at timestamptz;

-- CLV score per customer (weekly — dedup handled in application code)
CREATE TABLE IF NOT EXISTS customer_clv_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE CASCADE NOT NULL,
  scored_at timestamptz DEFAULT now(),

  -- Input features
  avg_basket_size numeric DEFAULT 0,
  visit_frequency_per_month numeric DEFAULT 0,
  months_as_customer numeric DEFAULT 0,
  product_diversity_score numeric DEFAULT 0,
  price_sensitivity_score numeric DEFAULT 0,
  seasonal_consistency_score numeric DEFAULT 0,

  -- CLV outputs
  predicted_monthly_revenue numeric DEFAULT 0,
  predicted_annual_revenue numeric DEFAULT 0,
  predicted_3yr_clv numeric DEFAULT 0,

  -- Tier classification
  clv_tier text CHECK (clv_tier IN ('champion','loyal','potential','at_risk','dormant','lost')),

  -- Trend signals
  visit_trend text CHECK (visit_trend IN ('accelerating','stable','decelerating','dormant')),
  spend_trend text CHECK (spend_trend IN ('growing','stable','declining')),
  days_since_last_visit integer DEFAULT 0,

  -- Intervention recommendation
  intervention_priority text CHECK (intervention_priority IN ('urgent','high','medium','low','none')),
  recommended_offer_type text CHECK (recommended_offer_type IN (
    'percentage_discount','free_item','points_bonus',
    'exclusive_access','vip_upgrade','none'
  )),
  recommended_offer_value numeric,
  recommended_message text,
  intervention_rationale text,

  -- Outcome tracking
  intervention_sent_at timestamptz,
  intervention_responded boolean,
  revenue_in_30d_after numeric,
  visit_count_in_30d_after integer
);

ALTER TABLE customer_clv_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_clv" ON customer_clv_scores
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_clv_scores_tier ON customer_clv_scores (business_id, clv_tier, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_clv_scores_priority ON customer_clv_scores (business_id, intervention_priority, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_clv_scores_customer ON customer_clv_scores (business_id, customer_id, scored_at DESC);

-- Portfolio-level summary (one row per business, updated weekly)
CREATE TABLE IF NOT EXISTS clv_portfolio_summary (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  scored_at timestamptz DEFAULT now(),
  total_customer_count integer DEFAULT 0,
  champion_count integer DEFAULT 0,
  loyal_count integer DEFAULT 0,
  potential_count integer DEFAULT 0,
  at_risk_count integer DEFAULT 0,
  dormant_count integer DEFAULT 0,
  lost_count integer DEFAULT 0,
  total_predicted_annual_revenue numeric DEFAULT 0,
  at_risk_annual_revenue numeric DEFAULT 0,
  top_20_pct_revenue_share numeric DEFAULT 0,
  if_rising_stars_add_1_visit numeric DEFAULT 0,
  avg_clv_champion numeric DEFAULT 0,
  avg_clv_loyal numeric DEFAULT 0,
  avg_clv_potential numeric DEFAULT 0,
  interventions_sent integer DEFAULT 0,
  interventions_responded integer DEFAULT 0,
  response_rate_pct numeric DEFAULT 0,
  revenue_attributed_to_interventions numeric DEFAULT 0
);

ALTER TABLE clv_portfolio_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_clv_portfolio" ON clv_portfolio_summary
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
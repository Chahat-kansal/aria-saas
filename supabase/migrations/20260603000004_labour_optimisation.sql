-- Labour Optimisation Agent tables

CREATE TABLE IF NOT EXISTS labour_demand_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  forecast_date date NOT NULL,
  hour_of_day integer NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  predicted_transactions integer DEFAULT 0,
  predicted_revenue numeric DEFAULT 0,
  predicted_basket_avg numeric DEFAULT 0,

  weather_adjustment_pct numeric DEFAULT 0,
  event_adjustment_pct numeric DEFAULT 0,
  school_holiday_adjustment_pct numeric DEFAULT 0,

  adjusted_predicted_revenue numeric DEFAULT 0,

  required_staff_count numeric DEFAULT 0,
  required_staff_skills text[],
  optimal_labour_cost numeric DEFAULT 0,

  actual_transactions integer,
  actual_revenue numeric,
  actual_staff_count numeric,
  actual_labour_cost numeric,
  forecast_accuracy_pct numeric,

  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, forecast_date, hour_of_day)
);
ALTER TABLE labour_demand_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_forecast" ON labour_demand_forecast
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ldf_business_date ON labour_demand_forecast (business_id, forecast_date, hour_of_day);
CREATE INDEX IF NOT EXISTS idx_ldf_business_created ON labour_demand_forecast (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS labour_optimisation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'early_finish_offer',
    'shift_offer',
    'labour_pct_alert',
    'understaffed_alert',
    'roster_suggestion',
    'forecast_accuracy_report'
  )),
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  target_date date NOT NULL,
  target_hour_start integer,
  target_hour_end integer,
  message_sent text,
  reasoning text,

  staff_response text CHECK (staff_response IN ('accepted','declined','no_response','pending')),
  responded_at timestamptz,
  labour_cost_saving numeric DEFAULT 0,

  executed_at timestamptz DEFAULT now(),
  agent_decision_id uuid REFERENCES agent_decisions(id) ON DELETE SET NULL
);
ALTER TABLE labour_optimisation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_actions" ON labour_optimisation_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_loa_business_executed ON labour_optimisation_actions (business_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_loa_business_type ON labour_optimisation_actions (business_id, action_type, executed_at DESC);

ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 25;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS availability_days integer[] DEFAULT '{0,1,2,3,4,5,6}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS max_hours_per_week numeric DEFAULT 38;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS performance_score numeric DEFAULT 0.7;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latitude numeric DEFAULT -33.8688;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS longitude numeric DEFAULT 151.2093;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS state text DEFAULT 'VIC';

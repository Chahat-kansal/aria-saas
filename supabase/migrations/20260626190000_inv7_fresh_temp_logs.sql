-- INV-7 — fresh/production. Reuses recipes/recipe_ingredients/pos_product_batches/pos_expiry_alerts/
-- pos_eod_markdown_rules + canonical adjustOutletStock. The ONE new table here is the temp/compliance log
-- (no temperature table existed — checked: temp_logs / temperature_logs / pos_temperature_logs / food_safety_logs
-- / compliance_logs all absent). Minimal + RLS-protected (service-role only; the staff app reads via supabaseAdmin).
-- Also widens inventory_tasks.task_type to admit 'temp' so overdue/failed temp checks surface in the INV-6 list.

CREATE TABLE IF NOT EXISTS pos_temperature_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE SET NULL,
  location text NOT NULL,                 -- e.g. 'Fridge 1', 'Display', 'Freezer'
  reading_c numeric NOT NULL,             -- the measured temperature (°C)
  threshold_c numeric,                    -- the safe max (fridge ≤5, freezer ≤-15); null = informational
  passed boolean NOT NULL,                -- reading within threshold (food-safe)
  logged_by uuid,                         -- staff PIN identity (attribution)
  logged_by_name text,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_temp_logs_biz_outlet_at ON pos_temperature_logs (business_id, outlet_id, logged_at DESC);
ALTER TABLE pos_temperature_logs ENABLE ROW LEVEL SECURITY;
-- no anon/authenticated policy: business data is reached only by the staff-app routes (service role bypasses RLS).

ALTER TABLE inventory_tasks DROP CONSTRAINT IF EXISTS inventory_tasks_task_type_check;
ALTER TABLE inventory_tasks ADD CONSTRAINT inventory_tasks_task_type_check
  CHECK (task_type IN ('count', 'receive', 'waste', 'expiring', 'cycle_count', 'velocity', 'weather', 'temp'));

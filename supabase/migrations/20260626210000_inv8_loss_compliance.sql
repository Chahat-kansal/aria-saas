-- INV-8 — loss & compliance. REUSES warehouse_quarantine for recall/on-hold (status quarantined→released/disposed/
-- returned_to_supplier already fits), pos_waste_log (the live waste table; cost_cents = CENTS) for disposal,
-- canonical adjustOutletStock for stock moves, and the EXISTING pos_products.age_restricted/is_age_restricted flag
-- for the age gate. The ONE new table is the age-check audit log (no age_verification table existed). Also widens
-- inventory_tasks.task_type to admit 'recall' so active on-holds surface in the INV-6 list.

CREATE TABLE IF NOT EXISTS pos_age_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE SET NULL,
  product_id uuid,
  product_name text,
  staff_id uuid,
  staff_name text,
  confirmed boolean NOT NULL DEFAULT true,   -- staff confirmed the customer is 18+
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_age_checks_biz_at ON pos_age_checks (business_id, created_at DESC);
ALTER TABLE pos_age_checks ENABLE ROW LEVEL SECURITY;
-- no anon/authenticated policy: reached only by the staff-app routes (service role bypasses RLS).

ALTER TABLE inventory_tasks DROP CONSTRAINT IF EXISTS inventory_tasks_task_type_check;
ALTER TABLE inventory_tasks ADD CONSTRAINT inventory_tasks_task_type_check
  CHECK (task_type IN ('count', 'receive', 'waste', 'expiring', 'cycle_count', 'velocity', 'weather', 'temp', 'recall'));

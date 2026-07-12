-- TOUR-RESURRECT-FIX-1 — the spotlight tour re-appeared on established
-- businesses whenever a new tour step shipped (Sip, ff5055a0: 74 days old,
-- 1815 sales, completed_steps had all 7 ORIGINAL steps, but landed on
-- step='ask_aria' — a step added AFTER Sip finished — because the read path
-- only auto-completes steps with a real-data signal, and 'ask_aria' has none
-- (MANUAL_STEP_KEYS), so it can never be grandfathered in without this fix).
--
-- completed_at: once set, the tour never auto-opens again — the API layer
-- keeps completed_steps saturated with every CURRENT tour-steps.ts key
-- whenever completed_at is set, so isLastStepDone stays permanently true.
ALTER TABLE onboarding_tour_progress
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;

-- Backfill: established businesses (>14 days old OR >50 completed pos_sales)
-- get every CURRENT tour-steps.ts key merged into completed_steps + a
-- completed_at snapshot now, so this fix takes effect immediately instead of
-- waiting for each business's next dashboard load.
WITH established AS (
  SELECT otp.business_id
  FROM onboarding_tour_progress otp
  JOIN businesses b ON b.id = otp.business_id
  WHERE otp.completed_at IS NULL
    AND (
      b.created_at <= now() - interval '14 days'
      OR (
        SELECT count(*) FROM pos_sales ps
        WHERE ps.business_id = otp.business_id AND ps.status != 'voided'
      ) > 50
    )
)
UPDATE onboarding_tour_progress otp
SET completed_at = now(),
    completed_steps = ARRAY(
      SELECT DISTINCT unnest(
        otp.completed_steps || ARRAY[
          'products','test_sale','ask_aria','invite_staff','cash_open',
          'payment_methods','cash_flow','loyalty','cx_app','set_hours',
          'connect_google','aria_runs'
        ]::text[]
      )
    ),
    updated_at = now()
FROM established e
WHERE otp.business_id = e.business_id;

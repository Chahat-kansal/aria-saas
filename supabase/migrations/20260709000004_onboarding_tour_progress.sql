-- SPOTLIGHT-TOUR-1: progressive spotlight activation tour, replacing the flat
-- "Get started" checklist (business_setup_progress, still present/untouched
-- per RULE0 — this is a new, richer table, not a rename).

CREATE TABLE IF NOT EXISTS onboarding_tour_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  step text NOT NULL DEFAULT 'products',
  completed_steps text[] NOT NULL DEFAULT '{}',
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tour_progress_business ON onboarding_tour_progress(business_id);

ALTER TABLE onboarding_tour_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own business tour progress" ON onboarding_tour_progress
  FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

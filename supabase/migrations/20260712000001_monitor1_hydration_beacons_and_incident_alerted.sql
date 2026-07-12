-- MONITOR-1 — client_hydration_beacons: ground-truth "a real browser actually
-- rendered us" signal. Not business-scoped (landing-page visitors have no
-- business context) — deliberately lean, high-volume, no RLS complexity
-- (writes only via the service-role /api/health/hydrated route).
CREATE TABLE IF NOT EXISTS client_hydration_beacons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path text NOT NULL,
  build_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hydration_beacons_build_created
  ON client_hydration_beacons (build_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hydration_beacons_created
  ON client_hydration_beacons (created_at DESC);

-- MONITOR-1 — the Anthropic-credits outage ran 2 weeks silent on Gemini
-- fallback because aria_provider_incidents had no way to record "we already
-- alerted about this incident" (recordAnthropicFailure only checks a 120s
-- OPEN_SEC window, so the row stays resolved_at=null indefinitely across a
-- long outage without ever being re-examined for alerting purposes).
-- Additive column — existing code/queries untouched.
ALTER TABLE aria_provider_incidents
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz NULL;

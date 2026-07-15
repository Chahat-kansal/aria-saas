-- BRIEF-INTEGRITY-2 item 1: aria_daily_briefings has THREE real writers (confirmed live via
-- source column values: generate-briefings.ts's "parallel" pipeline, daily-briefing-submit.ts/
-- daily-briefing-poll.ts's "batch" pipeline (source: batch_api/gemini_fallback/template_fallback),
-- and onboarding/provision's one-time "onboarding" welcome seed) sharing one UNIQUE
-- (business_id, briefing_date) constraint — whichever pipeline's upsert lands last for a given
-- business/day silently destroys the other's real, already-generated content. This makes each
-- pipeline's row for a given day a DISTINCT, preserved row instead.

ALTER TABLE aria_daily_briefings
  ADD COLUMN IF NOT EXISTS pipeline text;

-- Backfill from the existing free-text `source` column (live values confirmed via
-- `SELECT source, COUNT(*) FROM aria_daily_briefings GROUP BY source` before writing this
-- migration: batch_api=30, parallel=25, gemini_fallback=2, onboarding_template=1).
UPDATE aria_daily_briefings SET pipeline = CASE
  WHEN source = 'parallel' THEN 'parallel'
  WHEN source IN ('batch_api', 'gemini_fallback', 'template_fallback') THEN 'batch'
  WHEN source = 'onboarding_template' THEN 'onboarding'
  ELSE 'parallel' -- no other values exist live; safe, conservative default for any future NULL/unknown
END
WHERE pipeline IS NULL;

ALTER TABLE aria_daily_briefings
  ALTER COLUMN pipeline SET NOT NULL,
  ALTER COLUMN pipeline SET DEFAULT 'parallel',
  ADD CONSTRAINT aria_daily_briefings_pipeline_check CHECK (pipeline IN ('parallel', 'batch', 'onboarding'));

-- Replace the old two-column unique constraint (business_id, briefing_date) — the actual collision
-- surface — with one that includes the pipeline, so each pipeline's write for a given day persists
-- as its own row instead of racing to overwrite the same row.
ALTER TABLE aria_daily_briefings
  DROP CONSTRAINT aria_daily_briefings_business_id_briefing_date_key;

ALTER TABLE aria_daily_briefings
  ADD CONSTRAINT aria_daily_briefings_business_id_briefing_date_pipeline_key
  UNIQUE (business_id, briefing_date, pipeline);

COMMENT ON COLUMN aria_daily_briefings.pipeline IS
  'BRIEF-INTEGRITY-2: which of the three writers produced this row — parallel (generate-briefings.ts), batch (daily-briefing-submit/poll.ts, incl. its Gemini/template fallbacks), onboarding (onboarding/provision.ts one-time welcome seed). Part of the unique key with (business_id, briefing_date) so pipelines never silently overwrite each other.';

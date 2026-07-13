-- AI-COST-2 — idempotency guard (AI-COST-AUDIT-1 §1 live risk): withCronRetry wraps the ENTIRE
-- cron handler, not just the API call. If anything AFTER submitBatch() succeeds throws (e.g. a
-- Supabase write), the retry re-invokes the whole handler and submits a SECOND full Batch API job
-- for every business — the Batches API has no idempotency of its own across separate submissions.
--
-- submit_date defaults to CURRENT_DATE at insert time (mirrors submitted_at's DEFAULT now()). A
-- UNIQUE constraint on (job_type, submit_date) makes a same-day duplicate submission attempt fail
-- with a unique_violation, which the route treats as "already submitted today" and no-ops instead
-- of hitting the Batches API a second time.
ALTER TABLE aria_batch_jobs
  ADD COLUMN IF NOT EXISTS submit_date date NOT NULL DEFAULT CURRENT_DATE;

UPDATE aria_batch_jobs SET submit_date = submitted_at::date WHERE submitted_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_batch_jobs_job_type_submit_date
  ON aria_batch_jobs (job_type, submit_date);

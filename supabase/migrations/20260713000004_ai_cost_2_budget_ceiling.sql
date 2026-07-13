-- AI-COST-2 — per-business daily AI budget ceiling (AI-COST-AUDIT-1 follow-up). Config only,
-- default OFF (NULL = no ceiling). NOT for savings and never blocks an owner-initiated ask — this
-- is runaway protection (alert at 80%) now, with SaaS plan enforcement (actual blocking) queued as
-- a later sprint once ceilings are actually configured for real plans.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS ai_daily_budget_cents integer NULL,
  ADD COLUMN IF NOT EXISTS ai_budget_alert_sent_date date NULL;

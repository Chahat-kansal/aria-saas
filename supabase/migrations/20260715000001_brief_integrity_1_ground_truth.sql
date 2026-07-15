-- BRIEF-INTEGRITY-1: log the canonical revenue snapshot alongside the briefing it produced
-- (RULE 9 groundTruth) so the anti-repetition dedup block and any future advisor can read the
-- exact number used for that day instead of re-deriving it or scraping briefing text.
ALTER TABLE aria_daily_briefings
  ADD COLUMN IF NOT EXISTS ground_truth jsonb;

COMMENT ON COLUMN aria_daily_briefings.ground_truth IS
  'BRIEF-INTEGRITY-1: canonical revenue snapshot (getRevenueSnapshot) used to generate this briefing — {business_id, date, revenue, transaction_count, window_start, window_end, computed_at}.';

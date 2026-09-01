-- Applied to nxfzippunqvqsvkmwtjv on 1 Sep 2026 via Supabase MCP after founder approval.
-- Committed as the repo-side record; already live. Do not re-run.

-- ============================================================
-- PART D — the owner's only read path into mood.
-- ============================================================

CREATE VIEW team_mood_weekly
WITH (security_invoker = true) AS
SELECT business_id,
       week_start,
       count(*)::int          AS responses,
       round(avg(score), 2)   AS avg_score
FROM team_mood
GROUP BY business_id, week_start
HAVING count(*) >= 4;

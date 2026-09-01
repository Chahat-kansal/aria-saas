-- Applied to nxfzippunqvqsvkmwtjv on 1 Sep 2026 via Supabase MCP after founder approval.
-- Committed as the repo-side record; already live. Do not re-run.
--
-- Answers the TS-1 preflight question: the supersede link gets its own column,
-- not a jsonb key and not a repurposed id.
-- Reason: the superseded-by delta is part of the underwriting signal the moat
-- depends on, and a link buried in jsonb is not queryable. Verified before
-- deciding: proposal_id is non-null on 0 rows, action_id on 1 — so action_id is
-- in use and repurposing it would be semantic drift.

ALTER TABLE aria_autopilot_actions ADD COLUMN superseded_by uuid REFERENCES aria_autopilot_actions(id);

CREATE INDEX aria_autopilot_actions_superseded_by_idx ON aria_autopilot_actions (superseded_by) WHERE superseded_by IS NOT NULL;

COMMENT ON COLUMN aria_autopilot_actions.superseded_by IS 'The newer decision that replaced this one. Set together with status=''superseded''. Never set on a row that is still pending.';

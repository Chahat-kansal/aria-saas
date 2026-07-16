-- INTEL-CONTRACT-1 — daily_briefings already stores data_snapshot (the raw ground-truth context)
-- and recommendations (the rendered briefing cards), but nothing retains the Aria Intelligence
-- Contract assembled behind that response -- so once the request finishes, the facts/calculations/
-- assumptions/confidence/provenance backing the briefing are gone, and Part 3's owner-facing
-- "how Aria knows this" view would have nothing to read once the page reloads. Additive JSONB
-- column, RULE 10 pattern -- nullable, no default, existing rows unaffected.

ALTER TABLE daily_briefings
  ADD COLUMN IF NOT EXISTS contract jsonb;

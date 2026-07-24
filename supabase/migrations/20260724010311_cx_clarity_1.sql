-- CX-CLARITY-1 — persisted dismissal for the loop-explainer banner, for LINKED members only
-- (anonymous/unlinked visitors use localStorage per the task's own instruction — no server state
-- exists for them yet). Reuses the existing (member, business) link row rather than a new table.
ALTER TABLE community_member_loyalty_links ADD COLUMN IF NOT EXISTS banner_dismissed_at timestamptz;

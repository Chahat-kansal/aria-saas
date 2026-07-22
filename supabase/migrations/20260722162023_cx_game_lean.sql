-- CX-GAME-LEAN — levels + leaderboard + daily digest (display-only, no reward issuance).
--
-- PRE-FLIGHT finding: community_members (session/auth.users-based, cross-business — the identity
-- that comments/follows in the Pipel community) has NO schema link to pos_customers (the business-
-- scoped loyalty record with real points). They are two genuinely separate identity systems today.
-- This table is the opportunistic bridge: whenever a community member viewing/acting on business X
-- ALSO has a valid cx_session (loyalty) for X in the same request, the link is recorded here. No new
-- verification UI/flow — a member with no link simply shows no chip/rank, identical to the spec's own
-- "not a loyalty member of this business" fallback.
CREATE TABLE IF NOT EXISTS community_member_loyalty_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES community_members(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  loyalty_identity_id uuid NOT NULL REFERENCES loyalty_identity(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES pos_customers(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, business_id)
);
CREATE INDEX IF NOT EXISTS community_member_loyalty_links_customer ON community_member_loyalty_links (business_id, customer_id);

-- Leaderboard snapshot — one row per (business, period), latest only (upsert), per spec.
CREATE TABLE IF NOT EXISTS community_leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('7d', '30d', 'all')),
  rows jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, period)
);

-- Opt-out of appearing on any business's leaderboard (privacy). Nullable-safe default false —
-- existing rows are unaffected (nobody is silently opted out by this migration).
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS leaderboard_opt_out boolean NOT NULL DEFAULT false;
-- Last time the daily digest email was sent to this customer — needed to compute a truthful points
-- delta ("since last digest") rather than an arbitrary fixed window.
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS last_digest_at timestamptz;

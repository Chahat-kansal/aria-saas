-- CX-GAME-2 — level-up + top-3 leaderboard reward issuance (money-adjacent, PRELOAD-grade care).

-- Per-business level thresholds + perk overrides. pointsToLevel() falls back to the hardcoded L1-L5
-- thresholds (lib/community/levels.ts) when a business has zero rows here.
CREATE TABLE IF NOT EXISTS community_level_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  level int NOT NULL CHECK (level BETWEEN 1 AND 10),
  min_points int NOT NULL CHECK (min_points >= 0),
  name text NOT NULL,
  perk_reward_rule_id uuid REFERENCES loyalty_reward_rules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, level)
);

-- Level-up award ledger — the idempotency gate IS the UNIQUE constraint (insert-first-then-issue:
-- a conflict here means "already issued, never re-issue", checked BEFORE the ledger is touched).
-- Keyed on loyalty_identity_id, never member_id — a community_member_loyalty_links re-link (delete +
-- recreate, e.g. a different device) can never cause a second issuance for the same identity+level.
CREATE TABLE IF NOT EXISTS community_level_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  loyalty_identity_id uuid NOT NULL REFERENCES loyalty_identity(id) ON DELETE CASCADE,
  level int NOT NULL,
  snapshot_points int NOT NULL,
  reward_rule_id uuid REFERENCES loyalty_reward_rules(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  -- Set when the ledger issuance itself failed AFTER the award row was already claimed (insert
  -- succeeded, awardPointsViaLedger threw). The row is NOT deleted and NOT blindly retried — it
  -- surfaces here for the owner to see and the cron to explicitly re-attempt only rows with this set.
  issue_error text,
  UNIQUE (business_id, loyalty_identity_id, level)
);

-- Weekly top-3 leaderboard reward config — one row per business, per-rank reward rule (nullable =
-- that rank isn't rewarded). No row / all-null columns = feature off by default (owner opts in).
CREATE TABLE IF NOT EXISTS community_leaderboard_config (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  rank1_reward_rule_id uuid REFERENCES loyalty_reward_rules(id) ON DELETE SET NULL,
  rank2_reward_rule_id uuid REFERENCES loyalty_reward_rules(id) ON DELETE SET NULL,
  rank3_reward_rule_id uuid REFERENCES loyalty_reward_rules(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Weekly leaderboard award ledger — same insert-first-then-issue idempotency discipline.
CREATE TABLE IF NOT EXISTS community_leaderboard_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  loyalty_identity_id uuid NOT NULL REFERENCES loyalty_identity(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 3),
  reward_rule_id uuid NOT NULL REFERENCES loyalty_reward_rules(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, loyalty_identity_id, period_start)
);

-- Human gate for a bulk first-run backfill (a long-time member crossing L1->L4+ at once, multiplied
-- across every linked identity, on the very first cron run for a business). One pending proposal per
-- business at a time (partial unique index) — the cron checks for an existing pending row before
-- creating a new one, so re-evaluating daily while unapproved doesn't pile up duplicate proposals.
CREATE TABLE IF NOT EXISTS community_backfill_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- [{loyalty_identity_id, customer_id, level, snapshot_points}] — the exact real rows that WOULD be
  -- issued if approved (GROUNDING-TEETH: approval acts on this real computed snapshot, not a re-guess).
  proposal jsonb NOT NULL,
  awards_pending int NOT NULL,
  identity_count int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS community_backfill_review_queue_one_pending
  ON community_backfill_review_queue (business_id) WHERE status = 'pending';

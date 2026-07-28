-- OWNER-APP PH-1 — the decision registry every phone tab reads.
--
-- REUSE, not CREATE: aria_autopilot_actions already models "propose -> owner approves" almost
-- exactly (id, business_id FK cascade, category, priority CHECK, title, description, action_data
-- jsonb, status CHECK, approved_at, executed_at, expires_at, reasoning, outcome, confidence) and is
-- already ACTIVELY used by 4 existing agents (271 pending 'inventory' rows, 56 'compliance'/
-- bas_reminder, 15 reputation_defence recommendations, sales/cashflow rows) with correct RLS
-- already in place (own_autopilot: business_id IN (SELECT id FROM businesses WHERE user_id =
-- auth.uid())) and an index that already covers (business_id, status, created_at DESC). Creating a
-- parallel `owner_decisions` table would split one concept (decisions awaiting the owner) across
-- two tables for no reason. Every column below is additive (RULE0); zero existing rows change
-- shape or meaning.
--
-- Column mapping vs the brief's suggested schema (reused instead of duplicated):
--   payload jsonb      -> action_data (already exists, already this exact purpose)
--   aria_reason text   -> reasoning (already exists, already this exact purpose)
--   status vocabulary  -> the EXISTING CHECK (pending/approved/rejected/executed/dismissed/expired)
--                         is reused as-is: 'pending' serves the brief's 'waiting', 'rejected'
--                         serves the brief's 'declined' — two words for one state is exactly the
--                         drift class this repo's other sprints (SS-RECONCILE) have been fixing,
--                         so the owner-app's own code adapts to the existing vocabulary rather than
--                         adding synonyms. Only 'superseded' is genuinely new (no existing state
--                         covers "a newer decision replaced this one") — added to the CHECK.
--
-- Genuinely new columns (nothing existing covers these):
alter table aria_autopilot_actions add column if not exists domain text
  check (domain in ('money','people','growth','supply','compliance'));
alter table aria_autopilot_actions add column if not exists kind text;
alter table aria_autopilot_actions add column if not exists outlet_id uuid references pos_outlets(id);
alter table aria_autopilot_actions add column if not exists amount_cents bigint;
alter table aria_autopilot_actions add column if not exists requires_stepup boolean not null default false;
alter table aria_autopilot_actions add column if not exists resolved_by uuid;
alter table aria_autopilot_actions add column if not exists resolved_at timestamptz;
alter table aria_autopilot_actions add column if not exists created_by text not null default 'aria';

-- Widen the status CHECK additively (existing values untouched, 'superseded' added).
alter table aria_autopilot_actions drop constraint if exists aria_autopilot_actions_status_check;
alter table aria_autopilot_actions add constraint aria_autopilot_actions_status_check
  check (status = any (array['pending','approved','rejected','executed','dismissed','expired','superseded']));

-- Backfill domain on existing rows from their real category/agent_type — a real inference over
-- real existing data (GROUNDING-TEETH: not inventing new facts, categorizing rows that already
-- exist). Left NULL where the mapping is genuinely ambiguous (e.g. the single flash_intervention
-- row with no category/agent_type) rather than guessing.
update aria_autopilot_actions set domain = 'supply' where domain is null and category = 'inventory';
update aria_autopilot_actions set domain = 'compliance' where domain is null and category = 'compliance';
update aria_autopilot_actions set domain = 'money' where domain is null and category in ('sales','cashflow');
update aria_autopilot_actions set domain = 'growth' where domain is null and agent_type = 'reputation_defence';

-- New index for the domain filter (the existing idx_autopilot_business_status already covers
-- business_id/status/created_at — this adds domain to that same shape for the Decisions tab's
-- domain-filter query).
create index if not exists idx_autopilot_business_status_domain
  on aria_autopilot_actions (business_id, status, domain);

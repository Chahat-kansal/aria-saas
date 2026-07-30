-- MANAGER-AGENT-1 — the Store Manager orchestration layer.
--
-- WHAT THIS IS: the owner is the CEO; the domain agents do 100% of the labour; the Store Manager
-- assigns work to them, REVIEWS their output, sends back what's wrong, and consolidates the rest
-- into ONE briefing. It does no domain labour itself. These two tables are its memory: what it
-- reviewed (and why it rejected things), and what it did entirely on its own.
--
-- ★ THE AUTHORITY RULE — WHY THERE IS NO "AGENT COMMITTED THIS" TABLE ★
-- Autonomy must NOT remove owner control. The manager carries LABOUR to done; the owner keeps
-- AUTHORITY over anything that leaves a mark. The propose-approve gate (PH-1) is UNEDITED by this
-- sprint. The manager may act alone ONLY when an action is ALL FOUR of: invisible (nothing outside
-- the business sees it), reversible, zero-cost, and touching no customer/roster/money. Everything
-- else is drafted to done and released by the owner's tap via the existing aria_autopilot_actions
-- decision gate.
--
-- autonomy_ledger below therefore records ONLY that safe class. It is deliberately NOT a general
-- "things the agent did" log — if a marked action ever appeared here it would mean the gate had
-- been bypassed, which src/lib/manager/authority.ts makes structurally impossible (assertSafe()
-- throws rather than letting a marked action through). "Act then report" is the wrong direction
-- and is not implemented.

-- ── manager_reviews — every proposal the manager judged, including the ones it KILLED ────────────
-- The rejects are the point: they are the proposals that never reached the owner, and the record of
-- why. Without this the manager's corrections would be invisible and unauditable.
create table if not exists manager_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  run_id uuid not null,                   -- groups one manager pass
  agent_type text not null,               -- which domain agent produced the proposal
  proposal_title text,
  verdict text not null check (verdict in ('approved', 'rejected', 'annotated')),
  -- Why it was rejected/annotated. Reuses the named failure classes the briefing guards already
  -- fight, so a reviewer can see WHICH class caught it, not just that something did.
  reason_code text check (reason_code in (
    'invented_figure',        -- a $/% with no anchor in real data (ground-guard)
    'dormant_not_broken',     -- catastrophising a quiet business (health-signals INSUFFICIENT_SAMPLE)
    'contradictory',          -- conflicts with another surviving proposal or a HIGH alert
    'stale_data',             -- built on data health-signals flags as stale
    'scaffold_leak',          -- raw prompt scaffolding in owner-facing text
    'duplicate'               -- same substance as another proposal this run
  )),
  reason_detail text,
  decision_id uuid,                       -- set when approved and routed through createDecision()
  created_at timestamptz not null default now()
);
create index if not exists idx_manager_reviews_business_run on manager_reviews (business_id, run_id);
create index if not exists idx_manager_reviews_business_created on manager_reviews (business_id, created_at desc);

-- ── autonomy_ledger — ONLY invisible+reversible+free+unmarked actions ────────────────────────────
-- The "report" half of the safe class, so the owner can review after the fact. Every row must
-- satisfy all four safety predicates; they are stored explicitly (not implied) so an audit can
-- verify the claim rather than trust it, and so a future loosening of the rule is visible in data.
create table if not exists autonomy_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  run_id uuid,
  action_kind text not null,
  summary text not null,
  -- All four MUST be true for a row to exist here — enforced by the CHECK below, not just by code.
  is_invisible boolean not null,
  is_reversible boolean not null,
  is_zero_cost boolean not null,
  touches_no_marked_domain boolean not null,   -- no customer / roster / money
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint autonomy_ledger_safe_class_only check (
    is_invisible and is_reversible and is_zero_cost and touches_no_marked_domain
  )
);
create index if not exists idx_autonomy_ledger_business_created on autonomy_ledger (business_id, created_at desc);

-- RLS — owner-scoped read on both; writes are server-only (service_role bypasses RLS; no insert
-- policy is granted to authenticated, so a browser can never forge a review verdict or an autonomy
-- entry). Matches the PH-1/PH-4 owner-app pattern.
alter table manager_reviews enable row level security;
drop policy if exists manager_reviews_owner_read on manager_reviews;
create policy manager_reviews_owner_read on manager_reviews for select
  using (business_id in (select id from businesses where user_id = auth.uid()));

alter table autonomy_ledger enable row level security;
drop policy if exists autonomy_ledger_owner_read on autonomy_ledger;
create policy autonomy_ledger_owner_read on autonomy_ledger for select
  using (business_id in (select id from businesses where user_id = auth.uid()));

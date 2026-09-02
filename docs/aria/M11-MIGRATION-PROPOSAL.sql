-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- M11 PHASE 2 — PROPOSED DDL.  NOT APPLIED.  NOT A MIGRATION FILE.
--
-- RULE 10a: DDL is never mine. This file is a PROPOSAL for the founder to read, approve or reject.
-- It deliberately does NOT live in supabase/migrations/ — a file in that directory reads as
-- something that has been or will be applied, and this has not been.
--
-- The full evidence for why each object is needed is in M11-PHASE-2-PLAN-STORAGE.md. The short
-- version: aria_autopilot_actions already carries everything a STEP needs, including a status CHECK
-- with exactly the right seven values. What has nowhere to live is (1) the owner's request and the
-- plan's own state, and (2) the ORDER of the steps.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
-- It is NOT a second action registry. Steps stay in aria_autopilot_actions and gain two columns.
-- Nothing is moved, nothing is copied, no existing row changes, and every existing reader of that
-- table keeps working unchanged — both new columns are nullable and NULL means "not part of a
-- plan", which is true of all 817 rows today.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ── 1. THE PLAN ────────────────────────────────────────────────────────────────────────────────
-- One row per delegated job. Holds only what has nowhere to live in the action tables: the owner's
-- own words, the conversation it came from, the plan's state, and the report.

create table if not exists public.aria_plans (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,

  -- The Ask Aria thread this was delegated from. Deliberately NOT a foreign key to
  -- aria_conversations: a plan that outlives a deleted thread is still a true record of work that
  -- was done, and this repo's delete is a soft tombstone anyway (aria_conversations.deleted_at).
  -- M11 phase 1 put this same id in the URL, so a plan is reachable from its conversation and back.
  conversation_id   uuid,

  -- THE OWNER'S OWN WORDS, verbatim. Not a summary and not a normalisation: "what did I actually
  -- ask for" is the only thing that can settle whether a report answered it.
  request           text not null,

  -- Aria's one-line name for the job. Shown in history.
  title             text not null,

  status            text not null default 'proposed'
    check (status in (
      'proposed',    -- shown to the owner, nothing has run
      'approved',    -- the owner said go; safe steps may run
      'running',     -- at least one step has started
      'reported',    -- finished, and the report has been written. NOT "succeeded" — a plan whose
                     -- steps all failed is still reported, and that report is the deliverable
      'abandoned'    -- the owner declined it, or it was superseded
    )),

  -- Why a plan could not be formed, when it could not. NULL for every plan that exists.
  -- "Aria must be able to say a request cannot be planned" — this is where that sentence goes.
  unplannable_reason text,

  -- The report, once written. Prose the owner reads; the per-step truth stays on the step rows so
  -- the report can never disagree with the record it is generated from.
  report            text,

  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid,
  completed_at      timestamptz
);

create index if not exists aria_plans_biz_recent_idx
  on public.aria_plans (business_id, created_at desc);

-- History reopens a plan from its conversation. Partial: most plans may have no thread.
create index if not exists aria_plans_conversation_idx
  on public.aria_plans (conversation_id) where conversation_id is not null;


-- ── 2. THE STEPS ARE THE EXISTING REGISTRY, PLUS TWO COLUMNS ───────────────────────────────────
-- Both nullable. NULL plan_id = "this action is not part of a plan", which is every one of the 817
-- rows that exist today, so nothing is backfilled and no existing query changes meaning.

alter table public.aria_autopilot_actions
  add column if not exists plan_id uuid references public.aria_plans(id) on delete cascade;

-- THE ORDER. This is the column the whole proposal exists for: there is no ordinal anywhere in the
-- schema today, and the two ways to fake one (ordering by created_at, or a field inside
-- action_data jsonb) are respectively an accident waiting to break and the thing the sprint
-- forbids by name. 1-based, so the first step is "step 1" in the report as well as in the row.
alter table public.aria_autopilot_actions
  add column if not exists step_index integer;

comment on column public.aria_autopilot_actions.plan_id is
  'M11: the aria_plans row this action is a step of. NULL means a standalone action — the case for '
  'every row created before M11. Never set without step_index.';

comment on column public.aria_autopilot_actions.step_index is
  'M11: 1-based position of this step within its plan. Never set without plan_id. The pair is '
  'unique — see aria_autopilot_actions_plan_step_uniq.';

-- Both or neither. A plan_id with no order is an unordered plan; an order with no plan is noise.
alter table public.aria_autopilot_actions
  add constraint aria_autopilot_actions_plan_step_together
  check ((plan_id is null) = (step_index is null));

-- THE IDEMPOTENCY THE SPRINT ASKS FOR, ENFORCED BY THE DATABASE RATHER THAN BY CODE.
-- "A refresh or double-approve must never run a step twice." With this index, re-submitting a plan
-- cannot create a second copy of step 3: the second insert is a 23505 and the caller reads that as
-- "already there", the same pattern TS-1 phase 3 uses for poll votes. Uniqueness belongs to the
-- database, never to a preceding SELECT.
create unique index if not exists aria_autopilot_actions_plan_step_uniq
  on public.aria_autopilot_actions (plan_id, step_index) where plan_id is not null;

-- Reading a plan's steps in order.
create index if not exists aria_autopilot_actions_plan_idx
  on public.aria_autopilot_actions (plan_id, step_index) where plan_id is not null;


-- ── 3. RLS ─────────────────────────────────────────────────────────────────────────────────────
-- Matching what aria_autopilot_actions already does. Every server read in this codebase uses
-- supabaseAdmin (which bypasses RLS) and filters by business_id in the query, so the policy is
-- belt to that braces — but a table without one is a table nobody can safely read from the client.

alter table public.aria_plans enable row level security;

create policy aria_plans_owner_select on public.aria_plans
  for select using (
    business_id in (select id from public.businesses where user_id = auth.uid())
  );


-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OPTIONAL — NOT PART OF THE ASK, AND NOT RECOMMENDED WITHOUT A DECISION
--
-- Phase 6 says "the owner sees what it cost, before and after". There is no honest source for that
-- today: aria_ai_calls has NO linking column at all — no conversation_id, no request_id, no
-- trace_id (confirmed by querying its columns; 11,029 rows carry cost_usd_cents and none of them
-- can be attributed to a job). The only way to attribute cost without a link is a time window,
-- which would be a fabricated number, and GROUNDING-TEETH says an honest "unknown" beats a
-- plausible figure.
--
-- The fix, IF the founder wants per-job cost, is one nullable column:
--
--   alter table public.aria_ai_calls add column if not exists plan_id uuid;
--   create index if not exists aria_ai_calls_plan_idx
--     on public.aria_ai_calls (plan_id) where plan_id is not null;
--
-- It is separated here because it touches the cost ledger — the thing AI-COST-AUDIT-1 found was
-- already undercounting real spend by roughly half — and that deserves its own look rather than
-- riding along with a feature migration. Until it exists, a job's cost renders as UNKNOWN, not 0.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

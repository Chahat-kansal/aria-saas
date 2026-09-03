-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- M11 — aria_plans.  ✅ APPLIED TO PRODUCTION 3 SEP 2026 as migration 20260903010832_m11_aria_plans.
--
-- ── STATUS, UPDATED BY M11B PHASE 0 ────────────────────────────────────────────────────────────
-- This file was a PROPOSAL. It has been approved, applied, and verified live. The SQL below is now
-- the SQL THAT ACTUALLY RAN, byte-identical to
-- `supabase/migrations/20260903010832_m11_aria_plans.sql` and to
-- `supabase_migrations.schema_migrations` — so the repo, this document and production all say the
-- same thing. `git-migration ≠ prod-schema` drift is a documented recurring failure here and it had
-- happened again: the migration existed only in production until M11B phase 0 committed it.
--
-- ── WHAT CHANGED BETWEEN THE PROPOSAL AND WHAT RAN ─────────────────────────────────────────────
-- Recorded rather than silently absorbed, because "the file in git is what ran" has to be a claim
-- somebody can check.
--
--   1. `add constraint` and `create policy` had NO existence guard and would have failed on any
--      re-run. Each is now wrapped in a `do $$ … end $$` block that checks `pg_constraint` /
--      `pg_policies` first. Everything else already used `if not exists`.
--   2. The two `comment on column` texts were SHORTENED when applied. The live comments are the
--      ones below; the proposal's longer versions ("— the case for every row created before M11",
--      "The pair is unique — see aria_autopilot_actions_plan_step_uniq") are not in production and
--      this file no longer claims they are.
--
-- Nothing else differs: same table, same 12 columns, same status CHECK, same 5 indexes, same FK,
-- same paired CHECK, same RLS policy.
--
-- ── VERIFIED LIVE, M11B PHASE 0 (my own query, not the hand-over's) ────────────────────────────
--   table aria_plans .............. 1        aria_plans columns ........... 12
--   apa.plan_id + step_index ...... 2        indexes (5 named) ............. 5
--   paired CHECK .................. 1        RLS enabled ................... true
--   RLS policy .................... 1
--   aria_autopilot_actions rows ... 819      of those with plan_id ......... 0
--   aria_plans rows ............... 0
-- 819 rows intact, none carrying a plan — so no existing reader's results changed, which is the
-- property that made both columns safe to add nullable.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────────────────────
-- It is NOT a second action registry. Steps live in aria_autopilot_actions and gained two columns.
-- Nothing was moved, copied or backfilled, and every existing reader kept working unchanged: both
-- new columns are nullable and NULL means "not part of a plan", which was true of all 819 rows.
--
-- ── THE COLUMN THE WHOLE THING EXISTS FOR ─────────────────────────────────────────────────────
-- `step_index`. There was no ordinal anywhere in the schema, and the two ways to fake one are a
-- trap each: ordering by `created_at` breaks silently the moment anyone batches the insert (now()
-- is the transaction timestamp, identical for every row in one statement), and a step order inside
-- `action_data` jsonb is unindexable, unconstrainable, and the smuggling M11 was told not to do.
--
-- `aria_autopilot_actions_plan_step_uniq` is the other half: idempotency belongs to the DATABASE.
-- Re-submitting a plan cannot create a second copy of step 3 — the second insert is a 23505 and the
-- caller reads that as "already there", the same pattern TS-1 phase 3 used for poll votes. Never
-- re-implement it with a preceding SELECT.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.aria_plans (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  conversation_id   uuid,
  request           text not null,
  title             text not null,
  status            text not null default 'proposed'
    check (status in ('proposed','approved','running','reported','abandoned')),
  unplannable_reason text,
  report            text,
  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid,
  completed_at      timestamptz
);

create index if not exists aria_plans_biz_recent_idx
  on public.aria_plans (business_id, created_at desc);

create index if not exists aria_plans_conversation_idx
  on public.aria_plans (conversation_id) where conversation_id is not null;

alter table public.aria_autopilot_actions
  add column if not exists plan_id uuid references public.aria_plans(id) on delete cascade;

alter table public.aria_autopilot_actions
  add column if not exists step_index integer;

comment on column public.aria_autopilot_actions.plan_id is
  'M11: the aria_plans row this action is a step of. NULL means a standalone action. Never set without step_index.';

comment on column public.aria_autopilot_actions.step_index is
  'M11: 1-based position of this step within its plan. Never set without plan_id.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aria_autopilot_actions_plan_step_together'
  ) then
    alter table public.aria_autopilot_actions
      add constraint aria_autopilot_actions_plan_step_together
      check ((plan_id is null) = (step_index is null));
  end if;
end $$;

create unique index if not exists aria_autopilot_actions_plan_step_uniq
  on public.aria_autopilot_actions (plan_id, step_index) where plan_id is not null;

create index if not exists aria_autopilot_actions_plan_idx
  on public.aria_autopilot_actions (plan_id, step_index) where plan_id is not null;

alter table public.aria_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='aria_plans'
      and policyname='aria_plans_owner_select'
  ) then
    create policy aria_plans_owner_select on public.aria_plans
      for select using (
        business_id in (select id from public.businesses where user_id = auth.uid())
      );
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STILL NOT APPLIED, AND STILL NOT RECOMMENDED WITHOUT A DECISION — per-job cost.
--
-- M11 phase 6 wanted "the owner sees what it cost". There is no honest source: aria_ai_calls has NO
-- linking column at all — no conversation_id, no request_id, no trace_id (confirmed by listing its
-- columns; 11,029 rows carry cost_usd_cents and none can be attributed to a job). The only way to
-- attribute cost without a link is a time window, which would be a fabricated number, and
-- GROUNDING-TEETH says an honest "unknown" beats a plausible figure.
--
-- IF the founder wants per-job cost, it is one nullable column:
--
--   alter table public.aria_ai_calls add column if not exists plan_id uuid;
--   create index if not exists aria_ai_calls_plan_idx
--     on public.aria_ai_calls (plan_id) where plan_id is not null;
--
-- Separated because it touches the cost ledger AI-COST-AUDIT-1 found was already undercounting real
-- spend by roughly half, and that deserves its own look rather than riding along with a feature
-- migration. Until it exists, a job's cost renders UNKNOWN, not 0. M11B phase 5 does exactly that.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

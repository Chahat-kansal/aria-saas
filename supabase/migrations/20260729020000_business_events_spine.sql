-- OWNER-APP PH-2, Part B — the outcome/event spine.
--
-- WHY (deliberate, not scope creep): Aria's durable moat is proprietary compounding data — it (1)
-- benchmarks a business against its cohort and (2) underwrites future embedded-finance (cash
-- advances against card sales). Both need a CLEAN, append-only record of what was decided and how
-- it turned out. This is near-free to capture now, at the exact moments a decision resolves or a
-- job finishes, and impossible to reconstruct retroactively once those moments have passed
-- uncaptured. This migration lays the SPINE only — no benchmarking queries, no cross-business
-- reads, no payments/transaction capture, no cohort logic. Those are separate, later epics gated
-- behind launch and a licensing pass.
--
-- business_events is the ANALYTICS-grade parallel to activity_log (PH-1's human-audit trail) —
-- typed, small, immutable, cohort-ready. Deliberately NOT merged with activity_log: activity_log
-- stays free-text/human-readable audit; business_events stays a narrow, structured, append-only
-- fact table a future benchmarking/underwriting job can scan cheaply without parsing prose.
create table if not exists business_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  entity_type text not null check (entity_type in ('decision', 'job')),
  entity_id uuid not null,
  event_type text not null check (event_type in (
    'proposed', 'approved', 'declined', 'expired',
    'job_created', 'job_completed', 'job_failed'
  )),
  domain text, -- mirrors the decision's domain (money/people/growth/supply/compliance); null for job events with no single domain
  amount_cents bigint,
  actor text not null check (actor in ('aria', 'owner', 'cron')),
  -- SMALL by design (brief's own instruction) — only what benchmarking/underwriting will need:
  -- kind, domain, amount, decided-vs-proposed (was the approved amount/kind different from what
  -- was proposed), latency_seconds (how long the owner took to decide). NEVER the whole
  -- aria_autopilot_actions/aria_user_tasks row — this table must stay cheap to scan at scale.
  payload_summary jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_business_events_business_time on business_events (business_id, occurred_at);
create index if not exists idx_business_events_business_entity_event on business_events (business_id, entity_type, event_type);

-- Append-only: INSERT server-only (service_role), owner-scoped READ, no UPDATE/DELETE policy at
-- all (Postgres RLS defaults to deny when no policy matches a command — there is deliberately no
-- update/delete policy here, so even a service_role mistake at the APPLICATION layer still can't
-- update/delete through PostgREST; a real correction is a new compensating event row, never an
-- edit to history).
alter table business_events enable row level security;
create policy business_events_owner_read on business_events for select
  using (business_id in (select id from businesses where user_id = auth.uid()));
create policy business_events_service_insert on business_events for insert
  with check (auth.role() = 'service_role');

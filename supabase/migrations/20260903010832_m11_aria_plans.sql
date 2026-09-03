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

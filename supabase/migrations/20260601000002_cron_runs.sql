-- cron_runs: persistent record of every cron execution for health dashboards + alerting
create table if not exists public.cron_runs (
  id            uuid primary key default gen_random_uuid(),
  cron_name     text not null,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  status        text not null default 'running' check (status in ('running','completed','failed')),
  duration_ms   integer,
  rows_affected integer,
  error         text,
  metadata      jsonb
);

create index if not exists cron_runs_cron_name_started_at_idx on public.cron_runs (cron_name, started_at desc);
create index if not exists cron_runs_status_idx on public.cron_runs (status);

-- No RLS: cron_runs is server-only, never exposed to clients.
-- Retain 90 days of history.
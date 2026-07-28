-- OWNER-APP PH-2, Part A — Jobs/delegation model.
--
-- REUSE, not CREATE: aria_user_tasks already models exactly "create a job from a plain-language
-- ask -> queued -> running -> done/failed, with a deliverable reference" (id, business_id FK
-- cascade, title, task_prompt, status CHECK(queued/running/done/failed), output_id FK ->
-- aria_task_outputs, notify_email, started_at/completed_at/created_at) and is already wired to a
-- real execution path (api/aria/ask/route.ts inserts queued rows and fires
-- api/aria/process-user-task/route.ts via Vercel's waitUntil() — genuine background execution
-- that survives the client disconnecting, bounded by that function's own 300s maxDuration, not a
-- fully durable/retriable queue). aria_task_outputs is the existing deliverable-storage table
-- (render_html/pdf_url/data_snapshot/share_token) and needs no changes — it's already exactly
-- "result_ref". Creating a parallel `aria_jobs` table would split one concept across two tables.
--
-- Additive columns only (RULE0) — every existing aria_user_tasks row is unaffected:
alter table aria_user_tasks add column if not exists spec jsonb not null default '{}'::jsonb;
alter table aria_user_tasks add column if not exists steps jsonb not null default '[]'::jsonb;
alter table aria_user_tasks add column if not exists progress_step integer not null default 0;
alter table aria_user_tasks add column if not exists schedule text; -- null = one-shot; else 'sun_20:00'/'mon_07:00'/'quarterly' etc
alter table aria_user_tasks add column if not exists enabled boolean not null default true;
alter table aria_user_tasks add column if not exists created_by text not null default 'owner';
alter table aria_user_tasks add column if not exists updated_at timestamptz not null default now();
alter table aria_user_tasks add column if not exists last_run_at timestamptz;

-- Widen the status CHECK additively — 'needs_input'/'cancelled' are genuinely new states (a
-- one-shot ask never needed either; a standing job can now be cancelled and a job can need owner
-- clarification mid-run). Existing values untouched.
alter table aria_user_tasks drop constraint if exists aria_user_tasks_status_check;
alter table aria_user_tasks add constraint aria_user_tasks_status_check
  check (status = any (array['queued','running','needs_input','done','failed','cancelled']));

-- A job's produced decisions are NOT a new FK column — they're tagged inline in
-- aria_autopilot_actions.action_data->>'source_job_id' (the same jsonb column every one of the
-- 30 existing writers of that table already populates per-row), so the Jobs tab can look up
-- "what did this job produce" without a new coupling column, and existing writers of
-- aria_autopilot_actions that never set source_job_id are entirely unaffected.

create index if not exists idx_aria_user_tasks_business_status on aria_user_tasks (business_id, status);
create index if not exists idx_aria_user_tasks_schedule on aria_user_tasks (business_id, schedule) where schedule is not null;

-- RLS — aria_user_tasks had none (it was only ever written/read server-side via supabaseAdmin in
-- ask/route.ts and process-user-task/route.ts). The owner-app's Jobs tab reads via the
-- REQUEST-SCOPED client (matching PH-1's own_autopilot pattern on aria_autopilot_actions), so it
-- needs an explicit owner-scoped policy — additive, does not change the existing server-side
-- (service-role) write paths at all, since service_role bypasses RLS regardless.
alter table aria_user_tasks enable row level security;
drop policy if exists owner_app_own_tasks on aria_user_tasks;
create policy owner_app_own_tasks on aria_user_tasks for all
  using (business_id in (select id from businesses where user_id = auth.uid()));

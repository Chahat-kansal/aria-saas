-- ASK-ARIA-FORTRESS

-- PILLAR 1: register the Ask Aria actions kill-switch (KILL semantics — default NOT killed = actions ON, RULE 0).
-- Killed when is_globally_enabled=true (global break-glass) OR business id listed in enabled_for_business_ids
-- (per-business). Env ARIA_ACTIONS_KILL=1 overrides everything. No row / all-false = actions enabled.
insert into feature_flags (flag_key, label, description, is_globally_enabled)
select 'aria_actions_kill',
       'Ask Aria actions kill switch',
       'When globally enabled OR a business id is in enabled_for_business_ids, Ask Aria refuses ALL write actions (reads still work). Break-glass: env ARIA_ACTIONS_KILL=1. Default off = actions enabled.',
       false
where not exists (select 1 from feature_flags where flag_key = 'aria_actions_kill');

-- PILLAR 2: make aria_action_log APPEND-ONLY for the owner client (select + insert only; no update/delete).
-- The executor's logging and the rollback stamp run via service-role (bypass RLS), so rollback still works;
-- the owner client can read + append its audit trail but can never tamper (update/delete) it.
drop policy if exists aria_action_log_business_owner on aria_action_log;

create policy aria_action_log_select on aria_action_log
  for select using (business_id in (select id from businesses where user_id = auth.uid()));

create policy aria_action_log_insert on aria_action_log
  for insert with check (business_id in (select id from businesses where user_id = auth.uid()));

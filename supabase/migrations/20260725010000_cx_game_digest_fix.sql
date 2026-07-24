-- CX-GAME-DIGEST-FIX — atomic "claim today's digest send" guard for a single customer.
--
-- Real incident (2026-07-24): two digest emails landed for the same identity in the same minute,
-- with contradictory content (one said +100 points, the other said +0; ranks disagreed too). Root
-- cause: sendDailyDigests() read pos_customers.last_digest_at, computed a delta, sent the email,
-- THEN wrote last_digest_at — a read-then-write gap with no lock, so two independent invocations
-- close together (the real hourly cron + a manual test-digest run) both read the same stale
-- last_digest_at and both sent.
--
-- This function makes the claim atomic: SELECT ... FOR UPDATE takes a row lock, so a concurrent
-- second call for the SAME customer blocks until the first call's transaction commits, then sees
-- the already-updated last_digest_at and correctly reports claimed=false. No separate read-then-
-- write from the caller's side is possible.
--
-- p_force bypasses ONLY the same-day check (still atomic, still returns the real previous value) —
-- for scripts/send-test-digest.ts's --force flag, so a founder testing twice in a row can force a
-- second send without editing the DB by hand, while the real cron never passes force=true.
create or replace function claim_daily_digest_send(p_customer_id uuid, p_force boolean default false)
returns table(claimed boolean, previous_last_digest_at timestamptz)
language plpgsql
as $$
declare
  v_previous timestamptz;
begin
  select last_digest_at into v_previous
  from pos_customers
  where id = p_customer_id
  for update;

  if not p_force and v_previous is not null and v_previous >= date_trunc('day', now()) then
    return query select false, v_previous;
    return;
  end if;

  update pos_customers set last_digest_at = now() where id = p_customer_id;

  return query select true, v_previous;
end;
$$;

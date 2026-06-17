-- DELETE-RIGHTS-FIX: a sanctioned in-band path for legitimate account deletion (AU Privacy Act
-- APP "delete my data" right) past the protect_critical_data hard-delete guard.
--
-- protect_critical_data flat-raises on ANY delete of 8 critical tables (accidental-delete guard —
-- KEEP). Legitimate account deletion collided with it and failed at the first guarded table. We add
-- a transaction-local sanction flag: the guard now permits a delete IFF app.allow_account_deletion
-- is 'on'. The flag is set ONLY by purge_account_data() (below), a SECURITY DEFINER function that
-- first derives the owner from auth.uid() and deletes only that caller's OWN data, all in one
-- transaction. Absent the flag, every normal/accidental delete is still blocked exactly as before.

-- 1) Guard honours the transaction-local sanction flag (default behaviour UNCHANGED).
create or replace function public.protect_critical_data()
returns trigger
language plpgsql
as $function$
begin
  -- Sanctioned account-deletion path only: a transaction-local flag set server-side by
  -- purge_account_data() after it has verified ownership via auth.uid(). SET LOCAL/set_config
  -- with is_local=true means the flag cannot outlive the purge transaction or leak to other ops.
  if current_setting('app.allow_account_deletion', true) = 'on' then
    return old;
  end if;
  raise exception
    'Hard DELETE is disabled on this table (%). Use soft delete (archived, status, voided) instead. To perform a genuine delete, drop this trigger first via the Supabase dashboard.',
    TG_TABLE_NAME;
  return null;
end;
$function$;

-- 2) Sanctioned purge: derives the owner from auth.uid() (the verified session — never client
--    input), sets the transaction-local flag, and removes the caller's OWN business data in
--    FK-safe order (children before parents). Atomic: all-or-nothing.
create or replace function public.purge_account_data()
returns uuid[]
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_business_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- transaction-local sanction (is_local = true) — scoped to THIS function's transaction.
  perform set_config('app.allow_account_deletion', 'on', true);

  select array_agg(id) into v_business_ids from businesses where user_id = v_uid;
  if v_business_ids is null then
    return array[]::uuid[];
  end if;

  -- Same set + order as the account/delete route, now atomic and past the guard.
  delete from pos_sale_items where sale_id in (select id from pos_sales where business_id = any(v_business_ids));
  delete from aria_conversations where business_id = any(v_business_ids);
  delete from aria_ai_calls where business_id = any(v_business_ids);
  delete from aria_autopilot_actions where business_id = any(v_business_ids);
  delete from pos_sales where business_id = any(v_business_ids);
  delete from pos_customers where business_id = any(v_business_ids);
  delete from pos_products where business_id = any(v_business_ids);
  delete from pos_shift_reports where business_id = any(v_business_ids);
  delete from seo_audits where business_id = any(v_business_ids);
  delete from businesses where id = any(v_business_ids);

  return v_business_ids;
end;
$function$;

grant execute on function public.purge_account_data() to authenticated;

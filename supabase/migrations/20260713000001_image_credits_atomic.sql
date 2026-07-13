-- SECURITY-P2 H-13 — webhooks/stripe-image-credits TOCTOU race on paid_credits balance.
-- Read-then-write (select paid_credits, then update paid_credits = existing + N) is not atomic:
-- concurrent Stripe retries for the same event can both read the same starting balance and one
-- increment is lost. Replaces it with a single SECURITY DEFINER RPC, same shape as
-- loyalty_preload_load (20260622192325_loyalty_preload.sql): idempotent on the Stripe
-- payment_intent id via the unique index that already existed on pos_image_transactions
-- (idx_pos_image_txn_idempotency) but was never actually populated by the route — the insert
-- attempt itself is the concurrency guard (unique-index conflict picks exactly one winner), the
-- balance upsert is a single atomic UPDATE/INSERT ON CONFLICT, never a read-modify-write.

create or replace function credit_image_credits(
  p_business uuid, p_credits integer, p_pi text, p_pack text, p_amount numeric
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_balance integer;
  v_txn_id uuid;
begin
  if p_credits <= 0 then raise exception 'credits must be positive'; end if;
  if p_pi is null or p_pi = '' then raise exception 'payment intent id required for idempotency'; end if;

  -- Idempotency guard IS the concurrency guard: the unique index on idempotency_key lets exactly
  -- one concurrent caller for a given payment_intent succeed; every other caller (retry, race) sees
  -- v_txn_id null below and returns the current balance without crediting again.
  insert into pos_image_transactions (business_id, type, pack_size, amount_charged, stripe_payment_intent_id, idempotency_key)
    values (p_business, case when p_pack = 'single' then 'paid_single' else 'paid_pack' end, p_credits, p_amount, p_pi, p_pi)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_txn_id;

  if v_txn_id is null then
    select paid_credits into v_balance from pos_image_credits where business_id = p_business;
    return coalesce(v_balance, 0);
  end if;

  insert into pos_image_credits (business_id, paid_credits)
    values (p_business, p_credits)
  on conflict (business_id) do update
    set paid_credits = pos_image_credits.paid_credits + excluded.paid_credits, updated_at = now()
  returning paid_credits into v_balance;

  return v_balance;
end; $$;

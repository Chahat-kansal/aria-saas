-- LOY-PRELOAD — member stored-value (REAL MONEY). Separate from points and from pos_gift_cards
-- (transferable code-based gifting). Money-safe by construction: an append-only ledger is the source of
-- truth; the account balance is mutated only inside locking SECURITY DEFINER functions that refuse to go
-- negative; every load references a Stripe payment_intent and is idempotent on it.

create table if not exists loyalty_preload_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  balance numeric not null default 0,
  currency text not null default 'aud',
  updated_at timestamptz not null default now(),
  unique (business_id, customer_id),
  check (balance >= 0)
);
alter table loyalty_preload_accounts enable row level security;

create table if not exists loyalty_preload_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  entry_type text not null check (entry_type in ('load','bonus','spend','refund')),
  amount numeric not null,                 -- signed: load/bonus/refund > 0, spend < 0
  balance_after numeric not null,
  stripe_payment_intent_id text,
  sale_id uuid,
  note text,
  created_at timestamptz not null default now()
);
alter table loyalty_preload_ledger enable row level security;
-- idempotency guards: one load + one bonus per payment-intent; one spend per sale; one refund per PI.
create unique index if not exists loyalty_preload_pi_type
  on loyalty_preload_ledger (stripe_payment_intent_id, entry_type) where stripe_payment_intent_id is not null;
create unique index if not exists loyalty_preload_spend_per_sale
  on loyalty_preload_ledger (sale_id) where sale_id is not null and entry_type = 'spend';
create index if not exists idx_preload_ledger_acct on loyalty_preload_ledger (business_id, customer_id, created_at);

-- LOAD (+ optional bonus): idempotent on payment_intent. Serialised by the account-row lock.
create or replace function loyalty_preload_load(p_business uuid, p_customer uuid, p_amount numeric, p_bonus numeric, p_pi text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric; v_exists int;
begin
  if p_amount <= 0 then raise exception 'load amount must be positive'; end if;
  insert into loyalty_preload_accounts(business_id, customer_id, balance) values (p_business, p_customer, 0)
    on conflict (business_id, customer_id) do nothing;
  select balance into v_balance from loyalty_preload_accounts
    where business_id = p_business and customer_id = p_customer for update;
  select count(*) into v_exists from loyalty_preload_ledger where stripe_payment_intent_id = p_pi and entry_type = 'load';
  if v_exists > 0 then return v_balance; end if;
  v_balance := v_balance + p_amount;
  insert into loyalty_preload_ledger(business_id, customer_id, entry_type, amount, balance_after, stripe_payment_intent_id, note)
    values (p_business, p_customer, 'load', p_amount, v_balance, p_pi, 'Stripe load');
  if p_bonus is not null and p_bonus > 0 then
    v_balance := v_balance + p_bonus;
    insert into loyalty_preload_ledger(business_id, customer_id, entry_type, amount, balance_after, stripe_payment_intent_id, note)
      values (p_business, p_customer, 'bonus', p_bonus, v_balance, p_pi, 'Load bonus');
  end if;
  update loyalty_preload_accounts set balance = v_balance, updated_at = now()
    where business_id = p_business and customer_id = p_customer;
  return v_balance;
end; $$;

-- SPEND: atomic, never negative, idempotent per sale.
create or replace function loyalty_preload_spend(p_business uuid, p_customer uuid, p_amount numeric, p_sale uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric; v_exists int;
begin
  if p_amount <= 0 then raise exception 'spend amount must be positive'; end if;
  select balance into v_balance from loyalty_preload_accounts
    where business_id = p_business and customer_id = p_customer for update;
  if v_balance is null then raise exception 'no preload account'; end if;
  if p_sale is not null then
    select count(*) into v_exists from loyalty_preload_ledger where sale_id = p_sale and entry_type = 'spend';
    if v_exists > 0 then return v_balance; end if;
  end if;
  if v_balance < p_amount then raise exception 'insufficient preload balance'; end if;
  v_balance := v_balance - p_amount;
  insert into loyalty_preload_ledger(business_id, customer_id, entry_type, amount, balance_after, sale_id, note)
    values (p_business, p_customer, 'spend', -p_amount, v_balance, p_sale, 'Checkout spend');
  update loyalty_preload_accounts set balance = v_balance, updated_at = now()
    where business_id = p_business and customer_id = p_customer;
  return v_balance;
end; $$;

-- REFUND: credits value back (e.g. reversed load / goodwill), idempotent on PI.
create or replace function loyalty_preload_refund(p_business uuid, p_customer uuid, p_amount numeric, p_pi text, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric; v_exists int;
begin
  if p_amount <= 0 then raise exception 'refund amount must be positive'; end if;
  select balance into v_balance from loyalty_preload_accounts
    where business_id = p_business and customer_id = p_customer for update;
  if v_balance is null then raise exception 'no preload account'; end if;
  if p_pi is not null then
    select count(*) into v_exists from loyalty_preload_ledger where stripe_payment_intent_id = p_pi and entry_type = 'refund';
    if v_exists > 0 then return v_balance; end if;
  end if;
  v_balance := v_balance + p_amount;
  insert into loyalty_preload_ledger(business_id, customer_id, entry_type, amount, balance_after, stripe_payment_intent_id, note)
    values (p_business, p_customer, 'refund', p_amount, v_balance, p_pi, coalesce(p_note, 'Refund'));
  update loyalty_preload_accounts set balance = v_balance, updated_at = now()
    where business_id = p_business and customer_id = p_customer;
  return v_balance;
end; $$;

-- owner config (additive)
alter table pos_loyalty_config add column if not exists preload_enabled boolean not null default false;
alter table pos_loyalty_config add column if not exists preload_bonus_threshold numeric not null default 0;
alter table pos_loyalty_config add column if not exists preload_bonus_amount numeric not null default 0;
alter table pos_loyalty_config add column if not exists preload_amounts jsonb not null default '[20,50,100]'::jsonb;

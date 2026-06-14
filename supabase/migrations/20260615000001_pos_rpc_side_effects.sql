-- POS-RPC-FIX — restore missing POS side-effect RPCs.
-- Two independent audits (DB-WIRING, DB-TYPES-1) confirmed the POS sale path calls
-- RPCs that don't exist. Because .rpc() returns {error} without throwing, sales
-- INSERT fine while stock, customer stats, and session totals silently never update.
--
-- Verified live (15 Jun, project aria-os / nxfzippunqvqsvkmwtjv):
--   ABSENT: decrement_stock_quantity, increment_numeric, decrement_numeric, increment_session_totals
--   PRESENT (untouched): increment_loyalty_points
--
-- Signatures below match the EXISTING call sites byte-for-byte (param names + types).
-- All SECURITY DEFINER: the POS sale path calls these with the user-scoped client, so
-- they must write reliably regardless of RLS (RULE 7 — no silent empty updates).
-- search_path is pinned to prevent SECURITY DEFINER hijacking.

-- 1) decrement_stock_quantity(p_product_id, p_amount) -> new stock (integer)
--    Call sites: pos/sale (sale + recipe ingredient deduction), pos/sales.
--    Clamps at 0 (never negative). No-op + no error if the product is missing.
--    FLOOR so fractional ingredient deductions still reduce stock (0.5 would round up otherwise).
create or replace function public.decrement_stock_quantity(p_product_id uuid, p_amount numeric)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new integer;
begin
  update public.pos_products
     set stock_quantity = greatest(0, floor(coalesce(stock_quantity, 0) - p_amount))::int
   where id = p_product_id
  returning stock_quantity into v_new;
  -- v_new is NULL when no row matched (missing product) → silent no-op, no error.
  return v_new;
end;
$$;

-- 2) increment_numeric(p_table, p_id, p_column, p_amount) -> void
--    Generic atomic increment. Call sites: pos_customers (total_spent, visit_count,
--    loyalty_points), pos_products (stock_quantity), pos_outlet_inventory (items_on_hand).
--    %I quoting prevents identifier injection. coalesce guards null. Missing row = no-op.
create or replace function public.increment_numeric(p_table text, p_id uuid, p_column text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute format(
    'update public.%I set %I = coalesce(%I, 0) + $1 where id = $2',
    p_table, p_column, p_column
  ) using p_amount, p_id;
end;
$$;

-- 3) decrement_numeric(p_table, p_id, p_column, p_amount) -> void
--    Generic atomic decrement, clamped at 0. Call site: pos_outlet_inventory.items_on_hand.
create or replace function public.decrement_numeric(p_table text, p_id uuid, p_column text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute format(
    'update public.%I set %I = greatest(0, coalesce(%I, 0) - $1) where id = $2',
    p_table, p_column, p_column
  ) using p_amount, p_id;
end;
$$;

-- 4) increment_session_totals(p_session_id, p_cash_delta, p_card_delta, p_transaction_delta) -> void
--    Call sites: pos/sale, pos/sync-offline. Updates pos_cash_sessions money totals atomically.
--    pos_cash_sessions has no transaction-count column, so p_transaction_delta is accepted
--    (to match the call signature exactly) but has no target column to write.
--    Missing session id = silent no-op, no error.
create or replace function public.increment_session_totals(
  p_session_id uuid,
  p_cash_delta numeric,
  p_card_delta numeric,
  p_transaction_delta integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.pos_cash_sessions
     set total_cash_sales = coalesce(total_cash_sales, 0) + coalesce(p_cash_delta, 0),
         total_card_sales = coalesce(total_card_sales, 0) + coalesce(p_card_delta, 0)
   where id = p_session_id;
end;
$$;

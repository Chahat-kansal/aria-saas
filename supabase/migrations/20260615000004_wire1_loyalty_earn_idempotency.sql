-- WIRE-1 — one 'earn' ledger row per sale (race-proof idempotency for the loyalty earn path).
-- Applied live 2026-06-15. The sale route writes pos_loyalty_transactions(type='earn', sale_id);
-- this partial unique index guarantees a single earn row per sale even under concurrent calls
-- (sale route's waitUntil + the terminal's fire-and-forget /api/loyalty/earn).
create unique index if not exists pos_loyalty_txn_earn_per_sale
  on public.pos_loyalty_transactions (sale_id)
  where type = 'earn' and sale_id is not null;

-- One-time data fix (also run live): sync points_balance (the canonical balance the redeem path
-- reads) from loyalty_points where the earn path had only populated loyalty_points — so dashboard
-- liability and customer balances are consistent.
update public.pos_customers set points_balance = loyalty_points
  where coalesce(points_balance, 0) = 0 and coalesce(loyalty_points, 0) > 0;

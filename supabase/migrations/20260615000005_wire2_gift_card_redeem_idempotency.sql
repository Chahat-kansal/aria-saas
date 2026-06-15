-- WIRE-2 — one 'redeem' transaction per (gift_card, sale) on the canonical table
-- (gift_card_transactions, chosen for its staff_name audit column). Applied live 2026-06-15.
-- The redeem route writes this ledger row FIRST as the idempotency gate, so a retried tender
-- conflicts here instead of double-deducting the card balance.
create unique index if not exists gift_card_txn_redeem_per_sale
  on public.gift_card_transactions (gift_card_id, sale_id)
  where type = 'redeem' and sale_id is not null;

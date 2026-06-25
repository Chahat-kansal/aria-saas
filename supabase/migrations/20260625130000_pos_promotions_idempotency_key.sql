-- BUGFIX-ASKARIA-RC4: DB-enforced idempotency for Ask Aria promo creation (close the read-then-insert race).
-- Additive + scoped: only rows that CARRY a key (Ask Aria's create_promotion/apply_category_discount writes)
-- are constrained. Dashboard / POS manual promo creation writes idempotency_key = NULL → the partial index
-- ignores them entirely (RULE 0 — other paths unchanged). The key embeds a coarse 60s time bucket, so a
-- deliberate re-creation in a later minute has a different key and is allowed — only near-simultaneous
-- identical creates collide and get deduped via the 23505 catch in the executor.
alter table pos_promotions add column if not exists idempotency_key text;

create unique index if not exists uq_pos_promotions_idempotency
  on pos_promotions (business_id, idempotency_key)
  where idempotency_key is not null;

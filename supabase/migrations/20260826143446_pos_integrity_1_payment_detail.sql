-- POS-INTEGRITY-1 — additive only (RULE0). Nothing dropped, nothing renamed.
-- Rollback: stop writing the new columns. Code revert only; no data loss.

-- G3: dollars alongside cents. amount_cents is retained and still dual-written.
ALTER TABLE pos_sale_payments ADD COLUMN IF NOT EXISTS amount numeric;
-- G6: tenancy denormalised onto the payment row.
ALTER TABLE pos_sale_payments ADD COLUMN IF NOT EXISTS business_id uuid;
-- G5: tips.
ALTER TABLE pos_sale_payments ADD COLUMN IF NOT EXISTS tip_amount numeric DEFAULT 0;

-- G3 backfill: 62 rows, no batching required at this size.
UPDATE pos_sale_payments SET amount = amount_cents / 100.0 WHERE amount IS NULL;

-- G6 backfill from the parent sale. The 3 known orphan rows (sales deleted pre-FK)
-- intentionally keep business_id NULL: they are already invisible to RLS, which scopes
-- through sale_id -> pos_sales -> businesses. They are retained as forensic record.
UPDATE pos_sale_payments p SET business_id = s.business_id
FROM pos_sales s WHERE p.sale_id = s.id AND p.business_id IS NULL;

-- G6: FK enforced on NEW rows only. NOT VALID and deliberately NEVER validated --
-- VALIDATE would abort on the 3 orphans and roll back this entire migration.
ALTER TABLE pos_sale_payments
  ADD CONSTRAINT pos_sale_payments_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES pos_sales(id) ON DELETE CASCADE NOT VALID;

-- Plain index: 62 rows, CONCURRENTLY cannot run inside a migration transaction and buys nothing here.
CREATE INDEX IF NOT EXISTS idx_pos_sale_payments_business
  ON pos_sale_payments (business_id, created_at DESC);

-- Non-negative, not strictly positive: a $0.00 tender line is legitimate when a gift card
-- or 100% discount covers the remainder. New rows only.
ALTER TABLE pos_sale_payments
  ADD CONSTRAINT pos_sale_payments_amount_non_negative CHECK (amount >= 0) NOT VALID;

-- G5: tip total on the sale, for shift and staff attribution.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS tip_total numeric DEFAULT 0;

-- BUG 1: columns the offline sync route already writes to. Their absence makes every
-- offline sale insert fail 42703 and be swallowed at sync-offline/route.ts:88.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS synced_from_offline boolean DEFAULT false;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS offline_queued_at timestamptz;

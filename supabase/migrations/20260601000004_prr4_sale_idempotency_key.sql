-- PRR-4 Reliability: idempotency key on pos_sales
-- Clients send a UUID per checkout attempt; server rejects duplicate submissions.

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index: only enforce uniqueness when the key is present
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_biz_idempotency_key
  ON pos_sales(business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
-- PRR-5 Data Safety: soft-delete for pos_customers
-- Adds deleted_at column; API DELETE handler now sets this instead of hard-deleting.

ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for fast filtering of active customers (the common path)
CREATE INDEX IF NOT EXISTS idx_pos_customers_business_not_deleted
  ON pos_customers(business_id)
  WHERE deleted_at IS NULL;
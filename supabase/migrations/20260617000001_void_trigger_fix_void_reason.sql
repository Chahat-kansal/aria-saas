-- VOID-TRIGGER-FIX: add pos_sales.void_reason (unblock voids)
-- The log_sale_void() trigger inserts new.void_reason into deletion_audit_log when a sale's
-- status changes to 'voided', but the column never existed — so EVERY void threw
-- "column void_reason does not exist" and the void transaction failed. Adding the column
-- (nullable; existing rows unaffected) unblocks voids: new.void_reason resolves to null when
-- not provided, and the void route now populates it from the cashier-supplied reason.
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS void_reason text;

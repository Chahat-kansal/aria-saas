-- Expand pos_kds_orders status constraint to include delivered + void
-- (previously only allowed: new, in_progress, ready, bumped)
ALTER TABLE pos_kds_orders
  DROP CONSTRAINT IF EXISTS pos_kds_orders_status_check;

ALTER TABLE pos_kds_orders
  ADD CONSTRAINT pos_kds_orders_status_check
  CHECK (status = ANY (ARRAY['new','in_progress','ready','bumped','delivered','void']));

-- One-time backfill: mark all stale active orders (>24h old) as delivered
-- These are orders that were never bumped due to the silent constraint failure
UPDATE pos_kds_orders
SET status = 'delivered', bumped_at = COALESCE(bumped_at, now())
WHERE status IN ('new','in_progress','ready')
  AND created_at < now() - interval '24 hours';
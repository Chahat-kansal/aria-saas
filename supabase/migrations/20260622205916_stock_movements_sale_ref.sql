-- INV-DECREMENT-FIX phase 1 (logging-only): add a sale reference to stock_movements so the shared
-- sale-movement helper can be idempotent per sale (retry/webhook/offline-sync safe). Additive only —
-- existing 118 rows get sale_id = NULL and are unaffected; the partial unique index only applies to new
-- 'sale' rows that carry a sale_id. No behaviour of any existing path changes.
alter table stock_movements add column if not exists sale_id uuid;
create unique index if not exists stock_movements_sale_line_uniq
  on stock_movements (sale_id, item_id)
  where sale_id is not null and movement_type = 'sale';

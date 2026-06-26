-- INV-4 — counting engine. REUSE the existing pos_stock_takes (session) + pos_stock_take_items (lines) tables
-- rather than duplicating them. Additive only: the few columns a full/cycle/perpetual session needs (count
-- type, per-line attribution + variance). The status CHECK (in_progress | committed | cancelled) and the
-- ON DELETE CASCADE FK are kept as-is. A count NEVER mutates items_on_hand — variance routes to the owner
-- review queue (inventory_review_queue); the only stock move is the owner accepting (review route).

-- session: distinguish full stocktake / ABC cycle / perpetual spot count
ALTER TABLE pos_stock_takes
  ADD COLUMN IF NOT EXISTS count_type text NOT NULL DEFAULT 'full';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pos_stock_takes_count_type_check') THEN
    ALTER TABLE pos_stock_takes
      ADD CONSTRAINT pos_stock_takes_count_type_check CHECK (count_type IN ('full', 'cycle', 'perpetual'));
  END IF;
END $$;

-- lines: per-line attribution + computed variance + denormalised name (system_qty=expected, counted_qty exist)
ALTER TABLE pos_stock_take_items
  ADD COLUMN IF NOT EXISTS counted_by uuid,
  ADD COLUMN IF NOT EXISTS variance_qty integer,
  ADD COLUMN IF NOT EXISTS variance_cents integer,
  ADD COLUMN IF NOT EXISTS product_name text;

-- one open session per (outlet, type) so a stocktake is resumable across a shift, never duplicated
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_takes_one_open_per_outlet
  ON pos_stock_takes (business_id, outlet_id, count_type) WHERE status = 'in_progress';

-- cycle "last counted" lookup + variance-pattern history + open-session lookup
CREATE INDEX IF NOT EXISTS idx_stock_take_items_product_counted ON pos_stock_take_items (product_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_takes_biz_outlet_status ON pos_stock_takes (business_id, outlet_id, status);

-- INV-BASELINE-1 Phase 5 · tombstone the dead stocktake twin.
-- pos_stocktakes / pos_stocktake_items have ZERO rows and ZERO code references
-- (verified 17 Aug 2026). The canonical system is pos_stock_takes + pos_stock_take_items,
-- with lib/inventory/stocktake.ts as the canonical engine.
-- NOT dropped: a drop earns its own decision (RULE 0). The only cost these impose is on
-- humans reading the schema, which a comment fixes.
-- Reversal: COMMENT ON TABLE public.pos_stocktakes IS NULL;
--           COMMENT ON TABLE public.pos_stocktake_items IS NULL;

COMMENT ON TABLE public.pos_stocktakes IS
  'DEAD (tombstoned 2026-08-17, INV-BASELINE-1). Zero rows, zero code references. Thinner duplicate of pos_stock_takes: no outlet_id, no variance_cents, no recount, no count_type. DO NOT WRITE TO THIS TABLE. Canonical: pos_stock_takes via lib/inventory/stocktake.ts. See docs/aria/INV-BASELINE-PREFLIGHT.md.';

COMMENT ON TABLE public.pos_stocktake_items IS
  'DEAD (tombstoned 2026-08-17, INV-BASELINE-1). Zero rows, zero code references. DO NOT WRITE TO THIS TABLE. Canonical: pos_stock_take_items via lib/inventory/stocktake.ts. See docs/aria/INV-BASELINE-PREFLIGHT.md.';

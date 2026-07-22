import type { SupabaseClient } from '@supabase/supabase-js'

// INV-DECREMENT-FIX phase 1 — the single place every sale-completion path logs a stock movement, so
// stock_movements becomes a COMPLETE units-sold ledger (it previously covered only ~8% of sold lines
// because only pos/sale/route.ts logged). This is LOGGING-ONLY and behaviour-preserving: it does NOT
// change which stock field anyone decrements (that reconciliation is INV-DECREMENT-FIX phase 2). It is
// idempotent per sale (safe under offline-sync replay / webhook retry / double-click) via the sale_id
// guard + the partial unique index (sale_id, item_id) where movement_type='sale'.
//
// INV-DECREMENT-FIX (sibling sweep) — void/refund/return reversals ALSO write here now, sharing the
// same idempotency + diagnosability discipline instead of restoring stock silently. The idempotency
// check and the DB unique index are keyed on (sale_id, item_id, movement_type) — not sale_id alone —
// so a sale's 'sale' row and its later 'void' row don't collide (a naive sale_id-only guard would have
// made the reversal a permanent no-op the moment the original sale had already logged a movement).

// The allowed movement types (constant set — used instead of a DB CHECK so we don't risk rejecting the
// other, unaudited insert paths such as warehouse receiving/transfers).
export const SALE_MOVEMENT_TYPE = 'sale' as const
export const VOID_MOVEMENT_TYPE = 'void' as const
export const REFUND_MOVEMENT_TYPE = 'refund' as const
export const RETURN_MOVEMENT_TYPE = 'return' as const

export interface SaleMovementLine {
  /** pos_products.id (stock_movements.item_id is text and stores the product id as text). */
  itemId: string
  /** Positive units moved for this line (sign is derived from movementType, not the caller). */
  quantitySold: number
  /**
   * The post-adjustment running balance, when the calling path actually adjusted stock. Omit on paths
   * that do not adjust (phase 1) — the helper then snapshots the product's current stock_quantity so
   * the NOT-NULL new_stock column is satisfied honestly (balance unchanged because nothing ran).
   */
  newStock?: number | null
}

interface RecordParams {
  businessId: string
  /** The sale this movement set belongs to — part of the idempotency key. */
  saleId: string | null
  saleNumber?: string | number | null
  lines: SaleMovementLine[]
  /** Defaults to 'sale' — pass VOID_MOVEMENT_TYPE/REFUND_MOVEMENT_TYPE/RETURN_MOVEMENT_TYPE for reversals. */
  movementType?: string
  /** The outlet the stock adjustment actually applied to (already resolved by the caller). */
  outletId?: string | null
  /** Identifies the code path that wrote this row (e.g. 'lib/pos/create-sale') — diagnosability. */
  writtenBy?: string
}

/** Write one stock_movements row per moved line (movement_type defaults to 'sale'). Idempotent per
 * (sale_id, movement_type); never throws. */
export async function recordSaleMovements(supabase: SupabaseClient, params: RecordParams): Promise<void> {
  const { businessId, saleId, saleNumber, lines, outletId, writtenBy } = params
  const movementType = params.movementType ?? SALE_MOVEMENT_TYPE
  const sign = movementType === SALE_MOVEMENT_TYPE ? -1 : 1
  const valid = lines.filter(l => l.itemId && Number(l.quantitySold) > 0)
  if (!valid.length) return

  try {
    // Idempotency: if this (sale, movement type) already logged movements, do nothing — a sale's lines
    // for one movement type are written together, but a later reversal is a DIFFERENT movement type and
    // must still be allowed to log its own rows.
    if (saleId) {
      const { data: existing } = await supabase.from('stock_movements').select('id').eq('sale_id', saleId).eq('movement_type', movementType).limit(1).maybeSingle()
      if (existing) return
    }

    // Fill any missing new_stock from the current product stock (new_stock is NOT NULL).
    const needFetch = Array.from(new Set(valid.filter(l => l.newStock == null).map(l => l.itemId)))
    const stockMap: Record<string, number> = {}
    if (needFetch.length) {
      const { data } = await supabase.from('pos_products').select('id, stock_quantity').in('id', needFetch)
      for (const p of data ?? []) stockMap[p.id as string] = Number(p.stock_quantity ?? 0)
    }

    const label = movementType === SALE_MOVEMENT_TYPE ? 'Sale' : movementType === VOID_MOVEMENT_TYPE ? 'Void' : movementType === REFUND_MOVEMENT_TYPE ? 'Refund' : movementType === RETURN_MOVEMENT_TYPE ? 'Return' : movementType
    const rows = valid.map(l => ({
      business_id: businessId,
      item_id: l.itemId,
      sale_id: saleId,
      outlet_id: outletId ?? null,
      written_by: writtenBy ?? null,
      movement_type: movementType,
      quantity_added: sign * Math.abs(Math.round(Number(l.quantitySold))),
      new_stock: Math.max(0, Math.round(Number(l.newStock ?? stockMap[l.itemId] ?? 0))),
      notes: saleNumber != null && String(saleNumber) !== '' ? `${label} ${saleNumber}` : label,
      scanned_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('stock_movements').insert(rows)
    // A unique-violation means a concurrent run already logged this (sale, movement type) — idempotency working.
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error('[recordSaleMovements] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[recordSaleMovements] threw (non-fatal):', (e as Error).message)
  }
}

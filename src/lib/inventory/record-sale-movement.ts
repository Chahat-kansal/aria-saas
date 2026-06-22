import type { SupabaseClient } from '@supabase/supabase-js'

// INV-DECREMENT-FIX phase 1 — the single place every sale-completion path logs a stock movement, so
// stock_movements becomes a COMPLETE units-sold ledger (it previously covered only ~8% of sold lines
// because only pos/sale/route.ts logged). This is LOGGING-ONLY and behaviour-preserving: it does NOT
// change which stock field anyone decrements (that reconciliation is INV-DECREMENT-FIX phase 2). It is
// idempotent per sale (safe under offline-sync replay / webhook retry / double-click) via the sale_id
// guard + the partial unique index (sale_id, item_id) where movement_type='sale'.

// The allowed movement types (constant set — used instead of a DB CHECK so we don't risk rejecting the
// other, unaudited insert paths such as warehouse receiving/transfers).
export const SALE_MOVEMENT_TYPE = 'sale' as const

export interface SaleMovementLine {
  /** pos_products.id (stock_movements.item_id is text and stores the product id as text). */
  itemId: string
  /** Positive units sold for this line. */
  quantitySold: number
  /**
   * The post-decrement running balance, when the calling path actually decremented stock. Omit on paths
   * that do not decrement (phase 1) — the helper then snapshots the product's current stock_quantity so
   * the NOT-NULL new_stock column is satisfied honestly (balance unchanged because no decrement ran).
   */
  newStock?: number | null
}

interface RecordParams {
  businessId: string
  /** The sale this movement set belongs to — the idempotency key. */
  saleId: string | null
  saleNumber?: string | number | null
  lines: SaleMovementLine[]
}

/** Write one 'sale' stock_movements row per sold line. Idempotent per sale; never throws. */
export async function recordSaleMovements(supabase: SupabaseClient, params: RecordParams): Promise<void> {
  const { businessId, saleId, saleNumber, lines } = params
  const valid = lines.filter(l => l.itemId && Number(l.quantitySold) > 0)
  if (!valid.length) return

  try {
    // Idempotency: if this sale already logged movements, do nothing (a sale's lines are written together).
    if (saleId) {
      const { data: existing } = await supabase.from('stock_movements').select('id').eq('sale_id', saleId).limit(1).maybeSingle()
      if (existing) return
    }

    // Fill any missing new_stock from the current product stock (new_stock is NOT NULL).
    const needFetch = Array.from(new Set(valid.filter(l => l.newStock == null).map(l => l.itemId)))
    const stockMap: Record<string, number> = {}
    if (needFetch.length) {
      const { data } = await supabase.from('pos_products').select('id, stock_quantity').in('id', needFetch)
      for (const p of data ?? []) stockMap[p.id as string] = Number(p.stock_quantity ?? 0)
    }

    const rows = valid.map(l => ({
      business_id: businessId,
      item_id: l.itemId,
      sale_id: saleId,
      movement_type: SALE_MOVEMENT_TYPE,
      quantity_added: -Math.abs(Math.round(Number(l.quantitySold))),
      new_stock: Math.max(0, Math.round(Number(l.newStock ?? stockMap[l.itemId] ?? 0))),
      notes: saleNumber != null && String(saleNumber) !== '' ? `Sale ${saleNumber}` : 'Sale',
      scanned_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('stock_movements').insert(rows)
    // A unique-violation means a concurrent run already logged this sale — that's the idempotency working.
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error('[recordSaleMovements] insert failed:', error.message)
    }
  } catch (e) {
    console.error('[recordSaleMovements] threw (non-fatal):', (e as Error).message)
  }
}

// INV-BASELINE-1 PHASE 1 — what a POST to /api/pos/stock-takes actually asks for.
//
// EXTRACTED BECAUSE TWO SURFACES SEND TWO DIFFERENT BODY SHAPES to the same endpoint, and the old
// route's failure to distinguish them was destructive rather than merely untidy:
//
//   pos/inventory/stocktake/new  → { outlet_id, items: [{ product_id, system_qty, counted_qty, … }] }
//                                  a FINISHED count, every counted_qty populated
//   dashboard/stocktake          → { business_id, name, items: [{ product_id, product_name,
//                                    expected_qty, counted_qty: null }] }   ← no outlet_id
//                                  a NEW EMPTY session, nothing counted yet
//
// The old route ran `items.filter(i => i.counted_qty !== i.system_qty)` over both. For the dashboard
// shape that is `null !== undefined` — TRUE for every row — so every product became a "variance" and
// the route wrote `pos_products.stock_quantity = null` for each one. pos_products.stock_quantity is
// nullable, so those updates SUCCEEDED. Opening a stocktake from the dashboard silently wiped the
// stock figure for every tracked product in the business.
//
// Deciding "count these lines" vs "just open a session" is therefore a real decision with a real
// blast radius, and it belongs somewhere it can be tested without a database.

export interface StocktakeLineToCount {
  product_id: string
  counted_qty: number
}

export interface StocktakePostPlan {
  /** Explicit outlet from the caller, or null → the engine resolves the business's default. */
  outletId: string | null
  /** Only the lines the caller actually counted. */
  linesToCount: StocktakeLineToCount[]
  /**
   * `open_only` — no counted lines: create/resume the session and stop. Committing here would file a
   * completed stocktake that counted nothing.
   * `count_and_submit` — record the lines, then submit through the engine.
   */
  action: 'open_only' | 'count_and_submit'
}

/** A line counts only if counted_qty is a real number. null/undefined/'' are "not counted yet". */
function isCounted(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  return Number.isFinite(Number(v))
}

/**
 * Read a POST body into a plan. Total and defensive: any shape produces a valid plan rather than a
 * throw, because the two known callers disagree and a third could appear.
 *
 * THE CLIENT'S `system_qty` / `expected_qty` IS DELIBERATELY NOT CARRIED THROUGH. The engine reads
 * live items_on_hand for the session's outlet to establish book stock, so a stale tab or a hostile
 * client cannot declare what the system "expected" and thereby manufacture or hide a variance. The
 * old route trusted the client's number for exactly that comparison.
 */
export function planStocktakePost(body: unknown): StocktakePostPlan {
  const b = (body ?? {}) as Record<string, unknown>
  const rawOutlet = b.outlet_id
  const outletId = typeof rawOutlet === 'string' && rawOutlet.trim() ? rawOutlet : null

  const rawItems = Array.isArray(b.items) ? (b.items as Array<Record<string, unknown>>) : []
  const linesToCount: StocktakeLineToCount[] = []
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue
    const productId = typeof it.product_id === 'string' ? it.product_id : ''
    if (!productId) continue
    if (!isCounted(it.counted_qty)) continue
    // Negative and fractional counts are floored/rounded here rather than at the DB: a count is a
    // number of physical things.
    linesToCount.push({ product_id: productId, counted_qty: Math.max(0, Math.round(Number(it.counted_qty))) })
  }

  return {
    outletId,
    linesToCount,
    action: linesToCount.length > 0 ? 'count_and_submit' : 'open_only',
  }
}

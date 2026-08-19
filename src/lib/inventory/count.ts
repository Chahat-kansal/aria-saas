import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { openStocktake, countStocktakeLine, submitStocktake } from '@/lib/inventory/stocktake'

// INV-STAFF-APP-2 — the attributed count loop. THE LOCKED PRINCIPLE: a count NEVER mutates items_on_hand.
// Expected = current items_on_hand (book stock). A non-zero variance raises an inventory_review_queue row
// for the OWNER to decide (accept/investigate) — silent auto-correction is forbidden. Everything is
// attributed to the acting staff (completed_by / raised_by_staff_id / started_by). Idempotent per task.

export interface CountResult {
  expected: number
  counted: number
  variance: number
  review_raised: boolean
  review_id: string | null
  task_done: boolean
  idempotent: boolean
  staff_name: string
}

interface CountParams {
  businessId: string
  outletIdIn?: string | null
  productId: string
  productName?: string | null
  counted: number
  taskId?: string | null
  staffId: string
  staffName: string
}

export async function submitCount(supabase: SupabaseClient, p: CountParams): Promise<CountResult> {
  const outletId = await resolveOutletId(supabase, p.businessId, p.outletIdIn ?? null)

  // Expected = current items_on_hand (book stock) for this product+outlet. Read here only so the
  // early-return paths below (already-done task, same-day duplicate) can still report a variance
  // without opening a session. The AUTHORITATIVE expected/variance come from countStocktakeLine,
  // which reads the same field for the session's own outlet.
  const { data: inv } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('outlet_id', outletId ?? '').maybeSingle()
  const expected = Number(inv?.items_on_hand ?? 0)
  const counted = Math.max(0, Math.round(Number(p.counted) || 0))
  const variance = counted - expected

  // Idempotency: if this submission is tied to a task, atomically claim it open→done. A second submit of an
  // already-done task is a no-op (no duplicate review / no double-count).
  let taskDone = false
  if (p.taskId) {
    const { data: claimed } = await supabase.from('inventory_tasks')
      .update({ status: 'done', completed_by: p.staffId, completed_at: new Date().toISOString() })
      .eq('id', p.taskId).eq('business_id', p.businessId).eq('status', 'open').select('id').maybeSingle()
    if (!claimed?.id) {
      return { expected, counted, variance, review_raised: false, review_id: null, task_done: false, idempotent: true, staff_name: p.staffName }
    }
    taskDone = true
  }

  // ── SAME-DAY DEDUPE, PRESERVED, AND IT MUST STAY BEFORE THE SESSION OPENS ────────────────────
  // Ad-hoc counts (no task) dedupe per product/staff/day so a staffer re-counting the same item
  // does not file a second review. Checked BEFORE any write, exactly as before — running it after
  // opening a session would leave an empty session behind on every duplicate submit.
  if (variance !== 0 && !p.taskId) {
    const since = new Date(); since.setHours(0, 0, 0, 0)
    const { data: dup } = await supabase.from('inventory_review_queue').select('id')
      .eq('business_id', p.businessId).eq('product_id', p.productId).eq('raised_by_staff_id', p.staffId)
      .eq('flag_type', 'count_variance').eq('status', 'open').gte('created_at', since.toISOString()).maybeSingle()
    if (dup?.id) return { expected, counted, variance, review_raised: false, review_id: dup.id as string, task_done: taskDone, idempotent: true, staff_name: p.staffName }
  }

  // ── MS7 PHASE 1 — A SPOT COUNT NOW WRITES A REAL LEDGER LINE ─────────────────────────────────
  //
  // This function used to insert a pos_stock_takes header with `items_counted: 1` hardcoded and NO
  // pos_stock_take_items row behind it, then file its own review. Three shipped June headers still
  // carry that untrue claim. Since INV-BASELINE-1 phase 4 the consequence got worse: no ledger line
  // means no last_counted_at, so a spot-counted product reads "never counted" forever, stays pinned
  // to the top of the ABC cycle rotation, and staff are sent to recount it again and again.
  //
  // It now goes through the canonical engine, so a spot count is a first-class count: attribution
  // (counted_by), variance and variance value, the recount counter, the last_counted_at cache and
  // the materiality policy all apply to it identically to a full count. `items_counted` is whatever
  // was actually counted, because submitStocktake computes it from the lines.
  //
  // Nothing here decides commit-vs-review any more — count-policy.ts does, and it routes EVERY
  // staff count to owner review regardless of size. That is the same outcome this function always
  // produced (it raised a review for any non-zero variance), reached through one implementation
  // instead of a second copy.
  if (!outletId) {
    // No outlet resolvable: the engine cannot open a session, and a count with nowhere to belong is
    // not recorded rather than half-recorded. Previously this silently skipped the header too.
    return { expected, counted, variance, review_raised: false, review_id: null, task_done: taskDone, idempotent: false, staff_name: p.staffName }
  }

  const session = await openStocktake(supabase, p.businessId, outletId, 'perpetual', p.staffId)
  if (!session) {
    return { expected, counted, variance, review_raised: false, review_id: null, task_done: taskDone, idempotent: false, staff_name: p.staffName }
  }

  const line = await countStocktakeLine(supabase, p.businessId, session.id, p.productId, counted, p.staffId)
  if (!line) {
    // countStocktakeLine returns null when the line did not persist. Never report a count as
    // recorded in that case — the whole point of writing a ledger line is that it exists.
    return { expected, counted, variance, review_raised: false, review_id: null, task_done: taskDone, idempotent: false, staff_name: p.staffName }
  }

  // The engine's figures win: it read items_on_hand for the SESSION's outlet, which is the outlet
  // the line is filed against.
  const engineExpected = line.expected_qty
  const engineCounted = line.counted_qty ?? counted
  const engineVariance = line.variance_qty ?? 0

  // 'staff' — this is the staff-PIN app. Every variance routes to owner review; nothing commits.
  const result = await submitStocktake(supabase, p.businessId, session.id, p.staffId, p.staffName, 'staff')

  // A null result means the session was already committed by a concurrent submit — the line above
  // still persisted and was included in that submit, so the count IS recorded. Reported as
  // idempotent rather than failed.
  const reviewId: string | null = result?.review_ids?.[0] ?? null
  const reviewRaised = (result?.reviews_raised ?? 0) > 0

  // SAFETY ASSERTION (documented): items_on_hand is deliberately never written here. The only path that
  // changes it is the owner accepting the review (a later sprint), via adjustOutletStock — referenced so
  // the dependency is explicit but intentionally NOT called.
  void adjustOutletStock

  return {
    expected: engineExpected, counted: engineCounted, variance: engineVariance,
    review_raised: reviewRaised, review_id: reviewId, task_done: taskDone,
    idempotent: result == null, staff_name: p.staffName,
  }
}

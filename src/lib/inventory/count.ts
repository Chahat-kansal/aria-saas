import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

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

  // Expected = current items_on_hand (book stock) for this product+outlet.
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

  // Audit trail: a stock-take event (started_by = staff). Variance value at cost (NULL cost → 0, not faked).
  let varianceCents = 0
  try {
    const rc = await resolveCostFor(supabase, p.businessId, p.productId, outletId)
    if (rc.cost != null) varianceCents = Math.round(variance * rc.cost * 100)
  } catch { /* cost unknown → 0 */ }
  if (outletId) {
    await supabase.from('pos_stock_takes').insert({
      business_id: p.businessId, outlet_id: outletId, started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      started_by: p.staffId, status: 'committed', items_counted: 1, items_with_variance: variance !== 0 ? 1 : 0,
      total_variance_cents: varianceCents, notes: `Count via staff app${variance !== 0 ? ' — variance routed to owner review (stock NOT auto-adjusted)' : ' — matched'}`,
    })
  }

  // Mismatch → owner review (NEVER touch items_on_hand). For ad-hoc counts (no task) dedupe per product/staff/day.
  let reviewId: string | null = null
  let reviewRaised = false
  if (variance !== 0) {
    if (!p.taskId) {
      const since = new Date(); since.setHours(0, 0, 0, 0)
      const { data: dup } = await supabase.from('inventory_review_queue').select('id')
        .eq('business_id', p.businessId).eq('product_id', p.productId).eq('raised_by_staff_id', p.staffId)
        .eq('flag_type', 'count_variance').eq('status', 'open').gte('created_at', since.toISOString()).maybeSingle()
      if (dup?.id) return { expected, counted, variance, review_raised: false, review_id: dup.id as string, task_done: taskDone, idempotent: true, staff_name: p.staffName }
    }
    const { data: rev } = await supabase.from('inventory_review_queue').insert({
      business_id: p.businessId, outlet_id: outletId, flag_type: 'count_variance', product_id: p.productId,
      expected_value: expected, actual_value: counted, variance,
      evidence: { expected, counted, variance, product_name: p.productName ?? null, staff_id: p.staffId, staff_name: p.staffName, task_id: p.taskId ?? null, counted_at: new Date().toISOString() },
      raised_by_staff_id: p.staffId, status: 'open',
    }).select('id').maybeSingle()
    reviewId = (rev?.id as string) ?? null
    reviewRaised = !!reviewId
  }

  // SAFETY ASSERTION (documented): items_on_hand is deliberately never written here. The only path that
  // changes it is the owner accepting the review (a later sprint), via adjustOutletStock — referenced so
  // the dependency is explicit but intentionally NOT called.
  void adjustOutletStock

  return { expected, counted, variance, review_raised: reviewRaised, review_id: reviewId, task_done: taskDone, idempotent: false, staff_name: p.staffName }
}

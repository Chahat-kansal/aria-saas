import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

// INV-4 — the counting engine. THE LOCKED PRINCIPLE (extends INV-2): a count produces a VARIANCE (counted vs
// expected items_on_hand). Variance NEVER auto-corrects stock — every non-zero line files to the OWNER review
// queue (inventory_review_queue); the only path that moves items_on_hand is the owner ACCEPTING (review route,
// via adjustOutletStock). Sessions persist in pos_stock_takes (status in_progress→committed) + lines in
// pos_stock_take_items (REUSED, not duplicated). Per-outlet. Attributed (started_by / counted_by = staff PIN
// identity). ABC from product_performance_scores.abc_tier. Amounts grounded — unknown cost → 0, never faked.

export type CountType = 'full' | 'cycle' | 'perpetual'

export interface StocktakeSession {
  id: string; outlet_id: string | null; count_type: CountType; status: string
  started_by: string | null; started_at: string; completed_at: string | null
  items_counted: number; items_with_variance: number; total_variance_cents: number
}
export interface StocktakeLine {
  product_id: string; product_name: string | null; expected_qty: number; counted_qty: number | null
  variance_qty: number | null; variance_cents: number | null; counted_by: string | null; counted_at: string | null
}

const nowIso = () => new Date().toISOString()

/** Open (or RESUME) the one in-progress session for this outlet + type. Resumable across a shift. */
export async function openStocktake(sb: SupabaseClient, businessId: string, outletIdIn: string | null, type: CountType, staffId: string): Promise<StocktakeSession | null> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  if (!outletId) return null
  const { data: existing } = await sb.from('pos_stock_takes')
    .select('id, outlet_id, count_type, status, started_by, started_at, completed_at, items_counted, items_with_variance, total_variance_cents')
    .eq('business_id', businessId).eq('outlet_id', outletId).eq('count_type', type).eq('status', 'in_progress')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.id) return existing as StocktakeSession
  const { data: created } = await sb.from('pos_stock_takes').insert({
    business_id: businessId, outlet_id: outletId, count_type: type, status: 'in_progress',
    started_by: staffId, started_at: nowIso(), items_counted: 0, items_with_variance: 0, total_variance_cents: 0,
  }).select('id, outlet_id, count_type, status, started_by, started_at, completed_at, items_counted, items_with_variance, total_variance_cents').maybeSingle()
  return (created as StocktakeSession) ?? null
}

/** Load a session + its counted lines (resume view). */
export async function getStocktake(sb: SupabaseClient, businessId: string, sessionId: string): Promise<{ session: StocktakeSession; lines: StocktakeLine[] } | null> {
  const { data: s } = await sb.from('pos_stock_takes')
    .select('id, outlet_id, count_type, status, started_by, started_at, completed_at, items_counted, items_with_variance, total_variance_cents')
    .eq('business_id', businessId).eq('id', sessionId).maybeSingle()
  if (!s) return null
  const { data: rows } = await sb.from('pos_stock_take_items')
    .select('product_id, product_name, system_qty, counted_qty, variance_qty, variance_cents, counted_by, counted_at')
    .eq('stock_take_id', sessionId).order('counted_at', { ascending: false }).limit(2000)
  const lines: StocktakeLine[] = (rows ?? []).map(r => ({
    product_id: r.product_id as string, product_name: (r.product_name as string | null) ?? null,
    expected_qty: Number(r.system_qty) || 0, counted_qty: r.counted_qty != null ? Number(r.counted_qty) : null,
    variance_qty: r.variance_qty != null ? Number(r.variance_qty) : null, variance_cents: r.variance_cents != null ? Number(r.variance_cents) : null,
    counted_by: (r.counted_by as string | null) ?? null, counted_at: (r.counted_at as string | null) ?? null,
  }))
  return { session: s as StocktakeSession, lines }
}

/** Count one product in a session. Expected = LIVE items_on_hand at the session's outlet (book stock). Computes
 *  variance + variance value (cost). Upserts the line. NEVER mutates items_on_hand. */
export async function countStocktakeLine(sb: SupabaseClient, businessId: string, sessionId: string, productId: string, counted: number, staffId: string): Promise<StocktakeLine | null> {
  const { data: s } = await sb.from('pos_stock_takes').select('outlet_id, status').eq('business_id', businessId).eq('id', sessionId).maybeSingle()
  if (!s || s.status !== 'in_progress') return null
  const outletId = s.outlet_id as string | null
  const { data: inv } = await sb.from('pos_outlet_inventory').select('items_on_hand')
    .eq('business_id', businessId).eq('product_id', productId).eq('outlet_id', outletId ?? '').maybeSingle()
  const expected = Number(inv?.items_on_hand ?? 0)
  const countedQ = Math.max(0, Math.round(Number(counted) || 0))
  const variance = countedQ - expected
  let varianceCents = 0
  try { const rc = await resolveCostFor(sb, businessId, productId, outletId); if (rc.cost != null) varianceCents = Math.round(variance * rc.cost * 100) } catch { /* unknown cost → 0, never faked */ }
  const { data: prod } = await sb.from('pos_products').select('name').eq('id', productId).maybeSingle()
  const productName = (prod?.name as string | null) ?? null

  // Upsert the line (re-counting a product overwrites — recount). Keyed by (session, product).
  const { data: existing } = await sb.from('pos_stock_take_items').select('id, recount_count').eq('stock_take_id', sessionId).eq('product_id', productId).maybeSingle()
  const payload = { system_qty: expected, counted_qty: countedQ, variance_qty: variance, variance_cents: varianceCents, counted_by: staffId, counted_at: nowIso(), product_name: productName }
  const { error: lineErr } = existing?.id
    ? await sb.from('pos_stock_take_items').update({ ...payload, recount_count: (Number(existing.recount_count) || 0) + 1 }).eq('id', existing.id)
    : await sb.from('pos_stock_take_items').insert({ stock_take_id: sessionId, product_id: productId, recount_count: 0, ...payload })
  if (lineErr) return null // never report a count as recorded when the line didn't persist
  return { product_id: productId, product_name: productName, expected_qty: expected, counted_qty: countedQ, variance_qty: variance, variance_cents: varianceCents, counted_by: staffId, counted_at: payload.counted_at }
}

export interface SubmitResult { session_id: string; lines_counted: number; variances: number; total_variance_cents: number; reviews_raised: number; review_ids: string[] }

/** Submit a session: every non-zero-variance line files to the OWNER review queue (no stock moves). Session →
 *  committed. Idempotent: a re-submit of an already-committed session raises nothing. */
export async function submitStocktake(sb: SupabaseClient, businessId: string, sessionId: string, staffId: string, staffName: string): Promise<SubmitResult | null> {
  // Atomic claim: in_progress → committed (only one submit wins).
  const { data: claimed } = await sb.from('pos_stock_takes')
    .update({ status: 'committed', completed_at: nowIso() })
    .eq('business_id', businessId).eq('id', sessionId).eq('status', 'in_progress')
    .select('id, outlet_id, count_type').maybeSingle()
  if (!claimed?.id) return null
  const outletId = claimed.outlet_id as string | null

  const { data: lines } = await sb.from('pos_stock_take_items')
    .select('product_id, product_name, system_qty, counted_qty, variance_qty, variance_cents, counted_by')
    .eq('stock_take_id', sessionId).limit(5000)
  const counted = (lines ?? []).filter(l => l.counted_qty != null)
  const varianceLines = counted.filter(l => (Number(l.variance_qty) || 0) !== 0)
  let totalCents = 0
  const reviewIds: string[] = []

  for (const l of varianceLines) {
    const expected = Number(l.system_qty) || 0
    const countedQ = Number(l.counted_qty) || 0
    const variance = Number(l.variance_qty) || 0
    totalCents += Number(l.variance_cents) || 0
    const { data: rev } = await sb.from('inventory_review_queue').insert({
      business_id: businessId, outlet_id: outletId, flag_type: 'count_variance', product_id: l.product_id,
      expected_value: expected, actual_value: countedQ, variance,
      evidence: { expected, counted: countedQ, variance, variance_cents: Number(l.variance_cents) || 0, product_name: l.product_name ?? null, staff_id: l.counted_by ?? staffId, staff_name: staffName, session_id: sessionId, count_type: claimed.count_type, counted_at: nowIso() },
      raised_by_staff_id: (l.counted_by as string | null) ?? staffId, status: 'open',
    }).select('id').maybeSingle()
    if (rev?.id) reviewIds.push(rev.id as string)
  }

  await sb.from('pos_stock_takes').update({
    items_counted: counted.length, items_with_variance: varianceLines.length, total_variance_cents: totalCents,
    notes: `${claimed.count_type} count — ${varianceLines.length}/${counted.length} variances routed to owner review (stock NOT auto-adjusted)`,
  }).eq('id', sessionId)

  return { session_id: sessionId, lines_counted: counted.length, variances: varianceLines.length, total_variance_cents: totalCents, reviews_raised: reviewIds.length, review_ids: reviewIds }
}

// ── PART 2 — ABC cycle count ──────────────────────────────────────────────────────────────────────────────
export interface CycleItem { product_id: string; name: string; abc_tier: 'A' | 'B' | 'C'; expected_qty: number; last_counted_at: string | null; days_since: number | null; due_score: number }

const ABC_CADENCE_DAYS: Record<string, number> = { A: 1, B: 7, C: 30 } // A counted ~daily, B weekly, C monthly

/** Today's prioritised cycle-count subset for an outlet: ABC class (from product_performance_scores.abc_tier,
 *  latest per product) weighted by days-since-last-count vs the class cadence. A items surface most often.
 *  Returns the top `limit` most-due in-stock products — NOT all 74. */
export async function generateCycleCountList(sb: SupabaseClient, businessId: string, outletIdIn: string | null, limit = 10): Promise<CycleItem[]> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  if (!outletId) return []

  // latest abc_tier per product
  const { data: scores } = await sb.from('product_performance_scores')
    .select('product_id, abc_tier, scored_at').eq('business_id', businessId).not('abc_tier', 'is', null)
    .order('scored_at', { ascending: false }).limit(10000)
  const abc = new Map<string, 'A' | 'B' | 'C'>()
  for (const s of scores ?? []) { const pid = s.product_id as string; if (!abc.has(pid)) abc.set(pid, (s.abc_tier as 'A' | 'B' | 'C')) }

  // in-stock products at this outlet (expected qty)
  const { data: inv } = await sb.from('pos_outlet_inventory')
    .select('product_id, items_on_hand, pos_products!inner(name, is_active, track_stock)')
    .eq('business_id', businessId).eq('outlet_id', outletId).limit(10000)
  const stock = (inv ?? []).filter(r => (r.pos_products as { is_active?: boolean })?.is_active !== false)

  // last counted_at per product at THIS outlet (cycle rotation)
  const { data: counts } = await sb.from('pos_stock_take_items')
    .select('product_id, counted_at, pos_stock_takes!inner(outlet_id)')
    .eq('pos_stock_takes.outlet_id', outletId).not('counted_at', 'is', null)
    .order('counted_at', { ascending: false }).limit(10000)
  const lastCount = new Map<string, string>()
  for (const c of counts ?? []) { const pid = c.product_id as string; if (!lastCount.has(pid)) lastCount.set(pid, c.counted_at as string) }

  const now = Date.now()
  const items: CycleItem[] = stock.map(r => {
    const pid = r.product_id as string
    const tier = abc.get(pid) ?? 'C'
    const last = lastCount.get(pid) ?? null
    const daysSince = last ? (now - new Date(last).getTime()) / 86400_000 : null
    const cadence = ABC_CADENCE_DAYS[tier] ?? 30
    // due_score ≥ 1 means overdue for its class; never-counted = strongly due (cadence-scaled, finite).
    const due = daysSince == null ? 999 + (tier === 'A' ? 2 : tier === 'B' ? 1 : 0) : daysSince / cadence
    return { product_id: pid, name: (r.pos_products as { name?: string })?.name ?? 'Item', abc_tier: tier, expected_qty: Number(r.items_on_hand) || 0, last_counted_at: last, days_since: daysSince != null ? Math.round(daysSince * 10) / 10 : null, due_score: Math.round(due * 100) / 100 }
  })
  items.sort((a, b) => b.due_score - a.due_score || (a.abc_tier < b.abc_tier ? -1 : 1))
  return items.slice(0, Math.max(1, limit))
}

// ── PART 4 — variance intelligence (grounded pattern, never an accusation) ──────────────────────────────────
export interface CountPattern { product_id: string; counts: number; short: number; over: number; flag: boolean; fact: string | null }

/** Grounded shrinkage SIGNAL: over the product's last `window` counts, how many came up SHORT (negative variance).
 *  Returns a fact ("counted short N of last M") when the pattern is notable — never a cause/accusation. */
export async function countPattern(sb: SupabaseClient, businessId: string, productId: string, outletId?: string | null, window = 4): Promise<CountPattern> {
  let q = sb.from('pos_stock_take_items')
    .select('variance_qty, counted_at, pos_stock_takes!inner(business_id, outlet_id)')
    .eq('pos_stock_takes.business_id', businessId).eq('product_id', productId).not('variance_qty', 'is', null)
    .order('counted_at', { ascending: false }).limit(window)
  if (outletId) q = q.eq('pos_stock_takes.outlet_id', outletId)
  const { data } = await q
  const rows = (data ?? []) as Array<{ variance_qty: number | null }>
  const counts = rows.length
  const short = rows.filter(r => (Number(r.variance_qty) || 0) < 0).length
  const over = rows.filter(r => (Number(r.variance_qty) || 0) > 0).length
  const flag = counts >= 3 && short >= 3 // repeated shortfalls → owner signal
  const fact = flag ? `Counted short ${short} of the last ${counts} counts` : null
  return { product_id: productId, counts, short, over, flag, fact }
}

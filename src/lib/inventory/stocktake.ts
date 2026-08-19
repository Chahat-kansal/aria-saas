import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor, resolveCostBatch } from '@/lib/inventory/resolve-cost'
import { decideCountOutcome, THRESHOLD_DISCLOSURE, thresholdDisclosureFor, type CountActor, type CostTierMix } from '@/lib/inventory/count-policy'

/**
 * Prefix for the `reason` of a pos_stock_adjustments row created by a stocktake commit, followed by
 * the session id. pos_stock_adjustments has no reference column; this table's own established
 * convention is a structured reason prefix (avt.ts matches `recipe_depletion%`, guidance.ts matches
 * `other:`), so a stocktake-sourced adjustment is queryable the same way.
 */
export const STOCKTAKE_ADJUST_REASON_PREFIX = 'stocktake_commit:'

// INV-4 — the counting engine. THE LOCKED PRINCIPLE (extends INV-2): a count produces a VARIANCE (counted vs
// expected items_on_hand). Variance NEVER auto-corrects stock — every non-zero line files to the OWNER review
// queue (inventory_review_queue); the only path that moves items_on_hand is the owner ACCEPTING (review route,
// via adjustOutletStock). Sessions persist in pos_stock_takes (status in_progress→committed) + lines in
// pos_stock_take_items (REUSED, not duplicated). Per-outlet. Attributed (started_by / counted_by = staff PIN
// identity). ABC from product_performance_scores.abc_tier. Amounts grounded — INV-BASELINE-1 phase 3:
// an unknown cost is stored as NULL, never 0. "Worth nothing" and "value unknown" are different facts
// and this file used to record them identically.

export type CountType = 'full' | 'cycle' | 'perpetual'

export interface StocktakeSession {
  id: string; outlet_id: string | null; count_type: CountType; status: string
  started_by: string | null; started_at: string; completed_at: string | null
  items_counted: number; items_with_variance: number; total_variance_cents: number
}
export interface StocktakeLine {
  product_id: string; product_name: string | null; expected_qty: number; counted_qty: number | null
  variance_qty: number | null; variance_cents: number | null; counted_by: string | null; counted_at: string | null
  recount_required?: boolean  // INV-DEPTH-COUNTING: true when variance exceeds dual threshold
}

const nowIso = () => new Date().toISOString()

// INV-DEPTH-COUNTING — dual-threshold config (constants, not magic numbers inline).
const RECOUNT_THRESHOLD_UNITS = 5    // |variance_qty| > 5 units → blind recount required
const RECOUNT_THRESHOLD_PCT  = 0.10  // |variance_pct| > 10% of system_qty → blind recount required
function needsRecount(varianceQty: number, systemQty: number): boolean {
  const absV = Math.abs(varianceQty)
  if (absV === 0) return false
  if (systemQty === 0 && varianceQty > 0) return true  // phantom stock: counted where none expected
  if (absV > RECOUNT_THRESHOLD_UNITS) return true
  if (systemQty > 0 && absV / systemQty > RECOUNT_THRESHOLD_PCT) return true
  return false
}

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
  // INV-BASELINE-1 PHASE 3 — UNKNOWN COST IS NULL, NOT ZERO.
  // resolveCostFor is already honest: its own header says "an absent/zero cost is reported as
  // unknown (NULL), never silently treated as 0 and never fabricated". This caller was the liar —
  // it initialised to 0 and left it there, so "this variance is worth nothing" and "we have no idea
  // what this variance is worth" became the same stored value, indistinguishable forever after.
  let varianceCents: number | null = null
  try { const rc = await resolveCostFor(sb, businessId, productId, outletId); if (rc.cost != null) varianceCents = Math.round(variance * rc.cost * 100) } catch { /* unknown cost stays null — never faked */ }
  const { data: prod } = await sb.from('pos_products').select('name').eq('id', productId).maybeSingle()
  const productName = (prod?.name as string | null) ?? null

  // Upsert the line (re-counting a product overwrites — recount). Keyed by (session, product).
  const { data: existing } = await sb.from('pos_stock_take_items').select('id, recount_count').eq('stock_take_id', sessionId).eq('product_id', productId).maybeSingle()
  const countedAt = nowIso()
  const payload = { system_qty: expected, counted_qty: countedQ, variance_qty: variance, variance_cents: varianceCents, counted_by: staffId, counted_at: countedAt, product_name: productName }
  const { error: lineErr } = existing?.id
    ? await sb.from('pos_stock_take_items').update({ ...payload, recount_count: (Number(existing.recount_count) || 0) + 1 }).eq('id', existing.id)
    : await sb.from('pos_stock_take_items').insert({ stock_take_id: sessionId, product_id: productId, recount_count: 0, ...payload })
  if (lineErr) return null // never report a count as recorded when the line didn't persist

  // ── INV-BASELINE-1 PHASE 4 — refresh the denormalised cache, IN THE SAME OPERATION ────────────
  //
  // SOURCE OF TRUTH: pos_stock_take_items.counted_at. That is the ledger — per session, per
  // product, attributed via counted_by, and the only record that can answer "who counted this and
  // when". pos_outlet_inventory.last_counted_at is a CACHE of max(counted_at) for the
  // (product, outlet) pair, and exists so the cycle-count list can be built from one cheap query
  // instead of a join over every line ever counted.
  //
  // IT IS WRITTEN HERE AND NOWHERE ELSE. Writing it independently of a ledger line is what makes a
  // cache drift from its source, and this table already carried a write-only version of this column
  // (one writer in the old auto-correcting route, zero readers — preflight §Q5). Deliberately the
  // SAME `countedAt` value the line got, not a second nowIso(), so the two cannot differ by
  // construction rather than by discipline.
  //
  // Only after lineErr is clear: a cache entry for a count that did not persist would be a claim
  // about a count that never happened. Monotonic in practice — countedAt is always "now", and a
  // recount overwrites the line's counted_at with the same value written here.
  //
  // No row is created if none exists: generateCycleCountList only lists products that already have
  // a pos_outlet_inventory row, so a missing row cannot produce a stale "never counted" entry.
  const { error: cacheErr } = await sb.from('pos_outlet_inventory')
    .update({ last_counted_at: countedAt })
    .eq('business_id', businessId).eq('product_id', productId).eq('outlet_id', outletId ?? '')
  if (cacheErr) {
    // Non-fatal: the ledger line IS the record and it persisted. A stale cache makes the cycle
    // list suggest a product sooner than needed, which is noise, not data loss — but it is logged
    // rather than swallowed so drift is attributable.
    console.error('[stocktake] last_counted_at cache not refreshed (ledger line is intact):', { productId, outletId, error: cacheErr.message })
  }

  const recountRequired = needsRecount(variance, expected)
  return { product_id: productId, product_name: productName, expected_qty: expected, counted_qty: countedQ, variance_qty: variance, variance_cents: varianceCents, counted_by: staffId, counted_at: countedAt, recount_required: recountRequired }
}

/**
 * MS8 PHASE 3 — the cost-provenance mix for this business, so the threshold disclosure can describe
 * the owner's OWN data rather than the world in general.
 *
 * Reuses resolveCostBatch — the same resolver the valuation panel uses — so the mix reported here
 * cannot drift from the tiers shown elsewhere. Never throws: a disclosure is explanatory text, and
 * failing a stocktake submit because a sentence could not be personalised would be absurd. On any
 * failure the caller falls back to the general wording, which is still true.
 */
async function costTierMix(sb: SupabaseClient, businessId: string, outletId: string | null): Promise<CostTierMix | null> {
  try {
    const resolved = await resolveCostBatch(sb, businessId, outletId)
    const mix: CostTierMix = { verified: 0, estimated: 0, unknown: 0, total: 0 }
    for (const r of resolved.values()) {
      mix.total++
      if (r.grounding === 'verified') mix.verified++
      else if (r.source === 'unknown') mix.unknown++
      else mix.estimated++   // catalogue (estimated) and purchase_order/last_delivery (derived)
    }
    return mix.total > 0 ? mix : null
  } catch (e) {
    console.error('[stocktake] cost tier mix unavailable, using the general disclosure:', (e as Error).message)
    return null
  }
}

export interface SubmitResult {
  session_id: string; lines_counted: number; variances: number
  /** Sum of the variance lines whose value IS known. NULL when not one of them could be priced. */
  total_variance_cents: number | null
  reviews_raised: number; review_ids: string[]
  /** INV-BASELINE-1 PHASE 2 — sub-threshold owner lines applied directly, each with an attributed row. */
  committed: number
  /** Review rows the DB refused. Non-zero means variances that are neither applied NOR queued. */
  reviews_failed: number
  /** Why the threshold is in units and not dollars — for any surface that explains it. */
  threshold_disclosure: string
  /**
   * Variance lines whose value could not be resolved (no cost at any resolve-cost.ts tier). They
   * contribute NOTHING to total_variance_cents, so a surface showing that total must show this
   * count beside it or it presents a partial figure as a complete one.
   */
  unknown_value_lines: number
}

/**
 * Submit a session. Session → committed. Idempotent: a re-submit of an already-committed session
 * raises nothing.
 *
 * INV-BASELINE-1 PHASE 2 — three changes, all inside this function:
 *
 * (a) ATTRIBUTION IS UNCONDITIONAL. Any line that moves stock now writes an attributed
 *     pos_stock_adjustments row — who, when, why, and which session — before this returns. Nine
 *     pre-existing rows in that table have no matching ledger entry anywhere (preflight §Q3); this
 *     is the rail that stops the tenth.
 *
 * (b) MATERIALITY DECIDES, NOT ROLE. decideCountOutcome (lib/inventory/count-policy.ts) routes
 *     staff counts and material owner counts to review, and applies sub-threshold owner counts
 *     directly. Nothing about "a count never mutates items_on_hand" is being reversed: what changed
 *     is that an owner completing their own small count now counts as the human witnessing it.
 *     Staff counts behave exactly as before.
 *
 * (c) THE HEADER CAN NO LONGER LIE. It previously wrote "N/M variances routed to owner review"
 *     from the INTENDED count, with the review inserts unchecked — which is why three committed
 *     headers claim variance was routed while inventory_review_queue holds zero count_variance rows
 *     (preflight §Q2). Every insert is now checked and the note is written from what actually
 *     landed, with failures counted separately and logged.
 *
 * NO NEW SESSION STATUS IS NEEDED, and none is invented. The commit/review decision is PER LINE, so
 * a session can legitimately contain both; 'committed' on the header means the counting session was
 * submitted, which stays true either way. Per-line outcomes live where they belong — an attributed
 * pos_stock_adjustments row for applied lines, an inventory_review_queue row for routed ones.
 */
export async function submitStocktake(
  sb: SupabaseClient, businessId: string, sessionId: string, staffId: string, staffName: string,
  actor: CountActor = 'staff',
): Promise<SubmitResult | null> {
  // Atomic claim: in_progress → committed (only one submit wins).
  const { data: claimed } = await sb.from('pos_stock_takes')
    .update({ status: 'committed', completed_at: nowIso() })
    .eq('business_id', businessId).eq('id', sessionId).eq('status', 'in_progress')
    .select('id, outlet_id, count_type, started_at').maybeSingle()
  if (!claimed?.id) return null
  const outletId = claimed.outlet_id as string | null
  const sessionStartedAt = (claimed.started_at as string | null) ?? null

  // INV-DEPTH-COUNTING: include recount_count so the evidence and threshold gate have the live value.
  const { data: lines } = await sb.from('pos_stock_take_items')
    .select('product_id, product_name, system_qty, counted_qty, variance_qty, variance_cents, counted_by, recount_count')
    .eq('stock_take_id', sessionId).limit(5000)
  const counted = (lines ?? []).filter(l => l.counted_qty != null)
  const varianceLines = counted.filter(l => (Number(l.variance_qty) || 0) !== 0)
  let totalCents = 0
  const reviewIds: string[] = []

  // INV-DEPTH-COUNTING E: batch-fetch movements during the session for movement-context evidence.
  const varProductIds = varianceLines.map(l => l.product_id as string).filter(Boolean)
  const movementCount = new Map<string, number>()
  if (sessionStartedAt && varProductIds.length && outletId) {
    const { data: moves } = await sb.from('pos_stock_adjustments')
      .select('product_id').eq('business_id', businessId).eq('outlet_id', outletId)
      .in('product_id', varProductIds).gte('created_at', sessionStartedAt).limit(2000)
    for (const m of (moves ?? []) as Array<{ product_id: string }>) {
      movementCount.set(m.product_id, (movementCount.get(m.product_id) ?? 0) + 1)
    }
  }

  let committedCount = 0
  let reviewsFailed = 0
  let unknownValueLines = 0

  // Resolved once per submit, not per line — the mix is a property of the business, not the count.
  const disclosure = thresholdDisclosureFor(await costTierMix(sb, businessId, outletId))

  for (const l of varianceLines) {
    const expected = Number(l.system_qty) || 0
    const countedQ = Number(l.counted_qty) || 0
    const variance = Number(l.variance_qty) || 0
    const recountCount = Number(l.recount_count) || 0
    const recountRequired = needsRecount(variance, expected)
    const movsDuring = movementCount.get(l.product_id as string) ?? 0
    // Sum only what is KNOWN. A line with an unresolvable cost contributes nothing to the total and
    // is counted separately, so the header total is never a partial figure passing as a complete one.
    if (l.variance_cents == null) unknownValueLines++
    else totalCents += Number(l.variance_cents) || 0
    const productId = l.product_id as string
    const decision = decideCountOutcome({ varianceQty: variance, systemQty: expected, actor })

    // ── COMMIT: sub-threshold, owner-counted. Move the stock, and ATTRIBUTE IT. ──────────────────
    if (decision.outcome === 'commit') {
      // Stock first, attribution second, and the attribution is not conditional on anything: if the
      // adjust succeeded, a row explaining it MUST exist. adjustOutletStock is the canonical mutator
      // (atomic numeric RPC, floors at 0) — the same one the sale path uses.
      const after = await adjustOutletStock(sb, { businessId, outletId, productId, delta: variance })
      if (after == null) {
        // The stock did not move, so this line is not applied. Fall through to review rather than
        // silently dropping it — an unexplained no-op is how the nine orphan adjustments happened.
        console.error('[stocktake] commit failed to adjust stock, routing to review instead:', { sessionId, productId, variance })
      } else {
        // pos_stock_adjustments has no reference/notes column, so the session id rides in `reason`
        // using the structured-prefix convention this table already uses elsewhere
        // (avt.ts reads `ilike 'recipe_depletion%'`, guidance.ts reads `startsWith('other:')`).
        const { error: adjErr } = await sb.from('pos_stock_adjustments').insert({
          business_id: businessId, product_id: productId, outlet_id: outletId,
          adjustment_qty: variance, reason: `${STOCKTAKE_ADJUST_REASON_PREFIX}${sessionId}`,
          adjusted_by: staffName, staff_id: l.counted_by ?? staffId,
        })
        if (adjErr) {
          // Stock moved and the audit row did not. That is exactly the gap this phase exists to
          // close, so it is loud rather than swallowed.
          console.error('[stocktake] STOCK MOVED WITHOUT AN ATTRIBUTED ROW:', { sessionId, productId, variance, error: adjErr.message })
        }
        committedCount++
        continue
      }
    }

    // ── REVIEW: material, staff-counted, or a commit whose stock move failed. No stock moves. ────
    const { data: rev, error: revErr } = await sb.from('inventory_review_queue').insert({
      business_id: businessId, outlet_id: outletId, flag_type: 'count_variance', product_id: l.product_id,
      expected_value: expected, actual_value: countedQ, variance,
      evidence: { expected, counted: countedQ, variance, variance_cents: l.variance_cents == null ? null : Number(l.variance_cents), product_name: l.product_name ?? null, staff_id: l.counted_by ?? staffId, staff_name: staffName, session_id: sessionId, count_type: claimed.count_type, counted_at: nowIso(), recount_required: recountRequired, recount_count: recountCount, movements_during_count: movsDuring, session_started_at: sessionStartedAt, policy_reason: decision.reason, policy_detail: decision.detail, threshold_disclosure: disclosure },
      raised_by_staff_id: (l.counted_by as string | null) ?? staffId, status: 'open',
    }).select('id').maybeSingle()
    if (rev?.id) {
      reviewIds.push(rev.id as string)
    } else {
      // (c) — the failure that used to be invisible. This variance is now neither applied nor
      // queued, and the header below must not claim otherwise.
      reviewsFailed++
      console.error('[stocktake] review row NOT created — variance is neither applied nor queued:', { sessionId, productId, variance, error: revErr?.message ?? 'insert returned no row' })
    }
  }

  // (c) — every number here is what ACTUALLY happened, not what was intended. The old note was
  // built from varianceLines.length regardless of whether a single insert succeeded.
  const noteParts = [`${claimed.count_type} count — ${counted.length} counted, ${varianceLines.length} with variance`]
  if (committedCount) noteParts.push(`${committedCount} applied below threshold (attributed)`)
  if (reviewIds.length) noteParts.push(`${reviewIds.length} routed to owner review`)
  if (reviewsFailed) noteParts.push(`⚠ ${reviewsFailed} NEITHER applied nor queued — review row failed`)
  if (!committedCount && !reviewIds.length && !reviewsFailed) noteParts.push('no action required')

  // A total built only from the lines we could price. When NOT ONE variance line had a resolvable
  // cost the honest total is NULL — writing 0 would assert "this count cost nothing", a claim
  // rather than a measurement.
  const knownValueLines = varianceLines.length - unknownValueLines
  const headerTotal = varianceLines.length > 0 && knownValueLines === 0 ? null : totalCents
  if (unknownValueLines) noteParts.push(`${unknownValueLines} of ${varianceLines.length} variances have no known cost — value unknown`)

  await sb.from('pos_stock_takes').update({
    items_counted: counted.length, items_with_variance: varianceLines.length, total_variance_cents: headerTotal,
    notes: noteParts.join(' · '),
  }).eq('id', sessionId)

  return {
    session_id: sessionId, lines_counted: counted.length, variances: varianceLines.length,
    total_variance_cents: headerTotal, reviews_raised: reviewIds.length, review_ids: reviewIds,
    committed: committedCount, reviews_failed: reviewsFailed,
    threshold_disclosure: disclosure, unknown_value_lines: unknownValueLines,
  }
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
  // INV-BASELINE-1 PHASE 4 — reads the CACHE, in the query it was already making.
  //
  // last_counted_at is fetched here alongside items_on_hand, replacing a second 10,000-row query
  // that joined pos_stock_take_items back through pos_stock_takes to recover the same fact. The
  // cache is maintained by countStocktakeLine in the same operation as the ledger line, so the two
  // agree by construction; this list is the one reader allowed to prefer the cheap copy, because
  // rotation ordering tolerates staleness in a way attribution never could. Anything needing
  // correctness or "who counted it" must read pos_stock_take_items.counted_at instead.
  const { data: inv } = await sb.from('pos_outlet_inventory')
    .select('product_id, items_on_hand, last_counted_at, pos_products!inner(name, is_active, track_stock)')
    .eq('business_id', businessId).eq('outlet_id', outletId).limit(10000)
  const stock = (inv ?? []).filter(r => (r.pos_products as { is_active?: boolean })?.is_active !== false)

  const now = Date.now()
  const items: CycleItem[] = stock.map(r => {
    const pid = r.product_id as string
    const tier = abc.get(pid) ?? 'C'
    const last = (r.last_counted_at as string | null) ?? null
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

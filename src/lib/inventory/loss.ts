import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'
import { countPattern } from '@/lib/inventory/stocktake'

// INV-8 — loss & compliance. Recall/on-hold REUSES warehouse_quarantine (status quarantined→released/disposed/
// returned_to_supplier); on-hold NEVER deletes stock — the owner resolves it, and only disposal/return move stock
// (via canonical adjustOutletStock + an attributed pos_waste_log / pos_stock_adjustments). Shrinkage aggregates
// REAL loss rows (pos_waste_log + accepted count-variances). Age gate uses the EXISTING pos_products age flag.
// CENTS-SAFE: pos_waste_log.cost_cents is CENTS. GROUNDING-TEETH: theft is a grounded PATTERN, never an accusation.

const round2 = (n: number) => Math.round(n * 100) / 100
const aestDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(d)

async function productCost(sb: SupabaseClient, businessId: string, productId: string, outletId: string | null): Promise<number | null> {
  try { const rc = await resolveCostFor(sb, businessId, productId, outletId); return rc.cost } catch { return null }
}

// ── recall / on-hold (warehouse_quarantine) ─────────────────────────────────────────────────────────────────
export interface Hold { id: string; product_id: string; item_name: string; quantity: number; reason: string; status: string; quarantined_by: string | null; quarantined_at: string; value_at_risk: number | null }

/** Recall/hold a product (or batch): a not-sellable quarantine record. Stock is NOT deleted — held for the owner
 *  to resolve. Attributed.
 *  idempotency_key: UUID minted client-side for offline queue replay — used as the explicit warehouse_quarantine.id
 *  so a second replay finds the existing row and returns idempotent success without creating a duplicate hold. */
export async function recallProduct(sb: SupabaseClient, businessId: string, productId: string, quantity: number, reason: string, staffName: string, lotId?: string | null, idempotency_key?: string | null): Promise<{ ok: boolean; id: string | null; idempotent?: boolean }> {
  const idk = (idempotency_key ?? '').trim() || null
  if (idk) {
    // Check for existing hold with this key (idempotent replay guard).
    const { data: existing } = await sb.from('warehouse_quarantine').select('id').eq('id', idk).maybeSingle()
    if (existing?.id) return { ok: true, id: idk, idempotent: true }
  }
  const { data: p } = await sb.from('pos_products').select('name').eq('id', productId).eq('business_id', businessId).maybeSingle()
  const row: Record<string, unknown> = {
    business_id: businessId, item_id: productId, item_name: (p?.name as string) ?? 'Item', lot_id: lotId ?? null,
    quantity: Math.max(0, Math.round(quantity)), reason: reason.trim() || 'recall', status: 'quarantined', quarantined_by: staffName,
  }
  if (idk) row.id = idk
  const { data, error } = await sb.from('warehouse_quarantine').insert(row).select('id').maybeSingle()
  if (error && idk) {
    // Unique violation from concurrent replay — treat as idempotent success.
    return { ok: true, id: idk, idempotent: true }
  }
  return { ok: !error, id: (data?.id as string | null) ?? null }
}

/** Active holds (quarantined) with value-at-risk (cost × held qty). Business-level (a recall applies everywhere). */
export async function listHolds(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<Hold[]> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const { data } = await sb.from('warehouse_quarantine').select('id, item_id, item_name, quantity, reason, status, quarantined_by, quarantined_at')
    .eq('business_id', businessId).eq('status', 'quarantined').order('quarantined_at', { ascending: false }).limit(100)
  const out: Hold[] = []
  for (const h of data ?? []) {
    const pid = h.item_id as string
    const cost = /^[0-9a-f-]{36}$/.test(pid) ? await productCost(sb, businessId, pid, outletId) : null
    out.push({ id: h.id as string, product_id: pid, item_name: (h.item_name as string) ?? 'Item', quantity: Number(h.quantity) || 0, reason: (h.reason as string) ?? '', status: h.status as string, quarantined_by: (h.quarantined_by as string | null) ?? null, quarantined_at: h.quarantined_at as string, value_at_risk: cost != null ? round2(cost * (Number(h.quantity) || 0)) : null })
  }
  return out
}

/** Owner resolves a hold. release → un-flag (no stock change). dispose/return → canonical stock removal +
 *  attributed pos_waste_log (cents-safe) / pos_stock_adjustments. Atomic claim so it resolves once. */
export async function resolveHold(sb: SupabaseClient, businessId: string, holdId: string, resolution: 'released' | 'disposed' | 'returned_to_supplier', outletIdIn: string | null, staffName: string): Promise<{ ok: boolean; idempotent?: boolean; stock_changed?: boolean; new_on_hand?: number | null }> {
  const newStatus = resolution
  const { data: claimed } = await sb.from('warehouse_quarantine')
    .update({ status: newStatus, resolution, released_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('id', holdId).eq('status', 'quarantined')
    .select('id, item_id, item_name, quantity').maybeSingle()
  if (!claimed?.id) return { ok: true, idempotent: true, stock_changed: false }

  if (resolution === 'released') return { ok: true, stock_changed: false } // back to sellable, stock untouched

  const pid = claimed.item_id as string
  const qty = Number(claimed.quantity) || 0
  if (!/^[0-9a-f-]{36}$/.test(pid) || qty <= 0) return { ok: true, stock_changed: false, new_on_hand: null }
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const cost = await productCost(sb, businessId, pid, outletId)
  // canonical stock removal + attributed ledger
  const newOnHand = outletId ? await adjustOutletStock(sb, { businessId, outletId, productId: pid, delta: -qty }) : null
  if (outletId) await sb.from('pos_stock_adjustments').insert({ business_id: businessId, product_id: pid, outlet_id: outletId, adjustment_qty: -qty, reason: resolution === 'disposed' ? 'recall_disposal' : 'recall_return', adjusted_by: staffName })
  if (resolution === 'disposed') {
    await sb.from('pos_waste_log').insert({ business_id: businessId, product_id: pid, product_name: (claimed.item_name as string) ?? 'Item', quantity: qty, unit: 'each', reason: 'recall_disposal', recorded_by: staffName, cost_cents: cost != null ? Math.round(cost * qty * 100) : null })
  }
  return { ok: true, stock_changed: true, new_on_hand: newOnHand }
}

/** Quarantine view: active holds + failed temp checks today (INV-7) → one not-sellable / action-needed list. */
export async function quarantineView(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<{ holds: Hold[]; failed_temps: Array<{ location: string; reading_c: number; logged_at: string }>; total_at_risk: number }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const holds = await listHolds(sb, businessId, outletId)
  const todayStart = new Date(`${aestDate()}T00:00:00+10:00`).toISOString()
  let tq = sb.from('pos_temperature_logs').select('location, reading_c, logged_at').eq('business_id', businessId).eq('passed', false).gte('logged_at', todayStart).order('logged_at', { ascending: false }).limit(20)
  if (outletId) tq = tq.eq('outlet_id', outletId)
  const { data: temps } = await tq
  const totalAtRisk = round2(holds.reduce((s, h) => s + (h.value_at_risk ?? 0), 0))
  return { holds, failed_temps: (temps ?? []).map(t => ({ location: t.location as string, reading_c: Number(t.reading_c), logged_at: t.logged_at as string })), total_at_risk: totalAtRisk }
}

/** INV-6 reuse — a 'recall' task when there are active holds (idempotent, once/day). */
export async function ensureRecallTask(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<{ added: boolean }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const { count } = await sb.from('warehouse_quarantine').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'quarantined')
  if (!count) return { added: false }
  const today = aestDate()
  const { data: existing } = await sb.from('inventory_tasks').select('id').eq('business_id', businessId).eq('due_date', today).eq('task_type', 'recall').limit(1).maybeSingle()
  if (existing?.id) return { added: false }
  const { error } = await sb.from('inventory_tasks').insert({
    business_id: businessId, outlet_id: outletId, task_type: 'recall', product_id: null,
    title: `${count} item${count === 1 ? '' : 's'} on hold — action needed`, detail: 'Recalled / quarantined stock awaiting owner decision',
    hypothesis: `${count} product${count === 1 ? '' : 's'} are quarantined (recall/quality) — release, return to supplier, or dispose. Held stock is not sellable.`,
    priority: 35, generated_by: 'aria', due_date: today,
  })
  return { added: !error }
}

// ── shrinkage analysis ──────────────────────────────────────────────────────────────────────────────────────
export interface ShrinkageReport {
  period_days: number
  /** Only losses whose value is KNOWN. Unvalued variances are excluded, and counted below. */
  total_dollars: number
  by_category: Array<{ category: string; dollars: number; pct: number }>
  top_products: Array<{ name: string; dollars: number }>
  theft_signals: Array<{ name: string; fact: string }>
  /**
   * INV-BASELINE-1 PHASE 3 — accepted count-variances with no resolvable cost. They are REAL losses
   * of unknown value, so they are excluded from total_dollars rather than folded in as $0, and
   * reported here instead. A $0 contribution sitting silently beside real waste dollars is a
   * fabricated number inside an owner-facing money figure — exactly what GROUNDING-TEETH forbids.
   * Any surface rendering total_dollars MUST render this too when it is non-zero.
   */
  unvalued_variance_count: number
}
/** Where loss happens: waste (pos_waste_log, cents→$) + accepted negative count-variances. Grounded; theft is a
 *  pattern fact, never an accusation. */
export async function shrinkageReport(sb: SupabaseClient, businessId: string, outletIdIn: string | null, days = 30): Promise<ShrinkageReport> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const cat = new Map<string, number>()
  const prod = new Map<string, number>()
  const add = (c: string, p: string, d: number) => { if (d <= 0) return; cat.set(c, round2((cat.get(c) ?? 0) + d)); prod.set(p, round2((prod.get(p) ?? 0) + d)) }

  // waste (cents → dollars); reason 'expiry' / 'recall_disposal' bucketed separately
  const { data: waste } = await sb.from('pos_waste_log').select('product_name, reason, cost_cents, recorded_at').eq('business_id', businessId).gte('recorded_at', since).limit(5000)
  for (const w of waste ?? []) {
    const d = (Number(w.cost_cents) || 0) / 100
    const reason = (w.reason as string) ?? ''
    const c = reason.includes('expiry') ? 'Expiry' : reason.includes('recall') ? 'Recall disposal' : 'Waste'
    add(c, (w.product_name as string) ?? 'Item', d)
  }
  // accepted negative count-variances (real shrinkage owner accepted) → loss $ from evidence.variance_cents
  const { data: revs } = await sb.from('inventory_review_queue').select('product_id, variance, evidence').eq('business_id', businessId).eq('flag_type', 'count_variance').eq('resolution', 'accepted').lt('variance', 0).gte('created_at', since).limit(5000)
  const negIds = [...new Set((revs ?? []).map(r => r.product_id as string).filter(Boolean))]
  const { data: negProds } = negIds.length ? await sb.from('pos_products').select('id, name').in('id', negIds) : { data: [] }
  const nameMap = new Map((negProds ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  // INV-BASELINE-1 PHASE 3 — a variance we cannot price is EXCLUDED, not counted as zero.
  // Two sources of value, in order: the evidence snapshot written at count time, else a live cost
  // lookup. If neither resolves, the loss is real but its value is unknown, and it is tallied into
  // unvalued_variance_count instead of quietly adding $0.00 to an owner's shrinkage total.
  let unvaluedVariances = 0
  for (const r of revs ?? []) {
    const ev = (r.evidence ?? {}) as { variance_cents?: number | null }
    let d: number | null = ev.variance_cents != null ? Math.abs(Number(ev.variance_cents)) / 100 : null
    if (d == null || d === 0) {
      const cost = await productCost(sb, businessId, r.product_id as string, outletId)
      d = cost != null ? round2(Math.abs(Number(r.variance) || 0) * cost) : null
    }
    if (d == null) { unvaluedVariances++; continue }
    add('Count variance', nameMap.get(r.product_id as string) ?? 'Item', d)
  }

  const total = round2([...cat.values()].reduce((s, v) => s + v, 0))
  const byCategory = [...cat.entries()].sort((a, b) => b[1] - a[1]).map(([category, dollars]) => ({ category, dollars, pct: total > 0 ? Math.round((dollars / total) * 1000) / 10 : 0 }))
  const topProducts = [...prod.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, dollars]) => ({ name, dollars }))

  // theft-suspected = grounded pattern (repeated shorts), NOT an accusation
  const theft: Array<{ name: string; fact: string }> = []
  for (const id of negIds.slice(0, 8)) {
    const pat = await countPattern(sb, businessId, id, outletId)
    if (pat.flag && pat.fact) theft.push({ name: nameMap.get(id) ?? 'Item', fact: `${pat.fact} — unexplained, worth a closer look (not an accusation).` })
  }
  return { period_days: days, total_dollars: total, by_category: byCategory, top_products: topProducts, theft_signals: theft, unvalued_variance_count: unvaluedVariances }
}

// ── age-restricted gate ─────────────────────────────────────────────────────────────────────────────────────
export async function ageGateCheck(sb: SupabaseClient, businessId: string, productId: string): Promise<{ restricted: boolean; name: string | null }> {
  const { data } = await sb.from('pos_products').select('name, age_restricted, is_age_restricted').eq('id', productId).eq('business_id', businessId).maybeSingle()
  return { restricted: data?.age_restricted === true || data?.is_age_restricted === true, name: (data?.name as string | null) ?? null }
}
export async function logAgeCheck(sb: SupabaseClient, businessId: string, outletIdIn: string | null, productId: string, productName: string | null, staffId: string, staffName: string, confirmed: boolean): Promise<{ ok: boolean }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const { error } = await sb.from('pos_age_checks').insert({ business_id: businessId, outlet_id: outletId, product_id: productId, product_name: productName, staff_id: staffId, staff_name: staffName, confirmed })
  return { ok: !error }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrSeedReorderSettings } from '@/lib/inventory/par-levels'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'

// INV-AGENT-REPLENISH — velocity-driven replenishment draft generator (Tanpin Kanri: propose from real demand,
// never from par — 0 par values exist). Derives reorder need via days-of-cover = items_on_hand / daily_rate.
// Groups proposals by supplier where known; unknown-supplier items go to an "unassigned" draft. Owner approves
// in the existing purchase_order_drafts approve→send flow.
//
// HARD MONEY GATE: agent creates status='draft' only — never 'approved', 'pending_approval'→sent, or 'sent'.
// Cannot approve, send, or spend. Idempotent per week: one open ai_generated draft per supplier per
// week_starting (update in place if already exists).
// GROUNDING-TEETH: every proposal cites real daily_rate + days_of_cover; assumed lead times are stated.
// CENTS: total_cost_cents + unit_cost_cents are CENTS (integer). pos_products.cost_price is DOLLARS.

const DEFAULT_LEAD_DAYS = 5   // assumed when supplier has no delivery_days schedule
const MIN_DAILY_RATE = 0.05  // below this threshold = no meaningful velocity = skip (honest)
const LOOK_BACK_DAYS = 28
const TARGET_CYCLE_DAYS = 7  // additional buffer beyond lead+safety = one extra order cycle

// ── HARD SAFETY CAPS (INV-AGENT-REPLENISH-VERIFY) ────────────────────────────────────────────────────────
// These prevent a runaway draft from ever reaching the owner silently. Normal small-café orders are unaffected.
const MAX_LINES_PER_DRAFT = 60        // hard cap per draft — truncate + note overflow in reasoning
const MAX_QTY_DAYS_COVER = 60         // clamp suggested_qty to at most 60 days of demand per line
const LARGE_DRAFT_WARN_DOLLARS = 2000 // flag in aria_reasoning when total exceeds this (not a block)

const UNASSIGNED_KEY = '__unassigned__'

function currentWeekStartAEST(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayAest = fmt.format(new Date())
  const dow = new Date(todayAest + 'T12:00:00Z').getDay()  // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const [y, m, d] = todayAest.split('-').map(Number)
  const monday = new Date(Date.UTC(y, m - 1, d) + mondayOffset * 86400_000)
  return monday.getUTCFullYear() + '-' + String(monday.getUTCMonth() + 1).padStart(2, '0') + '-' + String(monday.getUTCDate()).padStart(2, '0')
}

// delivery_days convention: (getDay()+6)%7 = 0=Mon..6=Sun (per existing reorder-agent.ts)
function nextDeliveryDays(deliveryDays: number[]): number {
  const todayDow = (new Date().getDay() + 6) % 7
  for (let offset = 1; offset <= 14; offset++) {
    if (deliveryDays.includes((todayDow + offset) % 7)) return offset
  }
  return DEFAULT_LEAD_DAYS
}

export interface ReplenishLine {
  product_id: string
  product_name: string
  on_hand: number
  daily_rate: number
  days_of_cover: number
  suggested_qty: number
  unit_cost_cents: number
  line_total_cents: number
  reason: string
}

export interface ReplenishGroup {
  supplier_id: string | null
  supplier_name: string
  assumed_lead_time: boolean
  lead_days: number
  lines: ReplenishLine[]
  total_cost_cents: number
  unpriced_line_count: number
}

export interface ReplenishResult {
  groups: ReplenishGroup[]
  drafts_created: number
  drafts_updated: number
  items_below_cover: number
  skipped_no_velocity: number
  unassigned_line_count: number
  total_proposed_cents: number
}

export async function generateReplenishmentDrafts(
  sb: SupabaseClient, businessId: string, outletIdIn?: string | null
): Promise<ReplenishResult> {
  const settings = await getOrSeedReorderSettings(sb, businessId)
  const weekStarting = currentWeekStartAEST()
  const safetyDays = settings.buffer_weeks * 7

  // 1. Outlet inventory — sum items_on_hand per product (may span multiple outlet rows if no outlet filter)
  type InvRow = { product_id: string; items_on_hand: number | null; items_per_case: number | null }
  let invQ = sb.from('pos_outlet_inventory')
    .select('product_id, items_on_hand, items_per_case')
    .eq('business_id', businessId)
    .limit(600)
  if (outletIdIn) invQ = invQ.eq('outlet_id', outletIdIn)
  const { data: invRaw } = await invQ as { data: InvRow[] | null }
  if (!invRaw?.length) return { groups: [], drafts_created: 0, drafts_updated: 0, items_below_cover: 0, skipped_no_velocity: 0, unassigned_line_count: 0, total_proposed_cents: 0 }

  const invMap = new Map<string, { onHand: number; perCase: number }>()
  for (const r of invRaw) {
    const pid = r.product_id as string
    const existing = invMap.get(pid)
    invMap.set(pid, {
      onHand: (existing?.onHand ?? 0) + (Number(r.items_on_hand) || 0),
      perCase: existing?.perCase || Number(r.items_per_case) || 1,
    })
  }
  const allPids = [...invMap.keys()]

  // 2. 28-day velocity from pos_sale_items (direct by business_id + created_at — no pos_sales join needed)
  const since28 = new Date(Date.now() - LOOK_BACK_DAYS * 86400_000).toISOString()
  const { data: saleItems } = await sb.from('pos_sale_items')
    .select('product_id, quantity')
    .eq('business_id', businessId)
    .gte('created_at', since28)
    .in('product_id', allPids.slice(0, 400))
    .gt('quantity', 0)
    .limit(50000)
  const velMap = new Map<string, number>()
  for (const it of saleItems ?? []) {
    const pid = it.product_id as string
    velMap.set(pid, (velMap.get(pid) ?? 0) + (Number(it.quantity) || 0))
  }

  // 3. Product info (name, cost_price, supplier_id, items_per_case) — active products only
  const { data: prods } = await sb.from('pos_products')
    .select('id, name, supplier_id, items_per_case')
    .in('id', allPids.slice(0, 500))
    .eq('business_id', businessId)
    .eq('is_active', true)
  const prodMap = new Map((prods ?? []).map(p => [p.id as string, p]))
  // MS11 PHASE 1 — one batch cost resolution for every proposed line; the raw cost_price read is
  // gone. unit_cost_cents keeps the existing 0-means-unknown convention (rendered "(cost
  // unknown)" below), and the proposed total covers priced lines only.
  const replCostMap = await resolveCostBatch(sb, businessId, null)

  // 4. Suppliers (delivery_days, name, email)
  const supplierIds = [...new Set((prods ?? []).map(p => p.supplier_id as string | null).filter((s): s is string => !!s))]
  const { data: supplierRows } = supplierIds.length
    ? await sb.from('pos_suppliers').select('id, name, email, order_email, delivery_days').in('id', supplierIds)
    : { data: [] as Array<{ id: string; name: string | null; email: string | null; order_email: string | null; delivery_days: number[] | null }> }
  const supplierMap = new Map((supplierRows ?? []).map(s => [s.id as string, s]))

  // 5. PO-history fallback for products without supplier_id
  const noSupplierPids = allPids.filter(pid => !prodMap.get(pid)?.supplier_id)
  const histFallback = new Map<string, string>()
  if (noSupplierPids.length) {
    const { data: poLines } = await sb.from('pos_purchase_order_items')
      .select('product_id, pos_purchase_orders!inner(supplier_id, business_id)')
      .in('product_id', noSupplierPids.slice(0, 200))
      .eq('pos_purchase_orders.business_id', businessId)
      .order('created_at', { ascending: false, foreignTable: 'pos_purchase_orders' })
      .limit(500)
    for (const l of poLines ?? []) {
      const pid = l.product_id as string
      const sid = (l.pos_purchase_orders as { supplier_id?: string } | null)?.supplier_id ?? null
      if (sid && !histFallback.has(pid)) histFallback.set(pid, sid)
    }
  }

  // 6. Existing open ai_generated drafts this week — for idempotency (update vs insert)
  const { data: existingDrafts } = await sb.from('purchase_order_drafts')
    .select('id, supplier_id')
    .eq('business_id', businessId)
    .eq('draft_type', 'ai_generated')
    .eq('week_starting', weekStarting)
    .in('status', ['draft', 'pending_approval'])
  const openById = new Map((existingDrafts ?? []).map(d => [d.supplier_id as string | null, d.id as string]))

  // 7. Compute proposals per product and group by supplier
  type SupplierGroup = {
    supplierId: string | null
    supplierName: string
    supplierEmail: string | null
    deliveryDays: number[] | null
    lines: ReplenishLine[]
  }
  const groups = new Map<string, SupplierGroup>()
  let itemsBelowCover = 0
  let skippedNoVelocity = 0

  for (const pid of allPids) {
    const inv = invMap.get(pid)!
    const prod = prodMap.get(pid)
    if (!prod) continue

    const units28 = velMap.get(pid) ?? 0
    const dailyRate = units28 / LOOK_BACK_DAYS
    if (dailyRate < MIN_DAILY_RATE) { skippedNoVelocity++; continue }

    const onHand = inv.onHand
    const daysOfCover = dailyRate > 0 ? onHand / dailyRate : 9999

    const sid = (prod.supplier_id as string | null) ?? histFallback.get(pid) ?? null
    const sup = sid ? supplierMap.get(sid) : null
    const deliveryDays = (sup?.delivery_days as number[] | null) ?? null
    const hasSchedule = !!(deliveryDays?.length)
    const leadDays = hasSchedule ? nextDeliveryDays(deliveryDays!) : settings.lead_time_days
    const targetDays = leadDays + safetyDays + TARGET_CYCLE_DAYS

    if (daysOfCover >= targetDays) continue  // well stocked — skip

    itemsBelowCover++
    const neededUnits = Math.max(0, (targetDays - daysOfCover) * dailyRate)
    const caseSize = Math.max(1, inv.perCase || Number(prod.items_per_case) || 1)
    const rawQty = Math.ceil(neededUnits / caseSize) * caseSize
    if (rawQty <= 0) continue

    // QTY SAFETY CAP: clamp to MAX_QTY_DAYS_COVER days of demand — prevents single-line blowups
    const maxQtyCap = Math.max(caseSize, Math.ceil(MAX_QTY_DAYS_COVER * dailyRate / caseSize) * caseSize)
    const qtyClamped = rawQty > maxQtyCap
    const finalQty = qtyClamped ? maxQtyCap : rawQty

    const costDollars = replCostMap.get(pid)?.cost ?? 0
    const unitCostCents = costDollars > 0 ? Math.round(costDollars * 100) : 0
    const lineTotalCents = finalQty * unitCostCents

    const rateStr = (Math.round(dailyRate * 10) / 10).toString()
    const docStr = (Math.round(daysOfCover * 10) / 10).toString()
    const leadNote = hasSchedule ? 'next delivery ~' + leadDays + 'd' : 'assumed ' + leadDays + 'd lead (no schedule set)'
    const clampNote = qtyClamped ? ' · qty capped at ' + finalQty + ' (' + MAX_QTY_DAYS_COVER + 'd max, was ' + rawQty + ')' : ''
    const reason = rateStr + '/day · ' + docStr + 'd cover · ' + leadNote + clampNote

    const groupKey = sid ?? UNASSIGNED_KEY
    if (!groups.has(groupKey)) {
      const supName = (sup?.name as string | null) ?? (sid ? 'Supplier' : 'Unassigned — owner to route')
      const supEmail = (sup?.order_email as string | null) ?? (sup?.email as string | null) ?? null
      groups.set(groupKey, { supplierId: sid, supplierName: supName, supplierEmail: supEmail, deliveryDays, lines: [] })
    }
    // DEDUP GUARD: defensive check — invMap guarantees uniqueness but this makes it structurally impossible
    const g = groups.get(groupKey)!
    if (g.lines.some(l => l.product_id === pid)) continue
    g.lines.push({
      product_id: pid,
      product_name: (prod.name as string) ?? 'Item',
      on_hand: onHand,
      daily_rate: Math.round(dailyRate * 100) / 100,
      days_of_cover: Math.round(daysOfCover * 10) / 10,
      suggested_qty: finalQty,
      unit_cost_cents: unitCostCents,
      line_total_cents: lineTotalCents,
      reason,
    })
  }

  // 8. Write drafts (idempotent: update existing open draft or insert new one)
  let draftsCreated = 0
  let draftsUpdated = 0
  const resultGroups: ReplenishGroup[] = []
  let unassignedLineCount = 0

  for (const [key, g] of groups) {
    if (!g.lines.length) continue
    g.lines.sort((a, b) => a.days_of_cover - b.days_of_cover)

    // MAX LINES CAP: propose top N by urgency; note overflow in reasoning so owner sees there is more
    const totalQualified = g.lines.length
    const linesToWrite = g.lines.slice(0, MAX_LINES_PER_DRAFT)
    const overflowCount = totalQualified - linesToWrite.length
    const truncateNote = overflowCount > 0
      ? ' Note: ' + overflowCount + ' more item' + (overflowCount === 1 ? '' : 's') + ' below cover — showing top ' + MAX_LINES_PER_DRAFT + ' by urgency.'
      : ''

    // Priced lines only — an unknown-cost line is counted and named, never summed as $0.00.
    const totalCostCents = linesToWrite.reduce((s, l) => s + (l.unit_cost_cents > 0 ? l.line_total_cents : 0), 0)
    const unpricedLineCount = linesToWrite.filter(l => l.unit_cost_cents === 0).length
    const hasSchedule = !!(g.deliveryDays?.length)
    const leadDays = hasSchedule ? nextDeliveryDays(g.deliveryDays!) : settings.lead_time_days
    const isUnassigned = key === UNASSIGNED_KEY
    if (isUnassigned) unassignedLineCount += linesToWrite.length

    // $ GUARD: a large draft gets a visible warning in reasoning — money gate already prevents auto-send,
    // but a loud flag ensures the owner reads carefully before approving
    const largeDraftWarn = totalCostCents > LARGE_DRAFT_WARN_DOLLARS * 100
      ? ' ⚠ UNUSUALLY LARGE PROPOSAL ($' + (totalCostCents / 100).toFixed(2) + ' exceeds $' + LARGE_DRAFT_WARN_DOLLARS.toString() + ') — please review carefully before approving.'
      : ''

    // Grounded aria_reasoning — real numbers, stated assumptions
    const topItems = linesToWrite.slice(0, 5).map(l => {
      const costNote = l.unit_cost_cents > 0 ? ' @ $' + (l.unit_cost_cents / 100).toFixed(2) : ' (cost unknown)'
      return l.product_name + ': ' + l.on_hand + ' on hand (' + l.days_of_cover + 'd cover), ' + l.daily_rate + '/day — order ' + l.suggested_qty + costNote
    }).join('; ')
    const allUnpriced = unpricedLineCount === linesToWrite.length
    const totalDollars = allUnpriced ? 'unknown (no recorded costs)' : '$' + (totalCostCents / 100).toFixed(2)
    const leadNote = hasSchedule
      ? 'next delivery for ' + g.supplierName + ' ~' + leadDays + 'd per schedule'
      : 'lead time assumed ' + leadDays + 'd (no delivery schedule set for ' + g.supplierName + ')'
    const lineWord = linesToWrite.length === 1 ? 'line' : 'lines'
    const unpricedNote = unpricedLineCount > 0 ? ' ' + unpricedLineCount + ' of ' + linesToWrite.length + ' lines have no recorded cost — the total covers priced lines only.' : ''
    const reasoning = 'Velocity-derived replenishment for ' + g.supplierName + ' — ' + leadNote + '. Safety buffer: ' + safetyDays + 'd. Items (sorted by urgency): ' + topItems + '. Proposed total: ' + totalDollars + ' (' + linesToWrite.length + ' ' + lineWord + ').' + unpricedNote + truncateNote + largeDraftWarn + ' PROPOSE ONLY — no order placed. Owner must approve in the weekly-order flow.'

    const itemsJson = linesToWrite.map(l => ({
      product_id: l.product_id,
      product_name: l.product_name,
      suggested_qty: l.suggested_qty,
      unit_cost_cents: l.unit_cost_cents,
      reason: l.reason,
      on_hand: l.on_hand,
      daily_rate: l.daily_rate,
      days_of_cover: l.days_of_cover,
    }))

    const existingId = openById.get(g.supplierId)
    if (existingId) {
      await sb.from('purchase_order_drafts').update({
        items: itemsJson,
        total_cost_cents: allUnpriced ? null : totalCostCents,
        aria_reasoning: reasoning,
        supplier_name: g.supplierName,
        supplier_email: g.supplierEmail,
      }).eq('id', existingId).eq('business_id', businessId)
      draftsUpdated++
    } else {
      // HARD MONEY GATE: status='draft' only — agent can NEVER set approved, pending_approval→sent, or sent
      await sb.from('purchase_order_drafts').insert({
        business_id: businessId,
        draft_type: 'ai_generated',
        status: 'draft',
        supplier_id: g.supplierId,
        supplier_name: g.supplierName,
        supplier_email: g.supplierEmail,
        items: itemsJson,
        total_cost_cents: allUnpriced ? null : totalCostCents,
        aria_reasoning: reasoning,
        week_starting: weekStarting,
      })
      draftsCreated++
    }

    resultGroups.push({
      supplier_id: g.supplierId,
      supplier_name: g.supplierName,
      assumed_lead_time: !hasSchedule,
      lead_days: leadDays,
      lines: linesToWrite,
      // Stays a number for cached-PWA consumers (RULE 20 consumer test — the staff-app tasks
      // route reads this shape). It is the PRICED-LINES sum; unpriced_line_count beside it is
      // the additive honesty signal — a total without it reads as complete.
      total_cost_cents: totalCostCents,
      unpriced_line_count: unpricedLineCount,
    })
  }

  const totalProposedCents = resultGroups.reduce((s, g) => s + g.total_cost_cents, 0)
  return {
    groups: resultGroups,
    drafts_created: draftsCreated,
    drafts_updated: draftsUpdated,
    items_below_cover: itemsBelowCover,
    skipped_no_velocity: skippedNoVelocity,
    unassigned_line_count: unassignedLineCount,
    total_proposed_cents: totalProposedCents,
  }
}

/** Lightweight ground truth for Aria Ask / briefing: reads existing open ai_generated drafts for this week.
 *  Does NOT re-run the full draft generator — cheap, always consistent with what was proposed. */
export async function replenishmentGroundTruth(
  sb: SupabaseClient, businessId: string
): Promise<{ items_below_cover: number; proposed_spend_dollars: number | null; unassigned_supplier_count: number; open_draft_count: number }> {
  const weekStarting = currentWeekStartAEST()
  const { data: drafts } = await sb.from('purchase_order_drafts')
    .select('id, supplier_id, total_cost_cents, items')
    .eq('business_id', businessId)
    .eq('draft_type', 'ai_generated')
    .eq('week_starting', weekStarting)
    .in('status', ['draft', 'pending_approval'])

  if (!drafts?.length) return { items_below_cover: 0, proposed_spend_dollars: null, unassigned_supplier_count: 0, open_draft_count: 0 }

  let totalCents = 0
  let lineCount = 0
  let unassigned = 0
  for (const d of drafts) {
    totalCents += Number(d.total_cost_cents) || 0
    const lineItems = Array.isArray(d.items) ? (d.items as unknown[]).length : 0
    lineCount += lineItems
    if (!d.supplier_id) unassigned += lineItems
  }
  return {
    items_below_cover: lineCount,
    proposed_spend_dollars: totalCents > 0 ? Math.round(totalCents) / 100 : null,
    unassigned_supplier_count: unassigned,
    open_draft_count: drafts.length,
  }
}

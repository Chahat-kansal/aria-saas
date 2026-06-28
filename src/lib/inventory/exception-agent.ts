import type { SupabaseClient } from '@supabase/supabase-js'

// INV-AGENT-EXCEPTION — detect-only exception scanner.
// Files open inventory_review_queue rows for owner review.
// NEVER adjusts stock, NEVER resolves flags, NEVER spends. status='open' only.
//
// Owns:
//   short_delivery  — received POs with quantity_received < quantity_ordered
//   waste_spike     — 7d cost$ > 2x prior 3-week weekly average (weekly trend;
//                     complements the per-log same-day detector in waste.ts)
//   velocity_drop   — prior rate >=0.5/day (28-56d ago) AND recent rate <25% of prior (0-14d)
//
// Does NOT touch:
//   count_variance  — already filed by count.ts + stocktake.ts; this agent skips it entirely
//
// flag_type CHECK-LOCKED to ['count_variance','short_delivery','waste_spike','velocity_drop']
// — those four are the ONLY values used here; constraint is untouched.
//
// GROUNDING-TEETH: real signals only; thin history -> no flag; money in evidence in DOLLARS.
// IDEMPOTENT: one open flag per distinct exception; never refiles what is already open.

const LOOK_BACK_DAYS_SHORT = 30       // scan received POs within last 30 days
const LOOK_BACK_DAYS_WASTE = 28       // 7d recent + 21d prior baseline
const LOOK_BACK_DAYS_VEL = 56         // 14d recent + 28d prior (14d gap in between)
const VEL_RECENT_DAYS = 14            // recent window: 0-14d ago
const VEL_PRIOR_START_DAYS = 28       // prior window: starts at 28d ago, ends at 56d ago

const WASTE_SPIKE_MULT = 2.0           // recent 7d cost$ > 2x prior weekly avg = spike
const WASTE_BASELINE_MIN_DOLLARS = 2   // skip products with prior baseline < $2/week

const VEL_DROP_PRIOR_MIN = 0.5         // require prior rate >=0.5/day to qualify
const VEL_DROP_RECENT_MULT = 0.25      // recent rate < 25% of prior = severe drop (75%+ decline)
const VEL_PRIOR_MIN_UNITS = 14         // require >=14 units in prior 28d (consistent with 0.5/day * 28d)
const VEL_DEDUP_DAYS = 14             // suppress velocity_drop reflag within this window (days)

export interface ExceptionResult {
  short_delivery_filed: number
  waste_spike_filed: number
  velocity_drop_filed: number
  skipped_already_open: number
}

export async function scanExceptions(
  sb: SupabaseClient,
  businessId: string,
  outletIdIn?: string | null,
): Promise<ExceptionResult> {
  let shortFiled = 0
  let wasteFiled = 0
  let velFiled = 0
  let skipped = 0

  // ── A. SHORT DELIVERY ──────────────────────────────────────────────────────────────────────────
  // Scan received POs in last 30 days for lines where quantity_received < quantity_ordered.
  // Idempotency: check evidence->>'po_line_id' against ALL existing short_delivery flags (any
  // status) within the same window — prevents refiling flags the owner has already resolved.

  const shortLookbackIso = new Date(Date.now() - LOOK_BACK_DAYS_SHORT * 86400_000).toISOString()

  const { data: recentPos } = await sb.from('pos_purchase_orders')
    .select('id, supplier_name')
    .eq('business_id', businessId)
    .eq('status', 'received')
    .gte('received_at', shortLookbackIso)
    .limit(200)

  const poIds = (recentPos ?? []).map(p => p.id as string)
  const supplierOf = new Map((recentPos ?? []).map(p => [p.id as string, (p.supplier_name as string | null) ?? 'Unknown']))

  if (poIds.length > 0) {
    const [{ data: poLines }, { data: allShortFlags }] = await Promise.all([
      sb.from('pos_purchase_order_items')
        .select('id, order_id, product_id, product_name, quantity_ordered, quantity_received, unit_cost')
        .in('order_id', poIds)
        .in('receive_status', ['received', 'partial'])
        .limit(2000),
      // All existing flags for this window (any status) — prevents re-flagging resolved short deliveries
      sb.from('inventory_review_queue')
        .select('evidence')
        .eq('business_id', businessId)
        .eq('flag_type', 'short_delivery')
        .gte('created_at', shortLookbackIso)
        .limit(500),
    ])

    const flaggedLineIds = new Set(
      (allShortFlags ?? [])
        .map(f => ((f.evidence as Record<string, unknown> | null)?.po_line_id as string | undefined))
        .filter((id): id is string => Boolean(id))
    )

    for (const l of poLines ?? []) {
      const lineId = l.id as string
      const ordered = Number(l.quantity_ordered) || 0
      const received = Number(l.quantity_received) || 0
      if (ordered <= 0 || received >= ordered) continue
      if (flaggedLineIds.has(lineId)) { skipped++; continue }

      const shortUnits = ordered - received
      const unitCostDollars = Number(l.unit_cost) || 0
      const shortDollars = unitCostDollars > 0
        ? Math.round(shortUnits * unitCostDollars * 100) / 100
        : null

      await sb.from('inventory_review_queue').insert({
        business_id: businessId,
        outlet_id: null,
        flag_type: 'short_delivery',
        product_id: (l.product_id as string | null) ?? null,
        expected_value: ordered,
        actual_value: received,
        variance: received - ordered,
        evidence: {
          po_line_id: lineId,
          po_id: l.order_id as string,
          supplier_name: supplierOf.get(l.order_id as string) ?? 'Unknown',
          product_name: (l.product_name as string | null) ?? null,
          short_units: shortUnits,
          short_dollars: shortDollars,
          unit_cost_dollars: unitCostDollars > 0 ? unitCostDollars : null,
          ordered,
          received,
        },
        raised_by_staff_id: null,
        status: 'open',
      })
      shortFiled++
    }
  }

  // ── B. WASTE SPIKE (weekly trend) ─────────────────────────────────────────────────────────────
  // Compares recent 7d waste cost$ vs prior 21d (3-week avg). Catches SUSTAINED elevated waste
  // that the per-log detector in waste.ts misses (it only fires on the day the log entry is made).
  // expected_value = baseline weekly avg ($), actual_value = recent 7d ($), variance = delta ($).
  // Idempotency: skip if open/investigating/accepted waste_spike already exists for this product.

  const wasteLookbackIso = new Date(Date.now() - LOOK_BACK_DAYS_WASTE * 86400_000).toISOString()
  const waste7dIso = new Date(Date.now() - 7 * 86400_000).toISOString()

  const { data: wasteRows } = await sb.from('pos_waste_log')
    .select('product_id, product_name, cost_cents, recorded_at')
    .eq('business_id', businessId)
    .gte('recorded_at', wasteLookbackIso)
    .not('cost_cents', 'is', null)
    .gt('cost_cents', 0)
    .limit(5000)

  if ((wasteRows ?? []).length > 0) {
    const recentCents = new Map<string, number>()
    const priorCents = new Map<string, number>()
    const wasteProductNames = new Map<string, string>()

    for (const w of wasteRows ?? []) {
      const pid = w.product_id as string | null
      if (!pid) continue
      const cents = Number(w.cost_cents) || 0
      wasteProductNames.set(pid, (w.product_name as string | null) ?? 'Item')
      if ((w.recorded_at as string) >= waste7dIso) {
        recentCents.set(pid, (recentCents.get(pid) ?? 0) + cents)
      } else {
        priorCents.set(pid, (priorCents.get(pid) ?? 0) + cents)
      }
    }

    const { data: openWaste } = await sb.from('inventory_review_queue')
      .select('product_id')
      .eq('business_id', businessId)
      .eq('flag_type', 'waste_spike')
      .in('status', ['open', 'investigating', 'accepted'])
      .limit(200)
    const openWasteProducts = new Set(
      (openWaste ?? []).map(f => f.product_id as string | null).filter((p): p is string => Boolean(p))
    )

    for (const [pid, recentC] of recentCents) {
      if (openWasteProducts.has(pid)) { skipped++; continue }
      const priorC = priorCents.get(pid) ?? 0
      if (priorC <= 0) continue
      const priorWeeklyAvgDollars = priorC / 3 / 100    // 21d / 3 weeks / 100 (cents->$)
      if (priorWeeklyAvgDollars < WASTE_BASELINE_MIN_DOLLARS) continue
      const recentDollars = recentC / 100
      if (recentDollars <= priorWeeklyAvgDollars * WASTE_SPIKE_MULT) continue

      await sb.from('inventory_review_queue').insert({
        business_id: businessId,
        outlet_id: null,
        flag_type: 'waste_spike',
        product_id: pid,
        expected_value: Math.round(priorWeeklyAvgDollars * 100) / 100,
        actual_value: Math.round(recentDollars * 100) / 100,
        variance: Math.round((recentDollars - priorWeeklyAvgDollars) * 100) / 100,
        evidence: {
          product_name: wasteProductNames.get(pid) ?? 'Item',
          period_7d_dollars: Math.round(recentDollars * 100) / 100,
          baseline_weekly_avg_dollars: Math.round(priorWeeklyAvgDollars * 100) / 100,
          spike_multiple: Math.round((recentDollars / priorWeeklyAvgDollars) * 10) / 10,
          prior_window_days: 21,
          recent_window_days: 7,
          method: 'weekly_trend',
        },
        raised_by_staff_id: null,
        status: 'open',
      })
      wasteFiled++
    }
  }

  // ── C. VELOCITY DROP ──────────────────────────────────────────────────────────────────────────
  // Products with prior rate >=0.5/day (28-56d ago) that have severely declined in recent 14d
  // (recent rate < 25% of prior). The 14-28d gap intentionally excludes short-term fluctuations.
  // De-duped against slow_mover daily tasks (dead stock already surfaced to staff via that path).
  // Idempotency: skip if open/investigating/accepted velocity_drop exists within last VEL_DEDUP_DAYS.

  const velLookbackIso = new Date(Date.now() - LOOK_BACK_DAYS_VEL * 86400_000).toISOString()
  const velRecentCutoffIso = new Date(Date.now() - VEL_RECENT_DAYS * 86400_000).toISOString()
  const velPriorStartIso = new Date(Date.now() - VEL_PRIOR_START_DAYS * 86400_000).toISOString()

  const { data: saleItems } = await sb.from('pos_sale_items')
    .select('product_id, quantity, created_at')
    .eq('business_id', businessId)
    .gte('created_at', velLookbackIso)
    .gt('quantity', 0)
    .limit(30000)

  if ((saleItems ?? []).length > 0) {
    const recentUnits = new Map<string, number>()
    const priorUnits = new Map<string, number>()

    for (const s of saleItems ?? []) {
      const pid = s.product_id as string | null
      if (!pid) continue
      const qty = Number(s.quantity) || 0
      const ts = s.created_at as string
      if (ts >= velRecentCutoffIso) {
        // recent window: 0-14d ago
        recentUnits.set(pid, (recentUnits.get(pid) ?? 0) + qty)
      } else if (ts < velPriorStartIso) {
        // prior window: 28-56d ago (gap of 14-28d is unused — intentional)
        priorUnits.set(pid, (priorUnits.get(pid) ?? 0) + qty)
      }
    }

    const velDedupCutoffIso = new Date(Date.now() - VEL_DEDUP_DAYS * 86400_000).toISOString()
    const { data: openVel } = await sb.from('inventory_review_queue')
      .select('product_id')
      .eq('business_id', businessId)
      .eq('flag_type', 'velocity_drop')
      .in('status', ['open', 'investigating', 'accepted'])
      .gte('created_at', velDedupCutoffIso)
      .limit(200)
    const openVelProducts = new Set(
      (openVel ?? []).map(f => f.product_id as string | null).filter((p): p is string => Boolean(p))
    )

    // Today's slow_mover tasks — de-dup: skip velocity_drop if slow_mover already covers the product
    const todayAest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
    const { data: slowMoverTasks } = await sb.from('inventory_tasks')
      .select('product_id')
      .eq('business_id', businessId)
      .eq('task_type', 'slow_mover')
      .eq('due_date', todayAest)
      .eq('status', 'open')
      .limit(100)
    const slowMoverProducts = new Set(
      (slowMoverTasks ?? []).map(t => t.product_id as string | null).filter((p): p is string => Boolean(p))
    )

    // Products with enough prior history to compute a meaningful rate
    const qualifyingPids = [...priorUnits.keys()].filter(pid => (priorUnits.get(pid) ?? 0) >= VEL_PRIOR_MIN_UNITS)

    const velNameMap = new Map<string, string>()
    if (qualifyingPids.length > 0) {
      const { data: prods } = await sb.from('pos_products')
        .select('id, name')
        .in('id', qualifyingPids.slice(0, 200))
        .eq('business_id', businessId)
      for (const p of prods ?? []) velNameMap.set(p.id as string, (p.name as string | null) ?? 'Item')
    }

    for (const pid of qualifyingPids) {
      const priorTotal = priorUnits.get(pid) ?? 0
      const recentTotal = recentUnits.get(pid) ?? 0
      const priorRate = priorTotal / 28    // daily rate: prior 28d window
      const recentRate = recentTotal / 14  // daily rate: recent 14d window

      if (priorRate < VEL_DROP_PRIOR_MIN) continue
      if (recentRate >= priorRate * VEL_DROP_RECENT_MULT) continue
      if (openVelProducts.has(pid)) { skipped++; continue }
      if (slowMoverProducts.has(pid)) { skipped++; continue }

      await sb.from('inventory_review_queue').insert({
        business_id: businessId,
        outlet_id: null,
        flag_type: 'velocity_drop',
        product_id: pid,
        expected_value: Math.round(priorRate * 1000) / 1000,
        actual_value: Math.round(recentRate * 1000) / 1000,
        variance: Math.round((recentRate - priorRate) * 1000) / 1000,
        evidence: {
          product_name: velNameMap.get(pid) ?? 'Item',
          prior_rate_per_day: Math.round(priorRate * 100) / 100,
          recent_rate_per_day: Math.round(recentRate * 100) / 100,
          drop_pct: Math.round((1 - recentRate / priorRate) * 100),
          prior_window: '28-56d ago',
          recent_window: '0-14d ago',
          prior_total_units: priorTotal,
          recent_total_units: recentTotal,
          prior_window_days: 28,
          recent_window_days: 14,
        },
        raised_by_staff_id: null,
        status: 'open',
      })
      velFiled++
    }
  }

  return {
    short_delivery_filed: shortFiled,
    waste_spike_filed: wasteFiled,
    velocity_drop_filed: velFiled,
    skipped_already_open: skipped,
  }
}

export async function exceptionGroundTruth(
  sb: SupabaseClient,
  businessId: string,
): Promise<{
  counts: { count_variance: number; short_delivery: number; waste_spike: number; velocity_drop: number }
  total_open: number
  highest_dollar_exception: { type: string; description: string; dollars: number } | null
}> {
  const { data: flags } = await sb.from('inventory_review_queue')
    .select('flag_type, variance, evidence')
    .eq('business_id', businessId)
    .eq('status', 'open')
    .limit(500)

  const counts = { count_variance: 0, short_delivery: 0, waste_spike: 0, velocity_drop: 0 }
  let highest: { type: string; description: string; dollars: number } | null = null

  for (const f of flags ?? []) {
    const type = f.flag_type as string
    if (type in counts) counts[type as keyof typeof counts]++

    const ev = (f.evidence ?? {}) as Record<string, unknown>
    let dollars = 0
    if (type === 'short_delivery' && ev.short_dollars != null) {
      dollars = Number(ev.short_dollars) || 0
    } else if (type === 'waste_spike') {
      dollars = Math.abs(Number(f.variance) || 0)
    }

    if (dollars > (highest?.dollars ?? 0)) {
      highest = {
        type,
        description: String(ev.product_name ?? ev.supplier_name ?? type),
        dollars: Math.round(dollars * 100) / 100,
      }
    }
  }

  return {
    counts,
    total_open: Object.values(counts).reduce((s, v) => s + v, 0),
    highest_dollar_exception: highest,
  }
}

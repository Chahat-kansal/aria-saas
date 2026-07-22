import type { SupabaseClient } from '@supabase/supabase-js'

// INV-VELOCITY-1 — per-product, per-outlet velocity computed from stock_movements (reliable since
// INV-DECREMENT-FIX), rolling 7/28/90-day windows. movement_type='sale' ONLY — voids, refunds, and
// returns are now correctly typed distinct movement_types and must never inflate "how fast does this
// sell". Deterministic compute only; nothing here is LLM-inferred.
//
// "No history" is a DISTINCT state from 0/day: a product that has never had a 'sale' movement at a
// given outlet reports history_state='no_history' with null velocities, not zeroes — a genuinely dead
// mover (has history, sold nothing in the window) is a different fact from a product that's simply
// never been sold there (new/seasonal/wrong-outlet-catalogue), and collapsing them to the same "0"
// would hide exactly the distinction a buyer needs.
//
// Historical stock_movements rows predate per-outlet tagging (outlet_id is nullable, backfilled only
// going forward) — on a single-outlet business that's unambiguous (attributed to the one real outlet);
// on a multi-outlet business it genuinely isn't, so those units surface as their own "unattributed"
// rows rather than being guessed onto one outlet.

export interface MovementVelocityRow {
  product_id: string
  product_name: string
  outlet_id: string | null // null only for the "unattributed" bucket on a multi-outlet business
  outlet_name: string | null
  history_state: 'has_history' | 'no_history'
  units_7d: number
  units_28d: number
  units_90d: number
  velocity_7d_per_day: number | null
  velocity_28d_per_day: number | null
  velocity_90d_per_day: number | null
  first_sale_movement_at: string | null
  last_sale_movement_at: string | null
}

export interface MovementVelocityResult {
  computed_at: string
  rows: MovementVelocityRow[]
  unattributed_note: string | null
}

interface AggRow {
  product_id: string
  outlet_id: string | null
  units_7d: number
  units_28d: number
  units_90d: number
  first_sale_at: string | null
  last_sale_at: string | null
}

const earlier = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b)
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

/** Compute rolling-window velocity for every (track_stock, active) product × stock-tracking outlet. */
export async function computeMovementVelocity(supabase: SupabaseClient, businessId: string): Promise<MovementVelocityResult> {
  const [{ data: aggData }, { data: outletsData }, { data: productsData }, { data: invOutletsData }] = await Promise.all([
    supabase.rpc('movement_velocity_aggregate', { p_business: businessId }),
    supabase.from('pos_outlets').select('id, name').eq('business_id', businessId).eq('is_active', true),
    supabase.from('pos_products').select('id, name').eq('business_id', businessId).eq('track_stock', true).eq('is_active', true),
    supabase.from('pos_outlet_inventory').select('outlet_id').eq('business_id', businessId),
  ])

  const agg = (aggData ?? []) as AggRow[]
  const allOutlets = (outletsData ?? []) as { id: string; name: string }[]
  // "Single outlet" for unattributed-history attribution means single STOCK-TRACKING outlet — an
  // active pos_outlets row with zero pos_outlet_inventory rows (e.g. a table-booking-only outlet)
  // isn't a real place stock could have come from, so it shouldn't count toward "this business is
  // multi-outlet" for that purpose, and it correctly gets no product×outlet rows of its own either.
  const trackingOutletIds = new Set(((invOutletsData ?? []) as { outlet_id: string }[]).map(r => r.outlet_id))
  const outlets = allOutlets.filter(o => trackingOutletIds.has(o.id))
  const products = (productsData ?? []) as { id: string; name: string }[]
  const singleOutletId = outlets.length === 1 ? outlets[0].id : null

  // Merge unattributed (outlet_id null) rows into the single real outlet when unambiguous; else keep
  // them in their own bucket rather than guessing which outlet they belong to.
  let hadUnattributed = false
  const keyed = new Map<string, AggRow>()
  for (const a of agg) {
    let outletKey = a.outlet_id
    if (outletKey == null) {
      if (singleOutletId) outletKey = singleOutletId
      else hadUnattributed = true
    }
    const key = `${a.product_id}|${outletKey ?? 'unattributed'}`
    const existing = keyed.get(key)
    if (existing) {
      existing.units_7d = Number(existing.units_7d) + Number(a.units_7d)
      existing.units_28d = Number(existing.units_28d) + Number(a.units_28d)
      existing.units_90d = Number(existing.units_90d) + Number(a.units_90d)
      existing.first_sale_at = earlier(existing.first_sale_at, a.first_sale_at)
      existing.last_sale_at = later(existing.last_sale_at, a.last_sale_at)
    } else {
      keyed.set(key, { ...a, outlet_id: outletKey })
    }
  }

  const perDay = (units: number, days: number) => Math.round((units / days) * 100) / 100

  const rows: MovementVelocityRow[] = []
  for (const p of products) {
    for (const o of outlets) {
      const m = keyed.get(`${p.id}|${o.id}`)
      if (m) {
        rows.push({
          product_id: p.id, product_name: p.name, outlet_id: o.id, outlet_name: o.name,
          history_state: 'has_history',
          units_7d: Number(m.units_7d) || 0, units_28d: Number(m.units_28d) || 0, units_90d: Number(m.units_90d) || 0,
          velocity_7d_per_day: perDay(Number(m.units_7d) || 0, 7),
          velocity_28d_per_day: perDay(Number(m.units_28d) || 0, 28),
          velocity_90d_per_day: perDay(Number(m.units_90d) || 0, 90),
          first_sale_movement_at: m.first_sale_at, last_sale_movement_at: m.last_sale_at,
        })
      } else {
        rows.push({
          product_id: p.id, product_name: p.name, outlet_id: o.id, outlet_name: o.name,
          history_state: 'no_history',
          units_7d: 0, units_28d: 0, units_90d: 0,
          velocity_7d_per_day: null, velocity_28d_per_day: null, velocity_90d_per_day: null,
          first_sale_movement_at: null, last_sale_movement_at: null,
        })
      }
    }
    // Surface the genuinely-unattributed bucket for this product (multi-outlet only) as its own row —
    // disclosed, not dropped, and never merged into a specific outlet's figure.
    const unattributed = keyed.get(`${p.id}|unattributed`)
    if (unattributed) {
      rows.push({
        product_id: p.id, product_name: p.name, outlet_id: null, outlet_name: 'Unattributed (pre-outlet-tagging history)',
        history_state: 'has_history',
        units_7d: Number(unattributed.units_7d) || 0, units_28d: Number(unattributed.units_28d) || 0, units_90d: Number(unattributed.units_90d) || 0,
        velocity_7d_per_day: perDay(Number(unattributed.units_7d) || 0, 7),
        velocity_28d_per_day: perDay(Number(unattributed.units_28d) || 0, 28),
        velocity_90d_per_day: perDay(Number(unattributed.units_90d) || 0, 90),
        first_sale_movement_at: unattributed.first_sale_at, last_sale_movement_at: unattributed.last_sale_at,
      })
    }
  }

  return {
    computed_at: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
    rows,
    unattributed_note: hadUnattributed
      ? 'Some historical stock movements predate per-outlet tagging and could not be attributed to a specific outlet on this multi-outlet business — see the "Unattributed" rows.'
      : null,
  }
}

/** Persist (idempotent per day): delete-then-insert this day's snapshot rather than upsert, so the
 * two outlet-nullable/non-nullable partial unique indexes never need to act as an ON CONFLICT arbiter
 * (Postgres can't infer a partial index without a matching WHERE clause, which the JS client can't
 * express) — this is a once-a-day snapshot table, not concurrently-written sale state, so delete+insert
 * is a simple, correct idempotency strategy here. */
export async function persistMovementVelocity(supabase: SupabaseClient, businessId: string, result: MovementVelocityResult): Promise<void> {
  if (!result.rows.length) return
  await supabase.from('product_velocity').delete().eq('business_id', businessId).eq('computed_at', result.computed_at)
  const payload = result.rows.map(r => ({
    business_id: businessId, product_id: r.product_id, outlet_id: r.outlet_id, computed_at: result.computed_at,
    history_state: r.history_state, units_7d: r.units_7d, units_28d: r.units_28d, units_90d: r.units_90d,
    velocity_7d_per_day: r.velocity_7d_per_day, velocity_28d_per_day: r.velocity_28d_per_day, velocity_90d_per_day: r.velocity_90d_per_day,
    first_sale_movement_at: r.first_sale_movement_at, last_sale_movement_at: r.last_sale_movement_at,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('product_velocity').insert(payload)
  if (error) console.error('[persistMovementVelocity] insert failed:', error.message)
}

/** Read the latest persisted snapshot. Pass outletId to filter to one outlet's figures. */
export async function readMovementVelocity(supabase: SupabaseClient, businessId: string, outletId?: string): Promise<MovementVelocityRow[]> {
  const { data: latest } = await supabase.from('product_velocity').select('computed_at').eq('business_id', businessId).order('computed_at', { ascending: false }).limit(1).maybeSingle()
  if (!latest?.computed_at) return []
  let q = supabase.from('product_velocity')
    .select('product_id, outlet_id, history_state, units_7d, units_28d, units_90d, velocity_7d_per_day, velocity_28d_per_day, velocity_90d_per_day, first_sale_movement_at, last_sale_movement_at, pos_products(name), pos_outlets(name)')
    .eq('business_id', businessId).eq('computed_at', latest.computed_at as string)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data } = await q.limit(10000)
  return (data ?? []).map((r: Record<string, unknown>) => ({
    product_id: r.product_id as string,
    product_name: (r.pos_products as { name?: string } | null)?.name ?? 'Unknown',
    outlet_id: r.outlet_id as string | null,
    outlet_name: (r.pos_outlets as { name?: string } | null)?.name ?? (r.outlet_id ? null : 'Unattributed (pre-outlet-tagging history)'),
    history_state: r.history_state as 'has_history' | 'no_history',
    units_7d: Number(r.units_7d) || 0, units_28d: Number(r.units_28d) || 0, units_90d: Number(r.units_90d) || 0,
    velocity_7d_per_day: r.velocity_7d_per_day != null ? Number(r.velocity_7d_per_day) : null,
    velocity_28d_per_day: r.velocity_28d_per_day != null ? Number(r.velocity_28d_per_day) : null,
    velocity_90d_per_day: r.velocity_90d_per_day != null ? Number(r.velocity_90d_per_day) : null,
    first_sale_movement_at: r.first_sale_movement_at as string | null,
    last_sale_movement_at: r.last_sale_movement_at as string | null,
  }))
}

import { supabaseAdmin } from '@/lib/supabase-admin'

// I12 CAUSAL Part 1 — expand the event sources that feed intelligence_events (and therefore the
// causal engine). Pure detection from data that already exists; every event carries a dedup `ref`
// so emitIntelligenceEvent can skip an identical event inside a 24h window (the nightly stockout
// detector had no dedup, which is why duplicate rows piled up). severity uses the live CHECK set
// [critical,high,medium,info] — never 'low'.

export interface EmitParams {
  business_id: string
  event_type: string
  severity: 'critical' | 'high' | 'medium' | 'info'
  title: string
  body: string
  ref: string // dedup identity for this event (e.g. action_id, promotion_id)
  data?: Record<string, unknown>
  action_label?: string | null
  action_href?: string | null
}

// Insert one event unless an identical (business_id, event_type, ref) event exists in the last 24h.
export async function emitIntelligenceEvent(p: EmitParams): Promise<string | null> {
  const dayAgo = new Date(Date.now() - 24 * 86400000).toISOString()
  const { data: existing } = await supabaseAdmin
    .from('intelligence_events')
    .select('id')
    .eq('business_id', p.business_id)
    .eq('event_type', p.event_type)
    .eq('data->>ref', p.ref)
    .gte('triggered_at', dayAgo)
    .limit(1)
    .maybeSingle()
  if (existing) return null

  const { data, error } = await supabaseAdmin
    .from('intelligence_events')
    .insert({
      business_id: p.business_id,
      event_type: p.event_type,
      severity: p.severity,
      title: p.title.slice(0, 200),
      body: p.body.slice(0, 1000),
      data: { ...(p.data ?? {}), ref: p.ref },
      action_label: p.action_label ?? null,
      action_href: p.action_href ?? null,
      triggered_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()
  if (error) { console.error('[event-emitter] insert failed:', error.message); return null }
  return (data as { id?: string } | null)?.id ?? null
}

// Scan the cleanly-detectable change sources for one business and emit events (24h dedup each).
// Returns how many NEW events were emitted. Sources whose change cannot be verified without a
// history table (e.g. a >10% price move needs the prior price) are intentionally NOT fabricated.
export async function scanAndEmitEvents(businessId: string): Promise<{ emitted: number; by_type: Record<string, number> }> {
  const dayAgo = new Date(Date.now() - 24 * 86400000).toISOString()
  const by_type: Record<string, number> = {}
  const bump = (t: string) => { by_type[t] = (by_type[t] ?? 0) + 1 }

  const [actionsRes, promosRes, weatherRes, staffRes] = await Promise.all([
    // action_executed — aria_actions that reached status='executed' in the last 24h
    supabaseAdmin.from('aria_actions')
      .select('id, title, category, expected_impact, updated_at')
      .eq('business_id', businessId).eq('status', 'executed').gte('updated_at', dayAgo).limit(20),
    // promo_started — promotions created in the last 24h
    supabaseAdmin.from('aria_promotions')
      .select('id, promotion_name, target_day, estimated_lift_cents, created_at')
      .eq('business_id', businessId).gte('created_at', dayAgo).limit(20),
    // weather_extreme — cached weather signal with rain >=80% or temp <5 / >35 in the last 24h
    supabaseAdmin.from('aria_signal_cache')
      .select('payload, created_at')
      .eq('business_id', businessId).eq('signal_type', 'weather_today').gte('created_at', dayAgo).limit(5),
    // staff_change — a staff member whose record changed to a non-active status in the last 24h
    supabaseAdmin.from('staff_members')
      .select('id, first_name, last_name, status, updated_at')
      .eq('business_id', businessId).neq('status', 'active').gte('updated_at', dayAgo).limit(20),
  ])

  for (const a of (actionsRes.data ?? []) as Array<{ id: string; title: string; category: string | null; expected_impact: string | null }>) {
    const id = await emitIntelligenceEvent({
      business_id: businessId, event_type: 'action_executed', severity: 'info', ref: a.id,
      title: `Action executed: ${a.title}`.slice(0, 120),
      body: `Aria executed "${a.title}"${a.category ? ` (${a.category})` : ''}. Expected impact: ${a.expected_impact ?? 'n/a'}.`,
      data: { action_id: a.id, category: a.category, impact_expected: a.expected_impact },
    })
    if (id) bump('action_executed')
  }

  for (const pr of (promosRes.data ?? []) as Array<{ id: string; promotion_name: string | null; target_day: string | null; estimated_lift_cents: number | null }>) {
    const id = await emitIntelligenceEvent({
      business_id: businessId, event_type: 'promo_started', severity: 'info', ref: pr.id,
      title: `Promotion started: ${pr.promotion_name ?? 'Promotion'}`.slice(0, 120),
      body: `Promotion "${pr.promotion_name ?? 'Promotion'}"${pr.target_day ? ` targeting ${pr.target_day}` : ''} began.`,
      data: { promotion_id: pr.id, target_day: pr.target_day, estimated_lift_cents: pr.estimated_lift_cents },
    })
    if (id) bump('promo_started')
  }

  for (const w of (weatherRes.data ?? []) as Array<{ payload: { conditions_today?: string; temp_c?: number | null; rain_pct?: number | null; as_of?: string | null } | null }>) {
    const pl = w.payload
    if (!pl) continue
    const temp = pl.temp_c
    const rain = pl.rain_pct
    const isExtreme = (typeof rain === 'number' && rain >= 80) || (typeof temp === 'number' && (temp < 5 || temp > 35))
    if (!isExtreme) continue
    const dayKey = (pl.as_of ?? new Date().toISOString()).slice(0, 10)
    const id = await emitIntelligenceEvent({
      business_id: businessId, event_type: 'weather_extreme', severity: 'medium', ref: `weather_${dayKey}`,
      title: `Weather extreme: ${pl.conditions_today ?? 'severe conditions'}`.slice(0, 120),
      body: `Extreme weather today (${pl.conditions_today ?? 'severe'}${typeof temp === 'number' ? `, ${temp}°C` : ''}${typeof rain === 'number' ? `, ${rain}% rain` : ''}) may move foot traffic and revenue.`,
      data: { temp_c: temp, rain_pct: rain, conditions: pl.conditions_today },
    })
    if (id) bump('weather_extreme')
  }

  for (const s of (staffRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; status: string | null }>) {
    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'A staff member'
    const id = await emitIntelligenceEvent({
      business_id: businessId, event_type: 'staff_change', severity: 'medium', ref: s.id,
      title: `Staff change: ${name} now ${s.status}`.slice(0, 120),
      body: `${name}'s status changed to "${s.status}" — a roster change that can shift service capacity and revenue.`,
      data: { staff_id: s.id, status: s.status },
    })
    if (id) bump('staff_change')
  }

  const emitted = Object.values(by_type).reduce((s, n) => s + n, 0)
  return { emitted, by_type }
}

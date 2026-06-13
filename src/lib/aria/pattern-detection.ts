import { supabaseAdmin } from '@/lib/supabase-admin'

// PATTERN-MEMORY-1 (I3) — SQL-only (NO LLM, deterministic) detection of DURABLE data patterns,
// written to aria_business_memory as kind='pattern', source_type='signal'. Distinct from the
// EPHEMERAL aria_signal_cache signals (TTL-based) — these are compounding intelligence.

export interface DetectedPattern {
  kind: 'pattern'
  source_type: 'signal'
  content: string
  topic: string
  confidence: number
  importance: number
}

const CONFIDENCE_THRESHOLD = 0.6
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// created_at UTC → +10h ≈ AEST (fixed offset, matches date-au) for day/hour/month bucketing
function aest(iso: string): Date { return new Date(new Date(iso).getTime() + 10 * 3600000) }

export async function detectPatterns(businessId: string): Promise<DetectedPattern[]> {
  const now = Date.now()
  const since30 = new Date(now - 30 * 86400000).toISOString()
  const since56 = new Date(now - 56 * 86400000).toISOString()
  const since90 = new Date(now - 90 * 86400000).toISOString()
  const since180 = new Date(now - 180 * 86400000).toISOString()
  const out: DetectedPattern[] = []

  // ── 1. WEEKDAY_BASELINE (last 56 days) ──────────────────────────────────────
  try {
    const { data } = await supabaseAdmin.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', since56)
    const rows = (data ?? []) as Array<{ total_amount: number | null; created_at: string }>
    const dayAgg = new Map<string, { tot: number; dow: number }>()
    for (const r of rows) { const a = aest(r.created_at); const k = a.toISOString().slice(0, 10); const c = dayAgg.get(k) ?? { tot: 0, dow: a.getUTCDay() }; c.tot += Number(r.total_amount ?? 0); dayAgg.set(k, c) }
    if (dayAgg.size >= 4) {
      const dow = new Map<number, { tot: number; days: number }>()
      for (const v of dayAgg.values()) { const c = dow.get(v.dow) ?? { tot: 0, days: 0 }; c.tot += v.tot; c.days += 1; dow.set(v.dow, c) }
      const parts = [...dow.entries()].sort((a, b) => (b[1].tot / b[1].days) - (a[1].tot / a[1].days))
        .map(([d, s]) => `${DOW_NAMES[d]} $${(s.tot / s.days).toFixed(0)}`)
      const confidence = Math.min(1, dayAgg.size / 14)
      if (confidence >= CONFIDENCE_THRESHOLD && parts.length > 0)
        out.push({ kind: 'pattern', source_type: 'signal', topic: 'trading_patterns', confidence: +confidence.toFixed(2), importance: 7,
          content: `Weekday revenue baseline (last 56 days): ${parts.join(', ')}.` })
    }
  } catch { /* skip detector */ }

  // ── 2. PEAK_HOUR (last 30 days, top 3 hours by transaction count) ───────────
  try {
    const { data } = await supabaseAdmin.from('pos_sales').select('created_at')
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', since30)
    const rows = (data ?? []) as Array<{ created_at: string }>
    if (rows.length >= 20) {
      const hours = new Map<number, number>()
      for (const r of rows) { const h = aest(r.created_at).getUTCHours(); hours.set(h, (hours.get(h) ?? 0) + 1) }
      const days = new Set(rows.map(r => aest(r.created_at).toISOString().slice(0, 10))).size || 1
      const top = [...hours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      const confidence = Math.min(1, rows.length / 100)
      if (confidence >= CONFIDENCE_THRESHOLD)
        out.push({ kind: 'pattern', source_type: 'signal', topic: 'trading_patterns', confidence: +confidence.toFixed(2), importance: 6,
          content: `Peak hours (last 30 days): ${top.map(([h, c]) => `${h}:00 (~${(c / days).toFixed(1)} txns/day)`).join(', ')}.` })
    }
  } catch { /* skip */ }

  // ── 3. ITEM_CO_OCCURRENCE (last 30 days basket analysis) ────────────────────
  try {
    const { data } = await supabaseAdmin.from('pos_sale_items')
      .select('sale_id, product_name, pos_sales!inner(business_id, status, created_at)')
      .eq('pos_sales.business_id', businessId).eq('pos_sales.status', 'completed').gte('pos_sales.created_at', since30).limit(5000)
    const rows = (data ?? []) as Array<{ sale_id: string | null; product_name: string }>
    const baskets = new Map<string, Set<string>>()
    for (const r of rows) { if (!r.sale_id || !r.product_name) continue; const s = baskets.get(r.sale_id) ?? new Set<string>(); s.add(r.product_name); baskets.set(r.sale_id, s) }
    const itemCount = new Map<string, number>()
    const pairCount = new Map<string, number>()
    for (const items of baskets.values()) {
      const arr = [...items]
      for (const a of arr) itemCount.set(a, (itemCount.get(a) ?? 0) + 1)
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join(' ⟷ '); pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
      }
    }
    const topPair = [...pairCount.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topPair && topPair[1] >= 5) {
      const [aName, bName] = topPair[0].split(' ⟷ ')
      const base = Math.min(itemCount.get(aName) ?? 1, itemCount.get(bName) ?? 1)
      const pct = base > 0 ? Math.round((topPair[1] / base) * 100) : 0
      const confidence = Math.min(1, topPair[1] / 20)
      if (confidence >= CONFIDENCE_THRESHOLD && pct >= 25)
        out.push({ kind: 'pattern', source_type: 'signal', topic: 'product_patterns', confidence: +confidence.toFixed(2), importance: 6,
          content: `"${aName}" and "${bName}" sell together in ~${pct}% of baskets containing either (last 30 days, ${topPair[1]} co-occurrences).` })
    }
  } catch { /* skip */ }

  // ── 4. SEASONAL_TREND (month-over-month, last 6 months) ─────────────────────
  try {
    const { data } = await supabaseAdmin.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', since180)
    const rows = (data ?? []) as Array<{ total_amount: number | null; created_at: string }>
    const months = new Map<string, number>()
    for (const r of rows) { const k = aest(r.created_at).toISOString().slice(0, 7); months.set(k, (months.get(k) ?? 0) + Number(r.total_amount ?? 0)) }
    const ordered = [...months.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)
    if (ordered.length >= 3) {
      const changes: number[] = []
      for (let i = 1; i < ordered.length; i++) { const prev = ordered[i - 1][1]; if (prev > 0) changes.push(((ordered[i][1] - prev) / prev) * 100) }
      if (changes.length >= 2) {
        const avgMoM = changes.reduce((s, c) => s + c, 0) / changes.length
        const confidence = Math.min(1, ordered.length / 6)
        if (confidence >= CONFIDENCE_THRESHOLD)
          out.push({ kind: 'pattern', source_type: 'signal', topic: 'revenue_trend', confidence: +confidence.toFixed(2), importance: 7,
            content: `Revenue trending ${avgMoM >= 0 ? '+' : ''}${avgMoM.toFixed(1)}% month-over-month on average (last ${ordered.length} months).` })
      }
    }
  } catch { /* skip */ }

  // ── 5. CUSTOMER_RETENTION_PATTERN (last 90 days) ────────────────────────────
  try {
    const { data } = await supabaseAdmin.from('pos_sales').select('total_amount, customer_id')
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', since90).not('customer_id', 'is', null)
    const rows = (data ?? []) as Array<{ total_amount: number | null; customer_id: string }>
    if (rows.length >= 20) {
      const byCust = new Map<string, { visits: number; rev: number }>()
      for (const r of rows) { const c = byCust.get(r.customer_id) ?? { visits: 0, rev: 0 }; c.visits += 1; c.rev += Number(r.total_amount ?? 0); byCust.set(r.customer_id, c) }
      const totalRev = [...byCust.values()].reduce((s, c) => s + c.rev, 0)
      const repeatRev = [...byCust.values()].filter(c => c.visits >= 2).reduce((s, c) => s + c.rev, 0)
      if (totalRev > 0) {
        const pct = Math.round((repeatRev / totalRev) * 100)
        const confidence = Math.min(1, byCust.size / 30)
        if (confidence >= CONFIDENCE_THRESHOLD)
          out.push({ kind: 'pattern', source_type: 'signal', topic: 'customer_patterns', confidence: +confidence.toFixed(2), importance: 7,
            content: `${pct}% of revenue (last 90 days) comes from repeat customers (≥2 visits); ${byCust.size} identified customers.` })
      }
    }
  } catch { /* skip */ }

  return out.filter(p => p.confidence >= CONFIDENCE_THRESHOLD)
}

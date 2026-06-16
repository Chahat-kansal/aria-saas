import { supabaseAdmin } from '@/lib/supabase-admin'

// I10 BENCHMARK — surface where THIS business sits vs anonymized industry peers. Reads only the
// aggregate industry_benchmarks rows (percentiles + sample_size); never another business's raw data.
// Returns available:false (with a reason) when the business's industry has no fresh benchmark — which
// is the normal state until an industry passes the >=5-business privacy floor. No prompt rules: facts.

export interface BenchmarkComparison {
  metric_name: string
  your_value: number
  industry_p25: number | null
  industry_p50: number | null
  industry_p75: number | null
  sample_size: number
  percentile_position: 'below_p25' | 'p25_to_p50' | 'p50_to_p75' | 'above_p75' | 'unknown'
  vs_median_pct: number | null
  reasoning: string
}

export interface BenchmarkContext {
  industry: string | null
  available: boolean
  reason?: string
  comparisons: BenchmarkComparison[]
  _anchor_numbers: number[]
  computed_at: string
}

interface BenchRow {
  metric_name: string
  sample_size: number
  p25: number | null
  p50: number | null
  p75: number | null
}

function position(your: number, p25: number | null, p50: number | null, p75: number | null): BenchmarkComparison['percentile_position'] {
  if (p25 == null || p50 == null || p75 == null) return 'unknown'
  if (your < p25) return 'below_p25'
  if (your < p50) return 'p25_to_p50'
  if (your < p75) return 'p50_to_p75'
  return 'above_p75'
}

export async function computeBenchmarkContext(businessId: string): Promise<BenchmarkContext> {
  const now = new Date().toISOString()
  const empty = (industry: string | null, reason: string): BenchmarkContext =>
    ({ industry, available: false, reason, comparisons: [], _anchor_numbers: [], computed_at: now })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('industry').eq('id', businessId).maybeSingle()
  const industry = (biz?.industry as string | null) ?? null
  if (!industry) return empty(null, 'Business has no industry set — cannot match to peers.')

  // Latest non-expired weekly benchmarks for this industry
  const { data: benchRows } = await supabaseAdmin
    .from('industry_benchmarks')
    .select('metric_name, sample_size, p25, p50, p75, computed_at')
    .eq('industry', industry)
    .eq('metric_period', 'weekly')
    .gt('expires_at', now)
    .order('computed_at', { ascending: false })

  const rows = (benchRows ?? []) as Array<BenchRow & { computed_at: string }>
  if (rows.length === 0) {
    return empty(industry, `No current benchmark for "${industry}" — fewer than 5 businesses in this industry have enough data to form a privacy-safe peer set yet.`)
  }
  // newest row per metric (already ordered newest-first)
  const latest = new Map<string, BenchRow>()
  for (const r of rows) if (!latest.has(r.metric_name)) latest.set(r.metric_name, r)

  // This business's own current weekly metrics (same definitions as the cron)
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount, customer_id')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', since7d)
    .limit(100000)

  const s = (sales ?? []) as Array<{ total_amount: number | null; customer_id: string | null }>
  const rev = s.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0)
  const txns = s.length
  const customers = new Set(s.map(r => r.customer_id).filter((c): c is string => !!c)).size
  const ownValues: Record<string, number | null> = {
    weekly_revenue: txns > 0 ? +rev.toFixed(2) : null,
    daily_avg_transactions: txns > 0 ? +(txns / 7).toFixed(2) : null,
    avg_basket_size: txns > 0 ? +(rev / txns).toFixed(2) : null,
    customer_count: txns > 0 ? customers : null,
  }

  const comparisons: BenchmarkComparison[] = []
  const anchors: number[] = []
  for (const [metric, bench] of latest.entries()) {
    const your = ownValues[metric]
    for (const v of [bench.p25, bench.p50, bench.p75]) if (typeof v === 'number' && isFinite(v)) anchors.push(v)
    if (your == null) continue
    anchors.push(your)
    const vsMedian = bench.p50 != null && bench.p50 !== 0 ? +(((your - bench.p50) / bench.p50) * 100).toFixed(1) : null
    const pos = position(your, bench.p25, bench.p50, bench.p75)
    comparisons.push({
      metric_name: metric,
      your_value: your,
      industry_p25: bench.p25,
      industry_p50: bench.p50,
      industry_p75: bench.p75,
      sample_size: bench.sample_size,
      percentile_position: pos,
      vs_median_pct: vsMedian,
      reasoning: bench.p50 != null
        ? `Your ${metric.replace(/_/g, ' ')} is ${your}${vsMedian != null ? ` — ${Math.abs(vsMedian)}% ${vsMedian >= 0 ? 'above' : 'below'} the industry median (${bench.p50})` : ''}, across ${bench.sample_size} anonymized ${industry} peers.`
        : `Your ${metric.replace(/_/g, ' ')} is ${your}; industry median unavailable.`,
    })
  }

  if (comparisons.length === 0) {
    return empty(industry, `Benchmarks exist for "${industry}" but this business has no sales in the last 7 days to compare.`)
  }

  return {
    industry,
    available: true,
    comparisons,
    _anchor_numbers: anchors.filter(n => typeof n === 'number' && isFinite(n)),
    computed_at: now,
  }
}

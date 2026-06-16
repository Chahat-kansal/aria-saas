export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'

// I10 BENCHMARK — weekly cross-business aggregation. Privacy-safe: a benchmark row is emitted ONLY
// when >= 5 distinct businesses in an industry have sales in the period (the privacy floor). Stores
// percentiles + mean only — never an individual business's raw figure or identity.
const PRIVACY_FLOOR = 5

// nearest-rank percentile over a sorted ascending numeric array
function pct(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return +sorted[0].toFixed(2)
  const rank = Math.ceil(q * sorted.length)
  const idx = Math.min(Math.max(rank - 1, 0), sorted.length - 1)
  return +sorted[idx].toFixed(2)
}
function mean(arr: number[]): number | null {
  if (arr.length === 0) return null
  return +(arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(2)
}

interface PerBusiness { rev: number; txns: number; customers: Set<string>; returning: number }

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const periodDate = new Date().toISOString().slice(0, 10)
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  const priorStart = new Date(Date.now() - 90 * 86400000).toISOString()
  const priorEnd = since7d

  // All businesses with an industry set
  const { data: bizRows } = await supabaseAdmin
    .from('businesses')
    .select('id, industry')
    .not('industry', 'is', null)

  const byIndustry = new Map<string, string[]>()
  for (const b of (bizRows ?? []) as Array<{ id: string; industry: string }>) {
    if (!byIndustry.has(b.industry)) byIndustry.set(b.industry, [])
    byIndustry.get(b.industry)!.push(b.id)
  }

  // metric_name -> per-business value extractor (only businesses with txns>0 contribute)
  const METRICS: Array<{ name: string; value: (p: PerBusiness) => number }> = [
    { name: 'weekly_revenue',          value: p => +p.rev.toFixed(2) },
    { name: 'daily_avg_transactions',  value: p => +(p.txns / 7).toFixed(2) },
    { name: 'avg_basket_size',         value: p => +(p.rev / p.txns).toFixed(2) },
    { name: 'customer_count',          value: p => p.customers.size },
    { name: 'new_vs_returning_pct',    value: p => +((p.returning / p.txns) * 100).toFixed(1) },
  ]

  const rowsToUpsert: Array<Record<string, unknown>> = []
  const skipped: Array<{ industry: string; sample_size: number }> = []

  for (const [industry, ids] of byIndustry.entries()) {
    if (ids.length < PRIVACY_FLOOR) { skipped.push({ industry, sample_size: 0 }); continue }

    // Period sales (completed) for every business in this industry
    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('business_id, total_amount, customer_id, created_at')
      .in('business_id', ids)
      .eq('status', 'completed')
      .gte('created_at', since7d)
      .limit(100000)

    // Prior-window customer ids per business (for new-vs-returning classification)
    const { data: prior } = await supabaseAdmin
      .from('pos_sales')
      .select('business_id, customer_id')
      .in('business_id', ids)
      .eq('status', 'completed')
      .gte('created_at', priorStart)
      .lt('created_at', priorEnd)
      .limit(100000)

    const priorByBiz = new Map<string, Set<string>>()
    for (const r of (prior ?? []) as Array<{ business_id: string; customer_id: string | null }>) {
      if (!r.customer_id) continue
      if (!priorByBiz.has(r.business_id)) priorByBiz.set(r.business_id, new Set())
      priorByBiz.get(r.business_id)!.add(r.customer_id)
    }

    const perBiz = new Map<string, PerBusiness>()
    for (const r of (sales ?? []) as Array<{ business_id: string; total_amount: number | null; customer_id: string | null }>) {
      let pb = perBiz.get(r.business_id)
      if (!pb) { pb = { rev: 0, txns: 0, customers: new Set(), returning: 0 }; perBiz.set(r.business_id, pb) }
      pb.rev += Number(r.total_amount ?? 0)
      pb.txns += 1
      if (r.customer_id) {
        pb.customers.add(r.customer_id)
        if (priorByBiz.get(r.business_id)?.has(r.customer_id)) pb.returning += 1
      }
    }

    // sample = businesses that actually transacted in the period
    const sample = [...perBiz.values()].filter(p => p.txns > 0)
    const sampleSize = sample.length
    if (sampleSize < PRIVACY_FLOOR) { skipped.push({ industry, sample_size: sampleSize }); continue }

    for (const m of METRICS) {
      const arr = sample.map(m.value).filter(n => isFinite(n)).sort((a, b) => a - b)
      if (arr.length < PRIVACY_FLOOR) continue
      rowsToUpsert.push({
        industry,
        metric_name: m.name,
        metric_period: 'weekly',
        period_date: periodDate,
        sample_size: sampleSize,
        p25: pct(arr, 0.25),
        p50: pct(arr, 0.50),
        p75: pct(arr, 0.75),
        p90: pct(arr, 0.90),
        mean: mean(arr),
        computed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
    }
  }

  let upserted = 0
  if (rowsToUpsert.length > 0) {
    const { error } = await supabaseAdmin
      .from('industry_benchmarks')
      .upsert(rowsToUpsert, { onConflict: 'industry,metric_name,metric_period,period_date' })
    if (error) return NextResponse.json({ error: error.message, attempted: rowsToUpsert.length }, { status: 500 })
    upserted = rowsToUpsert.length
  }

  return NextResponse.json({
    ok: true,
    period_date: periodDate,
    industries_evaluated: byIndustry.size,
    benchmarks_upserted: upserted,
    skipped_below_floor: skipped,
    privacy_floor: PRIVACY_FLOOR,
  })
}

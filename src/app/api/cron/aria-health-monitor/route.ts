export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AiCallRow {
  agent_key: string
  model_id: string | null
  success: boolean
  latency_ms: number | null
}

interface AgentStats {
  agentKey: string
  modelId: string | null
  totalCalls: number
  successCount: number
  failCount: number
  maxLatencyMs: number
  hangCount: number   // calls exceeding 60 000ms
}

interface Anomaly {
  category: string    // dedupe key: runtime:<type>:<agent_key>
  subject: string
  message: string
  priority: 'high' | 'normal'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStatsMap(rows: AiCallRow[]): Map<string, AgentStats> {
  const map = new Map<string, AgentStats>()
  for (const row of rows) {
    const key = `${row.agent_key}::${row.model_id ?? 'unknown'}`
    const s = map.get(key) ?? {
      agentKey: row.agent_key,
      modelId: row.model_id,
      totalCalls: 0,
      successCount: 0,
      failCount: 0,
      maxLatencyMs: 0,
      hangCount: 0,
    }
    s.totalCalls++
    if (row.success) s.successCount++
    else s.failCount++
    if (row.latency_ms != null) {
      if (row.latency_ms > s.maxLatencyMs) s.maxLatencyMs = row.latency_ms
      if (row.latency_ms > 60_000) s.hangCount++
    }
    map.set(key, s)
  }
  return map
}

function detectAnomalies(
  recentStats: Map<string, AgentStats>,
  baselineStats: Map<string, AgentStats> | null,
): Anomaly[] {
  const anomalies: Anomaly[] = []

  for (const [key, s] of recentStats) {
    const { agentKey, modelId, totalCalls, successCount, failCount, maxLatencyMs, hangCount } = s
    const modelLabel = modelId ? ` [${modelId}]` : ''
    const successRate = totalCalls > 0 ? successCount / totalCalls : 1

    // Anomaly 1 — success rate < 85% with ≥10 calls (volume-gated: quiet ≠ broken)
    if (totalCalls >= 10 && successRate < 0.85) {
      const pct = (successRate * 100).toFixed(1)
      anomalies.push({
        category: `runtime:success_rate:${agentKey}`,
        subject: `[Health] Low success rate — ${agentKey}${modelLabel}`,
        message: [
          `Agent: ${agentKey}${modelLabel}`,
          `Success rate: ${pct}% (${successCount} ok / ${totalCalls} calls in last 24h)`,
          `Failures: ${failCount}`,
          `Max latency: ${maxLatencyMs > 0 ? (maxLatencyMs / 1000).toFixed(1) + 's' : 'n/a'}`,
          `Threshold: <85% success over ≥10 calls`,
        ].join('\n'),
        priority: successRate < 0.5 ? 'high' : 'normal',
      })
    }

    // Anomaly 2 — latency hang: any call exceeding 60s
    if (hangCount > 0) {
      anomalies.push({
        category: `runtime:latency:${agentKey}`,
        subject: `[Health] Latency hang — ${agentKey}${modelLabel}`,
        message: [
          `Agent: ${agentKey}${modelLabel}`,
          `Hang calls (>60s): ${hangCount} of ${totalCalls} calls in last 24h`,
          `Max latency observed: ${(maxLatencyMs / 1000).toFixed(1)}s`,
          `Threshold: any single call exceeding 60 000ms`,
        ].join('\n'),
        priority: maxLatencyMs > 120_000 ? 'high' : 'normal',
      })
    }

    // Anomaly 3 — failure-rate spike vs 7-day baseline
    if (baselineStats) {
      const base = baselineStats.get(key)
      if (base && base.totalCalls >= 10 && totalCalls >= 10) {
        const baseRate = base.failCount / base.totalCalls
        const recentRate = failCount / totalCalls
        // Spike: ≥2x baseline rate AND absolute increase ≥10pp AND ≥3 absolute failures
        if (recentRate >= 2 * baseRate && (recentRate - baseRate) >= 0.10 && failCount >= 3) {
          anomalies.push({
            category: `runtime:spike:${agentKey}`,
            subject: `[Health] Failure-rate spike — ${agentKey}${modelLabel}`,
            message: [
              `Agent: ${agentKey}${modelLabel}`,
              `Last 24h failure rate: ${(recentRate * 100).toFixed(1)}% (${failCount}/${totalCalls} calls)`,
              `7-day baseline failure rate: ${(baseRate * 100).toFixed(1)}% (${base.failCount}/${base.totalCalls} calls)`,
              `Spike ratio: ${(recentRate / baseRate).toFixed(1)}x baseline`,
              `Threshold: ≥2x baseline rate + ≥10pp increase + ≥3 absolute failures`,
            ].join('\n'),
            priority: 'normal',
          })
        }
      }
    }
  }

  return anomalies
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const since8d  = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch recent 24h — success + latency data
  const { data: recentRows, error: recentErr } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('agent_key,model_id,success,latency_ms')
    .gte('created_at', since24h)
    .limit(10_000)

  if (recentErr) {
    console.error('[aria-health-monitor] recent fetch failed:', recentErr.message)
    return NextResponse.json({ error: recentErr.message }, { status: 500 })
  }

  // Fetch prior 7-day baseline (days 2–8 ago) — success/fail only for spike detection
  const { data: baselineRows, error: baselineErr } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('agent_key,model_id,success,latency_ms')
    .gte('created_at', since8d)
    .lt('created_at', since24h)
    .limit(50_000)

  if (baselineErr) {
    console.warn('[aria-health-monitor] baseline fetch failed (spike detection skipped):', baselineErr.message)
  }

  const recentStats   = buildStatsMap((recentRows   ?? []) as AiCallRow[])
  const baselineStats = baselineRows ? buildStatsMap(baselineRows as AiCallRow[]) : null

  const anomalies = detectAnomalies(recentStats, baselineStats)

  console.log(`[aria-health-monitor] scanned ${recentStats.size} agents, found ${anomalies.length} anomalies`)

  // Dedup + write tickets
  let created = 0
  let skipped = 0

  for (const anomaly of anomalies) {
    // One ticket per ongoing problem — check for any open ticket with this category
    const { data: existing } = await supabaseAdmin
      .from('support_tickets')
      .select('id')
      .eq('category', anomaly.category)
      .neq('status', 'resolved')
      .maybeSingle()

    if (existing) {
      skipped++
      console.log(`[aria-health-monitor] dedup skip: ${anomaly.category}`)
      continue
    }

    const { error: insertErr } = await supabaseAdmin.from('support_tickets').insert({
      business_id:   null,
      user_email:    'aria-health@ariaos.site',
      subject:       anomaly.subject,
      message:       anomaly.message,
      status:        'open',
      priority:      anomaly.priority,
      source:        'aria_health',
      category:      anomaly.category,
      aria_attempted: false,
    })

    if (insertErr) {
      console.error('[aria-health-monitor] insert failed:', insertErr.message, anomaly.category)
    } else {
      created++
      console.log(`[aria-health-monitor] ticket created: ${anomaly.category}`)
    }
  }

  return NextResponse.json({
    ok: true,
    period_24h_start: since24h,
    agents_scanned: recentStats.size,
    anomalies_found: anomalies.length,
    tickets_created: created,
    tickets_deduplicated: skipped,
  })
}

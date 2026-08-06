export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'
import { sendAlert } from '@/lib/monitoring/alert'
import { shouldAlert, alertDedupeKey } from '@/lib/monitoring/ai-health'

// ─── SH-3 types ──────────────────────────────────────────────────────────────

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

// ─── SH-4 types ──────────────────────────────────────────────────────────────

type HealthStatus = 'green' | 'amber' | 'red'

interface WiringCheck {
  check_name: string
  status:     HealthStatus
  value:      number | null
  threshold:  string
  details:    Record<string, unknown>
}

interface BusinessRow {
  id:   string
  name: string
}

// ─── SH-3 helpers ─────────────────────────────────────────────────────────────

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

// ─── SH-4: wiring health pass ─────────────────────────────────────────────────

function wiringStatus(value: number, green: number, red: number, direction: 'lower_better' | 'higher_better'): HealthStatus {
  if (direction === 'lower_better') {
    if (value <= green) return 'green'
    if (value >= red)   return 'red'
    return 'amber'
  }
  // higher_better
  if (value >= green) return 'green'
  if (value <= red)   return 'red'
  return 'amber'
}

async function runWiringHealthPass(since7d: string, since24h: string): Promise<{
  checks: Array<WiringCheck & { business_id: string | null }>
  redActions: number
  checksWritten: number
}> {
  const checks: Array<WiringCheck & { business_id: string | null }> = []

  // ── Get all active businesses ─────────────────────────────────────────────
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('is_active', true)
    .limit(100)

  const bizList: BusinessRow[] = (businesses ?? []) as BusinessRow[]

  // ── Per-business checks ───────────────────────────────────────────────────
  for (const biz of bizList) {
    // 1. total_amount drift (sales where total_amount ≠ sum of line_totals)
    const { data: driftData, error: driftErr } = await supabaseAdmin
      .rpc('wh_drift_count', { p_business_id: biz.id, p_since: since7d })
    if (!driftErr) {
      const driftCount = (driftData ?? 0) as number
      checks.push({
        business_id: biz.id,
        check_name:  'total_amount_drift',
        status:      wiringStatus(driftCount, 0, 5, 'lower_better'),
        value:       driftCount,
        threshold:   'green=0, amber=1–4, red≥5 drifted sales in 7 days',
        details:     { business_name: biz.name, window_days: 7 },
      })
    }

    // 2. Headless sales (non-voided sales with zero line items)
    const { data: headlessData, error: headlessErr } = await supabaseAdmin
      .rpc('wh_headless_count', { p_business_id: biz.id, p_since: since7d })
    if (!headlessErr) {
      const headlessCount = (headlessData ?? 0) as number
      checks.push({
        business_id: biz.id,
        check_name:  'headless_sales',
        status:      wiringStatus(headlessCount, 0, 3, 'lower_better'),
        value:       headlessCount,
        threshold:   'green=0, amber=1–2, red≥3 headless sales in 7 days',
        details:     { business_name: biz.name, window_days: 7 },
      })
    }

    // 3. Payments coverage %
    const { data: covData, error: covErr } = await supabaseAdmin
      .rpc('wh_payments_coverage', { p_business_id: biz.id, p_since: since7d })
    if (!covErr && covData && (covData as Array<{ total_sales: number; paid_sales: number }>).length > 0) {
      const row = (covData as Array<{ total_sales: number; paid_sales: number }>)[0]
      const totalSales = Number(row.total_sales)   // PART 1b: now COMPLETED sales only (RPC fixed)
      const paidSales  = Number(row.paid_sales)
      const pct = totalSales > 0 ? Math.round((paidSales / totalSales) * 100) : 100
      // AUTOPILOT-FIX-1 PART 2: <10 completed sales is too small a sample to call a "failure".
      // Force green (insufficient-sample) rather than a red alert that becomes a fabricated crisis action.
      const covStatus = totalSales < 10 ? 'green' : wiringStatus(pct, 95, 80, 'higher_better')
      checks.push({
        business_id: biz.id,
        check_name:  'payments_coverage_pct',
        status:      covStatus,
        value:       pct,
        threshold:   'green≥95% (or <10 completed sales — insufficient sample), amber=80–94%, red<80% of COMPLETED sales have payment records',
        details:     { business_name: biz.name, total_sales: totalSales, paid_sales: paidSales, window_days: 7, sample_sufficient: totalSales >= 10 },
      })
    }

    // 4. Pending aria_actions count
    const { count: pendingAA } = await supabaseAdmin
      .from('aria_actions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .eq('status', 'pending')
    const aaCount = pendingAA ?? 0
    checks.push({
      business_id: biz.id,
      check_name:  'pending_aria_actions',
      status:      wiringStatus(aaCount, 9, 30, 'lower_better'),
      value:       aaCount,
      threshold:   'green≤9, amber=10–29, red≥30 pending aria_actions',
      details:     { business_name: biz.name },
    })

    // 5. Briefing tables write count (24 h) — all three tables
    const [
      { count: dailyBriefings },
      { count: ariaBriefings },
      { count: posBriefings },
    ] = await Promise.all([
      supabaseAdmin.from('daily_briefings')    .select('*', { count: 'exact', head: true }).eq('business_id', biz.id).gte('created_at', since24h),
      supabaseAdmin.from('aria_daily_briefings').select('*', { count: 'exact', head: true }).eq('business_id', biz.id).gte('created_at', since24h),
      supabaseAdmin.from('pos_daily_briefings') .select('*', { count: 'exact', head: true }).eq('business_id', biz.id).gte('created_at', since24h),
    ])
    const totalBriefings = (dailyBriefings ?? 0) + (ariaBriefings ?? 0) + (posBriefings ?? 0)
    checks.push({
      business_id: biz.id,
      check_name:  'briefing_table_writes_24h',
      status:      wiringStatus(totalBriefings, 2, 0, 'higher_better'),
      value:       totalBriefings,
      threshold:   'green≥2, amber=1, red=0 combined briefing rows written in last 24h',
      details:     {
        business_name: biz.name,
        daily_briefings: dailyBriefings ?? 0,
        aria_daily_briefings: ariaBriefings ?? 0,
        pos_daily_briefings:  posBriefings  ?? 0,
      },
    })
  }

  // ── System-wide checks (business_id = null) ───────────────────────────────

  // 6. Pending aria_agent_actions (unapproved, unexecuted)
  const { count: agentPending } = await supabaseAdmin
    .from('aria_agent_actions')
    .select('*', { count: 'exact', head: true })
    .is('approved', null)
    .eq('executed', false)
  const agentCount = agentPending ?? 0
  checks.push({
    business_id: null,
    check_name:  'pending_agent_actions',
    status:      wiringStatus(agentCount, 4, 20, 'lower_better'),
    value:       agentCount,
    threshold:   'green≤4, amber=5–19, red≥20 unapproved unexecuted agent actions',
    details:     { table: 'aria_agent_actions' },
  })

  // 7. Pending aria_autopilot_actions
  const { count: autopilotPending } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
  const autopilotCount = autopilotPending ?? 0
  checks.push({
    business_id: null,
    check_name:  'pending_autopilot_actions',
    status:      wiringStatus(autopilotCount, 9, 30, 'lower_better'),
    value:       autopilotCount,
    threshold:   'green≤9, amber=10–29, red≥30 pending autopilot actions',
    details:     { table: 'aria_autopilot_actions' },
  })

  // 8. RLS-disabled table count (via SQL function — requires pg_tables access)
  const { data: rlsData, error: rlsErr } = await supabaseAdmin
    .rpc('wh_rls_disabled_count')
  if (!rlsErr) {
    const rlsCount = (rlsData ?? 0) as number
    checks.push({
      business_id: null,
      check_name:  'rls_disabled_tables',
      status:      wiringStatus(rlsCount, 0, 5, 'lower_better'),
      value:       rlsCount,
      threshold:   'green=0, amber=1–4, red≥5 public tables with no RLS policies',
      details:     { schema: 'public' },
    })
  }

  // 9. aria_ai_calls failure rate by agent (24h) — per-agent check rows
  const { data: aiCallRows } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('agent_key, success')
    .gte('created_at', since24h)
    .limit(10_000)

  if (aiCallRows && aiCallRows.length > 0) {
    const agentMap = new Map<string, { total: number; fail: number }>()
    for (const row of aiCallRows as Array<{ agent_key: string; success: boolean }>) {
      const s = agentMap.get(row.agent_key) ?? { total: 0, fail: 0 }
      s.total++
      if (!row.success) s.fail++
      agentMap.set(row.agent_key, s)
    }
    for (const [agentKey, s] of agentMap) {
      if (s.total < 5) continue  // too few calls to be meaningful
      const failPct = Math.round((s.fail / s.total) * 100)
      checks.push({
        business_id: null,
        check_name:  `ai_failure_rate:${agentKey}`,
        status:      wiringStatus(failPct, 10, 25, 'lower_better'),
        value:       failPct,
        threshold:   'green≤10%, amber=11–24%, red≥25% failure rate (≥5 calls in 24h)',
        details:     { agent_key: agentKey, total_calls: s.total, fail_calls: s.fail },
      })
    }
  }

  // ── Write all check rows to aria_wiring_health_checks ────────────────────
  let checksWritten = 0
  if (checks.length > 0) {
    const rows = checks.map(c => ({
      business_id: c.business_id,
      check_name:  c.check_name,
      status:      c.status,
      value:       c.value,
      threshold:   c.threshold,
      details:     c.details,
    }))
    const { error: insertErr } = await supabaseAdmin
      .from('aria_wiring_health_checks')
      .insert(rows)
    if (insertErr) {
      console.error('[aria-health-monitor] wiring checks insert failed:', insertErr.message)
    } else {
      checksWritten = rows.length
    }
  }

  // ── RED → aria_actions (per business, high priority, system_health) ───────
  let redActions = 0
  const redChecks = checks.filter(c => c.status === 'red' && c.business_id !== null)

  for (const check of redChecks) {
    const title = buildRedTitle(check)
    const recommendation = buildRedRecommendation(check)

    // Dedup via upsertAriaAction — refreshes existing pending row or inserts new one
    try {
      await upsertAriaAction({
        business_id:    check.business_id!,
        category:       'system_health',
        title,
        recommendation,
        priority:       'high',
        status:         'pending',
        source:         'cron:aria-health-monitor',
        expected_impact: 'data integrity',
        confidence:     'high',
        payload: {
          check_name: check.check_name,
          value:      check.value,
          threshold:  check.threshold,
          details:    check.details,
          detected_at: new Date().toISOString(),
        },
      })
      redActions++
      console.log(`[aria-health-monitor] RED action upserted: ${check.check_name} biz=${check.business_id}`)
    } catch (e) {
      console.error('[aria-health-monitor] red action upsert failed:', (e as Error).message, check.check_name)
    }
  }

  // System-level RED → support_tickets (no business_id, following existing SH-3 pattern)
  const systemRedChecks = checks.filter(c => c.status === 'red' && c.business_id === null)
  for (const check of systemRedChecks) {
    const { data: existing } = await supabaseAdmin
      .from('support_tickets')
      .select('id')
      .eq('category', `wiring:${check.check_name}`)
      .neq('status', 'resolved')
      .limit(1)
    if (existing && existing.length > 0) continue

    await supabaseAdmin.from('support_tickets').insert({
      business_id:   null,
      user_email:    'aria-health@ariaos.site',
      subject:       `[Wiring] RED: ${check.check_name}`,
      message:       `Value: ${check.value} | Threshold: ${check.threshold}\nDetails: ${JSON.stringify(check.details)}`,
      status:        'open',
      priority:      'high',
      source:        'aria_health',
      category:      `wiring:${check.check_name}`,
      aria_attempted: false,
    })
  }

  return { checks, redActions, checksWritten }
}

function buildRedTitle(check: WiringCheck): string {
  switch (check.check_name) {
    case 'total_amount_drift':
      return `Data integrity: ${check.value} sales have total_amount ≠ sum of line items`
    case 'headless_sales':
      return `Data integrity: ${check.value} sales recorded with no line items`
    case 'payments_coverage_pct':
      return `Payments coverage dropped to ${check.value}% — missing payment records`
    case 'pending_aria_actions':
      return `${check.value} Aria recommendations pending review`
    case 'briefing_table_writes_24h':
      return `Briefing pipeline stalled — only ${check.value} rows written in last 24h`
    default:
      return `System health check failed: ${check.check_name} (value=${check.value})`
  }
}

function buildRedRecommendation(check: WiringCheck): string {
  switch (check.check_name) {
    case 'total_amount_drift':
      return 'Run a sales reconciliation report. Check for rounding errors in third-party sync or manual edits. Query pos_sales vs pos_sale_items for drifted rows.'
    case 'headless_sales':
      return 'Check pos_sales for rows with no matching pos_sale_items. May indicate a checkout crash mid-flow or an incomplete Square/offline sync.'
    case 'payments_coverage_pct':
      return 'Check pos_sale_payments for missing entries. Incomplete payment records affect revenue reporting and Xero sync accuracy.'
    case 'pending_aria_actions':
      return 'Review your Aria recommendations dashboard. A high backlog means insights are going unactioned.'
    case 'briefing_table_writes_24h':
      return 'Check the generate-briefings cron. If 0 rows in 24h, the briefing pipeline is stalled — your morning brief may not have run.'
    default:
      return `Investigate ${check.check_name}: current value ${check.value}. Threshold: ${check.threshold}.`
  }
}

// ─── SH-5: per-business AI daily budget ceiling ───────────────────────────────

async function checkBudgetCeilings(todayStart: string): Promise<number> {
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, ai_daily_budget_cents, ai_budget_alert_sent_date')
    .eq('is_active', true)
    .not('ai_daily_budget_cents', 'is', null)

  if (!businesses?.length) return 0

  const todayDate = todayStart.slice(0, 10)
  let alertsSent = 0

  for (const biz of businesses as Array<{ id: string; name: string; ai_daily_budget_cents: number; ai_budget_alert_sent_date: string | null }>) {
    if (biz.ai_budget_alert_sent_date === todayDate) continue // already alerted today — dedup

    const { data: rows } = await supabaseAdmin
      .from('aria_ai_calls')
      .select('cost_usd_cents')
      .eq('business_id', biz.id)
      .gte('created_at', todayStart)
      .limit(50_000)

    const spentCents = (rows ?? []).reduce((s, r) => s + Number((r as { cost_usd_cents: number | null }).cost_usd_cents ?? 0), 0)
    const pct = biz.ai_daily_budget_cents > 0 ? (spentCents / biz.ai_daily_budget_cents) * 100 : 0
    if (pct < 80) continue

    void sendAlert({
      title: `AI budget: ${biz.name} at ${pct.toFixed(0)}% of daily ceiling`,
      summary: `Spent $${(spentCents / 100).toFixed(2)} of $${(biz.ai_daily_budget_cents / 100).toFixed(2)} daily AI budget today. Alert-only — no calls have been blocked (never blocks an owner-initiated ask).`,
      severity: pct >= 100 ? 'high' : 'normal',
      details: { business_id: biz.id, spent_cents: spentCents, budget_cents: biz.ai_daily_budget_cents, pct: Math.round(pct) },
    })
    await supabaseAdmin.from('businesses').update({ ai_budget_alert_sent_date: todayDate }).eq('id', biz.id)
    alertsSent++
  }

  return alertsSent
}

// ─── COST-LEDGER-1: cost_subscriptions renewal alerts (T-7 days) ─────────────

async function checkSubscriptionRenewals(todayDate: string): Promise<number> {
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: renewing } = await supabaseAdmin
    .from('cost_subscriptions')
    .select('id, provider, plan_name, amount_usd_cents, renewal_date, renewal_alert_sent_date')
    .eq('active', true)
    .not('renewal_date', 'is', null)
    .lte('renewal_date', in7Days)
    .gte('renewal_date', todayDate)

  if (!renewing?.length) return 0

  let alertsSent = 0
  for (const sub of renewing as Array<{ id: string; provider: string; plan_name: string; amount_usd_cents: number; renewal_date: string; renewal_alert_sent_date: string | null }>) {
    if (sub.renewal_alert_sent_date === todayDate) continue // already alerted today — dedup (re-alerts once/day it's inside the window, not once total, so it stays visible as T-7 counts down)

    void sendAlert({
      title: `Renewal in ${Math.max(0, Math.round((new Date(sub.renewal_date).getTime() - Date.now()) / 86_400_000))}d: ${sub.provider} — ${sub.plan_name}`,
      summary: `$${(sub.amount_usd_cents / 100).toFixed(2)} renews ${sub.renewal_date}. Manage in Admin → Cost Ledger → Subscriptions.`,
      severity: 'normal',
      details: { cost_subscription_id: sub.id, provider: sub.provider, plan_name: sub.plan_name, amount_usd_cents: sub.amount_usd_cents, renewal_date: sub.renewal_date },
    })
    await supabaseAdmin.from('cost_subscriptions').update({ renewal_alert_sent_date: todayDate }).eq('id', sub.id)
    alertsSent++
  }
  return alertsSent
}

// ─── COST-LEDGER-1: Resend monthly quota (surface the forced-upgrade BEFORE it happens) ──────────

async function checkResendQuota(): Promise<boolean> {
  const { RESEND_MONTHLY_QUOTA } = await import('@/lib/external-apis')
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()

  const { count } = await supabaseAdmin
    .from('cost_events')
    .select('id', { count: 'exact', head: true })
    .eq('category', 'email')
    .eq('provider', 'resend')
    .gte('created_at', monthStart)

  const sent = count ?? 0
  const pct = (sent / RESEND_MONTHLY_QUOTA) * 100
  if (pct < 80) return false

  // Dedup: only one Resend-quota alert per calendar month, tracked via cost_subscriptions'
  // Resend row (seeded in the COST-LEDGER-1 migration) rather than a new table. renewal_alert_sent_date
  // is a `date` column, so the dedup marker is the 1st of the current month (a valid date), compared
  // by year-month prefix rather than exact equality.
  const monthFirstDay = monthStart.slice(0, 10)
  const { data: resendSub } = await supabaseAdmin
    .from('cost_subscriptions')
    .select('id, renewal_alert_sent_date')
    .eq('provider', 'Resend').eq('plan_name', 'Free/Pro').maybeSingle()
  if (resendSub?.renewal_alert_sent_date?.slice(0, 7) === monthFirstDay.slice(0, 7)) return false

  void sendAlert({
    title: `Resend email volume at ${pct.toFixed(0)}% of monthly quota`,
    summary: `${sent} of ${RESEND_MONTHLY_QUOTA} emails sent this month. The real cost event is the forced plan upgrade this triggers — act before it happens, not after the bill.`,
    severity: pct >= 100 ? 'high' : 'normal',
    details: { sent, quota: RESEND_MONTHLY_QUOTA, pct: Math.round(pct) },
  })
  if (resendSub?.id) await supabaseAdmin.from('cost_subscriptions').update({ renewal_alert_sent_date: monthFirstDay }).eq('id', resendSub.id)
  return true
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const now = Date.now()
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const since8d  = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()
  const since7d  = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── SH-3: AI call anomaly detection ──────────────────────────────────────

  const { data: recentRows, error: recentErr } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('agent_key,model_id,success,latency_ms')
    .gte('created_at', since24h)
    .limit(10_000)

  if (recentErr) {
    console.error('[aria-health-monitor] recent fetch failed:', recentErr.message)
    return NextResponse.json({ error: recentErr.message }, { status: 500 })
  }

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
  const anomalies     = detectAnomalies(recentStats, baselineStats)

  console.log(`[aria-health-monitor] SH-3: scanned ${recentStats.size} agents, found ${anomalies.length} anomalies`)

  let sh3Created = 0
  let sh3Skipped = 0

  for (const anomaly of anomalies) {
    const { data: existingRows, error: dedupErr } = await supabaseAdmin
      .from('support_tickets')
      .select('id')
      .eq('category', anomaly.category)
      .neq('status', 'resolved')
      .limit(1)

    if (dedupErr) console.warn('[aria-health-monitor] dedup query error:', dedupErr.message, anomaly.category)

    if (existingRows && existingRows.length > 0) {
      sh3Skipped++
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
      sh3Created++
      console.log(`[aria-health-monitor] SH-3 ticket created: ${anomaly.category}`)
    }
  }

  // ── SH-5: per-business AI daily budget ceiling (AI-COST-2) ────────────────
  // Config, default OFF (ai_daily_budget_cents is NULL for every business today). Alert-only —
  // never blocks a call, and this cron never touches ask_aria/council's request path at all.
  // "Not for savings — for SaaS plan enforcement later and runaway protection now" per the sprint.
  // Calendar-day window (not a rolling 24h one) since this is a DAILY ceiling that resets at midnight.
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'
  const budgetAlertsSent = await checkBudgetCeilings(todayStart)
  if (budgetAlertsSent > 0) console.log(`[aria-health-monitor] SH-5: ${budgetAlertsSent} budget-ceiling alert(s) sent`)

  // ── SH-6: cost_subscriptions renewals (T-7 days) + SH-7: Resend monthly quota (COST-LEDGER-1) ──
  const renewalAlertsSent = await checkSubscriptionRenewals(todayStart.slice(0, 10))
  if (renewalAlertsSent > 0) console.log(`[aria-health-monitor] SH-6: ${renewalAlertsSent} renewal alert(s) sent`)
  const resendQuotaAlerted = await checkResendQuota()
  if (resendQuotaAlerted) console.log('[aria-health-monitor] SH-7: Resend quota alert sent')

  // ── SH-4: wiring health pass ──────────────────────────────────────────────

  const { checks, redActions, checksWritten } = await runWiringHealthPass(since7d, since24h)

  const redCount   = checks.filter(c => c.status === 'red').length
  const amberCount = checks.filter(c => c.status === 'amber').length
  const greenCount = checks.filter(c => c.status === 'green').length

  console.log(`[aria-health-monitor] SH-4: ${checksWritten} checks written — ${redCount} red / ${amberCount} amber / ${greenCount} green — ${redActions} aria_actions created`)

  // ── MONITOR-1: surface failures (AI anomalies, red wiring checks, failed crons) to the alert
  // channel. Fire-and-forget; no-ops if ALERT_WEBHOOK is unset. Read-only (no table writes here).
  let failedCrons = 0
  try {
    const { count } = await supabaseAdmin
      .from('cron_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('started_at', since24h)
    failedCrons = count ?? 0
  } catch (e) {
    console.warn('[aria-health-monitor] cron_logs failure read failed:', (e as Error).message)
  }
  if (anomalies.length > 0 || redCount > 0 || failedCrons > 0) {
    void sendAlert({
      title: 'Aria health: failures detected (last 24h)',
      summary: `${anomalies.length} AI anomaly(ies) · ${redCount} red wiring check(s) · ${failedCrons} failed cron run(s).`,
      severity: redCount > 0 || failedCrons > 0 || anomalies.some(a => a.priority === 'high') ? 'high' : 'normal',
      details: {
        ai_anomalies: anomalies.map(a => a.category),
        red_checks: checks.filter(c => c.status === 'red').map(c => c.check_name),
        failed_crons: failedCrons,
      },
    })
  }

  // ── AI-HEALTH-1 — provider-level failure alerting ────────────────────────────────────────────
  // Added to THIS existing daily cron: no new route, no new Vercel function, no new cron entry
  // (both budgets are full — 22 cron slots, and the function-config globs are at 9).
  //
  // The gap it closes: 1,605 of the last 30 days' failures were one Anthropic 400,
  // "Your credit balance is too low", degrading ask_aria, business_brain_daily, the whole council,
  // hypothesis_engine and memory_extractor — and nothing anywhere said so, because the only surface
  // reading aria_ai_calls filtered on cost > 0 and a failed call costs $0.
  let aiHealthAlerts = 0
  try {
    const { data: hcalls } = await supabaseAdmin
      .from('aria_ai_calls')
      .select('provider, agent_key, success, error_message')
      .gte('created_at', since24h)
      .limit(20000)

    const buckets = new Map<string, { total: number; failures: number; agents: Set<string>; errors: Map<string, number> }>()
    for (const r of (hcalls ?? []) as Array<{ provider: string | null; agent_key: string | null; success: boolean | null; error_message: string | null }>) {
      const p = r.provider ?? 'unknown'
      let b = buckets.get(p)
      if (!b) { b = { total: 0, failures: 0, agents: new Set(), errors: new Map() }; buckets.set(p, b) }
      b.total++
      if (r.success === false) {
        b.failures++
        if (r.agent_key) b.agents.add(r.agent_key)
        const k = (r.error_message ?? 'unknown error').slice(0, 160)
        b.errors.set(k, (b.errors.get(k) ?? 0) + 1)
      }
    }

    const rows = [...buckets.entries()].map(([provider, b]) => ({
      provider,
      total_calls: b.total,
      failures: b.failures,
      agents_affected: b.agents.size,
      top_error: [...b.errors.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    }))

    const todayYmd = new Date().toISOString().slice(0, 10)
    for (const alert of shouldAlert(rows)) {
      // DE-DUPE via the existing aria_signal_cache (unique cache_key) — one alert per provider per
      // day, so a persistent outage does not re-alert on every run. No new table, no new column.
      const key = alertDedupeKey(alert.provider, todayYmd)
      const { error: dupeErr } = await supabaseAdmin.from('aria_signal_cache').insert({
        business_id: null,
        cache_key: key,
        signal_type: 'ai_health_alert',
        payload: { provider: alert.provider, severity: alert.severity, reason: alert.reason },
        expires_at: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
      })
      if (dupeErr) continue   // unique violation = already alerted for this provider today

      await sendAlert({
        // AlertPayload uses 'high' | 'normal'; the decision function uses 'high' | 'medium'
        // because that is the honest distinction it makes (account down vs elevated rate). Mapped
        // here rather than flattening the decision type to fit the transport.
        severity: alert.severity === 'high' ? 'high' : 'normal',
        title: 'AI provider failing: ' + alert.provider,
        summary: alert.failures + ' of ' + rows.find(r => r.provider === alert.provider)?.total_calls
          + ' calls failed in 24h (' + Math.round(alert.failureRate * 100) + '%) across '
          + alert.agentsAffected + ' agents. ' + (alert.reason === 'auth_or_credit'
            ? 'This is an account-level failure — every agent is degraded until it is resolved.'
            : 'Elevated failure rate.'),
        details: {
          provider: alert.provider,
          failures: alert.failures,
          failure_rate: Math.round(alert.failureRate * 100) + '%',
          agents_affected: alert.agentsAffected,
          top_error: alert.topError,
          reason: alert.reason,
        },
      })
      aiHealthAlerts++
    }
  } catch (e) {
    console.error('[aria-health-monitor] AI health check failed (non-fatal):', (e as Error).message)
  }

  return NextResponse.json({
    ok: true,
    period_24h_start: since24h,
    ai_health_alerts: aiHealthAlerts,
    sh3: {
      agents_scanned:       recentStats.size,
      anomalies_found:      anomalies.length,
      tickets_created:      sh3Created,
      tickets_deduplicated: sh3Skipped,
    },
    sh4: {
      checks_written: checksWritten,
      green:          greenCount,
      amber:          amberCount,
      red:            redCount,
      red_actions_created: redActions,
    },
  })
}

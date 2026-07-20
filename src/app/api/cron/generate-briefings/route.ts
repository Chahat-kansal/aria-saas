export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateInsight } from '@/lib/aria-insights'
import { checkBriefingTrigger, localDateString, BriefingBusiness } from '@/lib/aria/timezone'
import { addDaysYmd } from '@/lib/date-au'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendSlackMessage, getSlackAccessToken } from '@/lib/integrations/slack'
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import type { ParallelTask } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { safeBriefingContent, suppressUpbeatCloser } from '@/lib/aria/briefing-guard'
import { computeHealthSignals } from '@/lib/aria/health-signals'
import { stripUngroundedNumbers, extractNumbers } from '@/lib/aria/response-validator'

interface BriefingBusinessWithSlack extends BriefingBusiness {
  slack_connected?: boolean
  slack_briefing_enabled?: boolean
  slack_channel_id?: string | null
  name?: string
  lat?: number | null
  lng?: number | null
  city?: string | null
  weekly_revenue_target?: number | null
}

// ── AU small-biz RSS headlines (SmartCompany + ABC Business) ──────────────
async function fetchAURssHeadlines(): Promise<string[]> {
  const FEEDS = [
    'https://www.smartcompany.com.au/feed/',
    'https://www.abc.net.au/news/topic/business/rss.xml',
  ]
  const headlines: string[] = []
  for (const url of FEEDS) {
    if (headlines.length >= 3) break
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4_000),
        headers: { 'User-Agent': 'AriaOS/1.0 (+https://ariaos.site)' },
      })
      if (!res.ok) continue
      const xml = await res.text()
      // Try CDATA titles first, then plain titles; skip feed-level title
      const cdataMatches = [...xml.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)].map(m => m[1].trim())
      const plainMatches = [...xml.matchAll(/<title>([^<]{10,120})<\/title>/g)]
        .map(m => m[1].trim())
        .filter(t => !t.toLowerCase().includes('rss') && !t.toLowerCase().includes('feed') && !t.toLowerCase().includes('abc news') && !t.toLowerCase().includes('smartcompany'))
      const titles = (cdataMatches.length > 0 ? cdataMatches : plainMatches).slice(0, 3)
      headlines.push(...titles)
    } catch { /* skip silently on any fetch/parse error */ }
  }
  return headlines.slice(0, 3)
}

// ── Open-Meteo weather (free, no key required) ────────────────────────────
async function fetchWeatherSummary(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=auto&forecast_days=2`
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) })
    if (!res.ok) return ''
    const d = await res.json() as { daily?: { weathercode?: number[]; temperature_2m_max?: number[]; precipitation_sum?: number[] } }
    const code = d.daily?.weathercode?.[1]
    const maxC = d.daily?.temperature_2m_max?.[1]
    const rain = d.daily?.precipitation_sum?.[1]
    if (code == null) return ''
    const desc = code === 0 ? 'Sunny' : code <= 3 ? 'Partly cloudy' : code <= 48 ? 'Overcast/fog' : code <= 67 ? 'Rainy' : code <= 82 ? 'Showers' : 'Thunderstorms'
    return `${desc}, ${maxC?.toFixed(0) ?? '?'}°C${rain && rain > 0 ? `, ${rain.toFixed(0)}mm rain` : ''}`
  } catch { return '' }
}

async function generateMorning(
  biz: BriefingBusinessWithSlack,
  today: string
) {
  // BRIEF-INTEGRITY-1: UTC-safe calendar-date math (was mixing server-local-time Date mutation with
  // a UTC toISOString() re-serialize — a genuine source of off-by-one-day drift depending on the
  // cron host's local timezone). addDaysYmd operates purely on the YYYY-MM-DD string.
  const yday = addDaysYmd(today, -1)

  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString()
  const sevenDaysAgoWeekStart = new Date(now - 14 * 86_400_000).toISOString()

  // ── All data fetches in parallel ─────────────────────────────────────────
  const [
    revenueSnapshot,
    { data: salesBaseline },
    { data: thisWeekItems },
    { data: lastWeekItems },
    { data: lowStock },
    { data: marketScan },
    { data: topAction },
    { data: priorBriefings },
    { data: recentWins },
  ] = await Promise.all([
    // BRIEF-INTEGRITY-1: canonical revenue snapshot — the ONE source of "yesterday's revenue" for
    // this whole run (legacy bullets below, the LLM prompt context, and the ground_truth log all
    // read from this same value; buildBriefingTasks' own sales_summary task independently calls the
    // same function for the same date, so the two numbers can no longer disagree).
    getRevenueSnapshot(biz.id, yday),
    // 28-35 day baseline for daily average
    supabaseAdmin.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', biz.id).eq('status', 'completed')
      .gte('created_at', new Date(now - 35 * 86_400_000).toISOString()).lte('created_at', new Date(now - 28 * 86_400_000).toISOString()),
    // This week product sales (last 7d) for movers
    supabaseAdmin.from('pos_sale_items').select('product_name, line_total')
      .eq('business_id', biz.id).gte('created_at', sevenDaysAgo),
    // Prior week product sales (7-14d ago) for movers
    supabaseAdmin.from('pos_sale_items').select('product_name, line_total')
      .eq('business_id', biz.id).gte('created_at', sevenDaysAgoWeekStart).lt('created_at', sevenDaysAgo),
    // Low stock
    supabaseAdmin.from('pos_products').select('name, stock_quantity')
      .eq('business_id', biz.id).eq('is_active', true).lte('stock_quantity', 5).limit(5),
    // Market scan
    supabaseAdmin.from('market_price_scans').select('overpriced_count, underpriced_count, potential_revenue_gain_cents, finished_at')
      .eq('business_id', biz.id).eq('status', 'complete').gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    // MAX ONE aria_action recommendation (highest priority pending)
    supabaseAdmin.from('aria_actions').select('title, recommendation, category, priority')
      .eq('business_id', biz.id).eq('status', 'pending')
      .order('priority', { ascending: true }).limit(1).maybeSingle(),
    // Last 3 briefings for anti-repetition — ground_truth read alongside content so the dedup
    // context below quotes the CANONICAL number for that day, never a re-parse of old text.
    supabaseAdmin.from('aria_daily_briefings').select('briefing_date, content, ground_truth')
      .eq('business_id', biz.id).neq('briefing_date', today).not('content', 'is', null)
      .order('briefing_date', { ascending: false }).limit(3),
    // RECENT WINS: top 3 positive autopilot outcomes from last 30 days (moved up so it can feed the
    // LLM prompt, same as every other context block below — was previously fetched only after the
    // LLM call and glued onto the output instead of shown to the model).
    supabaseAdmin.from('aria_autopilot_actions').select('title')
      .eq('business_id', biz.id).eq('outcome', 'positive')
      .gte('created_at', new Date(now - 30 * 86_400_000).toISOString())
      .order('created_at', { ascending: false }).limit(3),
  ])

  // ── Revenue vs baseline ───────────────────────────────────────────────────
  const revenue = revenueSnapshot.revenue
  const txCount = revenueSnapshot.transaction_count
  const baselineDays = (salesBaseline ?? []).reduce((acc: Map<string, number>, row) => {
    const d = String(row.created_at).slice(0, 10)
    acc.set(d, (acc.get(d) ?? 0) + Number(row.total_amount ?? 0))
    return acc
  }, new Map<string, number>())
  const baselineDailyAvg = baselineDays.size > 0
    ? [...baselineDays.values()].reduce((s, v) => s + v, 0) / baselineDays.size
    : null
  const vsPrior = baselineDailyAvg
    ? ((revenue - baselineDailyAvg) / baselineDailyAvg * 100).toFixed(0)
    : null
  // BRIEF-FIX-1 (BUG 1) — this used to be a hardcoded TARGET_DAILY = 4_500 (=$31,500/week), compared
  // against and shown to the owner as "your target" regardless of whether they'd ever set one. That's
  // the exact GROUNDING-TEETH violation the task exists to catch, just sourced from a code constant
  // instead of a model hallucination: a fabricated target computed against and presented as real.
  // Only compute/show a target comparison when the owner has actually configured one.
  const weeklyTarget = biz.weekly_revenue_target && Number(biz.weekly_revenue_target) > 0
    ? Number(biz.weekly_revenue_target) : null
  const targetDaily = weeklyTarget != null ? weeklyTarget / 7 : null
  const vsTarget = targetDaily != null ? ((revenue - targetDaily) / targetDaily * 100).toFixed(0) : null

  // ── Product movers (this week vs last week by revenue) ───────────────────
  const thisWeekByProduct = new Map<string, number>()
  for (const row of thisWeekItems ?? []) {
    const k = String(row.product_name ?? 'Unknown')
    thisWeekByProduct.set(k, (thisWeekByProduct.get(k) ?? 0) + Number(row.line_total ?? 0))
  }
  const lastWeekByProduct = new Map<string, number>()
  for (const row of lastWeekItems ?? []) {
    const k = String(row.product_name ?? 'Unknown')
    lastWeekByProduct.set(k, (lastWeekByProduct.get(k) ?? 0) + Number(row.line_total ?? 0))
  }
  const moverDeltas = [...thisWeekByProduct.entries()].map(([name, cur]) => ({
    name, cur, prev: lastWeekByProduct.get(name) ?? 0,
    delta: lastWeekByProduct.has(name) ? cur - (lastWeekByProduct.get(name) ?? 0) : 0,
  })).filter(m => m.prev > 0 || m.cur > 20)
  moverDeltas.sort((a, b) => b.delta - a.delta)
  const topMover = moverDeltas[0]
  const bottomMover = moverDeltas[moverDeltas.length - 1]

  // ── Market price gap ──────────────────────────────────────────────────────
  let biggestGapName: string | null = null
  let biggestGapMarketPrice: number | null = null
  if (marketScan && Number(marketScan.overpriced_count) > 0) {
    const { data: topGap } = await supabaseAdmin
      .from('pos_market_price_cache').select('search_query, shelf_price, price_gap_cents')
      .eq('business_id', biz.id).eq('is_overpriced', true)
      .order('price_gap_cents', { ascending: false }).limit(1).maybeSingle()
    if (topGap) {
      biggestGapName = topGap.search_query as string
      biggestGapMarketPrice = Number(topGap.shelf_price)
    }
  }

  // ── Weather (optional, skip on failure) ──────────────────────────────────
  const weatherStr = (biz.lat && biz.lng)
    ? await fetchWeatherSummary(biz.lat, biz.lng)
    : ''

  // ── AU RSS headlines ──────────────────────────────────────────────────────
  const rssHeadlines = await fetchAURssHeadlines()

  // ── Anti-repetition context: canonical ground_truth revenue (not scraped text) + opening theme ──
  // BRIEF-INTEGRITY-1: previously "first line of prior content" accidentally captured whatever raw
  // scaffolding used to open that day's content (including old revenue figures) — now content is
  // guaranteed clean model prose (see the safeBriefingContent guard below), and the revenue figure
  // quoted here comes from that day's own logged ground_truth snapshot, never a re-parse.
  const priorContext = (priorBriefings ?? []).map(b => {
    const gt = b.ground_truth as { revenue?: number } | null
    const theme = String(b.content ?? '').split('\n')[0]?.slice(0, 120)
    const revStr = gt?.revenue != null ? `revenue $${gt.revenue.toFixed(2)}` : null
    return [b.briefing_date, revStr, theme ? `opened: "${theme}"` : null].filter(Boolean).join(', ')
  }).filter(Boolean)

  // Monday only: weekly labour cost summary — computed here (not after the LLM call) so it can
  // actually be shown to the model instead of glued onto its output afterward.
  let weeklyLabourSection: string | null = null
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 1) {
    const [{ data: weekTs }, { data: weekSales }] = await Promise.all([
      supabaseAdmin.from('pos_timesheets').select('hours_worked, total_pay_cents, pay_rate_cents')
        .eq('business_id', biz.id).gte('clock_in', sevenDaysAgo).limit(2000),
      supabaseAdmin.from('pos_sales').select('total_amount')
        .eq('business_id', biz.id).eq('status', 'completed').gte('created_at', sevenDaysAgo).limit(5000),
    ])
    const weekLabourCents = (weekTs ?? []).reduce((s, t) => {
      return s + Number(t.total_pay_cents ?? (Number(t.pay_rate_cents ?? 0) * Number(t.hours_worked ?? 0)))
    }, 0)
    const weekLabourDollars = weekLabourCents / 100
    const weekRevenue = (weekSales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const weekLabourPct = weekRevenue > 0 ? (weekLabourDollars / weekRevenue * 100) : null
    if (weekLabourDollars > 0 || weekRevenue > 0) {
      const pctStr = weekLabourPct != null ? ` (${weekLabourPct.toFixed(1)}% of revenue${weekLabourPct > 30 ? ' — above 30% benchmark' : weekLabourPct < 20 ? ' — well within benchmark' : ' — within benchmark'})` : ''
      weeklyLabourSection = `Weekly labour review (last 7 days): Labour cost A$${weekLabourDollars.toFixed(2)}, Revenue A$${weekRevenue.toFixed(2)}${pctStr}.`
    }
  }

  // ── Build the legacy insights bullets (Slack + pos_daily_briefings) ───────
  const marketCtx = marketScan
    ? ` market_prices_checked=${(marketScan.finished_at as string | null)?.slice(0, 10)} overpriced_products=${marketScan.overpriced_count} underpriced_products=${marketScan.underpriced_count} potential_revenue_gain_per_unit_cents=${marketScan.potential_revenue_gain_cents}${biggestGapName ? ` biggest_gap_product="${biggestGapName}" market_price=$${biggestGapMarketPrice?.toFixed(2)}` : ''}`
    : ''

  const { bullets } = await generateInsight({
    business_id: biz.id,
    context: `morning_briefing date=${today} yesterday_revenue=$${revenue.toFixed(0)} yesterday_transactions=${txCount} low_stock_count=${(lowStock ?? []).length}${marketCtx}`,
    data: { revenue, transactions: txCount, low_stock: (lowStock ?? []).map(p => p.name), market_price_intel: marketScan ? { overpriced: marketScan.overpriced_count, underpriced: marketScan.underpriced_count, potential_gain_cents: marketScan.potential_revenue_gain_cents, biggest_gap_product: biggestGapName } : null },
    maxBullets: 3,
    realtime: true,
  })

  // Both writes are independent — run in parallel
  const [, { error: cacheErr }] = await Promise.all([
    supabaseAdmin.from('pos_daily_briefings').upsert({
      business_id: biz.id,
      briefing_date: today,
      briefing_type: 'morning',
      insights: bullets,
      action_items: [],
      pace_vs_average_pct: null,
    }, { onConflict: 'business_id,briefing_date,briefing_type' }),
    supabaseAdmin.from('aria_briefings_cache').upsert({
      business_id: biz.id,
      briefing_date: today,
      bullets,
    }, { onConflict: 'business_id,briefing_date' }),
  ])
  if (cacheErr) console.warn('[generate-briefings] aria_briefings_cache upsert:', cacheErr.message)

  // Send to Slack if enabled — CONNECTOR-VAULT-1a: token now read from the encrypted vault
  // (pos_oauth_integrations) instead of the plaintext businesses.slack_access_token column.
  if (biz.slack_connected && biz.slack_briefing_enabled && biz.slack_channel_id) {
    const slackToken = await getSlackAccessToken(biz.id)
    if (slackToken) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'
      const bizName = biz.name ?? 'Your Business'
      const blocks = [
        { type: 'header', text: { type: 'plain_text', text: 'Aria Morning Briefing — ' + bizName } },
        { type: 'section', text: { type: 'mrkdwn', text: bullets.map((b: string) => '• ' + b).join('\n') } },
        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Aria' }, url: appUrl + '/dashboard' }] },
      ]
      sendSlackMessage(slackToken, biz.slack_channel_id, 'Morning briefing for ' + bizName, blocks).catch(() => {})
    }
  }

  // ── Structured parallel briefing → aria_daily_briefings (source of truth) ─
  // BRIEF-INTEGRITY-1: every context block below used to be built as a raw label string and glued
  // onto parallelResult.merged AFTER the LLM already ran — the model never saw any of it, and the
  // raw labels (including "TODAY'S RECOMMENDATION (max 1):" / "DO NOT open with the same theme as
  // these prior briefings:") were stored and shown to the owner verbatim. These are now fed INTO
  // the LLM as extra parallel tasks instead, so the model can synthesize them into real prose —
  // realizing the original "inject before the merged output" intent properly, with no information
  // lost. The stored content is ONLY ever parallelResult.merged (post-guard), never concatenated.
  try {
    const extraTasks: ParallelTask[] = []

    const revenueLine = [
      `Yesterday revenue: $${revenue.toFixed(2)} (${txCount} transactions).`,
      baselineDailyAvg ? `28-35 day daily average: $${baselineDailyAvg.toFixed(2)} (yesterday was ${Number(vsPrior) >= 0 ? '+' : ''}${vsPrior}% vs that window).` : null,
      // BRIEF-FIX-1 (BUG 1) — no owner-configured target → no target line at all. Never substitute a
      // default and compute a % against it (GROUNDING-TEETH: no invented $/%).
      targetDaily != null
        ? `Weekly revenue target: $${weeklyTarget!.toFixed(2)} (daily equivalent $${targetDaily.toFixed(2)}; yesterday was ${Number(vsTarget) >= 0 ? '+' : ''}${vsTarget}% vs that daily equivalent).`
        : `No weekly revenue target is set for this business — do not mention a target, goal, or "% to target" anywhere in the briefing.`,
    ].filter(Boolean).join(' ')
    extraTasks.push({ key: 'revenue_context', label: 'Revenue context', priority: 'high', fn: async () => revenueLine })

    // BRIEF-FIX-1 (BUG 4) — MERGE_SYSTEM already has explicit anti-catastrophizing rules, yet the
    // model still wrote "complete collapse in trading activity" for a business with only a handful of
    // sales — prompt wording alone wasn't reliable. computeHealthSignals()'s pos_health.status is the
    // concrete, sourced fact ("too small a sample to draw any POS-health conclusion") that gives the
    // model something specific to defer to instead of inferring severity from raw low numbers.
    extraTasks.push({
      key: 'system_state', label: 'System state (POS health)', priority: 'high',
      fn: async () => {
        const health = await computeHealthSignals(biz.id).catch(() => null)
        if (!health) return 'System state unavailable this run — do not assert a cause either way.'
        return `pos_health.status=${health.pos_health.status}. ${health.pos_health.reasoning} If status is INSUFFICIENT_SAMPLE, describe trading as quiet/dormant — never as a collapse, failure, or system breakage.`
      },
    })

    if ((lowStock ?? []).length > 0) {
      extraTasks.push({
        key: 'stock_alerts', label: 'Stock alerts', priority: 'high',
        fn: async () => `${(lowStock ?? []).length} item(s) at or below reorder point: ${(lowStock ?? []).map(p => `${p.name} (${p.stock_quantity} left)`).join(', ')}.`,
      })
    }

    if (topMover && topMover.delta > 0) {
      extraTasks.push({
        key: 'movers', label: 'Product movers', priority: 'medium',
        fn: async () => `${topMover.name} up $${topMover.delta.toFixed(0)} vs last week.${(bottomMover && bottomMover.delta < -20 && bottomMover.name !== topMover.name) ? ` ${bottomMover.name} down $${Math.abs(bottomMover.delta).toFixed(0)}.` : ''}`,
      })
    }

    if (recentWins && recentWins.length > 0) {
      const titles = (recentWins as { title: string | null }[]).map(w => w.title ?? '').filter(Boolean)
      if (titles.length > 0) extraTasks.push({ key: 'recent_wins', label: 'Recent wins (recommendations that worked)', priority: 'low', fn: async () => titles.join(' | ') })
    }

    if (weeklyLabourSection) extraTasks.push({ key: 'weekly_labour', label: 'Weekly labour review', priority: 'medium', fn: async () => weeklyLabourSection! })

    if (weatherStr) extraTasks.push({ key: 'weather', label: "Tomorrow's weather", priority: 'low', fn: async () => `${weatherStr}${biz.city ? ` in ${biz.city}` : ''}.` })

    if (rssHeadlines.length > 0) extraTasks.push({ key: 'au_news', label: 'AU business news', priority: 'low', fn: async () => rssHeadlines.join(' | ') })

    const hasHighAlert = topAction?.priority === 'high'
    if (topAction) {
      extraTasks.push({
        key: 'today_recommendation', label: "Today's recommendation (max one, weave in naturally)", priority: 'high',
        fn: async () => `[${(topAction.priority as string).toUpperCase()}] ${topAction.title} — ${topAction.recommendation}`,
      })
    }

    if (priorContext.length > 0) {
      extraTasks.push({
        key: 'anti_repetition', label: 'Prior briefings — vary today’s opening theme, do not repeat', priority: 'low',
        fn: async () => priorContext.join(' | '),
      })
    }

    const tasks = [...buildBriefingTasks(biz.id, 'retail'), ...extraTasks]
    const parallelResult = await runParallelAriaAgents(biz.id, tasks, 'starter')

    // BRIEF-INTEGRITY-1 part 4 — single-narrative: code-level backstop for MERGE_SYSTEM rule 8, in
    // case the model still closes on an upbeat note despite the prompt instruction.
    const toned = suppressUpbeatCloser(parallelResult.merged, hasHighAlert)

    // BRIEF-FIX-1 (BUG 1) — MERGE_SYSTEM rule 6 says "never invent a figure" (prompt-only), but
    // nothing enforced it, which is how "$999,999" reached storage. Same guard already applied to the
    // council pipeline (response-validator.ts): every risky $/%/count must trace to a number the model
    // was actually given (the task_results text below) within 2% tolerance, or it's stripped.
    const groundedAnchors = extractNumbers(
      parallelResult.task_results.map(r => r.result).filter((r): r is string => !!r).join(' ')
    )
    const guarded = stripUngroundedNumbers(toned, groundedAnchors)
    if (guarded.stripped.length > 0) {
      console.warn('[generate-briefings] fabrication guard fired for', biz.id, '— stripped:', guarded.stripped.length)
    }

    // BRIEF-INTEGRITY-1 part 1 — the hard guard. Only ever stores real model output or the static
    // honest fallback; a scaffold-marker match (or empty/failed generation) never reaches storage.
    const finalContent = safeBriefingContent(guarded.healedText)

    // BRIEF-INTEGRITY-2 — pipeline is part of the unique key now, so this write can no longer
    // silently overwrite (or be overwritten by) the batch/onboarding pipelines' rows for the same day.
    await supabaseAdmin.from('aria_daily_briefings').upsert({
      business_id: biz.id,
      briefing_date: today,
      content: finalContent,
      source: 'parallel',
      pipeline: 'parallel',
      generated_at: new Date().toISOString(),
      ground_truth: revenueSnapshot,
    }, { onConflict: 'business_id,briefing_date,pipeline' })
  } catch (err) {
    console.error('[generate-briefings] parallel briefing failed:', (err as Error).message)
  }
}

async function generateEvening(
  biz: BriefingBusiness,
  today: string
) {
  // BRIEF-INTEGRITY-1: canonical snapshot, same function generateMorning/parallel-tasks use.
  const { revenue, transaction_count: txCount } = await getRevenueSnapshot(biz.id, today)

  const { bullets } = await generateInsight({
    business_id: biz.id,
    context: `evening_briefing date=${today} today_revenue_so_far=$${revenue.toFixed(0)} today_transactions=${txCount}`,
    data: { revenue, transactions: txCount, type: 'evening' },
    maxBullets: 3,
    realtime: true,
  })

  await supabaseAdmin.from('pos_daily_briefings').upsert({
    business_id: biz.id,
    briefing_date: today,
    briefing_type: 'evening',
    insights: bullets,
    action_items: [],
    eod_reconciliation_status: 'pending',
  }, { onConflict: 'business_id,briefing_date,briefing_type' })
}

async function _GET(req: NextRequest) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: bizList, error } = await supabaseAdmin
    .from('businesses')
    .select('id, name, timezone, closing_hour_local, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled, slack_connected, slack_briefing_enabled, slack_channel_id, lat, lng, city, weekly_revenue_target')
    .eq('is_active', true)
    .limit(500)

  if (error) {
    console.error('[generate-briefings] businesses query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const businesses = (bizList ?? []) as BriefingBusinessWithSlack[]
  let morning = 0, evening = 0, errors = 0

  // Build work items (skip businesses with no trigger)
  const work: Array<{ biz: BriefingBusinessWithSlack; trigger: 'morning' | 'evening'; today: string }> = []
  for (const biz of businesses) {
    const trigger = checkBriefingTrigger(biz)
    if (!trigger) continue
    work.push({ biz, trigger, today: localDateString(biz.timezone || 'Australia/Melbourne') })
  }

  // Process in batches of 5 — failure of one doesn't block others
  const BATCH = 5
  for (let i = 0; i < work.length; i += BATCH) {
    const batch = work.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(({ biz, trigger, today }) =>
        trigger === 'morning'
          ? generateMorning(biz, today).then(() => trigger)
          : generateEvening(biz, today).then(() => trigger)
      )
    )
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      if (r.status === 'fulfilled') {
        if (r.value === 'morning') morning++; else evening++
      } else {
        console.error(`[generate-briefings] ${batch[j].trigger} failed for ${batch[j].biz.id}:`, r.reason)
        errors++
      }
    }
  }

  return NextResponse.json({ morning, evening, errors, total: businesses.length })
}

export const GET = withErrorCapture('cron/generate-briefings', _GET)

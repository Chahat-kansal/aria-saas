export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateInsight } from '@/lib/aria-insights'
import { checkBriefingTrigger, localDateString, BriefingBusiness } from '@/lib/aria/timezone'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { sendSlackMessage } from '@/lib/integrations/slack'
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'

function authOk(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true  // dev — no secret configured
  const auth = req.headers.get('authorization') ?? req.headers.get('x-cron-secret') ?? ''
  return auth === `Bearer ${cronSecret}` || auth === cronSecret
}

interface BriefingBusinessWithSlack extends BriefingBusiness {
  slack_connected?: boolean
  slack_briefing_enabled?: boolean
  slack_access_token?: string | null
  slack_channel_id?: string | null
  name?: string
  lat?: number | null
  lng?: number | null
  city?: string | null
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
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yday = yesterday.toISOString().slice(0, 10)

  const now = Date.now()
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString()
  const thirtyFiveDaysAgo = new Date(now - 35 * 86_400_000).toISOString()
  const twentyEightDaysAgo = new Date(now - 28 * 86_400_000).toISOString()
  const sevenDaysAgoWeekStart = new Date(now - 14 * 86_400_000).toISOString()

  // ── All data fetches in parallel ─────────────────────────────────────────
  const [
    { data: sales },
    { data: salesBaseline },
    { data: thisWeekItems },
    { data: lastWeekItems },
    { data: lowStock },
    { data: marketScan },
    { data: topAction },
    { data: priorBriefings },
  ] = await Promise.all([
    // Yesterday sales
    supabaseAdmin.from('pos_sales').select('total_amount')
      .eq('business_id', biz.id).neq('status', 'voided')
      .gte('created_at', `${yday}T00:00:00Z`).lte('created_at', `${yday}T23:59:59Z`),
    // 28-35 day baseline for daily average
    supabaseAdmin.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', biz.id).neq('status', 'voided')
      .gte('created_at', thirtyFiveDaysAgo).lte('created_at', twentyEightDaysAgo),
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
    // Last 3 briefings for anti-repetition
    supabaseAdmin.from('aria_daily_briefings').select('briefing_date, content')
      .eq('business_id', biz.id).neq('briefing_date', today).not('content', 'is', null)
      .order('briefing_date', { ascending: false }).limit(3),
  ])

  // ── Revenue vs baseline ───────────────────────────────────────────────────
  const revenue = (sales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
  const txCount = (sales ?? []).length
  const baselineDays = (salesBaseline ?? []).reduce((acc: Map<string, number>, row) => {
    const d = String(row.created_at).slice(0, 10)
    acc.set(d, (acc.get(d) ?? 0) + Number(row.total_amount ?? 0))
    return acc
  }, new Map<string, number>())
  const baselineDailyAvg = baselineDays.size > 0
    ? [...baselineDays.values()].reduce((s, v) => s + v, 0) / baselineDays.size
    : null
  const TARGET_DAILY = 4_500
  const vsPrior = baselineDailyAvg
    ? ((revenue - baselineDailyAvg) / baselineDailyAvg * 100).toFixed(0)
    : null
  const vsTarget = ((revenue - TARGET_DAILY) / TARGET_DAILY * 100).toFixed(0)

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

  // ── Anti-repetition: first line of each prior briefing ───────────────────
  const priorLeads = (priorBriefings ?? [])
    .map(b => String(b.content ?? '').split('\n')[0]?.slice(0, 120))
    .filter(Boolean)

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

  // Send to Slack if enabled
  if (biz.slack_connected && biz.slack_briefing_enabled && biz.slack_access_token && biz.slack_channel_id) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'
    const bizName = biz.name ?? 'Your Business'
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: 'Aria Morning Briefing — ' + bizName } },
      { type: 'section', text: { type: 'mrkdwn', text: bullets.map((b: string) => '• ' + b).join('\n') } },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open Aria' }, url: appUrl + '/dashboard' }] },
    ]
    sendSlackMessage(biz.slack_access_token, biz.slack_channel_id, 'Morning briefing for ' + bizName, blocks).catch(() => {})
  }

  // ── Structured parallel briefing → aria_daily_briefings (source of truth) ─
  try {
    const tasks = buildBriefingTasks(biz.id, 'retail')
    const parallelResult = await runParallelAriaAgents(biz.id, tasks, 'starter')

    // Build structured context sections to inject before the merged parallel output
    const revenueSection = [
      `REVENUE: Yesterday $${revenue.toFixed(2)} (${txCount} transactions).`,
      baselineDailyAvg ? `28-35d daily average: $${baselineDailyAvg.toFixed(2)} — yesterday was ${Number(vsPrior) >= 0 ? '+' : ''}${vsPrior}% vs prior window.` : null,
      `Daily target: $${TARGET_DAILY.toFixed(2)} — yesterday was ${Number(vsTarget) >= 0 ? '+' : ''}${vsTarget}% vs target.`,
    ].filter(Boolean).join(' ')

    const stockSection = (lowStock ?? []).length > 0
      ? `STOCK ALERTS: ${(lowStock ?? []).map(p => `${p.name} (${p.stock_quantity} left)`).join(', ')} — consider reordering.`
      : null

    const moversSection = (topMover && topMover.delta > 0)
      ? `MOVERS: ${topMover.name} up $${topMover.delta.toFixed(0)} vs last week.${(bottomMover && bottomMover.delta < -20 && bottomMover.name !== topMover.name) ? ` ${bottomMover.name} down $${Math.abs(bottomMover.delta).toFixed(0)}.` : ''}`
      : null

    const weatherSection = weatherStr ? `TOMORROW'S WEATHER: ${weatherStr}${biz.city ? ` in ${biz.city}` : ''}.` : null

    const rssSection = rssHeadlines.length > 0
      ? `AU BUSINESS NEWS: ${rssHeadlines.join(' | ')}`
      : null

    const recommendationSection = topAction
      ? `TODAY'S RECOMMENDATION (max 1): [${(topAction.priority as string).toUpperCase()}] ${topAction.title} — ${topAction.recommendation}`
      : null

    const antiRepeatNote = priorLeads.length > 0
      ? `DO NOT open with the same theme as these prior briefings: ${priorLeads.join(' | ')}`
      : null

    const structuredPrefix = [
      revenueSection,
      stockSection,
      moversSection,
      weatherSection,
      rssSection,
      recommendationSection,
      antiRepeatNote,
    ].filter(Boolean).join('\n')

    const enrichedContent = structuredPrefix + '\n\n' + parallelResult.merged

    await supabaseAdmin.from('aria_daily_briefings').upsert({
      business_id: biz.id,
      briefing_date: today,
      content: enrichedContent,
      source: 'parallel',
      generated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,briefing_date' })
  } catch (err) {
    console.error('[generate-briefings] parallel briefing failed:', (err as Error).message)
  }
}

async function generateEvening(
  biz: BriefingBusiness,
  today: string
) {
  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('total_amount, served_by, created_at')
    .eq('business_id', biz.id)
    .neq('status', 'voided')
    .gte('created_at', `${today}T00:00:00Z`)

  const revenue = (sales ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const txCount = (sales ?? []).length

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
  if (!authOk(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: bizList, error } = await supabaseAdmin
    .from('businesses')
    .select('id, name, timezone, closing_hour_local, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled, slack_connected, slack_briefing_enabled, slack_access_token, slack_channel_id, lat, lng, city')
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

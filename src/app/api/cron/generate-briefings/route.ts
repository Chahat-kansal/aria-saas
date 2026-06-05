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
}

async function generateMorning(
  biz: BriefingBusinessWithSlack,
  today: string
) {
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yday = yesterday.toISOString().slice(0, 10)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // All three are independent — run in parallel
  const [{ data: sales }, { data: lowStock }, { data: marketScan }] = await Promise.all([
    supabaseAdmin
      .from('pos_sales')
      .select('total_amount, served_by')
      .eq('business_id', biz.id)
      .neq('status', 'voided')
      .gte('created_at', `${yday}T00:00:00Z`)
      .lte('created_at', `${yday}T23:59:59Z`),
    supabaseAdmin
      .from('pos_products')
      .select('name, stock_quantity')
      .eq('business_id', biz.id)
      .eq('is_active', true)
      .lte('stock_quantity', 5)
      .limit(5),
    supabaseAdmin
      .from('market_price_scans')
      .select('overpriced_count, underpriced_count, potential_revenue_gain_cents, finished_at')
      .eq('business_id', biz.id)
      .eq('status', 'complete')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const revenue = (sales ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const txCount = (sales ?? []).length

  // Market price intelligence — include if a scan ran within 7 days

  let biggestGapName: string | null = null
  let biggestGapMarketPrice: number | null = null
  if (marketScan && Number(marketScan.overpriced_count) > 0) {
    const { data: topGap } = await supabaseAdmin
      .from('pos_market_price_cache')
      .select('search_query, shelf_price, price_gap_cents')
      .eq('business_id', biz.id)
      .eq('is_overpriced', true)
      .order('price_gap_cents', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (topGap) {
      biggestGapName = topGap.search_query as string
      biggestGapMarketPrice = Number(topGap.shelf_price)
    }
  }

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

  // Parallel agent briefing — runs alongside existing briefing, non-fatal
  try {
    const tasks = buildBriefingTasks(biz.id, 'retail')
    const parallelResult = await runParallelAriaAgents(biz.id, tasks, 'starter')
    await supabaseAdmin.from('aria_daily_briefings').upsert({
      business_id: biz.id,
      briefing_date: today,
      content: parallelResult.merged,
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
    .select('id, name, timezone, closing_hour_local, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled, slack_connected, slack_briefing_enabled, slack_access_token, slack_channel_id')
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

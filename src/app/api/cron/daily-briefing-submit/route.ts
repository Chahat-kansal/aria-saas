export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { withCronRetry } from '@/lib/api/retry'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submitBatch } from '@/lib/aria-batch'
import { nowAEST, toAESTStart, toAESTEnd, startOfWeekAEST } from '@/lib/date-au'
import { ARIA_SYSTEM_PROMPT } from '@/lib/aria-system-prompt'
import { trackCron } from '@/app/api/cron/_lib/track-cron'
import { isAnthropicUnreachable, recordAnthropicFailure, recordTotalOutage } from '@/lib/aria/circuit-breaker'
import { callGemini } from '@/lib/aria/providers/gemini'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { safeBriefingContent } from '@/lib/aria/briefing-guard'

// AI-ROUTER-FAILOVER-1 — the Anthropic Batches API has no per-item Gemini
// equivalent, so a submitBatch() outage used to fail every business's
// briefing in one shot with zero fallback. When submission itself fails with
// an "Anthropic unreachable" error, generate each business's briefing
// synchronously via Gemini instead (slower, no batching, but every business
// still gets a real briefing). Bounded concurrency so this stays well inside
// the 300s cron deadline even for a large business count.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function fallbackToGeminiPerBusiness(requests: Array<{ custom_id: string; params: { system?: unknown; messages: unknown[] } }>): Promise<{ gemini: number; templated: number; writeErrors: number }> {
  const today = new Date().toISOString().split('T')[0]
  let gemini = 0, templated = 0, writeErrors = 0

  await mapWithConcurrency(requests, 8, async req => {
    const systemPrompt = typeof req.params.system === 'string' ? req.params.system : ARIA_SYSTEM_PROMPT
    const userMsg = req.params.messages[0] as { content?: string } | undefined
    const userPrompt = userMsg?.content ?? ''

    const g = await callGemini({
      systemPrompt, userPrompt, maxTokens: 512,
      businessId: req.custom_id, agentKey: 'ops_narrative', role: 'narrative',
    })

    const usedGemini = g.success && !!g.raw.trim()
    // BRIEF-INTEGRITY-1 part 1 — guard applies here too ("no exceptions"): even though this path
    // already had a sane static fallback, route both branches through the same hard check as every
    // other write to this column.
    const content = safeBriefingContent(usedGemini ? g.raw.trim() : null)

    // BRIEF-INTEGRITY-2 — pipeline is part of the unique key now, so this write can no longer
    // silently overwrite (or be overwritten by) the parallel/onboarding pipelines' rows for the same day.
    const { error } = await supabaseAdmin.from('aria_daily_briefings').upsert({
      business_id: req.custom_id, briefing_date: today, content,
      generated_at: new Date().toISOString(), source: usedGemini ? 'gemini_fallback' : 'template_fallback',
      pipeline: 'batch',
    }, { onConflict: 'business_id,briefing_date,pipeline' })

    if (error) { writeErrors++; console.error('[daily-briefing-submit] gemini fallback upsert failed', { business_id: req.custom_id, error: error.message }) }
    else if (usedGemini) gemini++
    else templated++
  })

  return { gemini, templated, writeErrors }
}

interface MarketCtx {
  overpricedCount: number
  underpricedCount: number
  biggestOverpricedProduct: string | null
  biggestGapCents: number
  potentialRevenueCents: number
  lastChecked: string | null
}

async function getMarketPriceContext(businessId: string): Promise<MarketCtx | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: scan } = await supabaseAdmin
    .from('market_price_scans')
    .select('id, overpriced_count, underpriced_count, potential_revenue_gain_cents, finished_at')
    .eq('business_id', businessId)
    .eq('status', 'complete')
    .gte('started_at', sevenDaysAgo)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!scan) return null

  // Find the biggest overpriced gap for a specific product name
  const { data: topOverpriced } = await supabaseAdmin
    .from('pos_market_price_cache')
    .select('search_query, price_gap_cents')
    .eq('business_id', businessId)
    .eq('is_overpriced', true)
    .order('price_gap_cents', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    overpricedCount: scan.overpriced_count as number ?? 0,
    underpricedCount: scan.underpriced_count as number ?? 0,
    biggestOverpricedProduct: (topOverpriced?.search_query as string | null) ?? null,
    biggestGapCents: (topOverpriced?.price_gap_cents as number | null) ?? 0,
    potentialRevenueCents: scan.potential_revenue_gain_cents as number ?? 0,
    lastChecked: scan.finished_at as string | null,
  }
}

function buildMarketPricesPromptBlock(market: MarketCtx | null, industry: string | null): string {
  if (!market) return ''
  const ind = (industry ?? 'retail').toLowerCase()
  const lastDate = market.lastChecked ? new Date(market.lastChecked).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'recently'

  if (market.overpricedCount > 0) {
    const gain = (market.potentialRevenueCents / 100).toFixed(0)
    const product = market.biggestOverpricedProduct ?? 'a product'
    const gap = (market.biggestGapCents / 100).toFixed(2)
    if (ind === 'liquor') return `\n\nMARKET PRICE ALERT (checked ${lastDate}): ${market.overpricedCount} product(s) priced above major retailers. Dan Murphy's guarantee means customers who check will leave. Biggest gap: ${product} at A$${gap} above market — fixing it alone could recover A$${gain} in unit margins. Visit Competitor Intelligence → Market Prices to match with one click.`
    if (ind === 'cafe') return `\n\nMARKET PRICE INTELLIGENCE (checked ${lastDate}): ${market.overpricedCount} item(s) above market average. Biggest gap: ${product} is A$${gap} above the local average — that's pricing power you're not capturing, or margin you're losing. Check Market Prices tab to review.`
    if (ind === 'restaurant') return `\n\nPRICING INSIGHT (checked ${lastDate}): ${market.overpricedCount} menu item(s) above Uber Eats/Menulog average for your area. Your delivery margin is exposed — ${product} is A$${gap} above market. Review Market Prices in Competitor Intelligence.`
    return `\n\nMARKET PRICE ALERT (checked ${lastDate}): ${market.overpricedCount} product(s) priced above major retailers. Biggest gap: ${product} at A$${gap} above market. Fixing pricing could recover A$${gain} per unit. Visit Competitor Intelligence → Market Prices.`
  }

  if (market.underpricedCount > 0) {
    if (ind === 'cafe') return `\n\nPRICING POWER (checked ${lastDate}): ${market.underpricedCount} item(s) below local average — you have room to raise prices without losing customers. Check Market Prices in Competitor Intelligence.`
    if (ind === 'bakery') return `\n\nPRICING OPPORTUNITY (checked ${lastDate}): ${market.underpricedCount} product(s) below artisan bakery average in your area. Strong demand signal — consider a small price increase and monitor conversion. Market Prices tab has the details.`
    return `\n\nPRICING POWER (checked ${lastDate}): ${market.underpricedCount} product(s) are below market average — you have room to raise prices. Check Market Prices in Competitor Intelligence.`
  }

  return `\n\nMARKET PRICING (last checked ${lastDate}): Your pricing is competitive — no significant gaps found.`
}

async function buildBriefingContext(businessId: string) {
  // BRIEF-INTEGRITY-1: yesterday's revenue/transactions now come from the same canonical
  // getRevenueSnapshot() every other briefing/advisor path uses — was an independent AEST-bounded
  // query here (correct boundaries, but a second implementation of the same computation).
  const yday = new Date(nowAEST().getTime() - 86400000).toISOString().slice(0, 10)
  const yStart = toAESTStart(yday)
  const yEnd   = toAESTEnd(yday)
  // WEEK-1: "Week so far" = calendar week, Monday 00:00 AEST → now (was rolling 7 days — AUDIT-1 finding #3 mislabel)
  const weekAgo = toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))

  const [snapshot, { data: wSales }, { data: stock }, { data: items }] = await Promise.all([
    getRevenueSnapshot(businessId, yday),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).eq('status', 'completed').gte('created_at', weekAgo),
    supabaseAdmin.from('pos_products').select('name,stock_quantity,low_stock_threshold').eq('business_id', businessId).eq('is_active', true).limit(20),
    supabaseAdmin.from('pos_sale_items').select('product_name,quantity').eq('business_id', businessId).gte('created_at', yStart).lte('created_at', yEnd),
  ])

  const counts: Record<string, number> = {}
  for (const i of items ?? []) {
    counts[i.product_name] = (counts[i.product_name] ?? 0) + (i.quantity ?? 1)
  }
  const topProduct = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'no sales'

  return {
    yesterdayRevenue: snapshot.revenue.toFixed(2),
    yesterdayTransactions: snapshot.transaction_count,
    weekRevenue: (wSales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2),
    topProduct,
    lowStock: (stock ?? []).filter(p => (p.stock_quantity ?? 0) < (p.low_stock_threshold ?? 5)).slice(0, 3).map(p => p.name),
  }
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'daily-briefing-submit', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,city,owner_name,timezone')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // AI-COST-2 — idempotency guard (AI-COST-AUDIT-1 §1 live risk): withCronRetry wraps the ENTIRE
    // handler, so if anything AFTER submitBatch() succeeds throws, a retry would re-invoke this
    // whole function and submit a SECOND full Batch API job for every business. Check first —
    // aria_batch_jobs' (job_type, submit_date) unique index (AI-COST-2 migration) is the hard
    // backstop if this check ever races.
    const today = new Date().toISOString().slice(0, 10)
    const { data: alreadySubmitted } = await supabaseAdmin
      .from('aria_batch_jobs')
      .select('id, batch_id')
      .eq('job_type', 'daily_briefing')
      .eq('submit_date', today)
      .in('status', ['submitted', 'processing', 'completed'])
      .maybeSingle()
    if (alreadySubmitted) {
      console.warn('[daily-briefing-submit] already submitted today — skipping duplicate submission', alreadySubmitted)
      await supabaseAdmin.from('cron_logs').update({
        status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0,
        errors: { message: 'idempotency guard: already submitted today', existing_batch_id: alreadySubmitted.batch_id },
      }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_submitted_today', batch_id: alreadySubmitted.batch_id })
    }

    const requests = await Promise.all(businesses.map(async biz => {
      const [ctx, marketCtx] = await Promise.all([
        buildBriefingContext(biz.id),
        getMarketPriceContext(biz.id),
      ])
      const marketBlock = buildMarketPricesPromptBlock(marketCtx, biz.industry ?? null)
      // AI-GROUNDING-1 — this prompt asked the model to write "today's" briefing and describe
      // "yesterday" without ever stating what either date actually is. Claude has no reliable
      // knowledge of the real wall-clock date (only its training cutoff), and this is a Batch API
      // submission that can sit queued for hours — so any date/day-of-week reference the model
      // produced unprompted was a guess, not a fact. Ground it exactly like the sibling
      // /api/aria/daily-briefing route already does (`todayDate` in that file).
      const todayDateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })
      const yesterdayDateStr = new Date(nowAEST().getTime() - 86400000).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })
      return {
        custom_id: biz.id,
        params: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: ARIA_SYSTEM_PROMPT,
          messages: [{
            role: 'user' as const,
            content: `Today is ${todayDateStr}. Write today's morning briefing for ${biz.name}, a ${biz.industry ?? 'business'} in ${biz.city ?? 'Australia'}. Owner: ${biz.owner_name ?? 'there'}.\n\nYesterday (${yesterdayDateStr}): A$${ctx.yesterdayRevenue} from ${ctx.yesterdayTransactions} sales. Top seller: ${ctx.topProduct}.\nWeek so far: A$${ctx.weekRevenue}.\nLow stock: ${ctx.lowStock.join(', ') || 'none'}.${marketBlock}\n\nWrite 4 sentences: how yesterday went, one thing to watch today, one specific action they should take now. If market price data is included, add a sentence about the pricing opportunity. End with a single priority. No bullet points. Do not state any date other than the ones given above — if you don't need to mention a date, don't.`,
          }],
        },
      }
    }))

    // AI-ROUTER-FAILOVER-1 — submitBatch() failing means Anthropic is
    // unreachable for EVERY business in one shot (no per-item retry inside
    // the batch API). Trip the shared circuit breaker (so other Anthropic
    // callers stop hammering it too) and fail every business over to Gemini
    // individually rather than letting the whole day's briefings silently
    // fail — this is the exact "onboarding + briefing broke on Anthropic $0"
    // failure mode this fix exists for.
    let batchId: string
    try {
      batchId = await submitBatch(requests)
    } catch (batchErr) {
      const msg = (batchErr as Error).message
      if (!isAnthropicUnreachable(msg)) throw batchErr

      const { tripped } = await recordAnthropicFailure(msg)
      console.error('[daily-briefing-submit] batch submit failed, Anthropic unreachable — falling over to Gemini per business', { msg, tripped })

      const { gemini, templated, writeErrors } = await fallbackToGeminiPerBusiness(requests)
      if (gemini === 0 && templated === 0) await recordTotalOutage(msg)

      await supabaseAdmin.from('cron_logs').update({
        status: 'completed', finished_at: new Date().toISOString(),
        businesses_processed: gemini + templated,
        errors: { message: 'anthropic_unreachable, served via fallback', anthropic_error: msg, gemini_served: gemini, templated_served: templated, write_errors: writeErrors },
      }).eq('id', cronLogId)

      return NextResponse.json({ ok: true, degraded: true, gemini_served: gemini, templated_served: templated, count: businesses.length })
    }

    const { error: insertErr } = await supabaseAdmin.from('aria_batch_jobs').insert({
      batch_id: batchId, job_type: 'daily_briefing',
      business_count: businesses.length, status: 'submitted',
    })
    // 23505 = unique_violation on (job_type, submit_date) — the pre-check above raced and lost;
    // the Batches API call itself already happened (can't be undone), but this is now a duplicate
    // record, not a duplicate FUTURE submission — log it, don't fail the cron run over it.
    if (insertErr && insertErr.code !== '23505') console.error('[daily-briefing-submit] aria_batch_jobs insert failed:', insertErr.message)

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      businesses_processed: businesses.length,
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, batch_id: batchId, count: businesses.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function _GETTracked(req: Request) {
  return trackCron('daily-briefing-submit', async () => _GET(req))
}
export const GET = withCronRetry('daily-briefing-submit', _GETTracked)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'
import { runAriaCouncil, insertCouncilRun } from '@/lib/aria/council'
import type { CouncilOutput } from '@/lib/aria/council'
import { runOrchestrator } from '@/lib/aria/agents/orchestrator'

// ── Briefing recommendation builder ───────────────────────────────────────────
// Maps the council's structured brain outputs into the modal's Recommendation type.
type BriefingRec = {
  id: string; priority: 'high' | 'medium' | 'low'
  category: 'revenue' | 'customers' | 'stock' | 'marketing' | 'compliance' | 'reviews'
  title: string; description: string
  action_label: string; action_type: 'winback' | 'review_reply' | 'promotion' | 'reorder' | 'campaign' | 'navigate' | 'dismiss'
  metric: string; metric_label: string; trend: null
  action_payload: { href?: string }
}

function detectCategory(text: string): BriefingRec['category'] {
  const t = text.toLowerCase()
  if (/stock|inventory|reorder|supply|product|out of/i.test(t)) return 'stock'
  if (/customer|retention|winback|lapse|loyal|churn/i.test(t)) return 'customers'
  if (/review|rating|google|feedback/i.test(t)) return 'reviews'
  if (/marketing|campaign|promotion|social|adverti/i.test(t)) return 'marketing'
  if (/compliance|legal|tax|permit|licence/i.test(t)) return 'compliance'
  return 'revenue'
}

function actionForCategory(cat: BriefingRec['category']): Pick<BriefingRec, 'action_label' | 'action_type' | 'action_payload'> {
  switch (cat) {
    case 'stock':       return { action_label: 'Reorder now',      action_type: 'reorder',     action_payload: { href: '/pos/products?filter=low_stock' } }
    case 'customers':   return { action_label: 'Win them back',    action_type: 'winback',     action_payload: { href: '/dashboard/winback' } }
    case 'reviews':     return { action_label: 'Reply to review',  action_type: 'review_reply',action_payload: { href: '/dashboard/reviews' } }
    case 'marketing':   return { action_label: 'Start campaign',   action_type: 'campaign',    action_payload: { href: '/dashboard/winback' } }
    case 'compliance':  return { action_label: 'View details',     action_type: 'navigate',    action_payload: { href: '/dashboard' } }
    default:            return { action_label: 'View dashboard',   action_type: 'navigate',    action_payload: { href: '/dashboard' } }
  }
}

function toTitle(text: string): string {
  const words = text.trim().split(' ')
  return words.slice(0, 7).join(' ').replace(/[,.:;!?]$/, '') + (words.length > 7 ? '…' : '')
}

function buildBriefingRecs(council: CouncilOutput): BriefingRec[] {
  const recs: BriefingRec[] = []
  let idx = 0

  // 1. Consensus items — all brains agreed → high priority
  for (const item of (council.consensus ?? []).slice(0, 3)) {
    if (!item?.trim()) continue
    const cat = detectCategory(item)
    recs.push({ id: 'consensus-' + idx++, priority: 'high', category: cat, title: toTitle(item), description: item, ...actionForCategory(cat), metric: '', metric_label: '', trend: null })
  }

  // 2. Per-brain recommendations — map each brain role to a category
  const brainCatMap: Record<string, BriefingRec['category']> = { growth: 'revenue', risk: 'compliance', strategy: 'marketing', context: 'customers' }
  for (const brain of (council.raw_brain_outputs ?? [])) {
    if (!brain?.succeeded) continue
    const cat = brainCatMap[brain.role] ?? 'revenue'
    for (const rec of (brain.recommendations ?? []).slice(0, 1)) {
      if (!rec?.trim() || recs.length >= 6) break
      const detectedCat = detectCategory(rec)
      const finalCat = detectedCat !== 'revenue' ? detectedCat : cat
      const confidence = brain.confidence ?? 'medium'
      recs.push({ id: brain.role + '-' + idx++, priority: confidence === 'high' ? 'high' : confidence === 'medium' ? 'medium' : 'low', category: finalCat, title: toTitle(rec), description: rec, ...actionForCategory(finalCat), metric: '', metric_label: '', trend: null })
    }
  }

  // 3. Contested items — brains disagreed → medium priority, worth a look
  for (const item of (council.contested ?? []).slice(0, 2)) {
    if (!item?.trim() || recs.length >= 7) break
    const cat = detectCategory(item)
    recs.push({ id: 'contested-' + idx++, priority: 'medium', category: cat, title: toTitle(item), description: item + ' (Aria advisors are split on this — worth reviewing.)', ...actionForCategory(cat), metric: '', metric_label: '', trend: null })
  }

  // 4. Fallback from final_briefing if we still have < 4 cards
  if (recs.length < 4 && council.final_briefing) {
    const sentences = council.final_briefing.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 30)
    const cats: BriefingRec['category'][] = ['revenue', 'customers', 'stock', 'marketing']
    for (let i = 0; i < sentences.length && recs.length < 5; i++) {
      const cat = detectCategory(sentences[i]) !== 'revenue' ? detectCategory(sentences[i]) : cats[i % cats.length]
      recs.push({ id: 'brief-' + idx++, priority: 'medium', category: cat, title: toTitle(sentences[i]), description: sentences[i], ...actionForCategory(cat), metric: '', metric_label: '', trend: null })
    }
  }

  return recs.filter(r => r.title && r.description)
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });
  // fresh=true: caller signals a mutation just happened — briefing regenerates from live data (always true here, no cache)
  const _forceRefresh = searchParams.get('fresh') === 'true' || searchParams.get('force_refresh') === 'true'

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const sevenDaysAgoForScans = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: recentActivity, count: activityCount },
    { data: activeLeaks },
    { data: lapsedCustomers },
    { data: recentReviews },
    { data: cashSessions },
    { data: overdueCustomers },
    { data: recentStocktakes },
    { data: lowStockProducts },
    { data: recentAudits },
    { data: latestScan },
  ] = await Promise.all([
    supabase.from('activity_log').select('description', { count: 'exact' }).eq('business_id', businessId).gte('created_at', sevenDaysAgo),
    supabase.from('profit_leaks').select('description,monthly_loss').eq('business_id', businessId).eq('status', 'detected'),
    supabase.from('pos_customers').select('id', { count: 'exact' }).eq('business_id', businessId).lt('last_visit', thirtyDaysAgo),
    supabase.from('reviews').select('rating,content').eq('business_id', businessId).order('created_at', { ascending: false }).limit(3),
    supabase.from('pos_cash_sessions').select('variance_cents,closed_at,closed_by').eq('business_id', businessId).eq('status', 'closed').gte('closed_at', sevenDaysAgo).order('closed_at', { ascending: false }).limit(14),
    supabase.from('pos_customers').select('name,current_balance_cents,last_visit').eq('business_id', businessId).gt('current_balance_cents', 0).lt('last_visit', ninetyDaysAgo).limit(20),
    supabase.from('pos_stock_takes').select('status,items_counted,items_with_variance,completed_at').eq('business_id', businessId).order('completed_at', { ascending: false }).limit(1),
    supabase.from('pos_products').select('name,stock_quantity,low_stock_threshold').eq('business_id', businessId).eq('track_stock', true).lt('stock_quantity', 5).limit(5),
    supabase.from('pos_shift_audits').select('flagged_items,failed_checks,shift_date').eq('business_id', businessId).gte('shift_date', new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10)).order('shift_date', { ascending: false }).limit(5),
    supabase.from('market_price_scans').select('id,finished_at,overpriced_count,underpriced_count,potential_revenue_gain_cents').eq('business_id', businessId).eq('status', 'complete').gte('finished_at', sevenDaysAgoForScans).order('finished_at', { ascending: false }).limit(1),
  ]);

  const totalLeakLoss = (activeLeaks || []).reduce((s: number, l: { monthly_loss?: number }) => s + (l.monthly_loss || 0), 0);

  const cashVariances = (cashSessions || []).map((s: { variance_cents?: number | null }) => s.variance_cents ?? 0);
  const avgVariance = cashVariances.length > 0 ? Math.round(cashVariances.reduce((a: number, b: number) => a + b, 0) / cashVariances.length) : 0;
  const largeVariances = cashVariances.filter((v: number) => Math.abs(v) > 500);

  const overdueTotal = (overdueCustomers || []).reduce((s: number, c: { current_balance_cents?: number }) => s + (c.current_balance_cents ?? 0), 0);

  const lastStocktake = recentStocktakes?.[0];

  // Market price data — only included if a recent scan exists
  const scanRow = latestScan?.[0]
  let marketPriceContext = ''
  if (scanRow) {
    const { data: topOverpriced } = await supabase
      .from('pos_market_price_cache')
      .select('product_name,our_price,market_avg_price,price_gap_pct')
      .eq('business_id', businessId)
      .eq('is_overpriced', true)
      .order('price_gap_pct', { ascending: false })
      .limit(1)
    const scanDate = new Date(scanRow.finished_at as string).toLocaleDateString('en-AU')
    const overpriced = (scanRow.overpriced_count as number) ?? 0
    const gain = ((scanRow.potential_revenue_gain_cents as number) ?? 0) / 100
    const topItem = topOverpriced?.[0]
    const industryRef = business.industry === 'liquor' ? "Dan Murphy's" : business.industry === 'cafe' ? 'local café average' : 'Coles/Woolworths'
    marketPriceContext = `\nMarket prices (last scanned ${scanDate}): ${overpriced} product${overpriced !== 1 ? 's' : ''} above market vs ${industryRef}.${topItem ? ` Biggest gap: ${topItem.product_name} at $${Number(topItem.our_price ?? 0).toFixed(2)} vs market $${Number(topItem.market_avg_price ?? 0).toFixed(2)}.` : ''} Potential weekly revenue recovery: $${gain.toFixed(2)}.`
  }

  const context = `Business: ${business.name} (${business.industry})
Owner: ${business.owner_name}
Plan: ${business.plan}
Google rating: ${business.google_rating || 'not set'}

Last 7 days: ${activityCount || 0} actions taken
Active profit leaks: ${activeLeaks?.length || 0} totalling $${totalLeakLoss}/mo recoverable
At-risk customers: ${lapsedCustomers?.length || 0}
Recent reviews: ${(recentReviews || []).map((r: { rating?: number }) => `${r.rating}★`).join(', ') || 'none'}

OPERATIONS DATA (feed into briefing):
Cash-up (last 7 days): ${cashSessions?.length || 0} sessions. Avg variance: ${avgVariance > 0 ? '+' : ''}A$${(Math.abs(avgVariance) / 100).toFixed(2)}. ${largeVariances.length > 0 ? largeVariances.length + ' sessions had variance over $5.' : 'All sessions balanced.'}
Overdue customer tabs (90+ days): ${overdueCustomers?.length || 0} customers owing A$${(overdueTotal / 100).toFixed(2)} total.
Last stocktake: ${lastStocktake ? lastStocktake.items_counted + ' items counted, ' + lastStocktake.items_with_variance + ' variances found.' : 'No stocktake on record.'}
Low stock products: ${lowStockProducts?.map((p: { name?: string; stock_quantity?: number }) => p.name + ' (' + p.stock_quantity + ' left)').join(', ') || 'none critical'}
Audit checks (last 48h): ${(() => { const aa = (recentAudits || []) as Array<{failed_checks?: number; flagged_items?: Array<{name: string}>}>; const tot = aa.reduce((s, a) => s + (a.failed_checks ?? 0), 0); const flags = aa.flatMap(a => a.flagged_items ?? []).slice(0,3).map(f => f.name).join(', '); return tot > 0 ? tot + ' required checks failed' + (flags ? ': ' + flags : '') : 'all checks passed'; })()}${marketPriceContext}`.trim();

  // Try council path first — falls back to single-model if it fails
  let council = null
  let usedFallback = false
  try {
    const _bizCtx = await getBusinessContext(businessId)
    council = await runAriaCouncil(_bizCtx, businessId, 'briefing')
  } catch (e) {
    console.error('[briefing] council failed, using single-model fallback:', (e as Error).message)
    usedFallback = true
  }

  if (council && council.final_briefing) {
    await insertCouncilRun(businessId, 'briefing', council, false)
    // Fire-and-forget orchestrator — does not delay the briefing response
    if (!usedFallback) {
      runOrchestrator(council, businessId, 'briefing').catch(e =>
        console.error('[orchestrator] failed:', (e as Error).message)
      )
    }
    const recommendations = buildBriefingRecs(council)
    return NextResponse.json({
      briefing: council.final_briefing,
      recommendations,
      ask_blocks: council.ask_blocks ?? [],
      consensus: council.consensus,
      contested: council.contested,
      confidence_map: council.confidence_map,
      layout: council.layout ?? null,
      council_mode: true,
    })
  }

  // FALLBACK: original single-model briefing path — unchanged
  try {
    const _bizCtx = await getBusinessContext(businessId)
    const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
    const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
    const response =
  await trackAICall({ route: 'aria/briefing', model: 'claude-sonnet-4-5-20250929', businessId: businessId, purpose: 'daily-briefing' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 300,
      system: systemPrompt,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{
        role: 'user',
        content: `Write a short, friendly morning briefing for the business owner. 2-3 sentences max. Be specific and actionable. Context:\n${context}`,
      }],
    }));

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    await insertCouncilRun(businessId, 'briefing', null, true)
    return NextResponse.json({ briefing: text, council_mode: false });
  } catch {
    await insertCouncilRun(businessId, 'briefing', null, true)
    return NextResponse.json({ briefing: `Good morning! Aria is running ${activityCount || 0} automations for ${business.name}. Check your dashboard for the latest updates.`, council_mode: false });
  }
}

export const GET = withErrorCapture('aria/briefing', _GET)

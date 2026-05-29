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
import { runOrchestrator } from '@/lib/aria/agents/orchestrator'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

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
  ]);

  const totalLeakLoss = (activeLeaks || []).reduce((s: number, l: { monthly_loss?: number }) => s + (l.monthly_loss || 0), 0);

  const cashVariances = (cashSessions || []).map((s: { variance_cents?: number | null }) => s.variance_cents ?? 0);
  const avgVariance = cashVariances.length > 0 ? Math.round(cashVariances.reduce((a: number, b: number) => a + b, 0) / cashVariances.length) : 0;
  const largeVariances = cashVariances.filter((v: number) => Math.abs(v) > 500);

  const overdueTotal = (overdueCustomers || []).reduce((s: number, c: { current_balance_cents?: number }) => s + (c.current_balance_cents ?? 0), 0);

  const lastStocktake = recentStocktakes?.[0];

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
Audit checks (last 48h): ${(() => { const aa = (recentAudits || []) as Array<{failed_checks?: number; flagged_items?: Array<{name: string}>}>; const tot = aa.reduce((s, a) => s + (a.failed_checks ?? 0), 0); const flags = aa.flatMap(a => a.flagged_items ?? []).slice(0,3).map(f => f.name).join(', '); return tot > 0 ? tot + ' required checks failed' + (flags ? ': ' + flags : '') : 'all checks passed'; })()}`.trim();

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
    return NextResponse.json({
      briefing: council.final_briefing,
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

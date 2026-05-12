import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { trackUsage } from '@/lib/track-usage';
import { collectBusinessData } from '@/lib/aria/business-data';
import { getWeatherContext } from '@/lib/aria/get-weather-context';
import {
  AriaBrainMode,
  analyseBusinessHealth,
  analyseCustomerWinback,
  analyseInventory,
  analyseProfitLeaks,
  analyseSales,
  analyseStaffing,
  analyseSupplierRisks,
  chatWithBusinessBrain,
  convertInsightToAction,
  explainRecommendation,
  generateDailyDecisions,
  generateReorderPlan,
} from '@/lib/aria/business-brain';
import { withErrorCapture } from '@/lib/api/with-error-capture';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODES = new Set<AriaBrainMode>([
  'daily', 'health', 'sales', 'inventory', 'reorder', 'profit',
  'supplier', 'customer', 'staff', 'explain', 'chat',
]);

const CACHE_MODES = new Set<AriaBrainMode>(['daily', 'health', 'sales', 'inventory']);
const CACHE_MINUTES = 30;

// Parallel saves — eliminates sequential for-loop bottleneck
async function saveRecommendations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  mode: AriaBrainMode,
  output: Awaited<ReturnType<typeof generateDailyDecisions>>
) {
  if (output.recommendations.length === 0 || output.missing_data.length > 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const toProcess = output.recommendations.filter(
    r => r.suggested_action?.requires_owner_approval
  );
  if (!toProcess.length) return [];

  // Check all existence in parallel
  const checks = await Promise.all(
    toProcess.map(async recommendation => {
      const action = convertInsightToAction({ recommendation });
      const title = action.title.trim();
      if (!title) return null;

      const { data: existing } = await supabase
        .from('aria_actions')
        .select('id')
        .eq('business_id', businessId)
        .eq('title', title)
        .eq('source', `business_brain:${mode}`)
        .gte('created_at', `${today}T00:00:00.000Z`)
        .maybeSingle();

      return { title, existing, action, recommendation };
    })
  );

  // Insert new actions in parallel
  const toInsert = checks.filter(Boolean).filter(c => c && !c.existing);
  const insertResults = await Promise.all(
    toInsert.map(async c => {
      if (!c) return null;
      const { data, error } = await supabase
        .from('aria_actions')
        .insert({
          business_id: businessId,
          title: c.title,
          category: c.action.category,
          priority: c.action.priority,
          recommendation: c.action.recommendation,
          reason: c.action.reason,
          expected_impact: c.action.expected_impact,
          confidence: c.action.confidence,
          source: `business_brain:${mode}`,
          payload: c.action.payload,
        })
        .select('id')
        .single();
      if (error) console.error('[aria/business-brain] save action failed', error.message);
      return data ?? null;
    })
  );

  return [
    ...checks.filter(Boolean).filter(c => c?.existing).map(c => c!.existing),
    ...insertResults.filter(Boolean),
  ];
}

async function runMode(
  mode: AriaBrainMode,
  data: Awaited<ReturnType<typeof collectBusinessData>>,
  context?: object
) {
  if (mode === 'daily')    return generateDailyDecisions(data);
  if (mode === 'health')   return analyseBusinessHealth(data);
  if (mode === 'sales')    return analyseSales(data);
  if (mode === 'inventory') return analyseInventory(data);
  if (mode === 'reorder')  return generateReorderPlan(data);
  if (mode === 'profit')   return analyseProfitLeaks(data);
  if (mode === 'supplier') return analyseSupplierRisks(data);
  if (mode === 'customer') return analyseCustomerWinback(data);
  if (mode === 'staff')    return analyseStaffing(data);
  if (mode === 'explain')  return explainRecommendation(data, context);
  return chatWithBusinessBrain(data, context);
}

export const POST = withErrorCapture('aria/business-brain', async (req: Request) => {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessId = typeof body.business_id === 'string' ? body.business_id : '';
  const mode = (typeof body.mode === 'string' ? body.mode : 'daily') as AriaBrainMode;

  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!MODES.has(mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  try {
    // ── 30-minute cache for high-frequency modes ─────────────────────
    if (CACHE_MODES.has(mode) && !body.force_refresh) {
      const cacheFloor = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
      const { data: cached } = await supabase
        .from('daily_briefings')
        .select('content, generated_at')
        .eq('business_id', businessId)
        .eq('mode', mode)
        .gte('generated_at', cacheFloor)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r, () => ({ data: null }));

      if (cached?.content) {
        return NextResponse.json({ ...cached.content, cached: true });
      }
    }

    trackUsage({ business_id: businessId, event_type: 'daily_briefing', metadata: { mode } })

    const businessData = await collectBusinessData(businessId, { userId: user.id, supabase });
    if (!businessData.business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Fetch live weather for daily briefing mode
    const weatherCtx = mode === 'daily'
      ? await getWeatherContext(
          businessData.business.industry ?? 'retail',
          businessData.business.city ?? businessData.business.suburb ?? 'Melbourne'
        ).catch(() => null)
      : null

    // ── 45-second hard timeout for Claude call ────────────────────────
    let output: Awaited<ReturnType<typeof runMode>>;
    try {
      const timeoutSignal = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('claude_timeout')), 45_000)
      );
      output = await Promise.race([
        runMode(mode, businessData, body.context && typeof body.context === 'object' ? body.context : undefined),
        timeoutSignal,
      ]);
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.message === 'claude_timeout';
      if (isTimeout) {
        return NextResponse.json({
          summary: 'Your business briefing is loading — refresh in a moment.',
          business_health_score: null,
          data_status: businessData.data_status,
          observations: [],
          recommendations: [],
          questions_to_ask_owner: [],
          missing_data: [],
          cached: false,
          error: 'timeout',
        });
      }
      throw err;
    }

    // ── Parallel save recommendations ─────────────────────────────────
    const shouldSave = ['daily','health','sales','inventory','reorder','profit','supplier','customer','staff'].includes(mode);
    const saved_actions = shouldSave
      ? await saveRecommendations(supabase, businessId, mode, output)
      : [];

    // Prepend live weather opener to daily briefing summary
    let weatherPrefix = ''
    if (mode === 'daily' && weatherCtx) {
      const w = weatherCtx
      weatherPrefix = `It's ${w.today.temp_c}°C and ${w.today.condition} in ${w.location.split(',')[0]} today — ${w.business_impact} `
    }

    const result = {
      ...output,
      summary: weatherPrefix ? weatherPrefix + (output.summary ?? '') : output.summary,
      weather: weatherCtx ?? undefined,
      saved_actions,
      raw_counts: businessData.raw_counts,
    };

    // ── Write to cache ────────────────────────────────────────────────
    if (CACHE_MODES.has(mode)) {
      void supabase.from('daily_briefings').upsert({
        business_id: businessId,
        mode,
        content: result,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,mode' });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[aria/business-brain] route failed', error);
    return NextResponse.json({
      summary: 'Aria could not analyse the business data right now.',
      business_health_score: null,
      data_status: null,
      observations: [],
      recommendations: [],
      questions_to_ask_owner: [],
      missing_data: [],
      error: 'Unable to generate business intelligence.',
    }, { status: 500 });
  }
})

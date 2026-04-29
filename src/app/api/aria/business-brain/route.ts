import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { collectBusinessData } from '@/lib/aria/business-data';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODES = new Set<AriaBrainMode>([
  'daily',
  'health',
  'sales',
  'inventory',
  'reorder',
  'profit',
  'supplier',
  'customer',
  'staff',
  'explain',
  'chat',
]);

async function saveRecommendations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  mode: AriaBrainMode,
  output: Awaited<ReturnType<typeof generateDailyDecisions>>
) {
  if (output.recommendations.length === 0 || output.missing_data.length > 0) return [];

  const saved = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const recommendation of output.recommendations) {
    if (!recommendation.suggested_action?.requires_owner_approval) continue;
    const action = convertInsightToAction({ recommendation });
    const title = action.title.trim();
    if (!title) continue;

    const { data: existing } = await supabase
      .from('aria_actions')
      .select('id')
      .eq('business_id', businessId)
      .eq('title', title)
      .eq('source', `business_brain:${mode}`)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .maybeSingle();

    if (existing?.id) {
      saved.push(existing);
      continue;
    }

    const { data, error } = await supabase
      .from('aria_actions')
      .insert({
        business_id: businessId,
        title,
        category: action.category,
        priority: action.priority,
        recommendation: action.recommendation,
        reason: action.reason,
        expected_impact: action.expected_impact,
        confidence: action.confidence,
        source: `business_brain:${mode}`,
        payload: action.payload,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[aria/business-brain] failed to save action', error.message);
    } else if (data) {
      saved.push(data);
    }
  }

  return saved;
}

async function runMode(mode: AriaBrainMode, data: Awaited<ReturnType<typeof collectBusinessData>>, context?: object) {
  if (mode === 'daily') return generateDailyDecisions(data);
  if (mode === 'health') return analyseBusinessHealth(data);
  if (mode === 'sales') return analyseSales(data);
  if (mode === 'inventory') return analyseInventory(data);
  if (mode === 'reorder') return generateReorderPlan(data);
  if (mode === 'profit') return analyseProfitLeaks(data);
  if (mode === 'supplier') return analyseSupplierRisks(data);
  if (mode === 'customer') return analyseCustomerWinback(data);
  if (mode === 'staff') return analyseStaffing(data);
  if (mode === 'explain') return explainRecommendation(data, context);
  return chatWithBusinessBrain(data, context);
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessId = typeof body.business_id === 'string' ? body.business_id : '';
  const mode = (typeof body.mode === 'string' ? body.mode : 'daily') as AriaBrainMode;

  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!MODES.has(mode)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  try {
    const businessData = await collectBusinessData(businessId, { userId: user.id, supabase });
    if (!businessData.business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const output = await runMode(mode, businessData, body.context && typeof body.context === 'object' ? body.context : undefined);
    const saved_actions = ['daily', 'health', 'sales', 'inventory', 'reorder', 'profit', 'supplier', 'customer', 'staff'].includes(mode)
      ? await saveRecommendations(supabase, businessId, mode, output)
      : [];

    return NextResponse.json({
      ...output,
      saved_actions,
      raw_counts: businessData.raw_counts,
    });
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
}

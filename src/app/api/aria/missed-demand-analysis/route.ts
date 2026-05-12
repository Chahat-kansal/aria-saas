export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, missed_demand_id } = await req.json().catch(() => ({}));
  if (!business_id || !missed_demand_id) {
    return NextResponse.json({ error: 'business_id and missed_demand_id required' }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, industry, city')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: item } = await supabase
    .from('missed_demand')
    .select('*')
    .eq('id', missed_demand_id)
    .eq('business_id', business_id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

  // Look up global product for context
  const { data: globalProduct } = item.product_barcode
    ? await supabase.from('global_products').select('name, brand, category, suggested_price_cents').eq('barcode', item.product_barcode as string).maybeSingle()
    : { data: null };

  const bizData = biz as { id: string; name: string; industry: string | null; city: string | null };
  const context = {
    business_name: bizData.name,
    industry: bizData.industry,
    city: bizData.city,
    product_name: item.product_name,
    product_category: item.product_category ?? globalProduct?.category,
    times_requested: item.times_requested,
    estimated_quantity_wanted: item.estimated_quantity_wanted,
    approximate_price_point_cents: item.approximate_price_point_cents,
    suggested_price_cents: globalProduct?.suggested_price_cents,
    customer_note: item.customer_note,
    first_requested: item.first_requested_at,
    last_requested: item.last_requested_at,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      analysis: `Customers asked for ${item.product_name} ${item.times_requested} time(s). Consider adding to your catalogue.`,
      confidence: 'low',
      estimated_monthly_revenue_cents: null,
    });
  }

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `${ARIA_VOICE}\n\nReturn ONLY valid JSON.`,
    messages: [{
      role: 'user',
      content: `Analyse this missed demand item for an Australian ${bizData.industry ?? 'retail'} business:
${JSON.stringify(context)}

Return JSON:
{
  "analysis": "2-3 sentences: is this worth stocking? Expected demand, margin opportunity, risk. Cite specific numbers.",
  "confidence": "high|medium|low",
  "estimated_monthly_revenue_cents": number or null,
  "recommendation": "stock|monitor|reject",
  "reasoning": "one sentence"
}`,
    }],
  });

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({
      analysis: `Product requested ${item.times_requested} times — consider adding to catalogue.`,
      confidence: 'low',
      estimated_monthly_revenue_cents: null,
    });
  }

  const parsed = JSON.parse(match[0]);

  // Update missed_demand record with Aria's analysis
  await supabase
    .from('missed_demand')
    .update({
      aria_analysis: parsed.analysis,
      aria_confidence: parsed.confidence,
      estimated_monthly_revenue_cents: parsed.estimated_monthly_revenue_cents,
      status: 'analysed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', missed_demand_id);

  return NextResponse.json(parsed);
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'aria/missed-demand-analysis' } });
    return NextResponse.json({ data: [], status: 'error', message: 'temporarily_unavailable' }, { status: 200 });
  }
}

import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { calculateVariance } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase.from('businesses')
    .select('id, name, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const variances = await calculateVariance(business_id, dataSource);

  if (variances.length === 0) {
    return NextResponse.json({ items: [], total_loss_cents: 0, ai_insights: [] });
  }

  const totalLoss = variances.filter(v => v.variance < 0).reduce((s, v) => s + v.variance_value_cents, 0);

  // Claude insights for significant variances
  const significant = variances.filter(v => Math.abs(v.variance) >= 2 || v.variance_value_cents > 5000).slice(0, 8);
  let aiInsights: { item_id: string; insight: string }[] = [];

  if (significant.length > 0) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: 'You are Aria. Return ONLY valid JSON array, no markdown.',
        messages: [{
          role: 'user',
          content: `Generate brief AI insights for these stock variance items for ${business.name}. Return JSON array:
[{"item_id":"id","insight":"1-2 sentences explaining variance and recommended action"}]

Items: ${JSON.stringify(significant.map(v => ({
  item_id: v.item_id, name: v.item_name,
  variance: v.variance, value: (v.variance_value_cents / 100).toFixed(2),
})))}`,
        }],
      });
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) aiInsights = JSON.parse(m[0]);
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ items: variances, total_loss_cents: totalLoss, ai_insights: aiInsights });
  } catch (err: unknown) {
    Sentry.captureException(err, { tags: { route: 'aria/variance' } });
    return NextResponse.json({ data: [], status: 'error', message: 'temporarily_unavailable' }, { status: 200 });
  }
}

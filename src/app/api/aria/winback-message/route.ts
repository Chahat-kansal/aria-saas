export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry, city').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get top 3 products for context
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: topSales } = await supabase
    .from('pos_sale_items')
    .select('product_name, quantity')
    .gte('created_at', thirtyDaysAgo)
    .in('sale_id',
      (await supabase.from('pos_sales').select('id').eq('business_id', business_id).gte('created_at', thirtyDaysAgo)).data?.map((s: any) => s.id) ?? []
    )
    .limit(50);

  const productCounts: Record<string, number> = {};
  for (const si of topSales ?? []) {
    if ((si as any).product_name) productCounts[(si as any).product_name] = (productCounts[(si as any).product_name] ?? 0) + ((si as any).quantity ?? 1);
  }
  const topProducts = Object.entries(productCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);

  try {
    const msg = await trackAICall({ route: 'aria/winback-message', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'winback-message-personalize' }, () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'You are writing an SMS for an Australian small business. Keep under 160 characters. Friendly, not salesy. Include business name. No special characters.',
      messages: [{
        role: 'user',
        content: `Write a winback SMS for ${biz.name} (${biz.industry}) in ${biz.city ?? 'Australia'}. ${topProducts.length > 0 ? `Their popular items include: ${topProducts.join(', ')}.` : ''} The customer hasn't visited in 60+ days. Offer something compelling. 160 chars max. Return ONLY the SMS text.`,
      }],
    }));
    const message = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ message: `Hi! We miss you at ${biz.name}. It's been a while — come back and enjoy 10% off your next visit. See you soon! 😊` });
  }
}

export const POST = withErrorCapture('aria/winback-message', _POST)

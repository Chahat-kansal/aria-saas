export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, product_id } = await req.json();
  if (!business_id || !product_id) {
    return NextResponse.json({ error: 'business_id and product_id required' }, { status: 400 });
  }

  // Verify business ownership
  const bid = await getBid(supabase, user.id);
  if (!bid || bid !== business_id) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  // Fetch product
  const { data: product, error: productError } = await supabase
    .from('pos_products')
    .select('name, category, price, cost_price')
    .eq('id', product_id)
    .eq('business_id', business_id)
    .single();

  if (productError || !product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const price = product.price as number ?? 0;
  const costPrice = product.cost_price as number ?? 0;
  const productName = product.name as string;
  const category = product.category as string ?? 'General';

  // Fetch 90-day sales data
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: salesData } = await supabase
    .from('pos_sale_items')
    .select('quantity, unit_price, sale_id')
    .eq('product_id', product_id)
    .eq('business_id', business_id)
    .gte('created_at', ninetyDaysAgo);

  const items = salesData ?? [];
  const totalSold = items.reduce((sum, i) => sum + (i.quantity as number ?? 0), 0);
  const avgPrice = items.length > 0
    ? items.reduce((sum, i) => sum + (i.unit_price as number ?? 0), 0) / items.length
    : price;
  const txCount = new Set(items.map((i) => i.sale_id as string)).size;

  // Compute margin
  const currentMarginPct = costPrice > 0
    ? Math.round(((price - costPrice) / price) * 100 * 100) / 100
    : null;

  // Compute demand signal
  const dailyVelocity = totalSold / 90;
  let demandSignal: 'increasing' | 'stable' | 'decreasing';
  if (dailyVelocity > 5) demandSignal = 'increasing';
  else if (dailyVelocity > 1) demandSignal = 'stable';
  else demandSignal = 'decreasing';

  let reasoning: string | null = null;
  try {
    const marginStr = currentMarginPct !== null ? `${currentMarginPct}%` : 'unknown';
    const prompt = `For ${productName} in ${category} category: current price A$${price}, cost A$${costPrice}, margin ${marginStr}, sold ${totalSold} units in 90 days (avg price A$${Math.round(avgPrice * 100) / 100}, ${txCount} transactions). Give a 2-sentence pricing recommendation. Be specific and direct.`;

    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/price-check', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'price-check' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 150,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }));

    reasoning = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
  } catch {
    // AI failure — numeric data still returned
    reasoning = null;
  }

  return NextResponse.json({
    current_margin_pct: currentMarginPct,
    suggested_price: null,
    reasoning,
    demand_signal: demandSignal,
    price_vs_market: 'unknown',
  });
}

export const POST = withErrorCapture('aria/price-check', _POST)

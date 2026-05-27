export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Product { id: string; name: string; stock_quantity: number | null; cost_price: number | null; low_stock_threshold: number | null }
interface Sale { product_id: string; quantity: number | null }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { data: products } = await supabase.from('pos_products')
    .select('id, name, stock_quantity, cost_price, low_stock_threshold')
    .eq('business_id', bid).eq('track_stock', true).limit(2000);
  const prods = (products ?? []) as Product[];

  const sinceISO = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: sales } = await supabase.from('pos_sale_items')
    .select('product_id, quantity, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid)
    .gte('pos_sales.created_at', sinceISO)
    .limit(20000);

  const sold: Record<string, number> = {};
  for (const r of (sales ?? []) as unknown as Sale[]) {
    sold[r.product_id] = (sold[r.product_id] ?? 0) + Number(r.quantity ?? 0);
  }

  let totalValue = 0;
  let deadValue = 0;
  let lowStock = 0;
  const dead: { name: string; value_cents: number; stock: number }[] = [];
  for (const p of prods) {
    const stock = Number(p.stock_quantity ?? 0);
    const cost = Number(p.cost_price ?? 0);
    const value = stock * cost;
    totalValue += value;
    if (p.low_stock_threshold != null && stock <= Number(p.low_stock_threshold)) lowStock++;
    if (stock > 0 && (sold[p.id] ?? 0) === 0) {
      deadValue += value;
      dead.push({ name: p.name, value_cents: Math.round(value * 100), stock });
    }
  }

  let insight = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      temperature: 0.3,
      system: 'You are an inventory analyst for an Australian small business. Plain prose, 2-3 sentences. No preamble.',
      messages: [{ role: 'user', content: `Total inventory value: A$${totalValue.toFixed(0)}. Dead stock (no sales 90d): A$${deadValue.toFixed(0)} across ${dead.length} SKUs. Low stock items: ${lowStock}. Top dead items: ${dead.slice(0, 5).map(d => d.name).join(', ')}. What should the owner do?` }],
    });
    insight = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens; outputTokens = res.usage.output_tokens; success = true;
  } catch (e) { console.error('[inventory-insight] AI failed:', (e as Error).message); }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'inventory_insight', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'analysis',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({
    metrics: { sku_count: prods.length, total_value: Math.round(totalValue * 100) / 100, dead_value: Math.round(deadValue * 100) / 100, dead_count: dead.length, low_stock: lowStock },
    top_dead: dead.sort((a, b) => b.value_cents - a.value_cents).slice(0, 10),
    insight,
  });
}

export const POST = withErrorCapture('aria/inventory-insight', _POST);

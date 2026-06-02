export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Product { id: string; name: string; stock_quantity: number | null; low_stock_threshold: number | null; cost_price: number | null; supplier_id: string | null }
interface SaleItem { product_id: string; quantity: number | null }
interface DraftLine { product_id: string; product_name: string; current_stock: number; suggested_qty: number; estimated_cost_cents: number; reason: string }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { supplier_id, lead_days } = await req.json();
  if (!supplier_id) return NextResponse.json({ error: 'supplier_id required' }, { status: 400 });

  const { data: supplier } = await supabase.from('pos_suppliers').select('id, name').eq('id', supplier_id).maybeSingle();
  if (!supplier) return NextResponse.json({ error: 'supplier not found' }, { status: 404 });

  const { data: products } = await supabase.from('pos_products')
    .select('id, name, stock_quantity, low_stock_threshold, cost_price, supplier_id')
    .eq('business_id', bid)
    .eq('supplier_id', supplier_id)
    .eq('track_stock', true)
    .limit(200);

  const prods = (products ?? []) as Product[];

  // 30-day sales velocity per product
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: sales } = await supabase.from('pos_sale_items')
    .select('product_id, quantity, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', bid)
    .gte('pos_sales.created_at', since)
    .in('product_id', prods.map(p => p.id))
    .limit(5000);

  const velocity: Record<string, number> = {};
  for (const r of (sales ?? []) as unknown as SaleItem[]) {
    velocity[r.product_id] = (velocity[r.product_id] ?? 0) + Number(r.quantity ?? 0);
  }

  const lead = Number(lead_days ?? 7);
  const cover = lead + 14; // lead + 2 weeks buffer
  const draft: DraftLine[] = prods.map(p => {
    const sold30 = velocity[p.id] ?? 0;
    const daily = sold30 / 30;
    const need = Math.ceil(daily * cover);
    const current = Number(p.stock_quantity ?? 0);
    const suggested = Math.max(0, need - current);
    if (suggested === 0) return null;
    return {
      product_id: p.id,
      product_name: p.name,
      current_stock: current,
      suggested_qty: suggested,
      estimated_cost_cents: Math.round(suggested * Number(p.cost_price ?? 0) * 100),
      reason: daily > 0 ? `${daily.toFixed(1)}/day sold · cover ${cover}d` : 'stock low',
    };
  }).filter((l): l is DraftLine => l !== null);

  const totalCents = draft.reduce((a, l) => a + l.estimated_cost_cents, 0);

  let aiNote = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.2,
      system: 'You are a smart reorder advisor. One short sentence summarising this draft purchase order. No preamble.',
      messages: [{ role: 'user', content: `Supplier: ${supplier.name}\nLead: ${lead} days, cover ${cover} days\nLines:\n${JSON.stringify(draft.slice(0, 10))}\nTotal: A$${(totalCents / 100).toFixed(2)}` }],
    });
    aiNote = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    success = true;
  } catch (e) { console.error('[supplier-reorder] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'supplier_reorder', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'reorder',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })());

  return NextResponse.json({ supplier: { id: supplier.id, name: supplier.name }, draft, total_cents: totalCents, ai_note: aiNote });
}

export const POST = withErrorCapture('aria/supplier-reorder', _POST);

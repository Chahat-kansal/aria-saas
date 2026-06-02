export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface PoItem { product_id: string | null; product_name: string | null; unit_cost_cents: number | null; supplier_id: string | null }

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

  // Build a price-per-product map across suppliers from purchase orders
  const { data: items } = await supabase.from('pos_purchase_order_items')
    .select('product_id, product_name, unit_cost_cents, pos_purchase_orders!inner(business_id, supplier_id, pos_suppliers(name))')
    .eq('pos_purchase_orders.business_id', bid)
    .limit(2000);

  type PoItemWithJoin = PoItem & { pos_purchase_orders: { supplier_id: string | null; pos_suppliers: { name: string | null } | null } };
  const rows = (items ?? []) as unknown as PoItemWithJoin[];

  const map: Record<string, { name: string; offers: Record<string, { supplier_name: string; cost_cents: number; count: number }> }> = {};
  for (const r of rows) {
    if (!r.product_name || !r.unit_cost_cents) continue;
    const supId = r.pos_purchase_orders.supplier_id ?? 'unknown';
    const supName = r.pos_purchase_orders.pos_suppliers?.name ?? 'Unknown';
    if (!map[r.product_name]) map[r.product_name] = { name: r.product_name, offers: {} };
    if (!map[r.product_name].offers[supId]) map[r.product_name].offers[supId] = { supplier_name: supName, cost_cents: 0, count: 0 };
    map[r.product_name].offers[supId].cost_cents += Number(r.unit_cost_cents);
    map[r.product_name].offers[supId].count++;
  }

  // For each product with >1 supplier, compute current vs cheapest
  const opportunities = Object.values(map).map(p => {
    const offers = Object.entries(p.offers).map(([sid, o]) => ({ supplier_id: sid, supplier_name: o.supplier_name, avg_cost_cents: o.cost_cents / o.count }));
    if (offers.length < 2) return null;
    const sorted = offers.sort((a, b) => a.avg_cost_cents - b.avg_cost_cents);
    const cheapest = sorted[0];
    const dearest = sorted[sorted.length - 1];
    const saving_per_unit_cents = dearest.avg_cost_cents - cheapest.avg_cost_cents;
    if (saving_per_unit_cents <= 0) return null;
    return { product: p.name, cheapest, dearest, saving_per_unit_cents, offers };
  }).filter((o): o is NonNullable<typeof o> => o !== null)
    .sort((a, b) => b.saving_per_unit_cents - a.saving_per_unit_cents)
    .slice(0, 10);

  let recommendation = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  if (opportunities.length > 0) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 0.3,
        system: 'You are a procurement advisor for an Australian small business. One short paragraph: estimate monthly saving if they switch the top 3 products to the cheapest supplier. No preamble.',
        messages: [{ role: 'user', content: `Supplier price gaps:\n${JSON.stringify(opportunities.slice(0, 5))}\n\nWhat would they save monthly switching the top 3?` }],
      });
      recommendation = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      success = true;
    } catch (e) { console.error('[supplier-savings] AI failed:', (e as Error).message); }
  }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'supplier_savings', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'procurement',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })());

  return NextResponse.json({ opportunities, recommendation });
}

export const POST = withErrorCapture('aria/supplier-savings', _POST);

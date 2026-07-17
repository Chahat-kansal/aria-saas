export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';
import { guardOutput } from '@/lib/aria/ground-guard';

interface PoItem { product_id: string | null; product_name: string | null; unit_cost_cents: number | null; supplier_id: string | null }

async function _POST(_req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
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

  // BUGFIX-FAB-3 — the REAL per-unit savings are computed above; the LLM must cite them, NOT invent a monthly
  // figure (we have no sales-volume data to ground one). Feed the exact numbers + guard the prose.
  const allowed: number[] = [];
  for (const o of opportunities) {
    allowed.push(Math.round(o.saving_per_unit_cents) / 100, Math.round(o.cheapest.avg_cost_cents) / 100, Math.round(o.dearest.avg_cost_cents) / 100);
  }

  let recommendation = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  if (opportunities.length > 0) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
      const lines = opportunities.slice(0, 5).map(o => `${o.product}: save A$${(o.saving_per_unit_cents / 100).toFixed(2)}/unit — switch from ${o.dearest.supplier_name} (A$${(o.dearest.avg_cost_cents / 100).toFixed(2)}) to ${o.cheapest.supplier_name} (A$${(o.cheapest.avg_cost_cents / 100).toFixed(2)})`).join('\n');
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 0.3,
        system: 'You are a procurement advisor for an Australian small business. One short paragraph recommending which products to switch supplier. Cite ONLY the exact per-unit saving figures provided. Do NOT estimate or invent a monthly total — there is no sales-volume data to support one. No preamble.',
        messages: [{ role: 'user', content: `Real per-unit supplier savings:\n${lines}\n\nWhich should they switch? Cite only the per-unit savings above.` }],
      });
      recommendation = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
      const guarded = await guardOutput(recommendation, allowed, { mode: 'strip', businessId: bid, surface: 'supplier-savings' });
      recommendation = guarded.text;
      inputTokens = res.usage.input_tokens;
      outputTokens = res.usage.output_tokens;
      success = true;
    } catch (e) { console.error('[supplier-savings] AI failed:', (e as Error).message); }
  }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'supplier_savings', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'reorder',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({ opportunities, recommendation });
}

export const POST = withBusinessContext('aria/supplier-savings', _POST);

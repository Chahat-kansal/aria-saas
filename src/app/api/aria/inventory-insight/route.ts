export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';
import { computeStockValue } from '@/lib/inventory/stock-value';
import { resolveOutletId } from '@/lib/inventory/outlet-stock';
import { guardOutput } from '@/lib/aria/ground-guard';

// FAB-FIX-1 — stock value is now the CANONICAL items_on_hand × resolved cost (computeStockValue), NOT the
// demoted pos_products.stock_quantity cache (which summed to a fabricated A$234,523 for Sip vs the real
// A$11,476). The computed valuation is also injected as the ONLY dollar figures the LLM may cite.

interface Product { id: string; name: string; cost_price: number | null; low_stock_threshold: number | null }
interface Sale { product_id: string; quantity: number | null }
interface InvRow { product_id: string; items_on_hand: number | null }

async function _POST(_req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  // Canonical valuation (items_on_hand × resolved cost), per the resolved outlet — same scope/source as the
  // dashboard value tile and the INV-COST-1 panel, so the prose and the KPI agree.
  const outletId = await resolveOutletId(supabaseAdmin, bid, null);
  const sv = await computeStockValue(supabaseAdmin, bid, outletId);
  const totalValue = sv.at_cost;
  const valueAtCost: Record<string, number> = {};
  for (const p of sv.products) valueAtCost[p.id] = (valueAtCost[p.id] ?? 0) + (p.value_at_cost ?? 0);

  // Canonical on-hand per product (includes zero rows → real low/out-of-stock). Per resolved outlet.
  let invQ = supabaseAdmin.from('pos_outlet_inventory').select('product_id, items_on_hand').eq('business_id', bid).limit(10000);
  if (outletId) invQ = invQ.eq('outlet_id', outletId);
  const { data: invRows } = await invQ;
  const onHand: Record<string, number> = {};
  for (const r of (invRows ?? []) as InvRow[]) onHand[r.product_id] = (onHand[r.product_id] ?? 0) + (Number(r.items_on_hand) || 0);

  const { data: products } = await supabase.from('pos_products')
    .select('id, name, cost_price, low_stock_threshold')
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

  // Dead/low stock derive from canonical items_on_hand (NOT stock_quantity); dead value uses the
  // resolved-cost valuation so it stays consistent with totalValue.
  let deadValue = 0;
  let lowStock = 0;
  const dead: { name: string; value_cents: number; stock: number }[] = [];
  for (const p of prods) {
    const stock = onHand[p.id] ?? 0;
    if (p.low_stock_threshold != null && stock <= Number(p.low_stock_threshold)) lowStock++;
    if (stock > 0 && (sold[p.id] ?? 0) === 0) {
      const value = valueAtCost[p.id] ?? 0;
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
      messages: [{ role: 'user', content: `GROUND TRUTH — these are the ONLY numbers you may cite; do not invent, re-estimate, or alter any figure:
- Inventory value at cost: A$${sv.at_cost.toFixed(0)}
- Inventory value at retail: A$${sv.at_retail.toFixed(0)}
- Units on hand: ${sv.units_on_hand}
- Blended margin: ${sv.margin_pct != null ? sv.margin_pct.toFixed(1) + '%' : 'unknown'}
- Products with stock: ${sv.products_total} (${sv.products_valued} costed, ${sv.products_unknown_cost} missing a cost)
- Dead stock (on hand, no sales in 90 days): A$${deadValue.toFixed(0)} across ${dead.length} SKUs
- Low stock (at/below threshold): ${lowStock} items
- Top dead items: ${dead.slice(0, 5).map(d => d.name).join(', ') || 'none'}

What should the owner do? Plain prose, 2-3 sentences, Australian context. Cite only the figures above.` }],
    });
    insight = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    // BUGFIX-FAB-3 — guard the prose against the canonical valuation figures already injected as ground truth.
    const allowed: number[] = [sv.at_cost, sv.at_retail, sv.units_on_hand, sv.products_total, sv.products_valued, sv.products_unknown_cost, Math.round(deadValue * 100) / 100, lowStock, dead.length];
    if (sv.margin_pct != null) allowed.push(sv.margin_pct);
    insight = (await guardOutput(insight, allowed, { mode: 'strip', businessId: bid, surface: 'inventory-insight' })).text;
    inputTokens = res.usage.input_tokens; outputTokens = res.usage.output_tokens; success = true;
  } catch (e) { console.error('[inventory-insight] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'inventory_insight', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'analysis',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({
    metrics: {
      sku_count: prods.length,
      total_value: Math.round(totalValue * 100) / 100,
      dead_value: Math.round(deadValue * 100) / 100,
      dead_count: dead.length,
      low_stock: lowStock,
      // FAB-FIX-1 — canonical (items_on_hand) grounding figures, additive.
      at_retail: sv.at_retail,
      units_on_hand: sv.units_on_hand,
      margin_pct: sv.margin_pct,
      products_valued: sv.products_valued,
      products_unknown_cost: sv.products_unknown_cost,
    },
    top_dead: dead.sort((a, b) => b.value_cents - a.value_cents).slice(0, 10),
    insight,
  });
}

export const POST = withBusinessContext('aria/inventory-insight', _POST);

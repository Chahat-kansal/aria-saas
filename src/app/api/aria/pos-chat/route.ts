export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    message?: string;
    business_id?: string;
    cart_context?: { items: Array<{ name: string; qty: number; price: number }>; total_cents: number } | null;
    current_sale_total?: number;
  };
  const { message, business_id, cart_context } = body;
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const bid = await getBid(supabase, user.id);
  if (!bid || (business_id && bid !== business_id)) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }
  const resolvedBid = business_id ?? bid;

  const today = new Date().toISOString().split('T')[0];
  const nowHHMM = new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' });

  type SaleRow    = { id: string; total_amount: number; payment_method: string; customer_id: string | null };
  type ProductRow = { name: string; price: number; cost_price: number; stock_quantity: number; low_stock_threshold: number; track_stock: boolean };
  type ItemRow    = { product_name: string; quantity: number };

  // Fetch comprehensive context in parallel
  const [bizRes, salesRes, productsRes, settingsRes, topItemsRes] = await Promise.all([
    supabase.from('businesses').select('name, industry, city').eq('id', resolvedBid).maybeSingle(),
    supabase.from('pos_sales')
      .select('id, total_amount, payment_method, customer_id')
      .eq('business_id', resolvedBid).eq('status', 'completed')
      .gte('created_at', `${today}T00:00:00.000Z`),
    supabase.from('pos_products')
      .select('name, price, cost_price, stock_quantity, low_stock_threshold, track_stock')
      .eq('business_id', resolvedBid).eq('is_active', true)
      .order('name').limit(30),
    supabase.from('pos_settings')
      .select('loyalty_points_per_dollar, loyalty_points_per_dollar_value, gst_inclusive, cash_rounding')
      .eq('business_id', resolvedBid).maybeSingle(),
    supabase.from('pos_sale_items')
      .select('product_name, quantity').eq('business_id', resolvedBid)
      .gte('created_at', `${today}T00:00:00.000Z`).limit(200),
  ]);

  // Promotions in a separate try/catch (table may not exist)
  let promotions: Array<{ name: string; type: string; discount_value: number }> = [];
  try {
    const promoRes = await supabase.from('pos_promotions')
      .select('name, type, discount_value').eq('business_id', resolvedBid).eq('is_active', true).limit(10);
    promotions = (promoRes.data ?? []) as typeof promotions;
  } catch { /* promotions table optional */ }

  const business  = bizRes.data;
  const sales     = (salesRes.data ?? []) as SaleRow[];
  const products  = (productsRes.data ?? []) as ProductRow[];
  const settings  = settingsRes.data;
  const topItems  = (topItemsRes.data ?? []) as ItemRow[];

  // Aggregate today's stats
  const txCount   = sales.length;
  const revenue   = sales.reduce((s: number, r: SaleRow) => s + (r.total_amount ?? 0), 0);
  const avgBasket = txCount > 0 ? (revenue / txCount) : 0;
  const cashSales = sales.filter((s: SaleRow) => s.payment_method === 'cash').length;
  const cardSales = txCount - cashSales;

  // Top items sold today
  const itemCounts: Record<string, number> = {};
  for (const i of topItems) {
    const n = i.product_name ?? 'Unknown';
    itemCounts[n] = (itemCounts[n] ?? 0) + (i.quantity ?? 1);
  }
  const topSellers = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => `${name} (${qty})`).join(', ');

  // Product inventory summary
  const outOfStock = products.filter((p: ProductRow) => p.track_stock && (p.stock_quantity ?? 0) <= 0);
  const lowStock   = products.filter((p: ProductRow) => p.track_stock && (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5));

  const productsList = products.map((p: ProductRow) => {
    const sq = p.stock_quantity ?? 0;
    const lt = p.low_stock_threshold ?? 5;
    const stockInfo = p.track_stock ? ` — ${sq} in stock${sq <= 0 ? ' ⚠ OUT' : sq <= lt ? ' ⚡ low' : ''}` : '';
    const costInfo  = (p.cost_price ?? 0) > 0 ? ` (cost A$${p.cost_price.toFixed(2)})` : '';
    const marginInfo = (p.cost_price ?? 0) > 0 && (p.price ?? 0) > 0
      ? ` margin ${(((p.price) - (p.cost_price)) / (p.price) * 100).toFixed(0)}%` : '';
    return `${p.name}: A$${(p.price ?? 0).toFixed(2)}${costInfo}${marginInfo}${stockInfo}`;
  }).join('\n');

  // Active promotions
  const promoList = promotions.length > 0
    ? promotions.map(p => `• ${p.name} — ${p.type} ${p.discount_value}%`).join('\n')
    : 'No active promotions';

  // Cart context
  const cartText = cart_context?.items?.length
    ? cart_context.items.map(i => `${i.qty}× ${i.name} @ A$${i.price.toFixed(2)}`).join(', ') +
      ` — subtotal A$${(cart_context.total_cents / 100).toFixed(2)}`
    : 'Empty cart';

  // Loyalty settings
  const loyaltyRate = (settings as any)?.loyalty_points_per_dollar ?? 1;
  const loyaltyValue = (settings as any)?.loyalty_points_per_dollar_value ?? 100;
  const gstInclusive = (settings as any)?.gst_inclusive !== false;

  const systemPrompt = `You are Aria, the AI co-pilot inside ${business?.name ?? 'this business'}'s point-of-sale terminal.
Help staff serve customers faster and make better decisions. Maximum 2 sentences. Staff are with customers.

BUSINESS: ${business?.name ?? 'Unknown'}, ${business?.industry ?? ''}, ${business?.city ?? 'Australia'}
TIME: ${nowHHMM} (Sydney)

TODAY SO FAR:
• Revenue: A$${revenue.toFixed(2)} from ${txCount} transactions (avg A$${avgBasket.toFixed(2)})
• Payment: ${cashSales} cash, ${cardSales} card
• Top sellers: ${topSellers || 'No sales yet'}

LIVE INVENTORY (${products.length} active products):
${productsList}

STOCK ALERTS:
• Out of stock: ${outOfStock.length > 0 ? outOfStock.map((p: ProductRow) => p.name).join(', ') : 'None'}
• Low stock: ${lowStock.length > 0 ? lowStock.map((p: ProductRow) => `${p.name} (${p.stock_quantity ?? 0})`).join(', ') : 'None'}

ACTIVE PROMOTIONS:
${promoList}

CURRENT CART:
${cartText}

LOYALTY:
• ${loyaltyRate} point per A$1 spent
• ${loyaltyValue} points = A$1 discount
• GST: ${gstInclusive ? '10% inclusive (GST = total − total/1.1)' : '10% exclusive (add at checkout)'}
• Cash rounding: ${(settings as any)?.cash_rounding !== false ? 'Yes — nearest 5 cents' : 'No'}

RULES:
- Be specific — use real numbers from the data above
- For stock questions: check the inventory list first, answer with exact numbers
- For margin/GST/loyalty calculations: calculate from the real data
- For "do we have X": search the product list above
- Never invent numbers not in this context
- Australian context: A$, GST 10%, Fair Work applies`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: message as string }],
    });

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    // Detect actionable intent in the reply
    let action: { type: string; payload: Record<string, unknown> } | undefined;
    if (/applying|apply.*discount/i.test(reply)) {
      const match = reply.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) action = { type: 'apply_discount', payload: { percentage: parseFloat(match[1]) } };
    }

    return NextResponse.json({ reply, action });
  } catch (err) {
    console.error('[pos-chat] Claude error:', err);
    return NextResponse.json({ reply: "Sorry, I couldn't process that right now." });
  }
}

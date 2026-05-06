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
  const userMessage = message ?? '';
  if (!userMessage) return NextResponse.json({ error: 'message required' }, { status: 400 });

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

  const biz      = bizRes.data;
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
  const lowStockItems = products.filter((p: ProductRow) => p.track_stock && (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5));

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

  // Enhanced real-time business context (month + customers + top products)
  const [
    { data: todaySales },
    { data: monthSales },
    { data: topProducts },
    { data: lowStock },
    { data: customers },
  ] = await Promise.all([
    supabase.from('pos_sales').select('total_amount').eq('business_id', resolvedBid)
      .gte('created_at', new Date().toISOString().split('T')[0]),
    supabase.from('pos_sales').select('total_amount,created_at').eq('business_id', resolvedBid)
      .gte('created_at', new Date(Date.now()-30*86400000).toISOString()),
    supabase.from('pos_sale_items').select('product_name,quantity,unit_price')
      .eq('business_id', resolvedBid)
      .gte('created_at', new Date(Date.now()-30*86400000).toISOString()),
    supabase.from('pos_products').select('name,stock_quantity,track_stock')
      .eq('business_id', resolvedBid).eq('is_active', true).eq('track_stock', true).lt('stock_quantity', 10),
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', resolvedBid),
  ]);

  const todayRevenue = (todaySales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const todayCount = (todaySales || []).length;
  const monthRevenue = (monthSales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const monthCount = (monthSales || []).length;

  const prodMap: Record<string, { qty: number; revenue: number }> = {};
  for (const item of (topProducts || [])) {
    if (!prodMap[item.product_name]) prodMap[item.product_name] = { qty: 0, revenue: 0 };
    prodMap[item.product_name].qty += item.quantity;
    prodMap[item.product_name].revenue += (item.unit_price || 0) * item.quantity;
  }
  const topProdList = Object.entries(prodMap).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);

  const businessContext = `BUSINESS: ${biz?.name ?? 'Unknown'}, ${biz?.industry ?? ''}, ${biz?.city ?? 'Australia'}
TIME: ${nowHHMM} (Sydney)
TODAY: A$${todayRevenue.toFixed(2)} from ${todayCount} transactions (avg A$${todayCount > 0 ? (todayRevenue/todayCount).toFixed(2) : '0.00'}) | ${cashSales} cash, ${cardSales} card
THIS MONTH (30 days): A$${monthRevenue.toFixed(2)} revenue, ${monthCount} transactions
TOTAL CUSTOMERS: ${(customers as any)?.count ?? 'unknown'}

TOP 10 PRODUCTS THIS MONTH:
${topProdList.map(([name, v], i) => `${i+1}. ${name}: A$${v.revenue.toFixed(2)} (${v.qty} sold)`).join('\n') || 'No sales data yet'}

LOW STOCK ALERTS (< 10 units):
${(lowStock || []).map((p: any) => `- ${p.name}: ${p.stock_quantity} remaining`).join('\n') || 'No low stock items'}

TODAY TOP SELLERS: ${topSellers || 'No sales yet'}
STOCK OUT: ${outOfStock.map((p: ProductRow) => p.name).join(', ') || 'None'} | LOW: ${lowStockItems.map((p: ProductRow) => `${p.name}(${p.stock_quantity ?? 0})`).join(', ') || 'None'}
ACTIVE PROMOTIONS: ${promoList}
CART: ${cartText}
LOYALTY: ${loyaltyRate}pt/A$1 | ${loyaltyValue}pts=A$1 | GST ${gstInclusive ? 'inclusive' : 'exclusive'} | Cash rounding ${(settings as any)?.cash_rounding !== false ? 'yes' : 'no'}
PRODUCTS (${products.length}): ${productsList}`;

  // CSV generation if user wants a file export
  const wantsFile = /excel|csv|download|export|spreadsheet/i.test(userMessage);
  let downloadPayload: { filename: string; content: string; type: string } | null = null;

  if (wantsFile && topProdList.length > 0) {
    const csvRows = [['Product Name', 'Units Sold', 'Revenue', 'Avg Price']];
    for (const [name, v] of topProdList) {
      csvRows.push([name, String(v.qty), `A$${v.revenue.toFixed(2)}`, `A$${(v.revenue/v.qty).toFixed(2)}`]);
    }
    const csv = csvRows.map(r => r.map(c => `"${c.replace(/"/g,'""')}"`).join(',')).join('\n');
    const month = new Date().toISOString().slice(0,7);
    downloadPayload = { filename: `aria-sales-${month}.csv`, content: csv, type: 'text/csv' };
  }

  const systemPrompt = `You are Aria — the AI co-pilot built into AriaPOS.
You know everything about this POS system and this business.
You help with ANYTHING the staff or owner asks. No restrictions.

You can help with:
- Where to find any feature or page in the POS
- Sales reports, inventory reports, cashier reports, commission reports
  → Direct them to the Reports section in the sidebar
- How to process refunds, voids, discounts
- Stock levels and product information
- Customer loyalty points and history
- How to open/close the register
- Commission tracking and staff performance
- Kitchen display, table management, timesheets
- Any question about the business data you have access to
- Keyboard shortcuts (F1=Search, F2=Custom item, F3=Hold, F8=Cash, F9=Card, F10=Complete)
- How to use any feature in Aria

NAVIGATION — tell staff exactly where to go:
- Sales reports → sidebar → Reports → Sales Report
- Inventory report → sidebar → Reports → Inventory
- Cashier report → sidebar → Reports → Cashier
- Commission report → sidebar → Reports → Commission
- Register closures → sidebar → Reports → Closures
- Products → sidebar → Inventory → Products
- Categories → sidebar → Inventory → Categories
- Suppliers → sidebar → Inventory → Suppliers
- Purchase orders → sidebar → Inventory → Purchase Orders
- Stocktake → sidebar → Inventory → Stocktake
- Customers → sidebar → Customers
- Gift cards → sidebar → Customers → Gift Cards
- Promotions → sidebar → Customers → Promotions
- Loyalty → sidebar → Customers → Loyalty
- Kitchen display → sidebar → Operations → Kitchen (KDS)
- Tables → sidebar → Operations → Tables
- Timesheets → sidebar → Operations → Timesheets
- Cash management → sidebar → Operations → Cash
- Close register → sidebar → Operations → Close Register
- Settings → sidebar → Settings
- Staff PINs → sidebar → Settings → Staff PINs

BUSINESS DATA:
${businessContext}

RULES:
- Answer EVERYTHING directly and helpfully
- NEVER say you cannot help or redirect to a manager
- NEVER say "check the admin dashboard directly"
- Give specific answers with exact navigation paths
- Keep responses under 3 sentences — staff are serving customers
- For "where is X" questions: give the exact sidebar path
- For data questions: use the business context above
- You know this entire POS system inside out`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
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

    const assistantText = reply;
    return NextResponse.json({
      reply: assistantText,
      action,
      ...(downloadPayload ? { download: downloadPayload } : {}),
    });
  } catch (err) {
    console.error('[pos-chat] Claude error:', err);
    return NextResponse.json({ reply: "Sorry, I couldn't process that right now." });
  }
}

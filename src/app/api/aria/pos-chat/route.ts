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

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  type SaleRow    = { id: string; total_amount: number; payment_method: string; customer_id: string | null };
  type ProductRow = { name: string; price: number; cost_price: number; stock_quantity: number; low_stock_threshold: number; track_stock: boolean };
  type ItemRow    = { product_name: string; quantity: number };

  // Fetch all data in parallel
  const [
    bizRes,
    salesRes,
    productsRes,
    settingsRes,
    topItemsRes,
    { data: todaySales },
    { data: monthSales },
    { data: topItems },
    { data: lowStock },
    { data: promotions },
    customersRes,
  ] = await Promise.all([
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
    supabase.from('pos_sales').select('total_amount').eq('business_id', resolvedBid).gte('created_at', todayStart),
    supabase.from('pos_sales').select('total_amount').eq('business_id', resolvedBid).gte('created_at', monthStart),
    supabase.from('pos_sale_items').select('product_name,quantity').eq('business_id', resolvedBid).gte('created_at', monthStart),
    supabase.from('pos_products').select('name,stock_quantity').eq('business_id', resolvedBid).eq('is_active', true).eq('track_stock', true).lt('stock_quantity', 10).order('stock_quantity').limit(10),
    supabase.from('pos_promotions').select('name,active').eq('business_id', resolvedBid).eq('active', true).limit(5),
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', resolvedBid),
  ]);

  const biz      = bizRes.data;
  const sales     = (salesRes.data ?? []) as SaleRow[];
  const products  = (productsRes.data ?? []) as ProductRow[];
  const settings  = settingsRes.data;
  const topItemsToday = (topItemsRes.data ?? []) as ItemRow[];

  // Aggregate today's stats
  const txCount   = sales.length;
  const revenue   = sales.reduce((s: number, r: SaleRow) => s + (r.total_amount ?? 0), 0);
  const cashSales = sales.filter((s: SaleRow) => s.payment_method === 'cash').length;
  const cardSales = txCount - cashSales;

  // Top items sold today
  const itemCounts: Record<string, number> = {};
  for (const i of topItemsToday) {
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

  // Cart context
  const cartText = cart_context?.items?.length
    ? cart_context.items.map(i => `${i.qty}× ${i.name} @ A$${i.price.toFixed(2)}`).join(', ') +
      ` — subtotal A$${(cart_context.total_cents / 100).toFixed(2)}`
    : 'Empty cart';

  // Loyalty settings
  const loyaltyRate = (settings as any)?.loyalty_points_per_dollar ?? 1;
  const loyaltyValue = (settings as any)?.loyalty_points_per_dollar_value ?? 100;
  const gstInclusive = (settings as any)?.gst_inclusive !== false;

  // Rich business context (1A)
  const todayRevenue = (todaySales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
  const monthRevenue = (monthSales || []).reduce((s: number, r: any) => s + (r.total_amount || 0), 0);

  const prodMap: Record<string, number> = {};
  for (const item of (topItems || [])) {
    prodMap[item.product_name] = (prodMap[item.product_name] || 0) + item.quantity;
  }
  const topProductsList = Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([name,qty],i)=>`${i+1}. ${name}: ${qty} sold`).join('\n');

  const businessContext = `
LIVE DATA FOR ${biz?.name}:
TODAY: A$${todayRevenue.toFixed(2)}, ${(todaySales||[]).length} transactions
THIS MONTH: A$${monthRevenue.toFixed(2)}, ${(monthSales||[]).length} transactions
TOP PRODUCTS: ${topProductsList || 'No data yet'}
LOW STOCK: ${(lowStock||[]).map((p:any)=>`${p.name}: ${p.stock_quantity}`).join(', ') || 'None'}
ACTIVE PROMOTIONS: ${(promotions||[]).map((p:any)=>p.name).join(', ') || 'None'}

BUSINESS: ${biz?.name ?? 'Unknown'}, ${biz?.industry ?? ''}, ${biz?.city ?? 'Australia'}
TIME: ${nowHHMM} (Sydney)
TODAY: A$${revenue.toFixed(2)} from ${txCount} transactions | ${cashSales} cash, ${cardSales} card
TOTAL CUSTOMERS: ${(customersRes as any)?.count ?? 'unknown'}
TODAY TOP SELLERS: ${topSellers || 'No sales yet'}
STOCK OUT: ${outOfStock.map((p: ProductRow) => p.name).join(', ') || 'None'} | LOW: ${lowStockItems.map((p: ProductRow) => `${p.name}(${p.stock_quantity ?? 0})`).join(', ') || 'None'}
CART: ${cartText}
LOYALTY: ${loyaltyRate}pt/A$1 | ${loyaltyValue}pts=A$1 | GST ${gstInclusive ? 'inclusive' : 'exclusive'} | Cash rounding ${(settings as any)?.cash_rounding !== false ? 'yes' : 'no'}
PRODUCTS (${products.length}):
${productsList}`;

  // Action system prompt (1B)
  const ACTION_PROMPT = `
You have FULL authority to take actions. When asked to do something, DO IT.

NEVER say "I cannot do that automatically" or "please go to X page manually".

When you need to take an action, include it in your response like this:
ACTION:CREATE_ORDER:{"items":[{"product_name":"NAME","qty":N}],"reason":"WHY"}
ACTION:GENERATE_CSV:{"type":"sales","period":"month"}
ACTION:CREATE_PROMOTION:{"name":"NAME","discount_type":"percentage","discount_percent":N}

Examples:
- "order more Coopers" → respond + ACTION:CREATE_ORDER:{"items":[{"product_name":"Coopers Pale Ale","qty":24}],"reason":"Owner request"}
- "export sales to excel" → respond + ACTION:GENERATE_CSV:{"type":"sales","period":"month"}
- "create 10% discount on beer" → respond + ACTION:CREATE_PROMOTION:{"name":"10% Beer Special","discount_type":"percentage","discount_percent":10}
`;

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
- You know this entire POS system inside out
${ACTION_PROMPT}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // 1C: Parse and execute actions
    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const actionResults: any[] = [];
    let downloadPayload: { filename: string; content: string; type: string } | null = null;

    // Parse ACTION: tags
    const actionPattern = /ACTION:([A-Z_]+):([\s\S]*?)(?=\nACTION:|$)/gm;
    let m: RegExpExecArray | null;
    while ((m = actionPattern.exec(rawText)) !== null) {
      const [, actionType, jsonStr] = m;
      let data: any = {};
      try { data = JSON.parse(jsonStr.trim()); } catch { continue; }

      if (actionType === 'CREATE_ORDER') {
        try {
          const orderItems = (data.items || []).map((item: any) => ({
            product_name: item.product_name || item.name,
            suggested_qty: item.qty || item.quantity || 1,
            manual_qty: null,
            unit_cost_cents: 0,
            total_cost_cents: 0,
            reason: data.reason || 'Created by Aria',
          }));
          if (orderItems.length > 0) {
            const { data: draft } = await supabase.from('purchase_order_drafts').insert({
              business_id: resolvedBid,
              draft_type: 'ai_generated',
              status: 'pending_approval',
              items: orderItems,
              total_cost_cents: 0,
              aria_reasoning: data.reason || 'Created by Aria from chat',
              week_starting: new Date().toISOString().split('T')[0],
            }).select().single();
            actionResults.push({
              type: 'order_created',
              label: `✓ Purchase order created — ${orderItems.length} item(s)`,
              url: '/dashboard/orders',
              link_label: 'Review & approve →',
              draft_id: (draft as any)?.id,
            });
          }
        } catch (e) { console.error('CREATE_ORDER failed:', e); }
      }

      if (actionType === 'GENERATE_CSV') {
        try {
          const { data: saleItems } = await supabase
            .from('pos_sale_items')
            .select('product_name,quantity,unit_price,total_price,cost_price,created_at')
            .eq('business_id', resolvedBid)
            .gte('created_at', monthStart);

          const byProd: Record<string, { qty: number; rev: number; cost: number }> = {};
          for (const item of (saleItems || [])) {
            const k = (item as any).product_name || 'Unknown';
            if (!byProd[k]) byProd[k] = { qty: 0, rev: 0, cost: 0 };
            byProd[k].qty += (item as any).quantity || 0;
            byProd[k].rev += (item as any).total_price || 0;
            byProd[k].cost += ((item as any).cost_price || 0) * ((item as any).quantity || 1);
          }

          const rows = Object.entries(byProd).sort((a,b) => b[1].rev - a[1].rev);
          let csv = 'Product,Units Sold,Revenue,Cost,Profit,Margin %\n';
          csv += rows.map(([name, v]) => [
            `"${name}"`, v.qty,
            `$${v.rev.toFixed(2)}`, `$${v.cost.toFixed(2)}`,
            `$${(v.rev-v.cost).toFixed(2)}`,
            v.rev > 0 ? `${((v.rev-v.cost)/v.rev*100).toFixed(1)}%` : '0%',
          ].join(',')).join('\n');

          const month = new Date().toISOString().slice(0,7);
          downloadPayload = { filename: `aria-sales-${month}.csv`, content: csv, type: 'text/csv' };
          actionResults.push({ type: 'file_ready', label: `✓ ${downloadPayload.filename} ready` });
        } catch (e) { console.error('GENERATE_CSV failed:', e); }
      }

      if (actionType === 'CREATE_PROMOTION') {
        try {
          await supabase.from('pos_promotions').insert({
            business_id: resolvedBid,
            name: data.name,
            promotion_type: data.promotion_type || 'percentage_discount',
            discount_type: data.discount_type || 'percentage',
            discount_percent: data.discount_percent || 0,
            discount_amount: data.discount_amount || 0,
            active: true,
            product_ids: [],
            category_ids: [],
          });
          actionResults.push({ type: 'promotion_created', label: `✓ Promotion "${data.name}" created`, url: '/pos/promotions', link_label: 'View promotions →' });
        } catch (e) { console.error('CREATE_PROMOTION failed:', e); }
      }
    }

    // Strip ACTION: lines from displayed text
    const cleanText = rawText.replace(/ACTION:[A-Z_]+:[\s\S]*?(?=\nACTION:|\n\n|$)/gm, '').trim();

    // Also detect legacy discount action
    let action: { type: string; payload: Record<string, unknown> } | undefined;
    if (/applying|apply.*discount/i.test(cleanText)) {
      const match = cleanText.match(/(\d+(?:\.\d+)?)\s*%/);
      if (match) action = { type: 'apply_discount', payload: { percentage: parseFloat(match[1]) } };
    }

    return NextResponse.json({
      message: cleanText,
      reply: cleanText,
      action,
      actions_taken: actionResults,
      ...(downloadPayload ? { download: downloadPayload } : {}),
    });
  } catch (err) {
    console.error('[pos-chat] Claude error:', err);
    return NextResponse.json({ reply: "Sorry, I couldn't process that right now.", message: "Sorry, I couldn't process that right now." });
  }
}

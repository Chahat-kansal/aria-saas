export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: activeBiz } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const activeId = activeBiz?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;
  const business = activeId ? { id: activeId } : null;
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const body = await req.json();
  const {
    items, customer_id, payment_method,
    subtotal, tax_amount, discount_amount, total_amount,
    cash_tendered, change_given, notes,
    split_cash, split_card, outlet_id, served_by,
    session_id: bodySessionId, age_verified,
    table_id, order_type,
  } = body;

  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  // Validate stock for each item that tracks stock
  const productIds = items.map((i: any) => i.product_id);
  const { data: dbProducts } = await supabase
    .from('pos_products')
    .select('id, name, track_stock, stock_quantity, is_active')
    .in('id', productIds)
    .eq('business_id', business.id);

  if (!dbProducts) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });

  const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]));

  for (const item of items) {
    const p = productMap[item.product_id];
    if (!p) return NextResponse.json({ error: `Product not found: ${item.product_id}` }, { status: 400 });
    if (!p.is_active) return NextResponse.json({ error: `Product inactive: ${p.name}` }, { status: 400 });
    if (p.track_stock && p.stock_quantity != null && p.stock_quantity < item.quantity) {
      return NextResponse.json({ error: `Insufficient stock for: ${p.name}` }, { status: 400 });
    }
  }

  // Generate sale_number: POS-XXXX
  const { count } = await supabase
    .from('pos_sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id);

  const saleNumber = `POS-${String((count ?? 0) + 1).padStart(4, '0')}`;

  // Get open session
  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('id, total_cash_sales, total_card_sales')
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle();

  // Create sale record
  const { data: sale, error: saleErr } = await supabase
    .from('pos_sales')
    .insert({
      business_id: business.id,
      sale_number: saleNumber,
      customer_id: customer_id || null,
      session_id: openSession?.id || null,
      payment_method: payment_method ?? 'cash',
      subtotal: +subtotal.toFixed(2),
      tax_amount: +tax_amount.toFixed(2),
      discount_amount: +(discount_amount ?? 0).toFixed(2),
      total_amount: +total_amount.toFixed(2),
      cash_tendered: cash_tendered ?? null,
      change_given: change_given ?? null,
      split_cash: split_cash ?? null,
      split_card: split_card ?? null,
      outlet_id: outlet_id ?? null,
      notes: notes ?? null,
      served_by: served_by ?? null,
      age_verified: age_verified ?? false,
      status: 'completed',
    })
    .select()
    .single();

  if (saleErr || !sale) {
    return NextResponse.json({ error: saleErr?.message ?? 'Failed to create sale' }, { status: 500 });
  }

  // Create sale items
  const saleItems = items.map((i: any) => ({
    sale_id: sale.id,
    product_id: i.product_id,
    product_name: i.product_name,
    product_sku: i.product_sku ?? null,
    quantity: i.quantity,
    unit_price: +i.unit_price.toFixed(2),
    discount_percent: i.discount_percent ?? 0,
    tax_rate: i.tax_rate ?? 10,
    line_total: +i.line_total.toFixed(2),
  }));

  const { error: itemsErr } = await supabase.from('pos_sale_items').insert(saleItems);
  if (itemsErr) {
    await supabase.from('pos_sales').delete().eq('id', sale.id);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Decrement stock + log stock movements
  const stockOps: Promise<any>[] = [];
  for (const i of items) {
    const p = productMap[i.product_id];
    if (!p?.track_stock || p.stock_quantity == null) continue;
    const current = p.stock_quantity as number;
    const newStock = Math.max(0, current - i.quantity);
    stockOps.push(
      Promise.resolve(supabase.from('pos_products').update({ stock_quantity: newStock }).eq('id', i.product_id))
    );
    // Log stock movement — non-fatal if table missing
    stockOps.push(
      (async () => {
        try {
          await supabase.from('stock_movements').insert({
            business_id: business.id,
            item_id: i.product_id,
            movement_type: 'sale',
            quantity_added: -i.quantity,
            new_stock: newStock,
            notes: `Sale ${saleNumber}`,
            scanned_at: new Date().toISOString(),
          });
        } catch { /* non-fatal */ }
      })()
    );
  }
  await Promise.all(stockOps);

  // Update session totals (fix: eftpos not 'card')
  if (openSession) {
    const cashAmt = payment_method === 'cash' ? total_amount
      : payment_method === 'split' ? (split_cash ?? 0) : 0;
    const cardAmt = payment_method === 'eftpos' ? total_amount  // fixed: was 'card'
      : payment_method === 'split' ? (split_card ?? 0) : 0;
    await Promise.resolve(supabase.from('pos_cash_sessions').update({
      total_cash_sales: (openSession.total_cash_sales ?? 0) + cashAmt,
      total_card_sales: (openSession.total_card_sales ?? 0) + cardAmt,
    }).eq('id', openSession.id));
  }

  // Update customer loyalty + stats
  if (customer_id) {
    const { data: customer } = await supabase
      .from('pos_customers')
      .select('loyalty_points, total_spent, visit_count')
      .eq('id', customer_id)
      .maybeSingle();

    if (customer) {
      const pointsEarned = Math.floor(total_amount);
      await supabase.from('pos_customers').update({
        loyalty_points: (customer.loyalty_points ?? 0) + pointsEarned,
        total_spent: (customer.total_spent ?? 0) + total_amount,
        visit_count: (customer.visit_count ?? 0) + 1,
        last_visit: new Date().toISOString(),
      }).eq('id', customer_id);
    }
  }

  // Cafe KDS + ingredient deduction (non-blocking)
  ;(async () => {
    try {
      const { data: biz } = await supabase.from('businesses').select('industry').eq('id', business.id).maybeSingle()
      if (biz?.industry !== 'cafe') return

      // KDS ticket
      const tableLabel = table_id ? `Table ${table_id}` : (order_type === 'dine_in' ? 'Dine-in' : 'Takeaway')
      await supabase.from('pos_kds_orders').insert({
        business_id: business.id,
        sale_id: sale.id,
        table_number: tableLabel,
        items: items.map((i: any) => ({
          name: i.product_name,
          qty: i.quantity,
          modifiers: i.modifiers ?? [],
        })),
        status: 'new',
        priority: 1,
        notes: notes ?? null,
        created_at: new Date().toISOString(),
      })

      // Ingredient deduction via recipe_ingredients
      for (const item of items as Array<{ product_id: string; quantity: number }>) {
        const { data: recipe } = await supabase
          .from('recipes')
          .select('id, serves, recipe_ingredients(product_id, quantity)')
          .eq('business_id', business.id)
          .eq('product_id', item.product_id)
          .eq('is_active', true)
          .maybeSingle()
        if (!recipe || !(recipe as any).recipe_ingredients?.length) continue
        for (const ing of (recipe as any).recipe_ingredients as Array<{ product_id: string | null; quantity: number }>) {
          if (!ing.product_id) continue
          const { data: prod } = await supabase.from('pos_products').select('stock_quantity').eq('id', ing.product_id).maybeSingle()
          if (prod?.stock_quantity == null) continue
          const deduct = (ing.quantity * item.quantity) / ((recipe as any).serves || 1)
          await supabase.from('pos_products').update({ stock_quantity: Math.max(0, (prod.stock_quantity as number) - deduct) }).eq('id', ing.product_id)
        }
      }
    } catch { /* non-fatal */ }
  })()

  // Aria Brain — observe sale + low stock + activity log (non-blocking dynamic import)
  const bid = business.id
  import('@/lib/aria/brain').then(({ logActivity, ariaObserve }) => {
    logActivity(bid, 'sale_completed',
      `Sale ${sale.sale_number ?? sale.id?.slice(-6)} · A$${(total_amount ?? 0).toFixed(2)} · ${payment_method ?? 'cash'}`,
      { sale_id: sale.id, total: total_amount, method: payment_method }
    ).catch(() => {})

    ariaObserve({
      business_id: bid,
      category: 'sales',
      event_type: 'sale_completed',
      triggered_by: 'sale',
      data: {
        sale_id: sale.id,
        total: total_amount ?? 0,
        method: payment_method,
        item_count: body.items?.length ?? 0,
        hour: new Date().getHours(),
      },
    }).catch(() => {})

    // Low-stock check per sold item
    if (body.items?.length) {
      for (const item of body.items as Array<{ product_id?: string }>) {
        if (!item.product_id) continue
        supabase.from('pos_products')
          .select('name, stock_quantity, low_stock_threshold')
          .eq('id', item.product_id)
          .maybeSingle()
          .then(({ data: p }) => {
            if (p && p.stock_quantity != null && p.low_stock_threshold != null
                && p.stock_quantity <= p.low_stock_threshold) {
              ariaObserve({
                business_id: bid,
                category: 'inventory',
                event_type: 'low_stock_detected',
                triggered_by: 'sale',
                data: { product_name: p.name, current_stock: p.stock_quantity, reorder_level: p.low_stock_threshold },
              }).catch(() => {})
            }
          }, () => {})
      }
    }
  }).catch(() => {})

  return NextResponse.json({ sale });
}

export const POST = withErrorCapture('pos/sale', _POST)

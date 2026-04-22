import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: business } = await supabase
    .from('businesses').select('id').eq('user_id', session.user.id).maybeSingle();
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const body = await req.json();
  const {
    items, customer_id, payment_method,
    subtotal, tax_amount, discount_amount, total_amount,
    cash_tendered, change_given, notes,
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
    if (p.track_stock && p.stock_quantity < item.quantity) {
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
    .select('id, cash_sales, card_sales')
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
      notes: notes ?? null,
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

  // Decrement stock for tracked products
  const stockUpdates = items
    .filter((i: any) => productMap[i.product_id]?.track_stock)
    .map((i: any) => {
      const current = productMap[i.product_id].stock_quantity;
      return supabase
        .from('pos_products')
        .update({ stock_quantity: current - i.quantity })
        .eq('id', i.product_id);
    });
  await Promise.all(stockUpdates);

  // Update session totals
  if (openSession) {
    const isCash = payment_method === 'cash';
    const isCard = payment_method === 'card';
    await supabase.from('pos_cash_sessions').update({
      cash_sales: isCash ? (openSession.cash_sales ?? 0) + total_amount : openSession.cash_sales,
      card_sales: isCard ? (openSession.card_sales ?? 0) + total_amount : openSession.card_sales,
    }).eq('id', openSession.id);
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

  return NextResponse.json({ sale });
}
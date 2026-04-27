import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ sales: [] });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  const { data: sales, error } = await supabase
    .from('pos_sales')
    .select('*, pos_customers(name), pos_sale_items(quantity, unit_price, discount_amount, pos_products(name))')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: sales || [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { items, total_amount, payment_method, customer_id, discount_amount } = await req.json();
  if (!items?.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 });

  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('id, total_cash_sales, total_card_sales')
    .eq('business_id', bid)
    .is('closed_at', null)
    .single();

  const { data: sale, error: saleError } = await supabase
    .from('pos_sales')
    .insert({
      business_id: bid,
      session_id: openSession?.id ?? null,
      customer_id: customer_id ?? null,
      total_amount,
      discount_amount: discount_amount ?? 0,
      payment_method,
      status: 'completed',
    })
    .select()
    .single();

  if (saleError) return NextResponse.json({ error: saleError.message }, { status: 500 });

  const { error: itemsError } = await supabase.from('pos_sale_items').insert(
    items.map((i: any) => ({
      sale_id: sale.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_amount: i.discount_amount ?? 0,
    }))
  );

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  if (openSession) {
    const isCash = payment_method === 'cash';
    await supabase.from('pos_cash_sessions').update({
      total_cash_sales: (openSession.total_cash_sales || 0) + (isCash ? total_amount : 0),
      total_card_sales: (openSession.total_card_sales || 0) + (!isCash ? total_amount : 0),
    }).eq('id', openSession.id);
  }

  if (customer_id) {
    const pts = Math.floor(total_amount);
    await supabase.rpc('increment_loyalty_points', { customer_id, points: pts }).maybeSingle();
  }

  return NextResponse.json({ sale });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { status } = await req.json();
  const { error } = await supabase
    .from('pos_sales')
    .update({ status })
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
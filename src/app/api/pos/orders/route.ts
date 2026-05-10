export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
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

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ orders: [] });

  const { data, error: ordErr } = await supabase
    .from('pos_purchase_orders')
    .select('*, pos_suppliers(name)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false });

  if (ordErr?.code === '42P01') return NextResponse.json({ orders: [] });
  return NextResponse.json({ orders: data || [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  // Try the generate_po_number RPC first, fall back to count-based
  const { data: numData } = await supabase.rpc('generate_po_number', { p_business_id: bid });
  let orderNumber = numData as string | null;
  if (!orderNumber) {
    const { count } = await supabase.from('pos_purchase_orders').select('id', { count: 'exact', head: true }).eq('business_id', bid);
    const year = new Date().getFullYear();
    orderNumber = `PO-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`;
  }

  const body = await req.json();
  const { data: order, error } = await supabase
    .from('pos_purchase_orders')
    .insert({ status: 'draft', source: 'manual', ...body, business_id: bid, order_number: orderNumber })
    .select('*, pos_suppliers(name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase.from('pos_purchase_orders').update(body).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
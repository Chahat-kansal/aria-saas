import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, session.user.id);
  if (!bid) return NextResponse.json({ parked_sales: [] });

  const { data } = await supabase
    .from('pos_parked_sales')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ parked_sales: data || [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { label, items, customer_id, subtotal, total } = await req.json();

  const { data, error } = await supabase
    .from('pos_parked_sales')
    .insert({ business_id: bid, label: label || null, items: items || [], customer_id: customer_id || null, subtotal: subtotal || 0, total: total || 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ parked_sale: data });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await supabase.from('pos_parked_sales').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}
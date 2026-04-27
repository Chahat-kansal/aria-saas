import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ groups: [] });
  const { data: groups } = await supabase.from('pos_customer_groups').select('*').eq('business_id', bid).order('name');
  const counts = await Promise.all((groups ?? []).map(g =>
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('customer_group_id', g.id)
  ));
  return NextResponse.json({ groups: (groups ?? []).map((g, i) => ({ ...g, member_count: counts[i].count ?? 0 })) });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const body = await req.json();
  const { data, error } = await supabase.from('pos_customer_groups').insert({ ...body, business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  if (body.assign_customer_ids) {
    await supabase.from('pos_customers').update({ customer_group_id: id }).in('id', body.assign_customer_ids);
    return NextResponse.json({ ok: true });
  }
  await supabase.from('pos_customer_groups').update(body).eq('id', id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('pos_customers').update({ customer_group_id: null }).eq('customer_group_id', id);
  await supabase.from('pos_customer_groups').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

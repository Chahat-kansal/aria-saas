export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  if (!bid) return NextResponse.json({ gift_cards: [] });
  const { data } = await supabase.from('pos_gift_cards').select('*').eq('business_id', bid).order('created_at', { ascending: false });
  return NextResponse.json({ gift_cards: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { initial_balance, expires_at, customer_id } = await req.json();
  if (!initial_balance) return NextResponse.json({ error: 'initial_balance required' }, { status: 400 });
  const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const { data, error } = await supabase.from('pos_gift_cards').insert({
    business_id: bid, code, initial_balance, current_balance: initial_balance,
    expires_at: expires_at ?? null, customer_id: customer_id ?? null, is_active: true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift_card: data });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const { action, amount } = body;
  if (action === 'void') {
    await supabase.from('pos_gift_cards').update({ is_active: false }).eq('id', id).eq('business_id', bid);
    return NextResponse.json({ ok: true });
  }
  if (action === 'redeem' && amount) {
    const { data: card } = await supabase.from('pos_gift_cards').select('current_balance').eq('id', id).single();
    if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const newBalance = Math.max(0, (card.current_balance ?? 0) - amount);
    await supabase.from('pos_gift_cards').update({ current_balance: newBalance }).eq('id', id);
    return NextResponse.json({ ok: true, new_balance: newBalance });
  }
  const { error } = await supabase.from('pos_gift_cards').update(body).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

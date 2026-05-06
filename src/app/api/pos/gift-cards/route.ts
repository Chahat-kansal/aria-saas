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

function generateCode(): string {
  // 8-char alphanumeric code in format XXXX-XXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) part1 += chars[Math.floor(Math.random() * chars.length)];
  for (let i = 0; i < 4; i++) part2 += chars[Math.floor(Math.random() * chars.length)];
  return `${part1}-${part2}`;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ gift_cards: [] });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  // Check balance by code
  if (code) {
    const { data, error } = await supabase
      .from('pos_gift_cards')
      .select('*')
      .eq('business_id', bid)
      .eq('code', code.toUpperCase().trim())
      .maybeSingle();
    if (error?.code === '42P01') return NextResponse.json({ gift_card: null });
    return NextResponse.json({ gift_card: data ?? null });
  }

  const { data, error: gcErr } = await supabase
    .from('pos_gift_cards')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false });
  if (gcErr?.code === '42P01') return NextResponse.json({ gift_cards: [] });
  if (gcErr) return NextResponse.json({ error: gcErr.message }, { status: 500 });
  return NextResponse.json({ gift_cards: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();
  // Support both 'amount' (dollars) and legacy 'initial_balance' (also dollars)
  const amountDollars = body.amount ?? body.initial_balance;
  if (!amountDollars || Number(amountDollars) <= 0) {
    return NextResponse.json({ error: 'amount required and must be > 0' }, { status: 400 });
  }

  const balanceDollars = parseFloat(String(amountDollars));
  const recipient_name: string | null = body.recipient_name ?? null;
  const expires_at: string | null = body.expires_at ?? null;
  const customer_id: string | null = body.customer_id ?? null;

  // Generate a unique code (retry up to 5 times on collision)
  let code = '';
  let inserted = null;
  let insertError = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode();
    const { data, error } = await supabase
      .from('pos_gift_cards')
      .insert({
        business_id: bid,
        code,
        initial_balance: balanceDollars,
        current_balance: balanceDollars,
        recipient_name,
        expires_at: expires_at ?? null,
        customer_id: customer_id ?? null,
        is_active: true,
        status: 'active',
        issued_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error) { inserted = data; break; }
    // If unique constraint violation, retry with new code
    if (error.code === '23505') { insertError = error; continue; }
    // Any other error — return immediately
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!inserted) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to generate unique code' }, { status: 500 });
  }

  return NextResponse.json({ gift_card: inserted });
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
  if (action === 'void' || body.is_active === false) {
    await supabase.from('pos_gift_cards').update({ is_active: false, status: 'cancelled' }).eq('id', id).eq('business_id', bid);
    return NextResponse.json({ ok: true });
  }
  if (action === 'redeem' && amount) {
    const { data: card } = await supabase.from('pos_gift_cards').select('current_balance').eq('id', id).single();
    if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const newBalance = Math.max(0, (card.current_balance ?? 0) - amount);
    const newStatus = newBalance <= 0 ? 'used' : 'active';
    await supabase.from('pos_gift_cards').update({ current_balance: newBalance, status: newStatus }).eq('id', id);
    return NextResponse.json({ ok: true, new_balance: newBalance });
  }
  const { error } = await supabase.from('pos_gift_cards').update(body).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

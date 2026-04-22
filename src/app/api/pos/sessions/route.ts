import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, session.user.id);
  if (!bid) return NextResponse.json({ openSession: null, sessions: [] });

  const { searchParams } = new URL(req.url);
  const history = searchParams.get('history') === 'true';

  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('business_id', bid)
    .is('closed_at', null)
    .single();

  if (!history) return NextResponse.json({ openSession: openSession || null });

  const { data: sessions } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('business_id', bid)
    .order('opened_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ openSession: openSession || null, sessions: sessions || [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { data: existing } = await supabase
    .from('pos_cash_sessions')
    .select('id')
    .eq('business_id', bid)
    .is('closed_at', null)
    .single();

  if (existing) return NextResponse.json({ error: 'A session is already open' }, { status: 400 });

  const { opening_float } = await req.json();
  const { data: cashSession, error } = await supabase
    .from('pos_cash_sessions')
    .insert({
      business_id: bid,
      opened_by: session.user.id,
      opening_float: opening_float ?? 0,
      total_cash_sales: 0,
      total_card_sales: 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cashSession });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, session.user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { session_id, closing_float } = await req.json();
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const { error } = await supabase
    .from('pos_cash_sessions')
    .update({ closed_at: new Date().toISOString(), closing_float: closing_float ?? 0 })
    .eq('id', session_id)
    .eq('business_id', bid)
    .is('closed_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
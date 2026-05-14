export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

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

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ openSession: null, sessions: [] });

  const { searchParams } = new URL(req.url);
  const history = searchParams.get('history') === 'true';
  const sessionId = searchParams.get('id');
  const openOnly = searchParams.get('open') === 'true';
  const status = searchParams.get('status');

  // Fetch a specific session by ID
  if (sessionId) {
    const { data: session } = await supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('business_id', bid)
      .maybeSingle();
    return NextResponse.json({ session: session || null });
  }

  // ?status=open — return open session with payment totals for close page
  if (status === 'open') {
    const { data: session } = await supabase
      .from('pos_cash_sessions')
      .select('*')
      .eq('business_id', bid)
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) return NextResponse.json({ session: null, payment_totals: {} });

    const { data: salesData } = await supabase
      .from('pos_sales')
      .select('payment_method,total_amount')
      .eq('business_id', bid)
      .gte('created_at', session.opened_at)
      .neq('status', 'voided');

    const payment_totals: Record<string, number> = {};
    for (const s of (salesData || [])) {
      const meth = (s.payment_method as string) || 'cash';
      payment_totals[meth] = (payment_totals[meth] || 0) + ((s.total_amount as number) || 0);
    }

    return NextResponse.json({
      session,
      payment_totals,
      total_transactions: (salesData || []).length,
      total_revenue: Object.values(payment_totals).reduce((a, b) => a + b, 0),
    });
  }

  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('business_id', bid)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ?open=true — return open session under 'session' key for close page
  if (openOnly) return NextResponse.json({ session: openSession || null, openSession: openSession || null });

  if (!history) return NextResponse.json({ openSession: openSession || null });

  const { data: sessions } = await supabase
    .from('pos_cash_sessions')
    .select('*')
    .eq('business_id', bid)
    .order('opened_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ openSession: openSession || null, sessions: sessions || [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { data: existing } = await supabase
    .from('pos_cash_sessions')
    .select('id')
    .eq('business_id', bid)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) return NextResponse.json({ error: 'A session is already open' }, { status: 400 });

  const { opening_float } = await req.json();
  const { data: cashSession, error } = await supabase
    .from('pos_cash_sessions')
    .insert({
      business_id: bid,
      opened_by: user.id,
      opening_float: opening_float ?? 0,
      status: 'open',
      total_cash_sales: 0,
      total_card_sales: 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cashSession });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const queryId = searchParams.get('id');

  const body = await req.json();
  // Support both legacy { session_id } body and new ?id= query param
  const session_id = queryId ?? body.session_id;
  if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  // Build update payload — support both legacy closing_float and new detailed fields
  const updatePayload: Record<string, unknown> = {
    status: 'closed',
    closed_at: body.closed_at ?? new Date().toISOString(),
  };
  if (body.closing_float !== undefined) updatePayload.closing_float = body.closing_float;
  if (body.closing_float_cents !== undefined) updatePayload.closing_float = body.closing_float_cents / 100;
  if (body.actual_cash_cents !== undefined) {
    updatePayload.actual_cash_cents = body.actual_cash_cents;
  }
  if (body.expected_cash_cents !== undefined) {
    updatePayload.expected_cash_cents = body.expected_cash_cents;
  }
  if (body.variance_cents !== undefined) {
    updatePayload.variance_cents = body.variance_cents;
  }
  if (body.notes !== undefined) updatePayload.notes = body.notes;
  if (body.closure_note !== undefined) updatePayload.closure_note = body.closure_note;
  if (body.closed_by !== undefined) updatePayload.closed_by = body.closed_by;

  // Populate total_cash_sales / total_card_sales from actual sales for this session
  try {
    const { data: sessionMeta } = await supabase.from('pos_cash_sessions')
      .select('opened_at').eq('id', session_id).maybeSingle();
    if (sessionMeta?.opened_at) {
      const { data: sales } = await supabase.from('pos_sales')
        .select('payment_method, total_amount')
        .eq('business_id', bid).eq('session_id', session_id).neq('status', 'voided');
      let cashTotal = 0, cardTotal = 0;
      for (const sale of sales ?? []) {
        const amt = Number(sale.total_amount ?? 0);
        if (String(sale.payment_method ?? 'cash') === 'cash') cashTotal += amt;
        else cardTotal += amt;
      }
      updatePayload.total_cash_sales = cashTotal;
      updatePayload.total_card_sales = cardTotal;
      updatePayload.total_refunds = 0;
    }
  } catch { /* non-fatal */ }

  const { error } = await supabase
    .from('pos_cash_sessions')
    .update(updatePayload)
    .eq('id', session_id)
    .eq('business_id', bid)
    .eq('status', 'open');

  if (error) {
    // Schema cache miss — retry with minimal payload
    if (error.message?.includes('schema cache') || (error as any).code === 'PGRST204') {
      console.error('[sessions/PATCH] schema cache error, retrying minimal payload:', error.message);
      const minPayload: Record<string, unknown> = {
        status: 'closed',
        closed_at: updatePayload.closed_at ?? new Date().toISOString(),
      };
      if (updatePayload.closing_float !== undefined) minPayload.closing_float = updatePayload.closing_float;
      if (updatePayload.notes !== undefined) minPayload.notes = updatePayload.notes;
      if (updatePayload.closure_note !== undefined) minPayload.closure_note = updatePayload.closure_note;
      const { error: retryErr } = await supabase.from('pos_cash_sessions')
        .update(minPayload).eq('id', session_id).eq('business_id', bid).eq('status', 'open');
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, schema_cache_fallback: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/sessions', _GET)
export const POST = withErrorCapture('pos/sessions', _POST)
export const PATCH = withErrorCapture('pos/sessions', _PATCH)

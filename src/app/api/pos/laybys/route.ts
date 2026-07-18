export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ laybys: [] });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'active';
  let q = supabase.from('pos_laybys').select('*,pos_customers(name,phone)').eq('business_id', bid).order('created_at', { ascending: false }).limit(100);
  if (status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return NextResponse.json({ laybys: data ?? [] });
}

// WIRE-5 — layby create. ALL amounts CENTS (pos_laybys = deposit_cents/paid_cents/total_cents).
async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}));
  const total_cents = Math.round(Number(body.total_cents ?? 0));
  const deposit_cents = Math.round(Number(body.deposit_cents ?? 0));
  if (!body.customer_id) return NextResponse.json({ error: 'customer_id required — a layby is held against a customer' }, { status: 400 });
  if (total_cents <= 0) return NextResponse.json({ error: 'total_cents required (cents)' }, { status: 400 });
  if (deposit_cents < 0 || deposit_cents > total_cents) return NextResponse.json({ error: 'deposit_cents must be between 0 and total_cents' }, { status: 400 });

  const { data, error: insErr } = await supabase.from('pos_laybys').insert({
    business_id: bid,
    customer_id: body.customer_id,
    total_cents,
    deposit_cents,
    paid_cents: deposit_cents,                 // the deposit is the first payment
    due_date: body.due_date ?? null,
    items: Array.isArray(body.items) ? body.items : [],
    notes: body.notes ?? null,
    status: 'active',                          // stays 'active' until completed (CHECK: active|completed|cancelled)
  }).select('*').single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  return NextResponse.json({ layby: data }, { status: 201 });
}

// PATCH actions: 'pay' (add a payment, CENTS, atomic), 'complete' (convert to a POS sale),
// or a scoped status/notes update. business_id-scoped (no cross-business writes).
async function _PATCH(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: layby } = await supabase.from('pos_laybys').select('*').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!layby) return NextResponse.json({ error: 'Layby not found' }, { status: 404 });

  // ── Add a scheduled payment (CENTS), atomic optimistic-lock so concurrent pays can't overcount ──
  if (body.action === 'pay') {
    const amount_cents = Math.round(Number(body.amount_cents ?? 0));
    if (amount_cents <= 0) return NextResponse.json({ error: 'amount_cents required (cents)' }, { status: 400 });
    const curPaid = Number(layby.paid_cents ?? 0);
    const total = Number(layby.total_cents ?? 0);
    const newPaid = Math.min(total, curPaid + amount_cents);
    // status stays 'active' (CHECK allows active|completed|cancelled); fully-paid is paid_cents>=total_cents.
    const { data: upd } = await supabase.from('pos_laybys')
      .update({ paid_cents: newPaid })
      .eq('id', id).eq('business_id', bid).eq('paid_cents', curPaid).select('*').maybeSingle();
    if (!upd) return NextResponse.json({ error: 'Payment conflict — please retry' }, { status: 409 });
    return NextResponse.json({ layby: upd, paid_cents: newPaid, remaining_cents: total - newPaid, fully_paid: newPaid >= total });
  }

  // ── Complete → convert to a POS sale (total in DOLLARS = total_cents / 100) ──
  if (body.action === 'complete') {
    // paid_cents only ever increases (payments add), so this monotonic check before the atomic claim is safe.
    if (Number(layby.paid_cents ?? 0) < Number(layby.total_cents ?? 0)) {
      return NextResponse.json({ error: 'Layby not fully paid yet' }, { status: 400 });
    }
    // BUGFIX-POS-RACES-5 FIX 2 — atomic completion claim BEFORE creating the sale. Only the FIRST concurrent
    // complete updates a row (status 'active' → 'completed'); a second gets 0 rows and is rejected, so one
    // layby can never produce two sales (the prior check-then-set let both concurrent completes through).
    const { data: claimed } = await supabase.from('pos_laybys')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', id).eq('business_id', bid).eq('status', 'active')
      .select('*').maybeSingle();
    if (!claimed) return NextResponse.json({ error: 'Layby already completed' }, { status: 409 });

    const totalDollars = Math.round(Number(claimed.total_cents ?? 0)) / 100;
    const { count } = await supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid);
    const { data: sale, error: saleErr } = await supabase.from('pos_sales').insert({
      business_id: bid,
      sale_number: 'LAYBY-' + String((count ?? 0) + 1).padStart(4, '0'),
      payment_method: 'other',                 // pos_sales CHECK: cash|card|eftpos|split|gift_card|other
      total_amount: totalDollars,
      subtotal: totalDollars,
      tax_amount: Math.round((totalDollars - totalDollars / 1.1) * 100) / 100,
      discount_amount: 0,
      status: 'completed',
      customer_id: claimed.customer_id ?? null,
      notes: 'Layby completed',
    }).select('id, sale_number').single();
    if (saleErr || !sale) {
      // Roll back the claim so a failed sale insert doesn't strand the layby as completed-without-a-sale.
      await supabase.from('pos_laybys').update({ status: 'active', completed_at: null }).eq('id', id).eq('business_id', bid);
      return NextResponse.json({ error: saleErr?.message ?? 'Could not create sale from layby' }, { status: 500 });
    }
    const { data: done } = await supabase.from('pos_laybys')
      .update({ notes: `${claimed.notes ? claimed.notes + ' · ' : ''}Converted to sale ${sale.sale_number ?? ''}` })
      .eq('id', id).eq('business_id', bid).select('*').single();
    return NextResponse.json({ layby: done ?? claimed, sale_id: sale.id });
  }

  // ── Scoped status/notes/due_date update ──
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.notes !== undefined) patch.notes = body.notes;
  const { data } = await supabase.from('pos_laybys').update(patch).eq('id', id).eq('business_id', bid).select('*').single();
  return NextResponse.json({ layby: data });
}

export const GET = withErrorCapture('pos/laybys', _GET)
export const POST = withBusinessContext('pos/laybys', _POST)
export const PATCH = withBusinessContext('pos/laybys', _PATCH)

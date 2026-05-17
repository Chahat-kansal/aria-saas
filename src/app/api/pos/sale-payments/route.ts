export const dynamic = 'force-dynamic';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();
  const sale_id = body.sale_id;
  const method = body.method;
  // Accept both amount_cents (correct) and amount (legacy, convert)
  const amount_cents = body.amount_cents != null
    ? Math.round(Number(body.amount_cents))
    : body.amount != null
      ? Math.round(Number(body.amount) * 100)
      : null;
  const reference = body.reference ?? null;

  console.log('[sale-payments] received:', JSON.stringify({ sale_id, method, amount_cents: body.amount_cents, amount: body.amount }))

  if (!sale_id || !method || !amount_cents) {
    return NextResponse.json({ error: 'sale_id, method, and amount_cents (or amount) are required' }, { status: 400 });
  }

  console.log('[sale-payments] inserting:', JSON.stringify({ sale_id, method, amount_cents }))
  const { data, error: insertErr } = await supabase.from('pos_sale_payments').insert({
    sale_id,
    method,
    amount_cents,
    reference,
  }).select('id').single();

  if (insertErr) {
    console.error('[sale-payments] insert failed:', JSON.stringify({ code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint }));
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}

export const POST = withErrorCapture('pos/sale-payments', _POST)

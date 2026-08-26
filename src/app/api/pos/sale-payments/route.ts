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

  // SECURITY-CRITICAL-1 — bid was fetched (gates "belongs to *a* business") but never checked against
  // sale_id, and pos_sale_payments has no business_id column of its own to scope by (tenant isolation
  // for this table is derived entirely via the sale_id FK) — so this was a wide-open cross-tenant
  // write: any authenticated user could inject a payment row against any other business's sale
  // (BUG-HUNT-1 Tier 0.6). Verify the sale belongs to bid before inserting.
  const { data: sale } = await supabase.from('pos_sales').select('id').eq('id', sale_id).eq('business_id', bid).maybeSingle();
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 });

  // POS-INTEGRITY-1 §2.1 — dollars and tenancy, alongside the existing cents.
  //
  // This route is in scope even though it is not one of the three files the sprint named, and the
  // reason is concrete: the reconciliation query sums pos_sale_payments.amount. A row written here
  // WITHOUT `amount` would be counted as $0.00 and would report as drift on a sale that was in fact
  // fully paid — a false incident on the money tool, raised by the very sprint adding the check.
  //
  // `amount` is the authority; cents are derived from it. Where the caller sent amount_cents (the
  // legacy shape) dollars are recovered from it once, at the boundary, not on every read.
  const amountDollars = body.amount != null
    ? +Number(body.amount).toFixed(2)
    : +(amount_cents / 100).toFixed(2);

  console.log('[sale-payments] inserting:', JSON.stringify({ sale_id, method, amount_cents, amount: amountDollars }))
  const { data, error: insertErr } = await supabase.from('pos_sale_payments').insert({
    sale_id,
    business_id: bid,
    method,
    amount: amountDollars,
    amount_cents,
    tip_amount: body.tip_amount != null ? +Number(body.tip_amount).toFixed(2) : 0,
    reference,
  }).select('id').single();

  if (insertErr) {
    console.error('[sale-payments] insert failed:', JSON.stringify({ code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint }));
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}

export const POST = withErrorCapture('pos/sale-payments', _POST)

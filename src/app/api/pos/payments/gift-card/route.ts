export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * GET /api/pos/payments/gift-card?code=XXXX-XXXX
 * Validate a gift card and return its balance before charging.
 */
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code')?.toUpperCase().trim();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const { data: card, error } = await supabase
    .from('pos_gift_cards')
    .select('id, code, balance, initial_balance, recipient_name, expires_at, is_active')
    .eq('business_id', bid)
    .eq('code', code)
    .maybeSingle();

  if (error?.code === '42P01') return NextResponse.json({ valid: false, error: 'Gift cards not set up yet' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!card) return NextResponse.json({ valid: false, error: 'Gift card not found' });
  if (!card.is_active) return NextResponse.json({ valid: false, error: 'Gift card has been cancelled' });
  if ((card.balance ?? 0) <= 0) return NextResponse.json({ valid: false, error: 'Gift card has no remaining balance' });
  if (card.expires_at && new Date(card.expires_at) < new Date()) return NextResponse.json({ valid: false, error: 'Gift card has expired' });

  return NextResponse.json({
    valid: true,
    card: {
      id: card.id,
      code: card.code,
      balance: card.balance,
      initial_balance: card.initial_balance,
      recipient_name: card.recipient_name,
      expires_at: card.expires_at,
    },
  });
}

/**
 * POST /api/pos/payments/gift-card
 * Redeem a gift card as payment for a sale.
 * Call this AFTER the sale record is created.
 *
 * Body: { gift_card_code, amount_to_charge, sale_id }
 * Returns: { ok, charged, remaining_balance, new_status }
 */
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { gift_card_code, amount_to_charge, sale_id } = await req.json();
  if (!gift_card_code || !amount_to_charge || !sale_id) {
    return NextResponse.json({ error: 'gift_card_code, amount_to_charge, sale_id required' }, { status: 400 });
  }

  const code = String(gift_card_code).toUpperCase().trim();
  const charge = parseFloat(String(amount_to_charge));
  if (isNaN(charge) || charge <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

  // Fetch the card
  const { data: card, error: fetchErr } = await supabase
    .from('pos_gift_cards')
    .select('id, balance, is_active, expires_at, redeemed_amount, voided_at')
    .eq('business_id', bid)
    .eq('code', code)
    .maybeSingle();

  if (fetchErr?.code === '42P01') return NextResponse.json({ error: 'Gift cards table not set up' }, { status: 500 });
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!card) return NextResponse.json({ error: 'Gift card not found' }, { status: 404 });
  if (!card.is_active) return NextResponse.json({ error: 'Gift card is cancelled' }, { status: 400 });
  if (card.expires_at && new Date(card.expires_at) < new Date()) return NextResponse.json({ error: 'Gift card has expired' }, { status: 400 });
  if (card.voided_at) return NextResponse.json({ error: 'Gift card has been voided' }, { status: 400 });

  const currentBalance = parseFloat(String(card.balance ?? 0));
  if (currentBalance <= 0) return NextResponse.json({ error: 'Gift card has no remaining balance' }, { status: 400 });
  const actualCharge = Math.min(charge, currentBalance);
  const newBalance = Math.max(0, currentBalance - actualCharge);

  // WIRE-2 — write the redeem transaction FIRST as the idempotency gate (canonical table =
  // gift_card_transactions). The unique index gift_card_txn_redeem_per_sale (gift_card_id, sale_id
  // where type='redeem') makes a retried tender CONFLICT rather than double-deducting the card.
  const { error: txnErr } = await supabase.from('gift_card_transactions').insert({
    gift_card_id: card.id, business_id: bid, type: 'redeem',
    amount: actualCharge, balance_after: newBalance, sale_id,
    staff_name: user.email ?? null, created_at: new Date().toISOString(),
  });
  if (txnErr) {
    if (/duplicate|unique/i.test(txnErr.message)) {
      const { data: prior } = await supabase.from('gift_card_transactions')
        .select('amount, balance_after').eq('gift_card_id', card.id).eq('sale_id', sale_id).eq('type', 'redeem').maybeSingle();
      return NextResponse.json({ ok: true, charged: Number(prior?.amount ?? actualCharge), remaining_balance: Number(prior?.balance_after ?? currentBalance), idempotent: true });
    }
    return NextResponse.json({ error: txnErr.message }, { status: 500 });
  }

  // BUGFIX-POS-RACES-5 FIX 1 — atomic guarded deduct (was a JS read-modify-write that let two concurrent
  // DIFFERENT-sale redemptions both read the same balance and overspend below 0). The RPC row-locks the card,
  // charges LEAST(requested, balance) and can never go negative. The sale_id idempotency gate above still
  // prevents a SAME-sale double deduct (a retry conflicts before reaching here).
  const { data: redeemRows, error: rpcErr } = await supabase.rpc('redeem_gift_card', { p_card_id: card.id, p_bid: bid, p_charge: charge });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  const redeem = (Array.isArray(redeemRows) ? redeemRows[0] : redeemRows) as { charged: number; new_balance: number } | undefined;
  if (!redeem) {
    // Card was depleted by a concurrent redemption between validation and deduct — remove the idempotency
    // placeholder so this sale can be retried, and report a clean insufficient-balance error to the loser.
    await supabase.from('gift_card_transactions').delete()
      .eq('gift_card_id', card.id).eq('sale_id', sale_id).eq('type', 'redeem');
    return NextResponse.json({ error: 'Gift card has insufficient balance' }, { status: 409 });
  }
  const realCharge = Number(redeem.charged);
  const realBalance = Number(redeem.new_balance);
  // Reconcile the ledger row to the REAL charged/balance if a cross-sale race shifted them from the estimate.
  if (realCharge !== actualCharge || realBalance !== newBalance) {
    await supabase.from('gift_card_transactions')
      .update({ amount: realCharge, balance_after: realBalance })
      .eq('gift_card_id', card.id).eq('sale_id', sale_id).eq('type', 'redeem');
  }

  // Velocity fraud check — flag 3+ redemptions on the same card within 10 minutes
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('gift_card_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('gift_card_id', card.id).eq('type', 'redeem').gte('created_at', tenMinsAgo);
  if ((recentCount ?? 0) >= 3) {
    await supabase.from('pos_gift_cards').update({ is_flagged: true, flag_reason: `${recentCount} redemptions in 10 minutes` }).eq('id', card.id);
  }

  await supabase.from('pos_sales').update({
    gift_card_id: card.id, gift_card_code: code, gift_card_amount: realCharge,
  }).eq('id', sale_id).eq('business_id', bid);

  return NextResponse.json({
    ok: true, charged: realCharge, remaining_balance: realBalance,
    short_paid: charge > realCharge ? charge - realCharge : 0,
    flagged: (recentCount ?? 0) >= 3,
  });
}

export const GET = withErrorCapture('pos/payments/gift-card', _GET)
export const POST = withErrorCapture('pos/payments/gift-card', _POST)

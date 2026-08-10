export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { computeLoyaltyDrift, findDrift, describeDrift } from '@/lib/loyalty/reconcile';

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  // ARIA-LOYALTY-FIX-1 §2b — reconcile balances against the ledger, DAILY, here.
  //
  // This cron is the right host and needs no new cron entry or function: it already runs daily
  // (dispatch h04) and it already EXPIRES points, so it is the one job that must not operate on a
  // balance the ledger cannot explain. Reported, not enforced — see reconcile.ts for why deriving
  // the balance from the ledger is the right end state and not a safe same-sprint change.
  const drifted = findDrift(await computeLoyaltyDrift(supabaseAdmin));
  for (const d of drifted) console.warn('[loyalty-drift] ' + describeDrift(d));
  const { data: businesses } = await supabaseAdmin.from('businesses')
    .select('id, loyalty_points_expiry_months')
    .eq('is_active', true);

  let warned = 0, expired = 0;

  for (const biz of businesses ?? []) {
    const months = Number(biz.loyalty_points_expiry_months ?? 12);
    if (months <= 0) continue;
    const expiryCutoff = new Date(Date.now() - months * 30 * 86400_000).toISOString();
    const warnCutoff = new Date(Date.now() - (months * 30 - 30) * 86400_000).toISOString();

    // Find customers eligible for warning (inactive for months-1 months)
    const { data: warnCusts } = await supabaseAdmin.from('pos_customers')
      .select('id, points_balance, last_visit_at')
      .eq('business_id', biz.id)
      .gt('points_balance', 0)
      .lt('last_visit_at', warnCutoff)
      .gte('last_visit_at', expiryCutoff);

    for (const c of warnCusts ?? []) {
      // Log as transaction note (no actual deduction)
      try {
        await supabaseAdmin.from('pos_loyalty_transactions').insert({
          business_id: biz.id, customer_id: c.id, type: 'expiry_warning',
          points_delta: 0, reward_redeemed: `${c.points_balance} points expire in ~30 days`,
        });
        warned++;
      } catch (e) { console.error('[non-fatal]', e) }
    }

    // Expire points for customers whose last visit is older than the full expiry window
    const { data: expCusts } = await supabaseAdmin.from('pos_customers')
      .select('id, points_balance')
      .eq('business_id', biz.id)
      .gt('points_balance', 0)
      .lt('last_visit_at', expiryCutoff);

    for (const c of expCusts ?? []) {
      const balance = Number(c.points_balance ?? 0);
      if (balance <= 0) continue;
      await supabaseAdmin.from('pos_customers').update({ points_balance: 0 }).eq('id', c.id);
      try {
        await supabaseAdmin.from('pos_loyalty_transactions').insert({
          business_id: biz.id, customer_id: c.id, type: 'expired',
          points_delta: -balance, reward_redeemed: 'Points expired (inactivity)',
        });
      } catch (e) { console.error('[non-fatal]', e) }
      expired++;
    }
  }

  // Drift is surfaced in the RESPONSE as well as the log — a warn line nobody greps is not
  // visibility, and the cron response is what the ops surface actually reads.
  return NextResponse.json({
    ok: true, businesses_processed: (businesses ?? []).length, warned, expired,
    ledger_drift: drifted.map(describeDrift),
  });
}

export const GET = withErrorCapture('cron/loyalty-expiry', _GET);

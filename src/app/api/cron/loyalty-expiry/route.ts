export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { computeLoyaltyDrift, findDrift, describeDrift, computeIdentitySplits, describeSplit } from '@/lib/loyalty/reconcile';

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

  // ARIA-LOYALTY-CLOSEOUT-1 §2 — same host, same daily cadence, same output channel as the drift
  // check above, for the same reason: this cron already runs daily and already touches every
  // loyalty balance, so it is where a loyalty invariant belongs. No new cron entry, no new Vercel
  // function (RULE 4: 22-config ceiling, 22 crons already).
  //
  // Unlike drift, this one SHOULD always be empty — pos_customers_identity_uniq enforces it in the
  // database. A non-empty result means the index is gone or was bypassed, which is why the report
  // distinguishes "checked and clean" from "could not check".
  const splitReport = await computeIdentitySplits(supabaseAdmin);
  for (const s of splitReport.splits) console.error('[loyalty-identity-split] ' + describeSplit(s));
  if (!splitReport.checked) console.error('[loyalty-identity-split] CHECK DID NOT RUN: ' + (splitReport.error ?? 'unknown'));
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
    // checked:false is reported as loudly as a real split — "the guard's alarm did not run" is
    // itself the finding, and an omitted field would read as all-clear.
    identity_splits: splitReport.checked ? splitReport.splits.map(describeSplit) : null,
    identity_split_check: splitReport.checked ? 'ok' : ('failed: ' + (splitReport.error ?? 'unknown')),
  });
}

export const GET = withErrorCapture('cron/loyalty-expiry', _GET);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET() {
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
      } catch { /* non-fatal */ }
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
      } catch { /* non-fatal */ }
      expired++;
    }
  }

  return NextResponse.json({ ok: true, businesses_processed: (businesses ?? []).length, warned, expired });
}

export const GET = withErrorCapture('cron/loyalty-expiry', _GET);

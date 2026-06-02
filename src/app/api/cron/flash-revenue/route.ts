export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { FlashRevenueAgent } from '@/lib/agents/flash-revenue-agent';

// 15-minute cron: run FlashRevenueAgent for all active businesses.
// NOTE: not added to vercel.json (already at function limit + daily-max cron rule).
// Trigger via external scheduler (e.g. GitHub Actions, cron-job.org) with:
//   GET /api/cron/flash-revenue
//   Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: businesses, error } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .in('subscription_status', ['active', 'trialing'])
    .eq('is_active', true);

  if (error) {
    console.error('[flash-revenue cron]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agent = new FlashRevenueAgent();
  const results: Array<{ business_id: string; ok: boolean; decisions: number; error?: string }> = [];

  for (const biz of (businesses ?? [])) {
    try {
      const result = await Promise.race([
        agent.run(biz.id),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 45000)),
      ]);
      results.push({ business_id: biz.id, ok: true, decisions: result.decisions.length });
    } catch (err) {
      results.push({ business_id: biz.id, ok: false, decisions: 0, error: String(err) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('[flash-revenue cron] done:', succeeded, 'ok,', failed, 'failed');

  return NextResponse.json({ ok: true, ran: results.length, succeeded, failed, results });
}

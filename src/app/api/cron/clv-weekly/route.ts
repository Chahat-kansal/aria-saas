export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CLVAgent } from '@/lib/agents/clv-agent';

// Weekly CLV scoring run for all active businesses.
// Schedule externally: Sunday 7am AEST "0 19 * * 0" UTC
// Not added to vercel.json (already at function/cron limit).
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses, error } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .in('subscription_status', ['active', 'trialing'])
    .eq('is_active', true);

  if (error) {
    console.error('[clv-weekly cron]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agent = new CLVAgent();
  const results: Array<{ business_id: string; ok: boolean; decisions: number; error?: string }> = [];

  for (const biz of (businesses ?? [])) {
    try {
      const result = await Promise.race([
        agent.run(biz.id),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 55000)),
      ]);
      results.push({ business_id: biz.id, ok: true, decisions: result.decisions.length });
    } catch (err) {
      results.push({ business_id: biz.id, ok: false, decisions: 0, error: String(err) });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('[clv-weekly cron] done:', succeeded, 'ok,', failed, 'failed');

  return NextResponse.json({ ok: true, ran: results.length, succeeded, failed, results });
}

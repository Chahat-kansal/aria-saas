export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { MenuEngineeringAgent } from '@/lib/agents/menu-engineering-agent';

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses, error } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .in('subscription_status', ['active', 'trialing'])
    .eq('is_active', true);

  if (error) {
    console.error('[menu-engineering cron]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ business_id: string; ok: boolean; decisions: number; error?: string }> = [];
  const agent = new MenuEngineeringAgent();

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
  console.log('[menu-engineering cron] done:', succeeded, 'ok,', failed, 'failed');

  return NextResponse.json({ ok: true, ran: results.length, succeeded, failed, results });
}

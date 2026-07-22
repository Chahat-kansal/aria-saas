export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { MenuEngineeringAgent } from '@/lib/agents/menu-engineering-agent';
import { computeVelocity, persistVelocity } from '@/lib/inventory/velocity';
import { computeMovementVelocity, persistMovementVelocity } from '@/lib/inventory/movement-velocity';
import { computePar } from '@/lib/inventory/par-levels';

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
    // INV-VELOCITY-1 — refresh honest velocity + ABC into product_performance_scores (independent of the
    // agent; idempotent on the day-bucketed scored_at). Daily, reusing this cron — no new cron entry.
    try {
      const v = await computeVelocity(supabaseAdmin, biz.id);
      await persistVelocity(supabaseAdmin, biz.id, v);
      // INV-PAR-1 — re-derive par levels from the fresh velocity (seeds reorder_settings if missing).
      await computePar(supabaseAdmin, biz.id);
    } catch (err) { console.error('[menu-engineering cron] velocity/par failed', biz.id, String(err)); }
    // INV-VELOCITY-1 — per-outlet rolling-window velocity from stock_movements (movement_type='sale'
    // only). Separate table/writer from the whole-window ABC model above — different concept, same
    // daily cadence, no new cron entry.
    try {
      const mv = await computeMovementVelocity(supabaseAdmin, biz.id);
      await persistMovementVelocity(supabaseAdmin, biz.id, mv);
    } catch (err) { console.error('[menu-engineering cron] movement velocity failed', biz.id, String(err)); }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log('[menu-engineering cron] done:', succeeded, 'ok,', failed, 'failed');

  return NextResponse.json({ ok: true, ran: results.length, succeeded, failed, results });
}

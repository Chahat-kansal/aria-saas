export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// All crons run on AEST schedule (UTC+10).
// Businesses are assumed to be in Australia.
// Phase 2: add timezone per business from businesses table.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAgent } from '@/lib/agents/orchestrator';
import { generateInsight } from '@/lib/aria-insights';
import type { AgentType } from '@/lib/agents/types';

type Params = { params: Promise<{ task: string }> };

const TASK_TO_AGENT: Record<string, AgentType | null> = {
  'reorder-daily': 'reorder',
  'pricing-daily': 'pricing',
  'schedule-weekly': 'schedule',
  'briefing-daily': null,
  'promo-cleanup': null,
};

export async function GET(req: Request, { params }: Params) {
  const { task } = await params;

  const cronSecret = req.headers.get('x-cron-secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(task in TASK_TO_AGENT)) {
    return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 });
  }

  const agentType = TASK_TO_AGENT[task];
  const supabase = createServerSupabaseClient();

  if (task === 'promo-cleanup') {
    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from('pos_promotions')
      .update({ active: false })
      .eq('active', true)
      .lt('ends_at', now)
      .select('id');
    const deactivated = expired?.length ?? 0;
    if (error) console.error('[promo-cleanup] update error:', error.message);
    return NextResponse.json({ task, deactivated });
  }

  if (task === 'briefing-daily') {
    const { data: bizList } = await supabase.from('businesses').select('id').eq('is_active', true).limit(1000);
    const businesses = bizList ?? [];
    let processed = 0;
    let errors = 0;

    for (const business of businesses) {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const from = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
        const to = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();

        const { data: sales } = await supabase
          .from('pos_sales')
          .select('total_amount, served_by, outlet_id')
          .eq('business_id', business.id)
          .neq('status', 'voided')
          .gte('created_at', from)
          .lte('created_at', to);

        const revenue = (sales ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);

        const { bullets } = await generateInsight({
          business_id: business.id,
          context: `daily_briefing date=${from.split('T')[0]} revenue=$${revenue.toFixed(0)} transactions=${sales?.length ?? 0}`,
          data: { revenue, transactions: sales?.length ?? 0 },
          maxBullets: 3,
          realtime: true,
        });

        await supabase.from('aria_briefings_cache').upsert({
          business_id: business.id,
          briefing_date: from.split('T')[0],
          bullets,
        }, { onConflict: 'business_id,briefing_date' });

        processed++;
      } catch (err) {
        console.error('[briefing-daily] failed for', business.id, err);
        errors++;
      }
    }

    return NextResponse.json({ task, processed, errors });
  }

  if (!agentType) {
    return NextResponse.json({ task, skipped: true });
  }

  const { data: settings } = await supabase.from('agent_settings')
    .select('business_id')
    .eq('agent_type', agentType)
    .eq('enabled', true);

  let businessIds: string[];
  if (settings?.length) {
    businessIds = settings.map(s => s.business_id);
  } else {
    const { data: bizList } = await supabase.from('businesses').select('id').eq('is_active', true).limit(1000);
    businessIds = (bizList ?? []).map(b => b.id);
  }

  let processed = 0;
  let errors = 0;
  const results: Array<{ business_id: string; decisions: number; errors: number; timed_out?: boolean }> = [];

  for (const bid of businessIds) {
    const runStart = new Date().toISOString();
    try {
      const result = await Promise.race([
        runAgent(agentType, bid),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout after 55s')), 55_000)
        ),
      ]);
      results.push({ business_id: bid, decisions: result.decisions.length, errors: result.errors.length });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = msg.includes('timeout');
      console.error(`[cron/${task}] ${isTimeout ? 'timed out' : 'failed'} for ${bid}:`, msg);
      await supabase.from('agent_runs').insert({
        business_id: bid,
        agent_type: agentType,
        started_at: runStart,
        completed_at: new Date().toISOString(),
        decisions_count: 0,
        errors: [{ message: msg }],
        triggered_by: 'cron',
      }).then(() => null);
      results.push({ business_id: bid, decisions: 0, errors: 1, timed_out: isTimeout });
      errors++;
    }
  }

  return NextResponse.json({ task, agent_type: agentType, processed, errors, results });
}

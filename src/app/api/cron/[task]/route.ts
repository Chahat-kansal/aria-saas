export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAgent } from '@/lib/agents/orchestrator';
import type { AgentType } from '@/lib/agents/types';

type Params = { params: Promise<{ task: string }> };

const TASK_TO_AGENT: Record<string, AgentType | null> = {
  'reorder-daily': 'reorder',
  'pricing-daily': 'pricing',
  'schedule-weekly': 'schedule',
  'briefing-daily': null, // handled separately
};

export async function GET(req: Request, { params }: Params) {
  const { task } = await params;

  // Verify cron secret
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(task in TASK_TO_AGENT)) {
    return NextResponse.json({ error: `Unknown task: ${task}` }, { status: 400 });
  }

  const agentType = TASK_TO_AGENT[task];
  const supabase = createServerSupabaseClient();

  // Fetch all businesses with this agent enabled
  let businessIds: string[] = [];

  if (agentType) {
    const { data: settings } = await supabase.from('agent_settings')
      .select('business_id')
      .eq('agent_type', agentType)
      .eq('enabled', true);

    if (settings?.length) {
      businessIds = settings.map(s => s.business_id);
    } else {
      // If no settings, run for all active businesses (default enabled)
      const { data: bizList } = await supabase.from('businesses').select('id').eq('is_active', true).limit(1000);
      businessIds = (bizList ?? []).map(b => b.id);
    }
  }

  if (task === 'briefing-daily') {
    // Trigger briefing cache refresh for all businesses
    const { data: bizList } = await supabase.from('businesses').select('id').eq('is_active', true).limit(1000);
    const ids = (bizList ?? []).map(b => b.id);
    for (const bid of ids) {
      await supabase.from('aria_briefings_cache').delete()
        .eq('business_id', bid)
        .eq('briefing_date', new Date().toISOString().split('T')[0]); // clear cache so next request generates fresh
    }
    return NextResponse.json({ task, cleared_briefings: ids.length });
  }

  if (!agentType) {
    return NextResponse.json({ task, skipped: true });
  }

  // Run agent for each business
  let totalDecisions = 0;
  const results: Array<{ business_id: string; decisions: number; errors: number }> = [];

  for (const bid of businessIds) {
    try {
      const result = await runAgent(agentType, bid);
      totalDecisions += result.decisions.length;
      results.push({ business_id: bid, decisions: result.decisions.length, errors: result.errors.length });
    } catch (e) {
      console.error(`[cron/${task}] failed for ${bid}:`, e);
      results.push({ business_id: bid, decisions: 0, errors: 1 });
    }
  }

  return NextResponse.json({ task, agent_type: agentType, businesses: results.length, total_decisions: totalDecisions, results });
}

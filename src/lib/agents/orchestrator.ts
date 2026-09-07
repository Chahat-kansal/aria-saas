import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType, AgentRunResult } from './types';
import { ReorderAgent } from './reorder-agent';
import { PricingAgent } from './pricing-agent';
import { ScheduleAgent } from './schedule-agent';

function makeAgent(type: AgentType, supabase: SupabaseClient) {
  switch (type) {
    case 'reorder': return new ReorderAgent(supabase);
    case 'pricing': return new PricingAgent(supabase);
    case 'schedule': return new ScheduleAgent(supabase);
    default: return null;
  }
}

/**
 * M13D phase 2 — `supabase` is REQUIRED and threaded through, because this function is called from
 * BOTH sides of the split: `cron/[task]` (service role) and `pos/agents/[type]` (a signed-in
 * owner's session client). It is the one place that genuinely cannot choose, so it does not.
 */
export async function runAgent(type: AgentType, business_id: string, supabase: SupabaseClient): Promise<AgentRunResult> {
  const agent = makeAgent(type, supabase);
  if (!agent) return { decisions: [], errors: [new Error('Agent not implemented: ' + type)], duration_ms: 0 };
  return agent.run(business_id);
}

export interface IntentResult {
  agent: AgentType | null;
  confidence: number;
  reason: string;
}

export function routeIntent(message: string, _business_id: string): IntentResult {
  const lower = message.toLowerCase();

  if (/reorder|stock|order|supplier/.test(lower)) {
    return { agent: 'reorder', confidence: 0.75, reason: 'inventory/reorder keywords detected' };
  }
  if (/price|pricing|competitor|margin|cheaper/.test(lower)) {
    return { agent: 'pricing', confidence: 0.75, reason: 'pricing keywords detected' };
  }
  if (/staff|roster|schedule|shift/.test(lower)) {
    return { agent: 'schedule', confidence: 0.75, reason: 'scheduling keywords detected' };
  }
  return { agent: null, confidence: 0, reason: 'no matching keywords' };
}

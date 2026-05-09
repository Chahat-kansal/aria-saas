import type { AgentType, AgentRunResult } from './types';
import { ReorderAgent } from './reorder-agent';
import { PricingAgent } from './pricing-agent';
import { ScheduleAgent } from './schedule-agent';

function makeAgent(type: AgentType) {
  switch (type) {
    case 'reorder': return new ReorderAgent();
    case 'pricing': return new PricingAgent();
    case 'schedule': return new ScheduleAgent();
  }
}

export async function runAgent(type: AgentType, business_id: string): Promise<AgentRunResult> {
  const agent = makeAgent(type);
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

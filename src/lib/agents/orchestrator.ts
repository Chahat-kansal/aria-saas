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

// Simple intent routing — used by Conversation Reports
const INTENT_MAP: Record<string, AgentType> = {
  reorder: 'reorder', 'purchase order': 'reorder', stock: 'reorder', 'run out': 'reorder',
  pric: 'pricing', cheaper: 'pricing', competitor: 'pricing', margin: 'pricing',
  roster: 'schedule', staff: 'schedule', schedule: 'schedule', shift: 'schedule',
};

export function routeIntent(message: string): AgentType | null {
  const lower = message.toLowerCase();
  for (const [keyword, type] of Object.entries(INTENT_MAP)) {
    if (lower.includes(keyword)) return type;
  }
  return null;
}

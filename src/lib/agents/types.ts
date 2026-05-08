export type AgentType = 'reorder' | 'pricing' | 'schedule';
export type AgentDecisionInput = Omit<AgentDecision, 'id' | 'created_at' | 'status'> & { status?: AgentDecision['status'] };

export interface AgentDecision {
  id: string;
  agent_type: AgentType;
  business_id: string;
  decision_data: Record<string, unknown>;
  reasoning: string;
  confidence_score: number; // 0-1
  projected_impact_cents: number;
  status: 'pending' | 'approved' | 'rejected' | 'snoozed' | 'auto_executed' | 'expired';
  expires_at: string | null;
  created_at: string;
  reviewed_at?: string | null;
  executed_at?: string | null;
}

export interface AgentRunResult {
  decisions: AgentDecision[];
  errors: Error[];
  duration_ms: number;
}

export interface AgentSettings {
  enabled: boolean;
  auto_approve_below_cents: number;
  config: Record<string, unknown>;
}

export type AgentType =
  | 'reorder'
  | 'pricing'
  | 'schedule'
  | 'menu_engineering'
  | 'flash_revenue'
  | 'clv'
  | 'labour_optimisation'
  | 'waste_elimination'
  | 'supplier_negotiation'
  | 'bas_compliance'
  | 'reputation_defence'
  | 'reconciliation'
  | 'customer_acquisition'
  | 'inventory_financing'
  | 'council'

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

export interface AgentCouncilSession {
  id: string;
  business_id: string;
  session_date: string;
  status: 'running' | 'complete' | 'failed';
  proposals_count: number;
  conflicts_detected: number;
  plan: Record<string, unknown> | null;
  plan_narrative: string | null;
  projected_revenue_impact: number;
  projected_cost_saving: number;
  owner_priority: 'growth' | 'margin' | 'retention' | 'balanced';
  executed_actions: number;
  actual_revenue_impact: number | null;
  completed_at: string | null;
  created_at: string;
}

export interface AgentCouncilProposal {
  id: string;
  session_id: string;
  business_id: string;
  agent_type: string;
  proposal_type: string;
  proposal_data: Record<string, unknown>;
  projected_impact_dollars: number;
  confidence: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  conflicts_with: string[] | null;
  synergises_with: string[] | null;
  council_decision: 'approved' | 'rejected' | 'modified' | 'deferred' | null;
  council_reasoning: string | null;
  modified_proposal_data: Record<string, unknown> | null;
  executed_at: string | null;
  outcome_data: Record<string, unknown> | null;
  created_at: string;
}

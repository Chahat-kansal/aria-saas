# Prompt 222 — Multi-Agent Revenue Council
# Build this FIRST. Every other agent submits proposals through this orchestration layer.
# NO NEW ENV VARS needed. Uses existing ANTHROPIC_API_KEY + Supabase.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE — DO NOT RECREATE
- src/lib/agents/base-agent.ts — BaseAgent class (auth, getSettings, saveDecisions, logRun)
- src/lib/agents/types.ts — AgentType, AgentDecision, AgentRunResult, AgentSettings
- src/lib/agents/orchestrator.ts — runAgent(), routeIntent()
- src/lib/agents/reorder-agent.ts (244 lines), pricing-agent.ts (166 lines), schedule-agent.ts — already built
- DB: agent_settings (business_id, agent_type, enabled, auto_approve_below_cents, config, updated_at)
- DB: agent_decisions (id, business_id, agent_type, decision_data, reasoning, status, confidence_score, projected_impact_cents, reviewed_by, reviewed_at, executed_at, outcome, created_at, expires_at)
- DB: agent_runs (id, business_id, agent_type, triggered_by, decisions[], errors[], duration_ms, created_at)
- Extend AgentType union in types.ts to add new types
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. haiku for fast calls, sonnet for complex multi-step reasoning.
State "Build verified green, all commits pushed." when done.

## WHAT THIS IS
A daily council where all active agents submit proposed actions, Claude Sonnet evaluates
conflicts and synergies, and produces a single coordinated "Today's Aria Plan."
This prevents agents from working against each other (e.g. pricing agent raises prices
while flash revenue agent runs a discount on the same product).
The council is the difference between isolated automation and coordinated AI intelligence.

## TASK 1 — DB migrations
Commit: "feat(council): DB migrations — council_sessions + council_proposals"

```sql
-- One council session per business per day
CREATE TABLE IF NOT EXISTS agent_council_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  proposals_count integer DEFAULT 0,
  conflicts_detected integer DEFAULT 0,
  plan jsonb, -- full structured plan from sonnet
  plan_narrative text, -- 2-3 sentence plain English "Today Aria will..."
  projected_revenue_impact numeric DEFAULT 0,
  projected_cost_saving numeric DEFAULT 0,
  owner_priority text DEFAULT 'balanced' CHECK (owner_priority IN ('growth','margin','retention','balanced')),
  executed_actions integer DEFAULT 0,
  actual_revenue_impact numeric, -- filled in retrospectively
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, session_date)
);
ALTER TABLE agent_council_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_council_sessions" ON agent_council_sessions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON agent_council_sessions (business_id, session_date DESC);

-- Individual proposals submitted by each agent
CREATE TABLE IF NOT EXISTS agent_council_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES agent_council_sessions(id) ON DELETE CASCADE NOT NULL,
  business_id uuid NOT NULL,
  agent_type text NOT NULL, -- which agent submitted this
  proposal_type text NOT NULL CHECK (proposal_type IN (
    'price_change','send_campaign','create_reorder','run_promotion',
    'adjust_roster','send_offer','markdown_product','hide_product',
    'create_bundle','send_review_request','update_menu_position','labour_pct_alert'
  )),
  proposal_data jsonb NOT NULL, -- full structured proposal details
  projected_impact_dollars numeric DEFAULT 0, -- expected $ impact
  confidence numeric DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  urgency text DEFAULT 'normal' CHECK (urgency IN ('critical','high','normal','low')),
  conflicts_with text[], -- agent_types this conflicts with
  synergises_with text[], -- agent_types this enhances
  council_decision text CHECK (council_decision IN ('approved','rejected','modified','deferred')),
  council_reasoning text, -- why the council made this decision
  modified_proposal_data jsonb, -- if council modified the proposal
  executed_at timestamptz,
  outcome_data jsonb, -- what actually happened
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agent_council_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_council_proposals" ON agent_council_proposals
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON agent_council_proposals (session_id, agent_type);
CREATE INDEX ON agent_council_proposals (business_id, council_decision, created_at DESC);

-- Add council config columns to agent_settings
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS council_priority text DEFAULT 'balanced'
  CHECK (council_priority IN ('growth','margin','retention','balanced'));
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS mode text DEFAULT 'suggest'
  CHECK (mode IN ('suggest','auto'));
```

## TASK 2 — Council orchestrator: src/lib/agents/council.ts
Commit: "feat(council): council.ts — runs all agents, detects conflicts, produces daily plan via sonnet"

```typescript
// Full implementation spec:

export interface CouncilSession {
  session: AgentCouncilSession
  proposals: AgentCouncilProposal[]
  plan_narrative: string
  projected_revenue_impact: number
  projected_cost_saving: number
}

export async function runCouncilSession(business_id: string): Promise<CouncilSession>

// STEP 1: GET OR CREATE TODAY'S SESSION
// Upsert agent_council_sessions for (business_id, today) with status='running'
// If already 'complete': return existing session (idempotent)

// STEP 2: GET OWNER PRIORITY
// SELECT config FROM agent_settings WHERE business_id=X AND agent_type='council'
// priority = config.priority ?? 'balanced'
// mode = config.mode ?? 'suggest'

// STEP 3: RUN ALL ENABLED AGENTS IN PARALLEL
// Use Promise.allSettled — never let one agent failure block others
const agentTypes: AgentType[] = ['reorder', 'pricing', 'schedule',
  'menu_engineering', 'flash_revenue', 'clv', 'labour_optimisation',
  'waste_elimination', 'supplier_negotiation', 'bas_compliance',
  'reputation_defence', 'reconciliation', 'customer_acquisition', 'inventory_financing']
//
// For each type: check agent_settings.enabled before running
// Dynamically import agent class (handle ImportError gracefully — not all agents built yet)
// Collect all AgentDecision[] from successful runs
// Log: which agents ran, which failed, total decisions collected

// STEP 4: CONVERT DECISIONS TO COUNCIL PROPOSALS
// Map each AgentDecision to an AgentCouncilProposal:
//   agent_type from decision.agent_type
//   proposal_type: map from decision.decision_data.action_type
//   proposal_data: full decision_data
//   projected_impact_dollars: decision.projected_impact_cents / 100
//   confidence: decision.confidence_score
//   urgency: if projected_impact > 500 → 'high', > 1000 → 'critical', else 'normal'
// Bulk insert to agent_council_proposals

// STEP 5: CONFLICT DETECTION
// Run these conflict rules against all proposals in the session:
//
// RULE 1: pricing_raise + discount_on_same_product
//   If proposal A is price_change with new_price > current_price for product X
//   AND proposal B is run_promotion or markdown_product on same product X
//   → Mark A.conflicts_with = ['flash_revenue'] and B.conflicts_with = ['pricing']
//
// RULE 2: large_reorder + low_cash_runway
//   If proposal A is create_reorder with total_cost > $1,000
//   AND cash_position < total_cost * 2 (from cash_flow_forecasts if available)
//   → Mark A with urgency='critical', add 'inventory_financing' to synergises_with
//
// RULE 3: menu_deprioritise + waste_promote on same product
//   If proposal A is hide_product or update_menu_position (lower position) for product X
//   AND proposal B from waste_elimination is promoting product X
//   → Conflict: waste agent wants to sell it, menu agent wants to hide it
//
// RULE 4: send_campaign + loyalty_offer on same customer segment
//   If both CLV agent and Flash Revenue agent target 'lapsed_customers' in same session
//   → Synergy: merge into one coordinated outreach (note in synergises_with)
//
// RULE 5: labour_pct_alert + add_staff (from schedule agent)
//   If labour agent says labour % is too high AND schedule agent wants to add a shift
//   → Conflict: can't add staff when already over labour budget
//
// Update conflicts_with and synergises_with on affected proposals in DB

// STEP 6: CALL CLAUDE SONNET FOR PLAN GENERATION
// Build context JSON (keep under 4000 tokens):
const councilContext = {
  business_id,
  session_date: today,
  owner_priority: priority,
  // Business snapshot
  today_revenue_so_far: number, // from pos_sales today
  yesterday_revenue: number,
  current_cash_estimate: number, // from cash_flow_forecasts if available
  // All proposals grouped by agent
  proposals: groupedProposals, // { agent_type: proposal[] }
  conflicts: detectedConflicts, // array of conflict descriptions
  agent_performance: {}, // from last 30 days: which agents produced actionable outcomes
}
//
// System prompt:
// "You are the Aria Revenue Council chair for an Australian small business.
//  Your role is to evaluate all agent proposals for today and produce a single coordinated
//  action plan that maximises {owner_priority} without agents working against each other.
//  Be specific. Reference actual $ amounts and product names from the proposals.
//  Resolve conflicts by choosing the higher-impact option that aligns with the owner's priority."
//
// User: JSON.stringify(councilContext)
//
// Response format (JSON only, no markdown):
// {
//   "decisions": [{
//     "proposal_id": string,
//     "decision": "approved"|"rejected"|"modified"|"deferred",
//     "reasoning": string, // 1 sentence specific to this proposal
//     "modified_data"?: object // if modifying the proposal
//   }],
//   "plan_narrative": string, // 2-3 sentences: "Today Aria will..."
//   "projected_revenue_impact": number,
//   "projected_cost_saving": number,
//   "priority_focus": string, // what today's plan optimises for
//   "conflicts_resolved": string[] // how each conflict was resolved
// }
//
// Model: claude-sonnet-4-5-20250929
// max_tokens: 2000
// Log to aria_ai_calls

// STEP 7: UPDATE PROPOSALS WITH COUNCIL DECISIONS
// Bulk PATCH agent_council_proposals with council_decision + council_reasoning + modified_proposal_data

// STEP 8: UPDATE SESSION
// PATCH agent_council_sessions:
//   plan = full sonnet response
//   plan_narrative = plan.plan_narrative
//   projected_revenue_impact = plan.projected_revenue_impact
//   projected_cost_saving = plan.projected_cost_saving
//   proposals_count = total proposals
//   conflicts_detected = conflicts.length
//   status = 'complete'
//   completed_at = now()

// STEP 9: EXECUTE APPROVED PROPOSALS (if mode='auto')
// For each proposal with council_decision='approved' (or 'modified'):
//   Call executeProposal(proposal) from council-executor.ts
//   Update proposal.executed_at + outcome_data
//   Increment session.executed_actions

// STEP 10: LOG
// Log to agent_runs for each agent that contributed proposals
```

## TASK 3 — Council executor: src/lib/agents/council-executor.ts
Commit: "feat(council): council-executor.ts — routes proposal_type to real API actions"

```typescript
export async function executeProposal(
  proposal: AgentCouncilProposal,
  supabase: SupabaseClient
): Promise<{ success: boolean; outcome: object; error?: string }>

// Route by proposal_type:
//
// 'price_change':
//   PATCH pos_products SET price = proposal_data.new_price WHERE id = proposal_data.product_id
//   Log: { old_price, new_price, product_name }
//
// 'send_campaign':
//   POST /api/aria/winback with { customer_ids: proposal_data.customer_ids, message: proposal_data.message }
//   Or direct Twilio call if winback API not available
//
// 'create_reorder':
//   POST /api/pos/purchase-orders with {
//     supplier_id: proposal_data.supplier_id,
//     items: proposal_data.items, // [{product_id, quantity, unit_cost}]
//     notes: 'Auto-created by Aria Reorder Agent'
//   }
//
// 'run_promotion':
//   INSERT pos_promotions { name, discount_percent, product_ids, valid_from: now(), valid_until: proposal_data.expires_at }
//
// 'adjust_roster' / 'send_offer':
//   Twilio SMS to proposal_data.staff_phone with proposal_data.message
//   Insert labour_optimisation_actions row
//
// 'markdown_product':
//   INSERT pos_promotions { discount_percent: proposal_data.discount_pct, product_ids: [proposal_data.product_id], valid_until: proposal_data.expires_at }
//
// 'hide_product':
//   PATCH pos_products SET agent_hidden = true WHERE id = proposal_data.product_id
//
// 'send_review_request':
//   Twilio SMS to proposal_data.customer_phone with proposal_data.message
//   Insert review_requests row
//
// All executions:
//   Log to aria_autopilot_actions { action_type: proposal.proposal_type, business_id, agent_type: proposal.agent_type, proposal_id: proposal.id }
//   Return { success: true, outcome: { what_was_done } }
//   On error: { success: false, error: message } — NEVER throw, always return
```

## TASK 4 — Daily cron
Commit: "feat(council): daily 6am AEST council cron"

Create: src/app/api/cron/council-session/route.ts
Schedule: "0 20 * * *" in vercel.json (8pm UTC = 6am AEST)
Check vercel.json cron count stays ≤ 22 before adding.

```typescript
// Route handler:
// 1. Auth check: verify CRON_SECRET header if set
// 2. Fetch all active businesses (subscription status IN ('active','trialing'))
// 3. For each business:
//    const result = await runCouncilSession(business.id)
//    if result.plan_narrative:
//      Send push notification if push tokens available: "☀️ Aria's plan for today is ready"
// 4. Return: { processed: count, sessions_created: count, errors: [] }
// Timeout each business to 30s max via Promise.race
```

## TASK 5 — API routes
Commit: "feat(council): 4 API routes — get plan, approve/reject, settings, history"

### GET /api/agents/council
Auth required. Gets today's session for the business.
Response: {
  session: AgentCouncilSession | null,
  proposals: AgentCouncilProposal[],  // sorted: critical first, then by projected_impact
  pending_count: number,              // proposals not yet decided by owner
  auto_executed_count: number,        // proposals already executed in auto mode
  has_conflicts: boolean
}

### PATCH /api/agents/council/proposals/[id]
Auth required. Owner approves or rejects a proposal.
Body: { decision: 'approved'|'rejected', note?: string }
On 'approved':
  1. Update proposal.council_decision = 'approved'
  2. Call executeProposal(proposal) from council-executor
  3. Update proposal.executed_at = now(), outcome_data = result
  4. Increment session.executed_actions
On 'rejected':
  1. Update proposal.council_decision = 'rejected', council_reasoning = note
Response: { proposal, executed: boolean, outcome?: object }

### PATCH /api/agents/council/settings
Auth required. Update owner priority and default mode.
Body: { owner_priority?: string, mode?: string, agent_type?: string }
Upserts agent_settings row WHERE agent_type='council'

### GET /api/agents/council/history
Auth required. Last 30 council sessions with proposal counts and outcomes.
Params: ?limit=30
Response: { sessions: AgentCouncilSession[], total_revenue_attributed, total_cost_saved }

## TASK 6 — Dashboard page: src/app/dashboard/agents/page.tsx
Commit: "feat(council): agents dashboard — Today's Plan, All Agents, History, Performance"

Read ui-ux-pro-max SKILL.md before writing a single line. This is the most important
dashboard page in Aria — it's what owners interact with every morning.

### Today's Plan tab
Header: plan_narrative displayed in large Fraunces italic text
Status: "Aria ran at 6am · {proposals_count} proposals · {conflicts_detected} conflicts resolved"

Projected impact cards (row of 3):
  "Expected revenue lift" / "Expected cost saving" / "Actions taken"
  Numbers in Fraunces italic, large

Priority selector (inline toggle, not a dropdown):
  [ Growth ] [ Margin ] [ Retention ] [ Balanced ]
  Active state uses #2D5240 bg. Clicking auto-saves via PATCH /api/agents/council/settings

Mode banner (only shown if mode='suggest'):
  "Suggest mode — Aria queues actions for your approval. Switch to Auto for hands-free operation."
  Toggle to switch modes — show confirmation modal before enabling auto mode

Proposal cards (sorted: critical urgency first, then by projected_impact_dollars DESC):
  Agent badge: colour-coded pill (reorder=blue, pricing=amber, menu_engineering=#2D5240,
    flash_revenue=orange, clv=purple, labour_optimisation=teal, waste_elimination=sage,
    supplier_negotiation=red, bas_compliance=indigo, reputation_defence=pink,
    reconciliation=slate, customer_acquisition=emerald, inventory_financing=yellow)
  
  Card content:
    Title: proposal_data.title or auto-generated from proposal_type + key details
    Body: 1-2 sentences of proposal_data.description
    Impact: "+$X today" or "Save X hours" or "Save $X"
    Confidence bar: coloured progress bar 0-100%
    Urgency badge: 🔴 Critical / 🟠 High / 🟡 Normal / ⚪ Low
    
    If conflicts_with is not empty:
      Show conflict warning: "⚠ Conflicts with {agent_type} agent — council chose this because {reasoning}"
    
    If mode='suggest' AND council_decision='approved':
      Two buttons: "✓ Execute" and "✗ Skip"
      Loading state on Execute (show spinner, disable both buttons)
      On success: card turns green, shows "✓ Executed {time}"
      On failure: shows inline error
    
    If mode='auto' AND executed_at:
      Show "⚡ Auto-executed at {time}" with outcome summary
    
    If council_decision='rejected':
      Show greyed-out card with "Council skipped — {reasoning}"

### All Agents tab
Grid of agent cards (2 columns on desktop, 1 on mobile):
Each card:
  Header: agent icon + name + enabled toggle (PATCH agent_settings immediately on change)
  Status: "Last run: X min ago" + "Today: {decisions_count} decisions"
  Mode: suggest/auto toggle (per-agent override of global mode)
  Config button → opens a config modal:
    reorder: reorder_threshold_days, safety_stock_factor, target_cover_days
    pricing: min_margin_pct, max_price_change_pct, competitor_weight
    menu_engineering: peak_hours, scoring_weights
    flash_revenue: min_revenue_gap_pct, cooldown_minutes, enabled_triggers (checkboxes)
    clv: intervention_delay_days, min_basket_for_request, offer_types_enabled
    labour_optimisation: target_labour_pct, minimum_staff, target_revenue_per_staff_hour
    waste_elimination: enabled_products (multiselect), notification_phone
    All others: generic enable/disable + notes field
  "Run now" button → POST /api/agents/run { agent_type, business_id }
    Shows loading → "Running..." → "Done: {decisions_count} decisions"

### History tab
Timeline list (last 30 days):
  Each row: date pill | plan_narrative (truncated) | "{N} proposals · {executed} executed" | revenue chip
  Click → expands inline to show all proposals for that session with their outcomes
  
  Summary banner at top:
    "Last 30 days: Aria made {total_decisions} decisions · Attributed revenue: ${total} · Cost savings: ${total}"

### Performance tab
4 metric cards: Total actions / Revenue attributed / Cost saved / Avg accuracy
Agent ROI table:
  Columns: Agent | Actions 30d | Revenue impact | Accuracy | Best action type
  Sort by Revenue impact DESC
  Accuracy = projected_impact vs actual_impact for completed outcomes

## COMPLETION CHECKLIST
- [ ] 2 tables with RLS + indexes
- [ ] council.ts with all 10 steps including conflict detection (5 rules)
- [ ] council-executor.ts routing all 12 proposal types to real API actions
- [ ] Cron at 0 20 * * * (6am AEST) within vercel.json ≤22 limit
- [ ] All 4 API routes working with auth
- [ ] Dashboard: Today's Plan tab with approve/reject + loading states
- [ ] Dashboard: All Agents tab with enable/config/run-now per agent
- [ ] Dashboard: History tab with expandable sessions
- [ ] Dashboard: Performance tab with ROI table
- [ ] Auto mode executes without owner input
- [ ] Suggest mode queues and shows approve/reject buttons
- [ ] Sidebar: 'agents' → /dashboard/agents in Intelligence section, all industries
- [ ] buildAskAriaContext: adds today's plan_narrative
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

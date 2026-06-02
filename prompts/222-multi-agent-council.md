# Prompt 222 — Multi-Agent Revenue Council
# Build this FIRST. Every other agent submits proposals through this orchestration layer.
# NO NEW ENV VARS needed.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE — DO NOT RECREATE
- src/lib/agents/base-agent.ts — BaseAgent class
- src/lib/agents/types.ts — AgentType, AgentDecision, AgentRunResult
- src/lib/agents/orchestrator.ts — runAgent(), routeIntent()
- src/lib/agents/reorder-agent.ts, pricing-agent.ts, schedule-agent.ts — already built
- DB: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- Extend AgentType union in types.ts for each new agent type
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## WHAT THIS IS
A daily council where all active agents submit proposed actions, Claude Sonnet evaluates
conflicts and synergies, and produces a single coordinated "Today's Aria Plan."
Owner sees one coherent plan instead of isolated agent suggestions.

## TASK 1 — DB migrations
Commit: "feat(council): DB migrations — council sessions + proposals"

```sql
CREATE TABLE IF NOT EXISTS agent_council_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  proposals_count integer DEFAULT 0,
  conflicts_detected integer DEFAULT 0,
  plan jsonb,
  plan_narrative text,
  projected_revenue_impact numeric DEFAULT 0,
  projected_cost_saving numeric DEFAULT 0,
  owner_priority text DEFAULT 'balanced' CHECK (owner_priority IN ('growth','margin','retention','balanced')),
  executed_actions integer DEFAULT 0,
  actual_revenue_impact numeric,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, session_date)
);
ALTER TABLE agent_council_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_council_sessions" ON agent_council_sessions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON agent_council_sessions (business_id, session_date DESC);

CREATE TABLE IF NOT EXISTS agent_council_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES agent_council_sessions(id) ON DELETE CASCADE NOT NULL,
  business_id uuid NOT NULL,
  agent_type text NOT NULL,
  proposal_type text NOT NULL,
  proposal_data jsonb NOT NULL,
  projected_impact_dollars numeric DEFAULT 0,
  confidence numeric DEFAULT 0.5,
  urgency text DEFAULT 'normal' CHECK (urgency IN ('critical','high','normal','low')),
  conflicts_with text[],
  synergises_with text[],
  council_decision text CHECK (council_decision IN ('approved','rejected','modified','deferred')),
  council_reasoning text,
  executed_at timestamptz,
  outcome_data jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE agent_council_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_council_proposals" ON agent_council_proposals
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON agent_council_proposals (session_id, agent_type);

ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS council_priority text DEFAULT 'balanced';
ALTER TABLE agent_settings ADD COLUMN IF NOT EXISTS mode text DEFAULT 'suggest' CHECK (mode IN ('suggest','auto'));
```

## TASK 2 — Council orchestrator
Commit: "feat(council): council.ts — runs all agents, detects conflicts, produces daily plan"

Create: src/lib/agents/council.ts

Steps:
1. Get/create today's council session for business_id
2. Get owner priority from agent_settings WHERE agent_type='council'
3. Run ALL enabled agents in parallel via Promise.allSettled:
   ReorderAgent, PricingAgent, ScheduleAgent — and any new agents that exist (check orchestrator.ts)
   Skip gracefully if agent throws
4. Collect all AgentDecision[] from runs → convert to council proposals → insert to agent_council_proposals
5. Detect conflicts:
   - pricing RAISE + flash_revenue DISCOUNT on same product → conflict
   - reorder LARGE_ORDER + cashflow LOW_RUNWAY → conflict
   - menu DEPRIORITISE_ITEM + waste PROMOTE_ITEM → conflict
   Mark conflicts_with arrays on relevant proposals
6. Call claude-sonnet-4-5-20250929 with all proposals + conflicts + owner_priority + today's revenue snapshot:
   System: "You are the Aria Revenue Council chair for an Australian small business. Evaluate these agent proposals and produce a coordinated daily action plan."
   Response JSON: { decisions: [{proposal_id, decision, reasoning, modified_data?}], plan_narrative: string (2-3 sentences), projected_revenue_impact: number, projected_cost_saving: number }
7. Update proposal council_decision fields
8. Update council session: plan, plan_narrative, projections, status='complete'
9. If mode='auto': execute approved proposals via executeProposal()
   If mode='suggest': leave as pending for owner approval
10. Log to aria_ai_calls

Create: src/lib/agents/council-executor.ts
Routes proposal_type to real action:
- price_change → PATCH /api/pos/products/{id}
- send_campaign → POST /api/aria/winback
- create_reorder → POST /api/pos/purchase-orders
- run_promotion → POST /api/pos/promotions
- send_offer → POST /api/loyalty/offers
- markdown_product → POST /api/pos/promotions with discount
All executions logged to aria_autopilot_actions

## TASK 3 — Cron
Commit: "feat(council): daily 6am AEST council cron"

Create: src/app/api/cron/council-session/route.ts
Schedule: "0 20 * * *" (8pm UTC = 6am AEST)
Runs runCouncilSession(business_id) for all active businesses (subscription active or trialing)
Sends push notification to owner when plan is ready

## TASK 4 — API routes
Commit: "feat(council): API routes — get plan, approve/reject proposals, settings"

GET /api/agents/council → today's session + proposals + pending_count
PATCH /api/agents/council/proposals/[id] → approve/reject, executes on approve
PATCH /api/agents/council/settings → { owner_priority, mode }
GET /api/agents/council/history → last 30 sessions

## TASK 5 — Dashboard page
Commit: "feat(council): agents dashboard — Today's Plan, proposal cards, settings, history"

Create: src/app/dashboard/agents/page.tsx
Read ui-ux-pro-max skill. This is the centrepiece of Aria's agent system.

Tabs: Today's Plan | All Agents | History | Performance

Today's Plan tab:
- plan_narrative in large text at top
- Projected impact cards: revenue lift, cost saving, actions planned
- Priority toggle: Growth / Margin / Retention / Balanced (auto-saves)
- Mode toggle: Suggest vs Auto with clear explanation
- Proposal cards grouped by agent (colour-coded badges):
  reorder=blue, pricing=amber, menu=green, flash=orange, clv=purple, labour=teal, waste=sage, negotiation=red
  Each card: title, projected impact, confidence bar, urgency badge, conflict warning
  If suggest mode: Approve + Reject buttons
  If auto mode: "Executed at {time}" status

All Agents tab:
Grid of agent cards — one per agent type
Each: name, enabled toggle, mode toggle (suggest/auto per agent), last run time, decisions count
Config button → agent-specific settings modal
"Run now" button → POST /api/agents/run

History tab:
Timeline of past sessions: date, narrative, projected vs actual impact, actions count
Click → expand to see all proposals and outcomes

Performance tab:
Total revenue attributed to agents, total cost savings, actions taken
Best-performing agent by revenue impact per action
Accuracy: projected vs actual impact per agent

## TASK 6 — Sidebar + briefing
Commit: "feat(council): sidebar link + council plan in daily briefing"

Add to Sidebar.tsx ALL_ITEMS:
'agents': { href: '/dashboard/agents', label: 'Aria Agents', icon: BrainIcon, badge: 'AI', section: 'Intelligence' }
Add to all industry configs.

In buildAskAriaContext: add plan_narrative from today's session.
On daily-briefing page: add "Aria's Agent Plan" card with top 3 proposals.

## COMPLETION CHECKLIST
- [ ] 2 tables with RLS, council.ts orchestrator, council-executor.ts
- [ ] Cron daily 6am AEST, all 4 API routes
- [ ] Dashboard: Today's Plan with approve/reject, All Agents grid, History, Performance
- [ ] Auto-mode executes, Suggest-mode queues
- [ ] Sidebar link, plan in daily briefing
- [ ] npx tsc --noEmit + npm run build pass
State "Build verified green, all commits pushed." when done.

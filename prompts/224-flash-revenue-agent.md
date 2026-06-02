# Prompt 224 — Autonomous Flash Revenue Agent
# Monitors 15-minute revenue windows. Autonomously executes interventions.
# ENV: TWILIO (set ✅), RESEND (set ✅), no new vars needed.

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

## WHAT THIS AGENT DOES
Runs every 15 minutes. Monitors 8 triggers. When a trigger fires, AI selects the
optimal intervention and executes it autonomously (or queues for approval).
Measures actual revenue lift 2 hours later. Learns which interventions work best.

## TASK 1 — DB migrations
Commit: "feat(flash-agent): DB migrations — flash_interventions"

```sql
CREATE TABLE IF NOT EXISTS flash_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  triggered_by text NOT NULL,
  trigger_data jsonb NOT NULL,
  intervention_type text NOT NULL CHECK (intervention_type IN (
    'sms_blast','push_notification','online_menu_flash',
    'community_post','loyalty_offer','bundle_activation',
    'counter_offer','markdown_expiry'
  )),
  intervention_data jsonb NOT NULL,
  target_segment text,
  target_count integer DEFAULT 0,
  channel text NOT NULL CHECK (channel IN ('sms','push','email','community','pos_display','online_menu')),
  message_text text,
  discount_pct numeric,
  product_ids uuid[],
  expires_at timestamptz,
  revenue_in_2h_before numeric DEFAULT 0,
  revenue_in_2h_after numeric DEFAULT 0,
  transactions_in_2h_after integer DEFAULT 0,
  revenue_lift_pct numeric,
  executed_at timestamptz DEFAULT now(),
  expired_at timestamptz,
  cancelled_at timestamptz,
  agent_decision_id uuid REFERENCES agent_decisions(id) ON DELETE SET NULL
);
ALTER TABLE flash_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_flash" ON flash_interventions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON flash_interventions (business_id, executed_at DESC);
-- Prevent duplicate: only 1 flash per trigger type per hour
CREATE UNIQUE INDEX ON flash_interventions (business_id, triggered_by, date_trunc('hour', executed_at))
  WHERE cancelled_at IS NULL AND expired_at IS NULL;
```

## TASK 2 — FlashRevenueAgent class
Commit: "feat(flash-agent): FlashRevenueAgent — 8 triggers + AI intervention selection"

Create: src/lib/agents/flash-revenue-agent.ts (AgentType: 'flash_revenue')

run(business_id):
1. COOLDOWN: skip if any flash_intervention in last 90 minutes (configurable)
2. GATHER 8 TRIGGERS in parallel:
   T1 Revenue shortfall: current_1h_revenue < 60% of same-hour 30d average → FIRES if shortfall > 40%
   T2 Dead period: last transaction > 20 minutes ago during trading hours
   T3 Expiry: products with expiry_date < now()+48h AND stock > 5
   T4 Weather: Open-Meteo current hour weathercode >= 61 (rain) AND prior hour < 61
   T5 Competitor: competitor_snapshots with price drop > 5% in last 2h
   T6 Quiet day: today DOW in bottom 20% of revenue days historically
   T7 Labour overallocation: (active_staff_cost / revenue_today) > 45%
   T8 Basket drop: last_hour avg basket < baseline_basket * 0.8
3. If no triggers: return early
4. AI INTERVENTION SELECTION via haiku:
   Send all fired triggers + business context (industry, inventory, loyalty member count, Twilio enabled)
   Prompt: choose single best intervention. Response JSON: { intervention_type, channel, target_segment, message_text, discount_pct, product_ids, reasoning, expected_lift_pct, expires_minutes }
5. Record revenue_in_2h_before
6. EXECUTE (if mode=auto) or save AgentDecision (if mode=suggest):
   sms_blast → Twilio SMS to target segment customers
   community_post → POST /api/community/posts
   loyalty_offer → POST /api/loyalty/flash-offer
   bundle_activation → create pos_promotion
   markdown_expiry → temp price reduction on expiring product
   online_menu_flash → set product as featured + create timed promotion
   counter_offer → loyalty members only private offer
7. Log to flash_interventions + aria_autopilot_actions

## TASK 3 — Outcome cron + learning
Commit: "feat(flash-agent): outcome measurement + learning loop"

Create: src/app/api/cron/flash-outcomes/route.ts
Schedule: combine into existing 30-min cron if possible
Finds interventions 2h old without outcome → fills revenue_in_2h_after, revenue_lift_pct
Learning: if lift < 5% → add to failed_interventions in agent_settings.config
If lift > 20% → add to best_interventions. Updates success_rate per intervention_type.

15-minute agent cron: src/app/api/cron/flash-revenue/route.ts
Schedule: "*/15 * * * *" — check vercel.json limit before adding

## TASK 4 — Dashboard widget
Commit: "feat(flash-agent): flash revenue widget"

"Flash Revenue" section on agents dashboard:
- Current status: healthy OR active intervention with countdown timer
- 7-day hourly revenue bar chart with intervention events as vertical markers
- Intervention log: trigger, type sent, revenue lift %, status
- Learning: "SMS blasts average +28% lift. Community posts: low impact."
- Config: enabled triggers (8 checkboxes), min gap minutes, auto vs suggest

## COMPLETION CHECKLIST
- [ ] flash_interventions table with unique hour index
- [ ] All 8 triggers monitored
- [ ] haiku selects optimal intervention
- [ ] All 8 intervention types implemented
- [ ] 90-min cooldown working
- [ ] Outcome cron measuring 2h lift, learning updating success rates
- [ ] Dashboard widget with intervention history + learning insights
- [ ] npx tsc --noEmit + npm run build pass
State "Build verified green, all commits pushed." when done.

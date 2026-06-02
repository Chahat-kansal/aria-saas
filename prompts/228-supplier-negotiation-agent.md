# Prompt 228 — Supplier Negotiation Intelligence Agent
# Nothing like this exists for SMBs anywhere. Run after Prompts 220+221.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these skill files IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Every UI component must use Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers, glass/aurora surfaces.

## EXISTING INFRASTRUCTURE — DO NOT RECREATE
- src/lib/agents/base-agent.ts, types.ts, orchestrator.ts
- DB tables: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Models: haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## PREREQUISITE
Prompts 220 (supplier_invoices) and 221 (supplier_contracts, supplier_price_variances) must be complete.
Check these tables exist before running: supplier_invoices, supplier_invoice_items, supplier_contracts, supplier_price_variances

## WHAT THIS AGENT DOES
Runs monthly (first of each month). Silently builds negotiation leverage files per supplier over 12 months of invoice data. Detects price creep, invoice inaccuracies, and delivery reliability issues. When contract renewal approaches OR price creep exceeds 3%, auto-generates a complete negotiation brief with the specific arguments, expected outcome, and draft email. Tracks whether negotiations succeeded and refines confidence scores over time.

## TASK 1 — DB migrations
Commit: "feat(negotiation-agent): DB migrations — supplier_profiles + negotiation_briefs"

```sql
CREATE TABLE IF NOT EXISTS supplier_negotiation_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  
  -- 12-month spend analysis
  total_spend_12m numeric DEFAULT 0,
  total_orders_12m integer DEFAULT 0,
  avg_order_value_12m numeric DEFAULT 0,
  payment_on_time_pct numeric DEFAULT 100, -- % of invoices paid by due date
  
  -- Price trend analysis
  price_creep_pct numeric DEFAULT 0, -- % price increase detected vs 12m ago (same products)
  price_creep_products jsonb DEFAULT '[]', -- [{product_name, 12m_ago_price, current_price, creep_pct}]
  overcharge_count_12m integer DEFAULT 0, -- from supplier_price_variances
  total_overcharge_12m numeric DEFAULT 0, -- total $ overcharged vs contract
  invoice_accuracy_pct numeric DEFAULT 100, -- % invoices with no variance
  
  -- Delivery reliability
  on_time_delivery_pct numeric DEFAULT 100,
  damaged_goods_count integer DEFAULT 0,
  credit_notes_issued integer DEFAULT 0,
  
  -- Market position (from supplier_price_items + market benchmarks)
  vs_market_avg_pct numeric DEFAULT 0, -- how their prices compare to market (positive=above market)
  vs_competitor_supplier_pct numeric DEFAULT 0, -- vs another supplier for same products
  
  -- Leverage score (0-100): higher = stronger negotiation position
  leverage_score numeric DEFAULT 50,
  leverage_factors jsonb DEFAULT '[]', -- ["High spend volume", "Consistent payment", "Price above market"]
  
  -- Relationship context
  contract_renewal_date date,
  relationship_years numeric DEFAULT 0,
  key_products text[], -- top 5 products by spend
  
  -- Next action
  next_negotiation_trigger text, -- what will trigger a negotiation brief
  negotiation_priority text DEFAULT 'low' CHECK (negotiation_priority IN ('urgent','high','medium','low')),
  
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, supplier_name)
);
ALTER TABLE supplier_negotiation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_neg_profiles" ON supplier_negotiation_profiles
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS supplier_negotiation_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  profile_id uuid REFERENCES supplier_negotiation_profiles(id) ON DELETE SET NULL,
  
  -- Brief content
  trigger_reason text NOT NULL, -- e.g. "price_creep_exceeded_threshold", "contract_renewal_90_days"
  negotiation_goal text NOT NULL, -- specific ask: "Restore Heineken to $46.20/case"
  leverage_arguments jsonb NOT NULL, -- array of specific arguments with supporting data
  expected_outcome text NOT NULL, -- "High probability of success based on leverage score"
  success_probability numeric DEFAULT 0.5, -- 0-1
  
  -- Draft communication
  draft_email_subject text,
  draft_email_body text, -- full email to send to supplier
  draft_talking_points text[], -- for phone call
  
  -- Potential savings
  annual_saving_if_successful numeric DEFAULT 0,
  monthly_saving_if_successful numeric DEFAULT 0,
  
  -- Outcome tracking
  status text DEFAULT 'pending' CHECK (status IN ('pending','in_progress','won','lost','deferred')),
  outcome_notes text,
  actual_saving_achieved numeric,
  negotiation_started_at timestamptz,
  negotiation_completed_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_negotiation_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_neg_briefs" ON supplier_negotiation_briefs
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON supplier_negotiation_briefs (business_id, status, created_at DESC);
```

## TASK 2 — SupplierNegotiationAgent class
Commit: "feat(negotiation-agent): SupplierNegotiationAgent — profile building + brief generation"

Create: src/lib/agents/supplier-negotiation-agent.ts
Extends BaseAgent. AgentType: 'supplier_negotiation'

```typescript
// run(business_id: string): Promise<AgentRunResult>

// STEP 1: BUILD SUPPLIER PROFILES FROM 12 MONTHS OF INVOICE DATA
// For each unique supplier_name in supplier_invoices WHERE business_id:
//
// Spend analysis:
//   total_spend_12m = SUM(supplier_invoices.total WHERE invoice_date > now()-365d)
//   total_orders_12m = COUNT(distinct invoice_id) same period
//   avg_order_value_12m = total_spend_12m / total_orders_12m
//   payment_on_time_pct = COUNT(paid_at <= due_date) / COUNT(paid_at IS NOT NULL) * 100
//
// Price creep detection:
//   For each product in supplier_invoice_items for this supplier:
//     price_12m_ago = AVG(unit_price WHERE invoice_date BETWEEN now()-13m AND now()-11m)
//     price_now = AVG(unit_price WHERE invoice_date > now()-2m)
//     product_creep_pct = (price_now - price_12m_ago) / price_12m_ago * 100
//   supplier_price_creep_pct = AVG of all product creep_pcts (weighted by spend)
//   price_creep_products = array of products with creep > 2%
//
// Overcharge analysis (from supplier_price_variances):
//   overcharge_count_12m = COUNT WHERE supplier_name AND created_at > now()-365d AND variance_amount > 0
//   total_overcharge_12m = SUM(total_variance) same filter
//   invoice_accuracy_pct = (total_invoices - overcharge_invoices) / total_invoices * 100
//
// Market position:
//   For top 3 products by spend: compare this supplier's price vs other suppliers in supplier_price_items
//   vs_competitor_supplier_pct = (this_supplier_avg - cheapest_other_supplier_avg) / cheapest_other * 100
//   Also run a haiku web search for current AU wholesale prices for top 2 products
//   vs_market_avg_pct = (this_supplier_avg - market_avg) / market_avg * 100
//
// LEVERAGE SCORE ALGORITHM:
//   Start at 50
//   +15 if total_spend_12m > $50,000 (high-value customer)
//   +10 if total_spend_12m > $100,000
//   +10 if payment_on_time_pct > 95% (reliable payer)
//   +15 if vs_competitor_supplier_pct > 5% (competitor is cheaper)
//   +10 if vs_market_avg_pct > 8% (above market)
//   +10 if price_creep_pct > 5% AND no formal contract renewal
//   -15 if relationship_years < 1 (new relationship, less leverage)
//   -10 if total_spend_12m < $10,000 (low spend = low leverage)
//   +5 if overcharge_count_12m > 3 (they have a pattern of errors — grounds for renegotiation)
//
// leverage_factors = array of human-readable reasons matching the score additions above
//
// negotiation_priority:
//   urgent: price_creep_pct > 8% OR contract_renewal within 30 days
//   high: price_creep_pct > 5% OR contract_renewal within 90 days OR total_overcharge > $500
//   medium: price_creep_pct > 3% OR vs_market > 5%
//   low: everything else

// STEP 2: UPSERT supplier_negotiation_profiles

// STEP 3: GENERATE NEGOTIATION BRIEFS for urgent + high priority suppliers
// For each supplier with negotiation_priority in [urgent, high]:
//
// Build negotiation context JSON:
// {
//   supplier_name, total_spend, leverage_score, leverage_factors,
//   price_creep_pct, price_creep_products,
//   total_overcharge, overcharge_count,
//   vs_market_pct, vs_competitor_pct,
//   key_products, relationship_years, payment_reliability
// }
//
// Call claude-sonnet-4-5-20250929 (not haiku — this needs quality reasoning):
// System: "You are an expert procurement negotiator for Australian small businesses.
//   Generate a complete supplier negotiation package based on this data."
// User: JSON context above
// Response format (JSON only):
// {
//   "negotiation_goal": "specific, quantified ask",
//   "leverage_arguments": [
//     { "argument": string, "data_point": string, "strength": "strong"|"medium"|"weak" }
//   ],
//   "expected_outcome": string,
//   "success_probability": number,
//   "draft_email_subject": string,
//   "draft_email_body": string, // professional, specific, references actual data
//   "draft_talking_points": string[], // for phone call
//   "annual_saving_if_successful": number,
//   "monthly_saving_if_successful": number
// }
//
// Insert to supplier_negotiation_briefs

// STEP 4: TRIGGER ALERTS
// For each new urgent brief: create intelligence_event + aria_autopilot_action
// "⚡ Negotiation brief ready for {supplier}. You could save ${saving}/month."
// Send notification to owner

// STEP 5: TRACK OUTCOMES OF PREVIOUS NEGOTIATIONS
// Find briefs WHERE status='in_progress' AND negotiation_started_at < now()-30d
// Prompt owner in notifications: "How did the negotiation with {supplier} go?"
// This closes the feedback loop for the model

// STEP 6: LOG TO agent_runs
```

## TASK 3 — Monthly cron + API routes
Commit: "feat(negotiation-agent): cron + API routes"

Create: src/app/api/cron/supplier-negotiation/route.ts
Schedule: "0 20 1 * *" (1st of each month, 8am AEST)
Run SupplierNegotiationAgent for all active businesses

Create: src/app/api/agents/negotiation/profiles/route.ts
GET: all supplier_negotiation_profiles ordered by leverage_score DESC

Create: src/app/api/agents/negotiation/briefs/route.ts
GET: supplier_negotiation_briefs ordered by created_at DESC, filtered by status
POST: manually trigger a brief for a specific supplier_id

Create: src/app/api/agents/negotiation/briefs/[id]/route.ts
PATCH: update brief status (pending→in_progress→won/lost), add outcome notes, actual_saving

## TASK 4 — Dashboard widget
Commit: "feat(negotiation-agent): supplier negotiation widget on agents page"

"Supplier Intelligence" section on agents dashboard:

Supplier profiles table (sorted by negotiation_priority then leverage_score):
- Supplier name | Annual spend | Leverage score (coloured bar) | Price creep % | Overcharges | Priority badge | "View brief" button

Brief detail modal (click "View brief"):
- Full negotiation goal + expected outcome
- Leverage arguments with strength indicators
- Copy-to-clipboard buttons for: email subject, email body, talking points
- Potential saving: "${X}/month if successful"
- Status update buttons: "I've started negotiating" → "Won - save $X" or "Lost"

Portfolio summary:
- "Total negotiation opportunity: ${total_potential_saving}/year across {count} suppliers"
- "Strongest position: {supplier} (leverage score {X})"
- "Won so far this year: ${total_won}/year in savings"

Learning section:
- "Negotiations with leverage score > 70 have a {X}% success rate for your business"
- "Best argument: {most_successful_argument_type} has worked {X}% of the time"

## COMPLETION CHECKLIST
- [ ] 2 new tables with RLS + indexes
- [ ] SupplierNegotiationAgent with all 6 steps
- [ ] Leverage score algorithm with all factors
- [ ] Price creep detection from invoice history
- [ ] Market comparison via web search + cross-supplier data
- [ ] Negotiation brief generated by Claude Sonnet (not haiku)
- [ ] Full draft email in the brief (ready to send)
- [ ] Monthly cron running 1st of month
- [ ] API routes for profiles + briefs + status updates
- [ ] Dashboard: supplier table + brief modal + portfolio summary
- [ ] Outcome tracking closing the feedback loop
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

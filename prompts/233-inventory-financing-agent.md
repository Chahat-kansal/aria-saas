# Prompt 233 — Predictive Inventory Financing Agent
# Nothing like this exists for Australian SMBs. Cash flow crisis prevention.
# NO NEW ENV VARS — uses existing Supabase + Anthropic + Basiq (optional).

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE
- src/lib/agents/base-agent.ts, types.ts, orchestrator.ts — DO NOT recreate
- DB: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()
- CONFIRMED AVAILABLE env vars: ANTHROPIC_API_KEY, RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, GOOGLE_PLACES_API_KEY, GOOGLE_CLIENT_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
- Open-Meteo weather API: FREE, no API key needed
- Basiq: check if BASIQ_API_KEY exists before using — it may not be set yet

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Models: haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Sees cash flow crises 3-4 weeks before they happen.
Predicts exactly when large stock orders will be needed and whether the business will have
enough cash on hand. Generates specific, actionable options — not generic advice.
This is genuinely novel: no POS platform in Australia combines sales forecasting,
supplier payment timing, and cash position into a forward-looking crisis predictor.

## TASK 1 — DB migrations
Commit: "feat(financing-agent): DB migrations — cash_forecasts + financing_opportunities"

```sql
-- Rolling 14-week cash flow forecast (rebuilt weekly)
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  forecast_week date NOT NULL, -- Monday of the forecast week
  week_number integer NOT NULL, -- 1-14 into the future
  
  -- Inflows
  predicted_pos_revenue numeric DEFAULT 0,
  predicted_online_revenue numeric DEFAULT 0,
  pending_invoice_payments numeric DEFAULT 0, -- wholesale invoices due this week
  expected_rebates numeric DEFAULT 0, -- from af_rebates if connected
  
  -- Outflows
  predicted_supplier_payments numeric DEFAULT 0,
  predicted_payroll numeric DEFAULT 0,
  predicted_rent_utilities numeric DEFAULT 0,
  predicted_other_fixed numeric DEFAULT 0,
  
  -- Cash position
  opening_cash_position numeric DEFAULT 0, -- carryover from prior week
  closing_cash_position numeric DEFAULT 0, -- opening + inflows - outflows
  
  -- Reorder triggers in this week
  reorder_events jsonb DEFAULT '[]', -- [{product_id, supplier, estimated_cost, flexibility}]
  reorder_total_cost numeric DEFAULT 0,
  
  -- Risk assessment
  risk_level text DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  risk_reason text,
  
  -- Recommended actions
  actions jsonb DEFAULT '[]', -- [{type, description, potential_saving, urgency}]
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, forecast_week, week_number)
);
ALTER TABLE cash_flow_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_cash_forecasts" ON cash_flow_forecasts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON cash_flow_forecasts (business_id, forecast_week DESC);

-- Financing options surfaced to the owner
CREATE TABLE IF NOT EXISTS financing_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  opportunity_type text NOT NULL CHECK (opportunity_type IN (
    'supplier_terms_extension', -- ask supplier for 30/60 day terms
    'flash_promo_revenue',      -- run a promo to accelerate cash
    'payment_timing_shift',     -- pay X later, pay Y earlier
    'invoice_factoring',        -- sell unpaid wholesale invoices
    'bnpl_stock',               -- buy stock via Zip Business / Prospa
    'early_payment_discount'    -- get a discount for paying supplier early
  )),
  description text NOT NULL,
  potential_benefit numeric, -- $ amount this saves or generates
  effort_level text CHECK (effort_level IN ('automatic','one_tap','phone_call','application')),
  urgency text CHECK (urgency IN ('urgent','this_week','this_month')),
  trigger_week date, -- the week this opportunity becomes relevant
  expires_at date,
  status text DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  actioned_at timestamptz,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE financing_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_financing_ops" ON financing_opportunities
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON financing_opportunities (business_id, urgency, status);
```

## TASK 2 — InventoryFinancingAgent class
Commit: "feat(financing-agent): InventoryFinancingAgent — 14-week cash forecast + crisis detection"

Create: src/lib/agents/inventory-financing-agent.ts
Extends BaseAgent. AgentType: 'inventory_financing'

```typescript
// run(business_id: string): Promise<AgentRunResult>

// STEP 1: ESTABLISH CURRENT CASH POSITION
// If Basiq connected: GET /api/basiq/balance → current bank account balance
// If not: estimate from pos_sales - known expenses (rough approximation, clearly labelled as estimate)
// current_cash = bank balance or estimate

// STEP 2: PREDICT REORDER EVENTS FOR NEXT 14 WEEKS
// Use ReorderAgent logic (already built): which products will hit reorder point in next 14 weeks?
// For each predicted reorder:
//   Estimate cost: quantity_to_order * product.cost_price
//   Identify which week the order will need to be placed (reorder_point / daily_velocity)
//   Identify supplier payment terms (from pos_suppliers.payment_terms_default or assume COD)
//   If terms = COD: cash needed = week of order placement
//   If terms = Net30: cash needed = 30 days after order placement
// Aggregate: reorder_events per week + total cost per week

// STEP 3: PREDICT REVENUE PER WEEK
// Use labour_demand_forecast if available (from prompt 226)
// Or: compute from pos_sales historical data:
//   For each of next 14 weeks: AVG revenue of same week-of-year from last 2 years
//   Adjust for: school holidays, weather (Open-Meteo 14-day for first 2 weeks), known events
//   predicted_revenue per week

// STEP 4: PREDICT FIXED OUTFLOWS
// payroll: SUM(expected hours * hourly_rate) from staff roster or historical average
// rent_utilities: AVG(last 3 months rent+utilities from bank feed or manual config)
// other_fixed: business.fixed_monthly_costs / 4 (weekly)

// STEP 5: BUILD 14-WEEK CASH FLOW
// Week 1: opening = current_cash
// Each week:
//   closing = opening + predicted_revenue - reorder_costs_due - payroll - rent - other
//   opening_next = closing
// If any week closing < 0: risk_level = 'critical'
// If any week closing < (2 * avg_weekly_expenses): risk_level = 'high'
// If any week closing < (3 * avg_weekly_expenses): risk_level = 'medium'

// STEP 6: GENERATE SPECIFIC OPTIONS for any critical/high risk weeks
// For each week where risk_level IN ('critical','high'):
//
// Option analysis:
// a) Can we delay any supplier payment in that week without breaching terms?
//    If yes: financing_opportunity type='payment_timing_shift'
//    "Delay ILG payment from Week 4 to Week 6 — still within Net30 terms. Saves $2,400 in cash for 14 days."
//    potential_benefit = reorder_cost (cash preserved, not actually saved)
//
// b) Do we have leverage to extend supplier terms? (from prompt 228 negotiation profiles)
//    If leverage_score > 60: financing_opportunity type='supplier_terms_extension'
//    "Your leverage score with ALM is 72/100. Request Net30 terms on your next order.
//     This would delay $3,200 in payment by 30 days — beyond your cash pinch point."
//
// c) Flash promo: what revenue would we need from a flash promo to bridge the gap?
//    gap = abs(closing_cash) + safety_buffer
//    financing_opportunity type='flash_promo_revenue'
//    "Running a 15% flash promo on {top_margin_product} this weekend could generate
//     ~${gap} in additional revenue based on your flash promo history."
//
// d) BNPL for inventory (informational only — Aria doesn't arrange this):
//    financing_opportunity type='bnpl_stock'
//    "For this reorder, Zip Business or Prospa offer stock finance at ~1.5%/month.
//     On a $4,200 order this costs ~$63 — worth it to preserve cash flow."
//    Include links: zipbusiness.com.au, prospa.com
//
// e) Invoice factoring (if wholesale_orders table has unpaid invoices):
//    financing_opportunity type='invoice_factoring'
//    "You have ${amount} in outstanding wholesale invoices. Invoice finance providers
//     (e.g. Earlytrade, Waddle) advance 80-90% immediately for ~2-3% fee."
//
// Call sonnet to generate the full set of options as a coherent narrative:
// "In Week {N} ({date}), your cash position drops to ${amount}.
//  Here are your 3 best options in order of ease: ..."

// STEP 7: SEASONAL CHRISTMAS/EVENT ALERTS
// October every year: Christmas stock planning alert
//   "Christmas is 10 weeks away. Based on last year, your December revenue was {X}% above average.
//    You'll need ~${stock_budget} in additional stock by Week 8. 
//    Your current cash position can support ${available}.
//    Start planning now: {specific_supplier_order_recommendations}"
// Similar for: school holiday periods, EOFY, local events

// STEP 8: UPSERT cash_flow_forecasts + financing_opportunities
// Save AgentDecisions for critical weeks
```

## TASK 3 — Weekly cron + API routes
Commit: "feat(financing-agent): weekly cron + API routes"

Schedule: "0 19 * * 0" (Sunday 7am AEST — rebuild forecast weekly)

Create: src/app/api/agents/financing/forecast/route.ts
GET: 14-week cash_flow_forecasts with colour-coded risk
Returns: { weeks[], current_cash, critical_weeks[], opportunities[] }

Create: src/app/api/agents/financing/opportunities/route.ts
GET: open financing_opportunities ordered by urgency
PATCH /{id}: { status: 'actioned'|'dismissed', note? }

Create: src/app/api/agents/financing/run/route.ts
POST: trigger agent immediately

## TASK 4 — Dashboard section
Commit: "feat(financing-agent): inventory financing dashboard — 14-week chart + opportunities"

"Cash Flow Intelligence" section on agents page (separate from the existing cash flow page which is more operational):

14-week cash position chart:
- Line chart: x=week number, y=closing cash position
- Shade weeks below safety threshold (red zone)
- Mark reorder events as vertical dashed lines with cost labels
- Mark payroll weeks as blue markers
- Click any week → expand: all inflows, outflows, reorder events, financing options

Critical week alerts (if any):
- "⚠ Week 4 (Jun 23): Cash drops to $840. You have 3 options:"
- Option cards: each with potential_benefit, effort_level badge, action button
- "Delay ILG payment (easiest)" → marks opportunity as actioned
- "Run a flash promo" → links to promotions module
- "Request extended terms from ALM" → opens pre-filled email to supplier

Seasonal planning banner (October-November):
- "Christmas stock planning: 8 weeks away. Start your supplier conversations now."
- Pre-filled reorder suggestions with cash impact modelled

Bank connection status:
- Connected: "Cash position: $X (from Basiq, updated 2h ago)"
- Not connected: "Cash position estimated from POS revenue. Connect your bank for accuracy."

## COMPLETION CHECKLIST
- [ ] 2 new tables with RLS + indexes
- [ ] InventoryFinancingAgent: 14-week cash forecast built correctly
- [ ] Reorder cost timing computed from supplier payment terms
- [ ] All 5 financing option types generated when risk detected
- [ ] Seasonal Christmas/event alerts firing in October
- [ ] Sonnet generates coherent narrative for critical weeks
- [ ] Weekly cron rebuilding forecast
- [ ] Dashboard: 14-week chart with risk shading, opportunity cards
- [ ] Graceful degradation without Basiq (estimated mode clearly labelled)
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

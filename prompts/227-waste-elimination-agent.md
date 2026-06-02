# Prompt 227 — Predictive Waste Elimination Agent
# What Marriott and large hotel chains use for F&B. Now for Australian SMBs.

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

## WHAT THIS AGENT DOES
Runs nightly. Predicts next-day prep quantities per menu item. Sends kitchen a prep guide before opening. Monitors actual sales vs prep during the day. Triggers targeted promotions for over-prepped items before waste becomes inevitable. Learns and refines its model daily.

## TASK 1 — DB migrations
Commit: "feat(waste-agent): DB migrations — prep_predictions + waste_log"

```sql
CREATE TABLE IF NOT EXISTS prep_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  prediction_date date NOT NULL,
  
  -- Prediction inputs
  day_of_week integer NOT NULL,
  weather_code integer,
  is_school_holiday boolean DEFAULT false,
  is_public_holiday boolean DEFAULT false,
  local_event text,
  competitor_promotion_active boolean DEFAULT false,
  
  -- Prediction outputs
  predicted_units_sold numeric NOT NULL,
  prediction_confidence numeric DEFAULT 0.5, -- 0-1
  recommended_prep_qty numeric NOT NULL,
  recommended_prep_time text, -- e.g. "Prep 18 by 7:30am, top up 6 more by 11am"
  
  -- Actual (filled in at end of day)
  actual_units_sold numeric,
  actual_waste_units numeric,
  actual_waste_value numeric,
  waste_reason text, -- over_prepped, unexpected_event, quality_issue
  
  -- Model accuracy
  prediction_error_pct numeric, -- ABS(predicted - actual) / actual * 100
  
  -- Actions taken
  promotion_triggered boolean DEFAULT false,
  promotion_id uuid REFERENCES pos_promotions(id) ON DELETE SET NULL,
  promotion_units_saved numeric DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, product_id, prediction_date)
);
ALTER TABLE prep_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_prep_predictions" ON prep_predictions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON prep_predictions (business_id, prediction_date DESC);
CREATE INDEX ON prep_predictions (business_id, product_id, prediction_date DESC);

CREATE TABLE IF NOT EXISTS waste_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  waste_date date NOT NULL DEFAULT CURRENT_DATE,
  units_wasted numeric NOT NULL,
  cost_per_unit numeric DEFAULT 0,
  total_waste_value numeric DEFAULT 0,
  reason text CHECK (reason IN ('over_prepped','quality_degradation','event_cancelled','forecast_error','other')),
  prevented_by_agent boolean DEFAULT false,
  notes text,
  logged_by text DEFAULT 'agent',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE waste_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_waste_log" ON waste_log
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON waste_log (business_id, waste_date DESC);

-- Add prep-related columns to pos_products
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS prep_time_minutes integer DEFAULT 0;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS shelf_life_hours numeric; -- how long it lasts once prepped
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS waste_threshold_pct numeric DEFAULT 15; -- acceptable waste %
```

## TASK 2 — WasteEliminationAgent class
Commit: "feat(waste-agent): WasteEliminationAgent — prediction model + prep guide generation"

Create: src/lib/agents/waste-elimination-agent.ts
Extends BaseAgent. AgentType: 'waste_elimination'

```typescript
// run(business_id: string, target_date: Date = tomorrow): Promise<AgentRunResult>

// STEP 1: FETCH PRODUCTS NEEDING PREP PREDICTION
// Query pos_products WHERE business_id AND is_active=true
// Filter to products with shelf_life_hours IS NOT NULL OR (they appear in pos_sale_items frequently)
// For products without shelf_life_hours: use prep_time_minutes > 0 as proxy

// STEP 2: BUILD PREDICTION FEATURES per product per day
// For target_date and each product:
//
// Historical baseline: last 12 weeks same dow, same product
//   base_units = PERCENTILE_CONT(0.5) of last 12 matching days (median, not average — more robust)
//   p25_units = 25th percentile (pessimistic day)
//   p75_units = 75th percentile (optimistic day)
//
// Trend adjustment:
//   last_4w_avg = AVG(last 4 matching dow days)
//   prior_4w_avg = AVG(prior 4 matching dow days)
//   trend_multiplier = last_4w_avg / NULLIF(prior_4w_avg, 0) -- if 1.1, trending up 10%
//
// Weather adjustment (Open-Meteo for target_date):
//   Sunny warm (code 0-3, max_temp > 22): +10% for cold drinks, -10% for hot
//   Rainy (code 61+): -20% for foot traffic overall, +15% for delivery/online
//   Cold (max_temp < 15): +20% for hot drinks, -10% for cold
//
// Event / holiday adjustment: same logic as labour agent
//
// Recent sell-through pattern:
//   Check if this product has been selling out before close recently:
//   sold_out_days_last_2w = COUNT(days where actual_units_sold >= recommended_prep_qty)
//   If sold_out_days_last_2w > 3: +15% buffer (we've been under-prepping)
//
// Final predicted_units:
//   predicted = base_units * trend_multiplier * weather_mult * event_mult
//   Clamp to [p25_units * 0.8, p75_units * 1.2]
//
// recommended_prep_qty:
//   If shelf_life_hours >= 24: recommended = CEILING(predicted * 1.05) -- 5% safety buffer
//   If shelf_life_hours < 24 AND shelf_life_hours >= 4: recommended = CEILING(predicted * 1.0) -- no buffer
//   If shelf_life_hours < 4 (very perishable): batch preparation guide
//     "Prep {batch_1_qty} by {open_time}. Prep {batch_2_qty} by {midday}."
//     batch_1 = predicted * 0.6, batch_2 = predicted * 0.4
//
// prediction_confidence:
//   high (>0.75): 12+ historical data points, low variance, no unusual signals
//   medium (0.5-0.75): 6-12 data points or unusual weather/event
//   low (<0.5): few data points or major unusual signal

// STEP 3: GENERATE PREP GUIDE via haiku
// Build the guide as a structured document:
//   For each product with predicted_units > 0:
//     Sort by: prep_time_minutes DESC (longest prep first)
//     Format: "• {product_name}: prep {qty} {unit} by {time}"
// Prompt to haiku: "Given this prep plan, write a kitchen briefing in 3-4 sentences.
//   Highlight the top 3 items by quantity, mention any unusual adjustments (weather/event).
//   Tone: practical, professional, like a head chef briefing."
// Result: prep_guide_narrative

// STEP 4: UPSERT prep_predictions for tomorrow
// Send prep guide via Twilio SMS to the business owner or head chef phone number at 9pm
// Also create an intelligence_event so it appears in the dashboard

// STEP 5: INTRA-DAY MONITORING (called by a separate cron at noon)
// For today's predictions: compare actual sales so far vs predicted trajectory
//   projected_eod = actual_units_sold_by_noon * 2 (simple linear)
//   over_prepped = recommended_prep_qty - projected_eod
//   If over_prepped > 3 AND product.shelf_life_hours < 6:
//     TRIGGER WASTE PREVENTION PROMOTION:
//     POST /api/pos/promotions: { product_id, discount_pct: 20, valid_until: close_time, name: "Today special" }
//     Also: POST /api/community/posts with agent-generated "today special" post
//     Log to prep_predictions.promotion_triggered = true

// STEP 6: END-OF-DAY RECONCILIATION (called by cron at close time)
// For today's predictions: fill in actual_units_sold, actual_waste_units, prediction_error_pct
// Compute: actual_waste_units = recommended_prep_qty - actual_units_sold (if positive)
// actual_waste_value = actual_waste_units * product.cost_price
// Log to waste_log if actual_waste_units > 0
// Update model: if prediction_error_pct > 25%, increase the p25/p75 buffer for this product

// STEP 7: MODEL REFINEMENT (weekly, Sunday night)
// For all products with 4+ weeks of prep_prediction data:
//   Compute: avg_prediction_error_pct, most_common_over_under
//   Adjust recommendation formula: if consistently over-prepping, reduce trend_multiplier
//   Store adjustments in agent_settings.config.waste_model_adjustments
```

## TASK 3 — Crons
Commit: "feat(waste-agent): 3 crons — nightly prep guide, noon check, end-of-day reconcile"

NIGHTLY (9pm AEST): src/app/api/cron/waste-prep-guide/route.ts → runs STEPS 1-4
Schedule: "0 11 * * *" (11am UTC = 9pm AEST)

NOON CHECK (12pm): src/app/api/cron/waste-noon-check/route.ts → runs STEP 5
Schedule: "0 2 * * *" (2am UTC = 12pm AEST)

END OF DAY (10pm): src/app/api/cron/waste-reconcile/route.ts → runs STEP 6
Schedule: "0 12 * * *" (12pm UTC = 10pm AEST)

Note: check total cron count stays ≤22 in vercel.json. If at limit, combine with closest existing cron.

## TASK 4 — API routes + dashboard widget
Commit: "feat(waste-agent): API routes + waste elimination widget"

Create: src/app/api/agents/waste/predictions/route.ts
GET: today + tomorrow prep predictions with accuracy from yesterday
Returns: { today_predictions[], tomorrow_predictions[], waste_saved_this_month, accuracy_this_month }

Create: src/app/api/agents/waste/log/route.ts
GET: waste_log for last 30 days grouped by product
POST: manually log waste (owner-entered)

Dashboard section:

"Waste Elimination" widget on agents page:
- Today's prep guide: show the prep_guide_narrative for today
- Accuracy tracker: "Aria's predictions have been {accuracy}% accurate over the last 30 days"
- Waste saved this month: "Aria prevented $X in food waste this month via X flash promotions"
- Products to watch: items with consistently high waste % (over-prepped repeatedly)
- Product setup: table showing pos_products with shelf_life_hours, waste_threshold_pct — owner can edit inline
- Monthly waste report: bar chart of daily waste value, with reduction trend line

## COMPLETION CHECKLIST
- [ ] 2 new tables + 3 new columns on pos_products
- [ ] WasteEliminationAgent with all 7 steps
- [ ] Median-based prediction (not average) — more robust
- [ ] Batch prep guide for perishables < 4h shelf life
- [ ] haiku generates narrative prep briefing
- [ ] SMS sent to chef/owner at 9pm with prep guide
- [ ] Noon monitoring triggers flash promotions automatically
- [ ] End-of-day reconciliation + waste_log entries
- [ ] Weekly model refinement adjusting per-product weights
- [ ] 3 crons at correct AEST times within vercel.json ≤22 limit
- [ ] Dashboard: prep guide display, accuracy, waste saved, product setup
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

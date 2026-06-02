# Prompt 224 — Autonomous Flash Revenue Agent
# Monitors 15-minute revenue windows. Autonomously executes the optimal intervention.
# ENV: TWILIO_ACCOUNT_SID ✅, TWILIO_AUTH_TOKEN ✅, TWILIO_FROM_NUMBER ✅, RESEND_API_KEY ✅
# Open-Meteo weather API: FREE, no key needed.

## SKILLS — READ BEFORE ANY CODE
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md

## EXISTING INFRASTRUCTURE
Read src/lib/agents/base-agent.ts, types.ts before starting.
Add 'flash_revenue' to AgentType in types.ts.

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. haiku for intervention selection. No AI needed for trigger evaluation.
State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Runs every 15 minutes during trading hours (configurable, default 7am-10pm).
Monitors 8 business health triggers. When ≥1 fires AND cooldown has passed:
Uses haiku to select the single best intervention from 8 options.
Executes it (if auto mode) or queues for approval (if suggest mode).
Measures actual revenue lift 2 hours later. Learns which interventions work per business.
Prevents customer fatigue: never SMS the same customer twice within 7 days.

## TASK 1 — DB migrations
Commit: "feat(flash-agent): DB migrations — flash_interventions"

```sql
CREATE TABLE IF NOT EXISTS flash_interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,

  -- What triggered this intervention
  triggered_by text NOT NULL CHECK (triggered_by IN (
    'revenue_shortfall','dead_period','expiry_stock',
    'weather_event','competitor_promotion','quiet_day',
    'labour_overallocation','basket_size_drop'
  )),
  trigger_data jsonb NOT NULL, -- the actual metric values that caused the trigger
  -- e.g. { "shortfall_pct": 45, "current_1h_revenue": 23.50, "baseline_1h_revenue": 42.80 }

  -- What was chosen and executed
  intervention_type text NOT NULL CHECK (intervention_type IN (
    'sms_blast','push_notification','online_menu_flash',
    'community_post','loyalty_offer','bundle_activation',
    'counter_offer','markdown_expiry'
  )),
  intervention_data jsonb NOT NULL, -- full details of what was sent/created
  target_segment text CHECK (target_segment IN ('lapsed_2km','loyalty_members','all_opted_in','online_only','vip_only')),
  target_count integer DEFAULT 0, -- how many customers/users were targeted
  channel text NOT NULL CHECK (channel IN ('sms','push','email','community','pos_display','online_menu')),
  message_text text, -- what was sent to customers
  discount_pct numeric, -- discount offered (if any)
  product_ids uuid[], -- products featured in this intervention
  expires_at timestamptz, -- when the flash deal expires

  -- Outcome measurement (filled 2h after execution)
  revenue_in_2h_before numeric DEFAULT 0, -- baseline: revenue in 2h before intervention
  revenue_in_2h_after numeric DEFAULT 0,  -- actual: revenue in 2h after intervention
  transactions_in_2h_after integer DEFAULT 0,
  revenue_lift_pct numeric, -- ((after - before) / before) * 100

  -- Status
  executed_at timestamptz DEFAULT now(),
  expired_at timestamptz, -- set when the flash deal expires
  cancelled_at timestamptz, -- set if owner cancels

  agent_decision_id uuid REFERENCES agent_decisions(id) ON DELETE SET NULL
);
ALTER TABLE flash_interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_flash" ON flash_interventions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON flash_interventions (business_id, executed_at DESC);
CREATE INDEX ON flash_interventions (business_id, triggered_by, executed_at DESC);

-- Prevents duplicate: only 1 flash per trigger type per hour per business
-- This stops the agent from spamming the same intervention repeatedly
CREATE UNIQUE INDEX flash_interventions_no_dup
  ON flash_interventions (business_id, triggered_by, date_trunc('hour', executed_at))
  WHERE cancelled_at IS NULL AND expired_at IS NULL;
```

## TASK 2 — FlashRevenueAgent class
Commit: "feat(flash-agent): FlashRevenueAgent — 8 triggers + haiku intervention selection + execution"

Create: src/lib/agents/flash-revenue-agent.ts
Add 'flash_revenue' to AgentType in types.ts. Extends BaseAgent.

```typescript
export class FlashRevenueAgent extends BaseAgent {
  type: AgentType = 'flash_revenue'

  async run(business_id: string): Promise<AgentRunResult> {
    const settings = await this.getSettings(business_id)
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: 0 }

    const config = settings.config as {
      cooldown_minutes?: number // default 90
      min_gap_between_sms_days?: number // default 7 (customer fatigue prevention)
      trading_hours_start?: number // default 7
      trading_hours_end?: number // default 22
      enabled_triggers?: string[] // default all 8
      revenue_shortfall_threshold_pct?: number // default 40
      dead_period_minutes?: number // default 20
      expiry_stock_minimum?: number // default 5
      labour_pct_threshold?: number // default 45
      basket_drop_threshold_pct?: number // default 20
    }

    // STEP 1: CHECK TRADING HOURS
    const hour = new Date().getHours()
    if (hour < (config.trading_hours_start ?? 7) || hour >= (config.trading_hours_end ?? 22)) {
      return { decisions: [], errors: [], duration_ms: 0 } // don't run outside trading hours
    }

    // STEP 2: CHECK COOLDOWN
    // Query: SELECT COUNT(*) FROM flash_interventions
    //   WHERE business_id=X AND executed_at > now() - interval '{cooldown} minutes'
    //   AND cancelled_at IS NULL
    // If count > 0: return early (respect cooldown)
    const cooldown = config.cooldown_minutes ?? 90
    // ... query and check

    // STEP 3: GATHER ALL 8 TRIGGER METRICS IN PARALLEL
    // Use Promise.allSettled to gather all metrics even if some fail

    // T1 — REVENUE SHORTFALL
    // current_1h_revenue = SUM(pos_sales.total_amount) WHERE created_at > now()-1h AND business_id=X
    // For baseline: find same hour (EXTRACT(HOUR FROM now())) averaged across last 30 days
    //   SELECT AVG(hour_total) FROM (
    //     SELECT DATE_TRUNC('hour', created_at) as h, SUM(total_amount) as hour_total
    //     FROM pos_sales WHERE business_id=X AND created_at > now()-31d AND created_at < now()-1h
    //       AND EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM now())
    //     GROUP BY h
    //   ) sub
    // shortfall_pct = (baseline - current) / baseline * 100
    // FIRES if shortfall_pct > (config.revenue_shortfall_threshold_pct ?? 40)

    // T2 — DEAD PERIOD
    // SELECT MAX(created_at) FROM pos_sales WHERE business_id=X
    // dead_minutes = (now() - max_created_at) in minutes
    // FIRES if dead_minutes > (config.dead_period_minutes ?? 20)

    // T3 — EXPIRY STOCK
    // SELECT p.id, p.name, p.price, p.cost_price, p.stock_quantity, si.expiry_date
    // FROM pos_products p
    // JOIN pos_sale_items si ON si.product_id = p.id (to get expiry from recent items)
    //   OR p.expiry_date (if column exists on pos_products — check first)
    // WHERE expiry_date < now()+48h AND stock_quantity > (config.expiry_stock_minimum ?? 5)
    // FIRES if any such products exist

    // T4 — WEATHER EVENT (Open-Meteo, free, no API key)
    // GET lat/lng from businesses table (default Sydney -33.8688, 151.2093 if null)
    // GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}
    //   &hourly=weathercode&timezone=Australia/Sydney&forecast_days=1
    // current_hour_code = hourly.weathercode[current_hour_index]
    // previous_hour_code = hourly.weathercode[current_hour_index - 1]
    // FIRES if current_hour_code >= 61 (rain/storm) AND previous_hour_code < 61
    //   (i.e. rain just started in the last hour)

    // T5 — COMPETITOR PROMOTION
    // SELECT * FROM competitor_snapshots
    //   WHERE business_id=X AND created_at > now()-2h
    //   AND previous_price IS NOT NULL AND price < previous_price * 0.95
    // FIRES if any competitor dropped price > 5% in last 2 hours
    // Also check community_posts from businesses in same suburb with industry match

    // T6 — QUIET DAY OF WEEK
    // Compute avg daily revenue by day_of_week for last 12 weeks:
    //   SELECT EXTRACT(DOW FROM created_at) as dow, AVG(day_total)
    //   FROM (SELECT DATE(created_at) as d, EXTRACT(DOW FROM created_at) as dow, SUM(total_amount) as day_total
    //     FROM pos_sales WHERE business_id=X AND created_at > now()-84d GROUP BY d, dow) sub
    //   GROUP BY dow ORDER BY AVG(day_total)
    // FIRES if today's DOW is in the bottom 20% (1-2 lowest days out of 7)
    //   AND current hour is 30 min before typical peak (we want to warm up before the rush)

    // T7 — LABOUR OVERALLOCATION
    // active_staff_cost = SUM( (EXTRACT(EPOCH FROM now()) - EXTRACT(EPOCH FROM clock_in)) / 3600 * hourly_rate )
    //   FROM pos_timesheets WHERE clock_out IS NULL AND business_id=X
    // revenue_today = SUM(total_amount) FROM pos_sales WHERE created_at > midnight AND business_id=X
    // labour_pct = active_staff_cost / NULLIF(revenue_today, 0) * 100
    // FIRES if labour_pct > (config.labour_pct_threshold ?? 45) AND revenue_today > 0

    // T8 — BASKET SIZE DROP
    // last_hour_avg_basket = AVG(total_amount) FROM pos_sales
    //   WHERE business_id=X AND created_at > now()-1h
    // baseline_avg_basket = AVG(total_amount) FROM pos_sales
    //   WHERE business_id=X AND created_at BETWEEN now()-30d AND now()-1h
    //   AND EXTRACT(HOUR FROM created_at) = EXTRACT(HOUR FROM now())
    // drop_pct = (baseline - current) / baseline * 100
    // FIRES if drop_pct > (config.basket_drop_threshold_pct ?? 20)
    //   AND COUNT(last_hour sales) >= 3 (need minimum sample)

    // STEP 4: COLLECT FIRED TRIGGERS
    const firedTriggers: FiredTrigger[] = [] // collect all triggers that fired
    // Filter by config.enabled_triggers if set
    // If firedTriggers.length === 0: return { decisions: [], errors: [], duration_ms }

    // STEP 5: AI INTERVENTION SELECTION via haiku
    // Build business context:
    const bizContext = {
      industry: business.industry, // cafe, retail, liquor etc
      active_loyalty_members: number, // COUNT from loyalty_members
      twilio_enabled: !!process.env.TWILIO_ACCOUNT_SID,
      current_inventory_value: number, // approximate
      expiring_products: ExpiringProduct[], // from T3 if fired
      last_intervention_types: string[], // last 3 intervention types to avoid repetition
      best_performing_types: string[], // from agent_settings.config.best_interventions
    }

    // Haiku prompt (claude-haiku-4-5-20251001):
    // System: "You are Aria's Flash Revenue Agent for an Australian {industry}.
    //   A revenue trigger has fired. Choose the SINGLE best intervention to
    //   execute RIGHT NOW based on the trigger data and business context.
    //   Consider: customer fatigue (don't over-SMS), urgency, expected lift.
    //   Prioritise interventions that work quickly (within 30 minutes)."
    // User: JSON of firedTriggers + bizContext
    // Response (JSON only):
    // {
    //   "intervention_type": one of 8 types,
    //   "channel": "sms"|"push"|"email"|"community"|"pos_display"|"online_menu",
    //   "target_segment": one of 5 segments,
    //   "message_text": string (max 160 chars for SMS),
    //   "discount_pct": number|null,
    //   "product_ids": uuid[]|null,
    //   "reasoning": string (why this intervention for these triggers),
    //   "expected_lift_pct": number (realistic estimate 5-40%),
    //   "expires_minutes": number (how long the intervention should last)
    // }

    // STEP 6: CAPTURE REVENUE BASELINE
    // revenue_in_2h_before = SUM(pos_sales.total_amount WHERE created_at > now()-2h)
    // Store in flash_intervention for outcome measurement later

    // STEP 7: EXECUTE INTERVENTION (if mode='auto') OR CREATE AGENT DECISION (if mode='suggest')
    //
    // 'sms_blast':
    //   Get customers matching target_segment:
    //     lapsed_2km: pos_customers WHERE last_visited_at < now()-30d AND marketing_opt_in=true
    //       AND distance(lat,lng, business.lat, business.lng) < 2km (if customer has location)
    //     loyalty_members: loyalty_members WHERE tier IN ('gold','silver') AND marketing_opt_in=true
    //     all_opted_in: pos_customers WHERE marketing_opt_in=true AND phone IS NOT NULL
    //     vip_only: loyalty_members WHERE tier='platinum' OR total_spend > $1000
    //   Filter out: customers who received an SMS in last 7 days (review_requests + flash_interventions)
    //   Send via Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER all set ✅)
    //   target_count = number of SMS sent
    //
    // 'community_post':
    //   POST /api/community/posts with { content: message_text, type: 'flash_deal' }
    //   If product_ids: include product names in the post
    //
    // 'loyalty_offer':
    //   INSERT pos_promotions { discount_percent: discount_pct, valid_until: now()+expires_minutes*60s,
    //     requires_code: false, applies_to: 'cart', min_customer_lifetime_spend: 50 }
    //   Optional: send push notification to loyalty app users
    //
    // 'bundle_activation':
    //   Insert into pos_promotions as a bundle deal using product_ids
    //   Or: update agent_bundle_product_id + agent_bundle_price on pos_products temporarily
    //
    // 'markdown_expiry':
    //   For each product in product_ids: PATCH pos_products SET price = original * (1-discount_pct/100)
    //   Also update pos_promotions with expiry-based discount
    //   Schedule a revert at expires_at using a future job or just store original_price
    //
    // 'online_menu_flash':
    //   For product_ids: PATCH pos_products SET is_featured = true (or similar prominence field)
    //   Create a time-limited pos_promotion with these products featured
    //   Revert at expires_at
    //
    // 'counter_offer' (private to loyalty members only — not public, avoids price war):
    //   Create loyalty-member-only promotion: min_customer_lifetime_spend threshold ensures exclusivity
    //   Message to loyalty members only via Twilio
    //
    // 'push_notification':
    //   If push_tokens table or FCM integration exists: send push
    //   Else: fall back to email via Resend (RESEND_API_KEY ✅)

    // STEP 8: INSERT flash_interventions row + log to aria_autopilot_actions
    // Insert: triggered_by, trigger_data, intervention_type, all intervention details, revenue_in_2h_before

    // STEP 9: SAVE AGENT DECISION (even in auto mode, for audit trail)
    await this.saveDecisions([{
      business_id,
      agent_type: 'flash_revenue',
      decision_data: { intervention, trigger_summary: firedTriggers },
      reasoning: intervention.reasoning,
      confidence_score: intervention.expected_lift_pct / 100,
      projected_impact_cents: Math.round(revenue_in_2h_before * intervention.expected_lift_pct / 100 * 100),
      expires_at: new Date(Date.now() + intervention.expires_minutes * 60000).toISOString(),
      status: mode === 'auto' ? 'auto_executed' : 'pending'
    }])

    await this.logRun(business_id, result, 'cron_15min')
  }
}
```

## TASK 3 — Outcome measurement + learning loop
Commit: "feat(flash-agent): outcome measurement cron + learning loop"

Create: src/app/api/cron/flash-outcomes/route.ts
Schedule: combine into an existing 30-min or hourly cron rather than adding new one.
If under 22 cron limit: "*/30 * * * *"

Handler logic:
1. Find flash_interventions WHERE:
   executed_at < now()-2h
   AND revenue_in_2h_after IS NULL
   AND cancelled_at IS NULL
2. For each:
   revenue_in_2h_after = SUM(pos_sales.total_amount)
     WHERE business_id = intervention.business_id
     AND created_at BETWEEN intervention.executed_at AND intervention.executed_at + INTERVAL '2 hours'
   transactions_in_2h_after = COUNT(pos_sales) same window
   revenue_lift_pct = ((revenue_in_2h_after - revenue_in_2h_before) / NULLIF(revenue_in_2h_before, 0)) * 100
   UPDATE flash_interventions SET revenue_in_2h_after, transactions_in_2h_after, revenue_lift_pct
3. LEARNING — update agent_settings.config for this business:
   Group recent interventions by intervention_type
   For each type: avg_lift_pct = AVG(revenue_lift_pct WHERE lift IS NOT NULL)
   If avg_lift_pct < 5%: add to config.failed_interventions[] (haiku will deprioritise)
   If avg_lift_pct > 20%: add to config.best_interventions[] (haiku will prioritise)
   Store: config.intervention_success_rates = { sms_blast: 28, community_post: 8, ... }
   This dict is passed to haiku in STEP 5 of the agent so it learns over time

## TASK 4 — 15-minute cron
Commit: "feat(flash-agent): 15-minute agent cron"

Create: src/app/api/cron/flash-revenue/route.ts
Add to vercel.json: { "path": "/api/cron/flash-revenue", "schedule": "*/15 * * * *" }
CRITICAL: Count total crons in vercel.json before adding. If ≥ 22, merge into another cron.

Handler:
- Verify cron auth (check CRON_SECRET if configured)
- Fetch all active businesses (trialing or active subscription)
- For each business in parallel (Promise.allSettled, 15s max per business):
  const agent = new FlashRevenueAgent()
  await agent.run(business.id)
- Return: { processed, interventions_fired, errors }

## TASK 5 — API routes + Dashboard widget
Commit: "feat(flash-agent): API routes + flash revenue dashboard widget"

Create: src/app/api/agents/flash-revenue/route.ts
GET: flash_interventions for business, last 7 days, joined with outcome data
Response: {
  interventions: FlashIntervention[],
  active_intervention: FlashIntervention | null, // currently running flash deal
  stats_7d: {
    total_interventions: number,
    avg_lift_pct: number,
    best_intervention_type: string,
    revenue_attributed: number // sum of (revenue_in_2h_after - revenue_in_2h_before) for positive lifts
  },
  success_rates: Record<intervention_type, number>, // from agent_settings.config
  next_run_at: string // approximate next 15-min window
}

Create: src/app/api/agents/flash-revenue/cancel/[id]/route.ts
POST: cancel an active intervention (set cancelled_at, revert any price changes)

Dashboard "Flash Revenue" widget on /dashboard/agents:

Status indicator (live, shown prominently):
  If no active intervention: large green "✓ Revenue tracking normally" with current vs baseline
  If active: pulsing orange "⚡ Flash intervention active" + what's running + countdown timer to expiry
  "Revenue in last hour: $X (vs $Y baseline = {+/-Z}%)"

7-day hourly revenue chart (recharts):
  x-axis: 168 hours (7 days)
  y-axis: revenue per hour
  Flash intervention events: vertical orange dashed lines at execution time
  Tooltip: hover shows intervention type and lift %

Intervention log (last 7 days):
  Each row: date/time | trigger | intervention type | target | revenue lift % | status badge
  Lift%: green if > 10%, amber if 0-10%, red if negative
  Click row: expands to show full trigger data, message sent, outcome details

Learning panel:
  "What Aria has learned:" section
  Bar chart of success rate per intervention type (only shows if ≥3 data points per type)
  "SMS blasts average +28% lift. Community posts: +7% lift (low effectiveness for your business)"
  "Aria now prioritises SMS over community posts for revenue shortfalls"

Config section:
  Enabled triggers: 8 checkboxes (each trigger name with description)
  Cooldown: slider 30-180 minutes
  SMS customer gap: slider 3-14 days (prevent SMS fatigue)
  Mode: suggest/auto toggle
  Trading hours: from/to time pickers

## COMPLETION CHECKLIST
- [ ] flash_interventions table with unique hour index preventing duplicates
- [ ] All 8 triggers correctly computed with exact SQL/logic
- [ ] haiku selects intervention with context including success_rates
- [ ] All 8 intervention types execute real actions (Twilio SMS, promotions, products, etc)
- [ ] Customer fatigue prevention: 7-day SMS gap enforced
- [ ] Cooldown: no flash within 90 min (configurable)
- [ ] Baseline captured BEFORE execution for fair comparison
- [ ] Outcome cron measures revenue 2h after each intervention
- [ ] Learning: success_rates updated in agent_settings.config
- [ ] 15-min cron within vercel.json ≤22 limit
- [ ] API: GET /flash-revenue with stats, active intervention, cancel
- [ ] Dashboard: live status, 7-day chart with events, intervention log, learning panel, config
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

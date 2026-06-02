# Prompt 226 — Dynamic Labour Cost Optimisation Agent
# What Deputy Enterprise charges $15k+/year for.
# ENV: TWILIO ✅ (for shift offer SMS). Open-Meteo weather FREE (no key).

## SKILLS — READ BEFORE ANY CODE
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md

## EXISTING INFRASTRUCTURE
Read src/lib/agents/base-agent.ts, types.ts. Add 'labour_optimisation' to AgentType.
EXISTING pos_timesheets columns: check actual columns before assuming any exist.
EXISTING staff_members columns: check actual columns before assuming any exist.
Read both tables' schemas from Supabase MCP before writing any code.

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. No AI needed — pure maths and SMS execution. haiku only for the daily narrative.
Amounts in dollars. State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Runs daily at 5am AEST. Builds a 14-day hourly demand forecast using:
  - Historical POS revenue (last 12 weeks, same hour-of-day, same day-of-week)
  - Weather adjustment (Open-Meteo 14-day forecast)
  - School holiday adjustment (VIC 2026 hardcoded + other states)
  - Local event adjustment (from intelligence_events table)
Compares forecast against current roster. Groups overstaffed/understaffed blocks.
Sends early-finish offers to 1 staff member in overstaffed windows.
Sends shift offers to best-fit available staff in understaffed windows.
Monitors real-time labour % during the day and alerts if > threshold.
Measures forecast accuracy by comparing predictions to actual the next day.

## TASK 1 — DB migrations
Commit: "feat(labour-agent): DB migrations — labour_demand_forecast + optimisation_actions"

```sql
-- 14-day hourly demand forecast, rebuilt daily
CREATE TABLE IF NOT EXISTS labour_demand_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  forecast_date date NOT NULL,
  hour_of_day integer NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Monday AUS convention

  -- Demand signals
  predicted_transactions integer DEFAULT 0,
  predicted_revenue numeric DEFAULT 0,
  predicted_basket_avg numeric DEFAULT 0, -- predicted_revenue / predicted_transactions

  -- External adjustments applied (as percentages)
  weather_adjustment_pct numeric DEFAULT 0,    -- e.g. -15 for rain, +5 for sunny
  event_adjustment_pct numeric DEFAULT 0,       -- e.g. +30 for local festival
  school_holiday_adjustment_pct numeric DEFAULT 0, -- e.g. +20 for school holidays

  -- Final forecast after all adjustments
  adjusted_predicted_revenue numeric DEFAULT 0,

  -- Staff requirement derived from forecast
  required_staff_count numeric DEFAULT 0, -- can be fractional (1.5 = needs 1 or 2)
  required_staff_skills text[], -- e.g. ['barista', 'cashier'] for cafe
  optimal_labour_cost numeric DEFAULT 0, -- required_staff * avg_hourly_rate

  -- Actuals (filled in retrospectively the next day)
  actual_transactions integer,
  actual_revenue numeric,
  actual_staff_count numeric,
  actual_labour_cost numeric,
  forecast_accuracy_pct numeric, -- (1 - abs(predicted-actual)/NULLIF(actual,0)) * 100

  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, forecast_date, hour_of_day)
);
ALTER TABLE labour_demand_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_forecast" ON labour_demand_forecast
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON labour_demand_forecast (business_id, forecast_date, hour_of_day);
CREATE INDEX ON labour_demand_forecast (business_id, created_at DESC);

-- Every action the agent takes
CREATE TABLE IF NOT EXISTS labour_optimisation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'early_finish_offer',   -- sent to overstaffed window: "go home early today"
    'shift_offer',          -- sent to available staff for understaffed window
    'labour_pct_alert',     -- labour cost too high as % of revenue
    'understaffed_alert',   -- understaffed window with no available staff to fill
    'roster_suggestion',    -- weekly roster adjustment suggestion
    'forecast_accuracy_report' -- weekly: how accurate were our forecasts?
  )),
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  target_date date NOT NULL,
  target_hour_start integer,   -- e.g. 14 for 2pm
  target_hour_end integer,     -- e.g. 17 for 5pm
  message_sent text,           -- exact SMS/notification text sent
  reasoning text,              -- why this action was taken

  -- Outcome tracking
  staff_response text CHECK (staff_response IN ('accepted','declined','no_response','pending')),
  responded_at timestamptz,
  labour_cost_saving numeric DEFAULT 0, -- estimated saving if accepted

  executed_at timestamptz DEFAULT now(),
  agent_decision_id uuid REFERENCES agent_decisions(id) ON DELETE SET NULL
);
ALTER TABLE labour_optimisation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_actions" ON labour_optimisation_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON labour_optimisation_actions (business_id, executed_at DESC);
CREATE INDEX ON labour_optimisation_actions (business_id, action_type, executed_at DESC);

-- Add missing columns to staff_members
-- IMPORTANT: Check which columns already exist before adding
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 25;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS availability_days integer[] DEFAULT '{0,1,2,3,4,5,6}';
-- 0=Monday, 1=Tuesday, etc (Australian convention)
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS max_hours_per_week numeric DEFAULT 38;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS performance_score numeric DEFAULT 0.7; -- 0-1

-- Add lat/lng to businesses for weather
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS latitude numeric DEFAULT -33.8688;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS longitude numeric DEFAULT 151.2093; -- default Sydney
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS state text DEFAULT 'VIC';
```

## TASK 2 — LabourOptimisationAgent class
Commit: "feat(labour-agent): LabourOptimisationAgent — 14-day forecast + gap analysis + SMS actions"

Create: src/lib/agents/labour-optimisation-agent.ts
Add 'labour_optimisation' to AgentType in types.ts. Extends BaseAgent.

```typescript
export class LabourOptimisationAgent extends BaseAgent {
  type: AgentType = 'labour_optimisation'

  async run(business_id: string): Promise<AgentRunResult> {
    const settings = await this.getSettings(business_id)
    const config = settings.config as {
      target_revenue_per_staff_hour?: number // default 120 (AUD)
      minimum_staff?: number // default 1
      labour_pct_threshold?: number // default 38%
      target_labour_pct?: number // default 30%
      accountant_email?: string
    }

    // STEP 1: FETCH BUSINESS DATA
    // Get business: latitude, longitude, state, industry from businesses table
    // Get all staff_members for business with: hourly_rate, skills, availability_days, max_hours_per_week

    // STEP 2: FETCH 14-DAY WEATHER FORECAST
    // Open-Meteo API (FREE, no API key required):
    // GET https://api.open-meteo.com/v1/forecast
    //   ?latitude={business.latitude}&longitude={business.longitude}
    //   &hourly=weathercode,precipitation_probability
    //   &timezone=Australia/Sydney
    //   &forecast_days=14
    // Parse: weathercode array (168 values = 14 days × 24 hours)
    // For each hour: map weathercode to adjustment:
    //   weathercode 0 (clear sky): +5% (sunny day boost)
    //   weathercode 1-3 (mostly clear): +3%
    //   weathercode 45-48 (fog): -5%
    //   weathercode 51-57 (drizzle): -10%
    //   weathercode 61-67 (rain): -15%
    //   weathercode 71-77 (snow) — rare in AU: -30%
    //   weathercode 80-82 (showers): -12%
    //   weathercode 95-99 (thunderstorm): -25%

    // STEP 3: SCHOOL HOLIDAY ADJUSTMENTS
    // VIC 2026 school holidays:
    const VIC_2026_HOLIDAYS = [
      { start: new Date('2026-03-28'), end: new Date('2026-04-13') }, // Term 1 break
      { start: new Date('2026-06-27'), end: new Date('2026-07-13') }, // Term 2 break
      { start: new Date('2026-09-19'), end: new Date('2026-10-05') }, // Term 3 break
      { start: new Date('2026-12-18'), end: new Date('2027-01-27') }, // Summer break
    ]
    // NSW 2026 (add similar):
    const NSW_2026_HOLIDAYS = [...]
    // QLD, SA, WA, TAS also hardcode
    // Select holiday array based on business.state
    //
    // For each forecast date: check if it falls in school holiday period
    // If yes AND industry IN ('cafe','retail','restaurant','bakery'):
    //   school_holiday_adjustment_pct = +20% (more families, kids in store)
    // If yes AND industry = 'warehouse':
    //   school_holiday_adjustment_pct = -10% (B2B deliveries reduce)

    // STEP 4: EVENT ADJUSTMENTS
    // Query: SELECT * FROM intelligence_events
    //   WHERE business_id=X AND event_type='local_event'
    //   AND event_date BETWEEN now() AND now()+14d
    // For each event: add event_adjustment_pct based on event.scale field
    //   'small': +15%, 'medium': +30%, 'large': +50%

    // STEP 5: BUILD 14-DAY HOURLY FORECAST
    // For each of next 14 days (day 0 = tomorrow), for each hour 0-23:
    //   dow = (day.getDay() + 6) % 7 // convert JS 0=Sunday to AUS 0=Monday
    //   hour = h
    //
    //   HISTORICAL BASELINE (last 12 weeks, same DOW, same hour):
    //   Query pos_sales WHERE business_id=X
    //     AND EXTRACT(DOW FROM created_at AT TIME ZONE 'Australia/Sydney') = dow  -- AUS DOW
    //     AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Australia/Sydney') = hour
    //     AND created_at > now()-84d -- 12 weeks
    //     AND date(created_at AT TIME ZONE 'Australia/Sydney') != current_date -- exclude today
    //   GROUP BY date(created_at)
    //   Use PERCENTILE_CONT(0.5) (median, more robust than avg) for transactions and revenue
    //   If fewer than 3 data points for this DOW+hour: use overall DOW average across all hours
    //
    //   All adjustments applied:
    //   weather_adj = weather_adjustment_pct for this specific date+hour
    //   holiday_adj = school_holiday_adjustment_pct if date is in holiday period
    //   event_adj = event_adjustment_pct if there's an event on this date
    //   adjusted_revenue = median_revenue * (1 + weather_adj/100 + holiday_adj/100 + event_adj/100)
    //
    //   STAFF REQUIREMENT:
    //   target_rev_per_staff_hour = config.target_revenue_per_staff_hour ?? 120
    //   raw_staff_needed = adjusted_revenue / target_rev_per_staff_hour
    //   required_staff_count = MAX(CEIL(raw_staff_needed * 2) / 2, minimum_staff)
    //   // Round to nearest 0.5, minimum 1 staff
    //
    //   optimal_labour_cost = required_staff_count * AVG(staff.hourly_rate)
    //
    //   Upsert labour_demand_forecast for (business_id, forecast_date, hour_of_day)

    // STEP 6: FETCH CURRENT ROSTER (next 14 days)
    // Query pos_timesheets WHERE business_id=X AND clock_in BETWEEN now() AND now()+14d
    // Also check if there's a staff_schedules or roster table — query if it exists
    // Build: rostered[date_string][hour] = { staff_count: number, staff: StaffMember[], cost: number }
    // For each hour: interpolate staff between clock_in and clock_out
    //   e.g. if staff clocked in at 9am and out at 5pm, they're counted in hours 9-17

    // STEP 7: GAP ANALYSIS — identify contiguous overstaffed and understaffed blocks
    // For each day in next 14 days, for each trading hour:
    //   rostered = rostered[date][hour]?.staff_count ?? 0
    //   required = labour_demand_forecast[date][hour].required_staff_count
    //   gap = rostered - required
    //   overstaffed_by = MAX(gap, 0)
    //   understaffed_by = MAX(-gap, 0)
    //
    // GROUP CONTIGUOUS GAPS (must be in same day, consecutive hours):
    // e.g. overstaffed from 2pm-5pm on Tuesday = one block, not 3 separate hours
    // Block: { date, start_hour, end_hour, gap_amount, estimated_cost_waste }
    // estimated_cost_waste = overstaffed_by * avg_hourly_rate * (end_hour - start_hour)

    // STEP 8: EARLY FINISH OFFERS (overstaffed blocks > 1.5 hours waste)
    // For each overstaffed block where estimated_cost_waste > $30:
    //   Find the rostered staff member to offer early finish to:
    //     a) In that time window
    //     b) Lowest performance_score (less critical to operations)
    //     c) If tie: offer to whoever has the most hours this week already (fairness)
    //   
    //   message = "Hi {name}! Tuesday 3-5pm is looking quiet at {business_name}.
    //     Would you like to finish at 3pm instead of 5pm? 
    //     Your weekly pay won't be affected — we'll schedule you extra hours next week 💚"
    //   
    //   If mode='auto': send via Twilio SMS (TWILIO keys all set ✅)
    //   If mode='suggest': create AgentDecision for council/owner approval
    //   
    //   Insert labour_optimisation_actions:
    //     action_type='early_finish_offer', staff_member_id, target_date, hours, message
    //     labour_cost_saving = 2 hours * staff.hourly_rate

    // STEP 9: SHIFT OFFERS (understaffed blocks > 1 hour gap)
    // For each understaffed block:
    //   Find best available staff member:
    //     1. WHERE availability_days CONTAINS dow (they work this day)
    //     2. WHERE (max_hours_per_week - hours_rostered_this_week) >= block_hours
    //     3. WHERE has the required skills (if required_staff_skills not null)
    //     4. RANK BY: performance_score DESC, hourly_rate ASC (best performer at lowest cost)
    //     5. Check: not already rostered in this time window
    //   
    //   If no one found: action_type='understaffed_alert', no SMS, just notification to owner
    //   
    //   If found:
    //   estimated_shift_pay = hourly_rate * block_hours
    //   message = "Hi {name}! A shift is available at {business_name} on {day} {start}–{end}.
    //     Pay: ${estimated_shift_pay} ({hourly_rate}/hr). Reply YES to confirm ✅"
    //   
    //   Send via Twilio if mode='auto'
    //   Insert labour_optimisation_actions

    // STEP 10: REAL-TIME LABOUR % MONITORING
    // This runs regardless of the 14-day forecast work above
    // Query active clocked-in staff:
    //   SELECT SUM((EXTRACT(EPOCH FROM now()) - EXTRACT(EPOCH FROM clock_in)) / 3600 * hourly_rate)
    //   FROM pos_timesheets WHERE clock_out IS NULL AND business_id=X
    // active_cost = result (in dollars, this hour's accumulated labour cost)
    // revenue_today = SUM(pos_sales.total_amount) WHERE created_at > midnight today
    // labour_pct = active_cost / NULLIF(revenue_today, 0) * 100
    //
    // If labour_pct > (config.labour_pct_threshold ?? 38):
    //   Create AgentDecision type='labour_pct_alert':
    //   decision_data.message = "Labour cost is {labour_pct.toFixed(1)}% of today's revenue.
    //     Target: {threshold}%. Currently {N} staff clocked in.
    //     Options: (1) Send 1 staff home early (saves ${hourly_rate}/hr),
    //     (2) Run a flash promotion to increase revenue."
    //   Insert labour_optimisation_actions action_type='labour_pct_alert'

    // STEP 11: WHAT-IF RETROSPECTIVE (runs weekly, Sunday)
    // Compare last week's actual roster vs what agent recommended
    // For each day in last 7 days:
    //   overstaffed_hours = SUM(hours where rostered > required from last week's forecasts)
    //   cost_of_overstaffing = overstaffed_hours * avg_hourly_rate
    //   understaffed_revenue_risk = SUM(adjusted_predicted_revenue WHERE understaffed * 15%)
    //     // Understaffing risks ~15% of forecast revenue (slower service, lost sales)
    // potential_saving = cost_of_overstaffing + understaffed_revenue_risk
    // Store in agent_settings.config.last_week_potential_saving

    // STEP 12: FILL IN ACTUALS FOR YESTERDAY
    // For each labour_demand_forecast WHERE forecast_date = yesterday AND actual_revenue IS NULL:
    //   actual_revenue = SUM(pos_sales.total_amount) WHERE business_id AND date=yesterday AND hour
    //   actual_transactions = COUNT(pos_sales) same
    //   actual_staff_count: from pos_timesheets clocked in during that hour
    //   forecast_accuracy_pct = (1 - abs(predicted-actual)/NULLIF(actual,0)) * 100
    //   UPDATE labour_demand_forecast

    await this.logRun(business_id, result, 'daily_cron')
  }
}
```

## TASK 3 — Daily cron + API routes
Commit: "feat(labour-agent): cron 5am AEST + API routes + roster accuracy tracking"

Create: src/app/api/cron/labour-optimisation/route.ts
Add to vercel.json: { "path": "/api/cron/labour-optimisation", "schedule": "0 19 * * *" }
// 7pm UTC = 5am AEST. Check vercel.json cron count ≤22 before adding.

Handler:
- For each active business: run LabourOptimisationAgent
- Also: fill in actuals for yesterday's forecasts
- Log: businesses processed, actions taken, total potential saving this week

Create: src/app/api/agents/labour/forecast/route.ts
GET: 14-day forecast with gap analysis
Params: ?days=7 (show first 7 of the 14)
Response: {
  forecast: [{date, hours: [{hour, required_staff, rostered_staff, gap, adjusted_revenue}]}],
  gap_summary: {
    total_overstaffed_hours: number,
    total_understaffed_hours: number,
    estimated_cost_waste: number, // from overstaffing
    estimated_revenue_risk: number // from understaffing
  },
  forecast_accuracy_last_week: number // avg accuracy % from last 7 days
}

Create: src/app/api/agents/labour/actions/route.ts
GET: last 30 days of labour_optimisation_actions with staff response status
Response: { actions, pending_responses, accepted_count, declined_count, total_savings_realised }
PATCH /{id}: { staff_response: 'accepted'|'declined' } (when staff responds to SMS)

Create: src/app/api/agents/labour/realtime/route.ts
GET: current labour_pct, active staff count, revenue today
Used by dashboard for the live widget (polling every 5 min)

## TASK 4 — Dashboard widget
Commit: "feat(labour-agent): labour optimisation dashboard section on agents page"

Add "Labour Optimisation" section to /dashboard/agents page.

14-day roster gap chart (recharts BarChart):
  x-axis: 14 days (date labels)
  Each bar = that day's total rostered hours vs required hours
  Green = correct staffing (rostered ≈ required ±10%)
  Red = understaffed (rostered < required - 10%)
  Amber = overstaffed (rostered > required + 10%)
  Clicking a day bar → expands an hourly breakdown below the chart:
    Shows all 24 hours with required_staff, rostered_staff, gap, estimated_revenue and cost

Gap summary cards (below the chart):
  "This week: {overstaffed_hours}h overstaffed · estimated waste: ${cost_waste}"
  "This week: {understaffed_hours}h understaffed · revenue risk: ${revenue_risk}"
  "Potential weekly saving: ${potential_saving}" (if you followed Aria's recommendations)

Live Labour % widget (updated every 5 min via /api/agents/labour/realtime):
  Large percentage number: colour-coded
    < 25%: green "✓ Efficient"
    25-38%: amber "⚡ Monitor"  
    > 38%: red "⚠ Over threshold"
  Below: "{N} staff clocked in · ${cost_so_far} today · ${revenue_today} revenue"
  "Target: {target_pct}% labour cost"

Action queue:
  List of pending SMS offers with staff response status:
  "✉ Early finish offer sent to Jake — Tuesday 3pm. Status: Pending reply"
  "✅ Shift offer accepted by Maria — Thursday lunch 11am-3pm"
  "❌ Shift offer declined by Tom — Monday evening" (greyed out)
  Resend button on pending offers (only if > 4 hours since original)

What-if analysis card:
  "If you'd followed Aria's roster suggestions last week:"
  "${potential_saving} in labour savings"
  "More accurate staffing would have improved service in {N} understaffed hours"

Forecast accuracy tracker:
  "Aria's demand forecasts: {accuracy}% accurate this month"
  Small week-by-week accuracy bar chart
  "Improving as Aria learns your business patterns"

Config section:
  Target labour % threshold: slider 20-50% (default 38%)
  Minimum staff count: number input (default 1)
  Target revenue per staff hour: number input (default $120)
  Operating hours: from/to (e.g. 7am-10pm)
  Enable school holiday adjustments: toggle
  Notify phone for understaffed alerts: phone input

## COMPLETION CHECKLIST
- [ ] 2 new tables with RLS + all indexes
- [ ] 5 new columns on staff_members (with IF NOT EXISTS)
- [ ] lat/lng/state columns on businesses (with IF NOT EXISTS)
- [ ] LabourOptimisationAgent with all 12 steps
- [ ] 14-day hourly forecast using median (not average) for robustness
- [ ] Weather adjustments from Open-Meteo (14-day, no API key)
- [ ] School holidays for all Australian states hardcoded
- [ ] Event adjustments from intelligence_events
- [ ] Staff requirement: rounds to nearest 0.5, respects minimum_staff config
- [ ] Gap analysis: groups CONTIGUOUS hours into blocks (not individual hours)
- [ ] Early finish SMS: sent to lowest-performance-score staff member in overstaffed block
- [ ] Shift offer SMS: sent to best-fit available staff (performance DESC, rate ASC)
- [ ] Real-time labour % monitoring + alert when threshold exceeded
- [ ] What-if retrospective computed weekly
- [ ] Actuals filled in for yesterday's forecasts (forecast accuracy tracking)
- [ ] Cron "0 19 * * *" (5am AEST) within vercel.json ≤22 limit
- [ ] API: forecast with gap summary, actions with responses, realtime
- [ ] Dashboard: 14-day chart with hourly expansion, live % widget, action queue, what-if, config
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

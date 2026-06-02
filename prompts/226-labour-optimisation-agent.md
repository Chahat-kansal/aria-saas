# Prompt 226 — Dynamic Labour Cost Optimisation Agent
# What Deputy Enterprise charges $15k+/year for.
# ENV: TWILIO (set ✅) for shift offer SMS. Open-Meteo weather (FREE, no key).

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

## EXISTING TABLES
pos_timesheets: id, business_id, staff_member_id, clock_in, clock_out, pay_rate_cents (verify column name), hours_worked
staff_members: id, business_id, name, role, email, phone — check actual columns before using

## WHAT THIS AGENT DOES
Runs daily at 5am. Builds a 14-day hourly demand forecast using historical POS data,
weather, school holidays, and events. Identifies overstaffed and understaffed windows.
Sends early-finish offers to overstaffed staff. Finds and offers shifts to understaffed windows.
Monitors real-time labour % and alerts when threshold is breached.

## TASK 1 — DB migrations
Commit: "feat(labour-agent): DB migrations — demand forecast + optimisation actions"

```sql
CREATE TABLE IF NOT EXISTS labour_demand_forecast (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  forecast_date date NOT NULL,
  hour_of_day integer NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  predicted_transactions integer DEFAULT 0,
  predicted_revenue numeric DEFAULT 0,
  weather_adjustment_pct numeric DEFAULT 0,
  event_adjustment_pct numeric DEFAULT 0,
  school_holiday_adjustment_pct numeric DEFAULT 0,
  adjusted_predicted_revenue numeric DEFAULT 0,
  required_staff_count numeric DEFAULT 0,
  required_staff_skills text[],
  optimal_labour_cost numeric DEFAULT 0,
  actual_transactions integer,
  actual_revenue numeric,
  actual_staff_count numeric,
  actual_labour_cost numeric,
  forecast_accuracy_pct numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, forecast_date, hour_of_day)
);
ALTER TABLE labour_demand_forecast ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_forecast" ON labour_demand_forecast
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON labour_demand_forecast (business_id, forecast_date, hour_of_day);

CREATE TABLE IF NOT EXISTS labour_optimisation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'early_finish_offer','shift_offer','labour_pct_alert','understaffed_alert','roster_suggestion'
  )),
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  target_date date NOT NULL,
  target_hour_start integer,
  target_hour_end integer,
  message_sent text,
  staff_response text CHECK (staff_response IN ('accepted','declined','no_response','pending')),
  responded_at timestamptz,
  labour_cost_saving numeric DEFAULT 0,
  executed_at timestamptz DEFAULT now()
);
ALTER TABLE labour_optimisation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_labour_actions" ON labour_optimisation_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Add missing columns to staff_members if not present
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 25;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS availability_days integer[] DEFAULT '{0,1,2,3,4,5,6}';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS max_hours_per_week numeric DEFAULT 38;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS performance_score numeric DEFAULT 0.7;
```

## TASK 2 — LabourOptimisationAgent class
Commit: "feat(labour-agent): LabourOptimisationAgent — 14-day forecast + gap analysis + actions"

Create: src/lib/agents/labour-optimisation-agent.ts (AgentType: 'labour_optimisation')

run(business_id):
1. 14-DAY HOURLY FORECAST: for each of next 14 days, for each hour 0-23:
   baseline_revenue = PERCENTILE_CONT(0.5) of last 12 matching DOW+hour from pos_sales
   baseline_transactions = same
   Weather: Open-Meteo 14-day forecast (lat/lng from businesses table, default Sydney if null)
     weathercode >= 61: -15% | >= 80: -25% | 0: +5%
   School holidays (VIC 2026 hardcoded from prompt 218): +20% for cafe/retail
   Event: query intelligence_events WHERE event_type='local_event' AND event_date=this_date → +15-50%
   adjusted_revenue = baseline * (1 + all_adjustments)
   required_staff = adjusted_revenue / target_revenue_per_staff_hour (default $120, from config)
   Minimum staff from agent_settings.config.minimum_staff (default 1)
   Upsert labour_demand_forecast

2. FETCH ROSTER: query pos_timesheets WHERE clock_in BETWEEN now() AND now()+14d
   Build: rostered_hours[date][hour] = { staff_count, cost, staff[] }

3. GAP ANALYSIS per hour:
   overstaffed_by = rostered - required (if positive)
   understaffed_by = required - rostered (if positive)
   Group contiguous overstaffed/understaffed blocks
   overstaffed_cost_waste = overstaffed_by * avg_hourly_rate * block_hours

4. EARLY FINISH OFFERS for overstaffed blocks:
   Find rostered staff member with lowest performance_score for that window
   Message: "Hi {name}, looks quiet {day} {time}. Finish at {earlier_time} instead? Same weekly pay."
   If mode=auto: send via Twilio. Else: AgentDecision.

5. SHIFT OFFERS for understaffed blocks:
   Find available staff: availability_days contains dow AND remaining weekly hours >= block_hours
   Rank by performance_score DESC, hourly_rate ASC
   Message: "Hi {name}, shift available {day} {start}-{end}. $X/hr. Reply YES to confirm."

6. REAL-TIME LABOUR % MONITORING:
   active_cost = SUM((now()-clock_in) * hourly_rate) WHERE clock_out IS NULL
   revenue_today = SUM(pos_sales.total_amount WHERE created_at > midnight today)
   labour_pct = active_cost / NULLIF(revenue_today, 0) * 100
   If labour_pct > config.labour_pct_threshold (default 38%):
     AgentDecision type='labour_pct_alert': "Labour cost is {pct}% of revenue. Target: {threshold}%."

7. WHAT-IF ANALYSIS: compare last week actual vs agent recommendations
   potential_saving = SUM(overstaffed_cost_waste for last 7 days)

8. Fill actual_* columns on labour_demand_forecast for yesterday

## TASK 3 — Cron + API routes + Dashboard
Commit: "feat(labour-agent): cron 5am + API routes + dashboard widget"

Cron: "0 19 * * *" (7pm UTC = 5am AEST)
GET /api/agents/labour/forecast → 14-day forecast with gap summary
GET /api/agents/labour/actions → last 30 days of actions with responses

Dashboard "Labour Optimisation" section:
- 14-day stacked bar chart: required_staff vs rostered_staff per day
  Green = correct, Red = understaffed, Amber = overstaffed
  Click bar → hour-by-hour breakdown
- Gap summary: "This week: 12h overstaffed ($340 waste) | 3h understaffed (risk)"
- Live labour % widget (updates every 5 min): large % number, green/amber/red
- Action queue: pending shift/early-finish offers with staff responses
- What-if: "Following Aria's roster last week: saved $340"
- Config: target labour %, minimum staff, target revenue per staff hour

## COMPLETION CHECKLIST
- [ ] 2 tables + 5 new columns on staff_members
- [ ] 14-day hourly forecast with weather + school holiday + event adjustments
- [ ] Gap analysis identifies overstaffed + understaffed contiguous blocks
- [ ] Early finish SMS to correct staff member
- [ ] Open shift SMS to best-fit available staff
- [ ] Real-time labour % alert when threshold breached
- [ ] What-if retrospective computed
- [ ] Cron daily 5am AEST, forecast accuracy tracked
- [ ] Dashboard: 14-day chart, live %, action queue, what-if
- [ ] npx tsc --noEmit + npm run build pass
State "Build verified green, all commits pushed." when done.

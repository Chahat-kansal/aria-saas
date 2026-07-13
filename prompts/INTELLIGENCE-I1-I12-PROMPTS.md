======================================================================
INTELLIGENCE I1–I12 — SINGLE MERGED PROMPT FILE (15 Jun 2026)
Combined from intelligence-12-sprints.html + intelligence-rewire-grounded.html
Corrected prompts used where the rewrite doc supersedes. Run top to bottom.
======================================================================

LIVE-RECONCILED BY CLAUDE TODAY — key corrections baked in:
• POS-RPC-FIX-1: only increment_customer_stats + increment_session_total are ABSENT.
  decrement_stock_quantity + increment_numeric now EXIST — do NOT recreate them.
• I3 uses I3-REWIRE (re-adds the wrongly-dropped 'pattern' CHECK widen).
• I1✅ I2✅ already done this session — included for completeness, skip if done.

######################################################################
# UNIVERSAL VERIFY-OR-HALT PREFLIGHT — prepend to EVERY sprint below
######################################################################
PREFLIGHT — run BEFORE writing any code. Each query is ONE statement (multi-statement returns only
the LAST result set — do not infer "empty" from missing output). Paste every result verbatim in the report.

1. pwd  →  must be  C:\Users\kansa\aria-saas-audit
2. git log origin/main..HEAD --oneline   (know what's already stacked)
3. For EVERY table this sprint WRITES, run separately and confirm each column + CHECK value the build uses:
     select column_name, data_type from information_schema.columns
       where table_schema='public' and table_name='' order by ordinal_position;
     select pg_get_constraintdef(oid) from pg_constraint
       where conrelid=''::regclass and contype='c';
4. For EVERY RPC this sprint CALLS:
     select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='';
   Empty result = ABSENT = HALT and report (do not write code that calls a missing RPC).
5. HALT CONDITION: if any column is missing, any literal you will insert is not in the CHECK array, or any
   RPC is absent → STOP, report the mismatch, do NOT build. Fix the schema in a migration first (additive).
RULE 7: the live DB wins over database.types.ts, over memory, and over this doc if they ever disagree.

######################################################################
# STEP 0 — POS-RPC-FIX-1  (RUN FIRST — real silent production bug)
# CORRECTED: create ONLY the 2 absent RPCs; HALT on the 2 now present.
######################################################################
# POS-RPC-FIX-1 — restore missing POS side-effect RPCs. CODE+MIGRATION. SOLO. RULE 0.

PREFLIGHT (universal block) + confirm ABSENT: decrement_stock_quantity, increment_numeric,
increment_customer_stats, increment_session_total. Confirm PRESENT: increment_loyalty_points.

INVESTIGATE (quote, don't guess):
1. grep -rn "\.rpc('" src — list every call to the 4 absent RPCs + the args each passes.
2. For each: read the calling code, determine the exact table+column the RPC must mutate
   (e.g. decrement_stock_quantity → pos_products.stock_quantity; increment_numeric → generic col+amount).
3. Check git history / supabase/migrations for any dropped or never-applied definition.

BUILD (additive migration, one function per RPC, matching the call signatures EXACTLY):
- Recreate each as a SQL/plpgsql function with the parameter names the code already passes.
- Each must be idempotent-safe and guard nulls. decrement must not drive stock below 0 (clamp + log).
- Add .error checks at each call site (rule 11) so a future missing RPC fails loud, not silent.

VERIFY LIVE (mandatory): run one real POS sale for Sip → confirm stock_quantity decremented,
customer stats + session total updated. Report before/after numbers.

GATE: tsc 0 + build pass · ≤22 fns · migration applied to DB · ONE commit fix(pos-rpc). STOP before push.
DO NOT: rename existing columns, change the call signatures, or touch the loyalty RPC (it exists).

######################################################################
# I1 HEALTH-SIGNALS  [FOUNDATION] ✅ DONE THIS SESSION — skip
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I1 HEALTH-SIGNALS-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.

WHY (from audit):
The 07:54 AM AEST test (after V2 deployed) still said "POS payment sync is broken" — because Aria's context contained no diagnostic facts about POS health. V2 stripped 22 fabricated numbers but couldn't strip qualitative inferences. The fix is not a prompt rule — it's adding facts.

AUDIT FINDINGS:
- aria_wiring_health_checks.payments_coverage_pct ALREADY computes payment coverage daily (48 rows, last 2026-06-13 05:00)
- aria_signal_cache.day_of_week_pattern ALREADY caches dow baselines (3 rows; needs expansion to all 16 businesses)
- aria_signal_cache.revenue_velocity_7d / churn_velocity / avg_basket_trend ALREADY exist (16 rows each)
- pos_sales canonical: status='completed', total_amount in dollars, created_at AEST conversion
- weather: NO existing table. aria_signal_cache has no weather signal_type yet.

PRE-FLIGHT (mandatory verbatim quotes in report):
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read src/app/api/aria/ask/route.ts: quote groundTruth construction site (V2 expanded it)
3. Read src/lib/aria/council.ts: quote where advisor input context is assembled
4. Confirm logAICallSafe import from LOGGING-AUDIT-3
5. Confirm wh_payments_coverage RPC signature via Supabase tool (AUTOPILOT-FIX-1 fixed it)
6. List aria_signal_cache rows: chat-Claude confirms which signal_types exist for businessId

BUILD (additive only):

PART 1 — src/lib/aria/health-signals.ts (NEW)
Export computeHealthSignals(businessId): Promise<HealthSignals>

Read from existing tables (DO NOT recompute what's already there):
- pos_health: 
  - payment_coverage_pct: SELECT * FROM wh_payments_coverage(businessId, now() - interval '7 days')
  - last_sale_at: SELECT max(created_at) FROM pos_sales WHERE business_id=? AND status='completed'
  - last_sync_at: SELECT max(checked_at) FROM aria_wiring_health_checks WHERE business_id=? AND check_name='payments_coverage_pct'
  - status logic:
    - OK: coverage >= 95% AND completed_count >= 5 AND last_sale_at within 48h
    - DEGRADED: coverage = 10 (matches AUTOPILOT-FIX-1 baseline)
    - INSUFFICIENT_SAMPLE: completed_count  now()
  - If miss: compute via SQL avg per dow last 56 days, write to cache with 24h TTL
  - Surface: today_dow_name, today_baseline_avg, today_baseline_rank (1=best, 7=worst), actual_today, deviation_pct

- weather_context:
  - First: SELECT payload FROM aria_signal_cache WHERE business_id=? AND signal_type='weather_today' AND expires_at > now()
  - If miss: fetch via open-meteo provider (free, already in provider CHECK list as 'open-meteo'), write to cache 6h TTL
  - businesses.lat + lng required (verify column existence in pre-flight)
  - If lat/lng null: return { available: false, reason: 'no_location' }
  - Surface: conditions_today_text, temp_c, rain_pct, historical_revenue_on_similar_days (compute from pos_sales + cached weather history)

- data_freshness:
  - last_pos_sync_at, last_action_executed_at, stale_signal_count (signal_cache rows past expires_at)
  - reasoning: human-readable

- known_unknowns: string[] (ALWAYS included; this IS the architecture's honesty)
  - "Whether the shop was physically open today"
  - "Whether staff were present"
  - "Whether there was a local event/closure/disruption"
  - "Whether a payment provider had an outage today"
  - "Whether marketing/promo was running"
  - "Whether private events / catering / wholesale moved revenue off-POS"

Return shape:
{ pos_health, dow_context, weather_context, data_freshness, known_unknowns, computed_at }

PART 2 — Surface to groundTruth (in src/app/api/aria/ask/route.ts)
- Call computeHealthSignals(businessId) once during groundTruth construction
- Add groundTruth.business_health = result
- Push every numeric value (payment_coverage_pct, today_baseline_avg, deviation_pct, temp_c) into _anchor_values so V2 Check 6 can validate them when synthesis cites them

PART 3 — Pass to advisors AND synthesis (in src/lib/aria/council.ts)
- Include groundTruth.business_health in each advisor's input
- Include in synthesis input
- In advisor prompt template ADD ONE fact-pointer line (NOT a rule — RULE 9):
    "DIAGNOSTIC_FACTS: The user's verifiable system state is in business_health. 
    Reason from these facts. known_unknowns lists what cannot be verified — frame those as questions."
- Do NOT script "ask vs assert" — let the facts make wrong claims structurally inconsistent

PART 4 — Log via logAICallSafe
For every call to computeHealthSignals, write ONE row:
  agent_key: 'health_signals', role: 'analysis', provider: 'other'
  request_summary: businessId
  response_summary: JSON.stringify({ pos_status, dow_rank, weather_available }).slice(0, 200)

BUILD GATE:
- npx tsc --noEmit → 0 errors
- npm run build → PASS
- ONE commit: feat(i1-health-signals): diagnostic facts in groundTruth, no prompt rules
- STOP before push. Report includes verbatim pre-flight quotes + sample healthSignals for Sip + confirmation Parts 1-4 are additive + the ONE advisor prompt line shown verbatim.

VERIFY POST-DEPLOY (chat-Claude SQL):
1. select * from aria_ai_calls where agent_key='health_signals' and business_id='ff5055a0-c351-4ada-817a-1804961035f3' and created_at > now() - interval '5 minutes';
   PASS: row appears with pos_status, dow_rank, weather_available in response_summary
2. Fresh chat "how am I doing this week?":
   - NO "POS payment sync is broken" stated as fact (pos_health.status='OK' in context)
   - Aria states "POS is healthy (100% coverage, last sale Xh ago)" or asks about known_unknowns
   - dow context surfaces: "Tuesday baseline $327, today's $7 still N% below" — using fact, not invention

DO NOT:
- Do not add prompt rules telling Aria how to phrase ("ask, don't assert")
- Do not strip qualitative claims downstream
- Do not modify any other advisor system prompt beyond ONE fact-pointer line
- Do not block on weather if lat/lng missing — mark unavailable
- No new npm dependencies

######################################################################
# I2 GOAL-AWARE  [FOUNDATION] ✅ DONE THIS SESSION — skip
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I2 GOAL-AWARE-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I1 HEALTH-SIGNALS deployed (groundTruth shape established).

WHY (from audit):
businesses.weekly_revenue_target column ALREADY exists. Today Aria mentions it occasionally. Smarter: every recommendation framed against goal trajectory. Owner feels accountability + Aria becomes coach, not analyst.

AUDIT FINDINGS:
- businesses.weekly_revenue_target: numeric column, exists
- pos_sales: total_amount, status='completed' — canonical revenue source
- Tonight's WEEK-1 + SWLM-1 already compute revenue_this_week_calendar + same_week_last_month
- aria_actions.expected_impact already exists per recommendation

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read I1 health-signals.ts — confirm pattern
3. Quote groundTruth construction site verbatim (post-I1)
4. SELECT business_id, weekly_revenue_target FROM businesses WHERE weekly_revenue_target IS NOT NULL — chat-Claude lists which have targets set

BUILD (additive):

PART 1 — src/lib/aria/goal-context.ts (NEW)
Export computeGoalContext(businessId): Promise<GoalContext>

Shape:
{
  weekly_target: number | null,   // from businesses.weekly_revenue_target
  revenue_this_week: number,      // from WEEK-1 calculation
  days_remaining_in_week: number, // 0-6 based on AEST
  projected_eow_revenue: number,  // linear extrapolation; cap at 2× current_pace if days = 110
- on_track: on_track_pct in [90, 110)
- behind: on_track_pct in [70, 90)
- critical: on_track_pct  now() - interval '5 minutes';

DO NOT:
- Do not invent a default target if column is null
- Do not change projection math without documenting (linear vs dow_weighted)
- Do not modify any advisor prompt beyond ONE line in synthesis input
- Do not change businesses table schema

######################################################################
# I3 PATTERN-MEMORY  [FOUNDATION]
######################################################################
>>> USE THE CORRECTED I3-REWIRE (supersedes original I3) <<<
# I3-REWIRE — make pattern-memory actually write. CODE+MIGRATION. SOLO. RULE 0 (extend CHECK, never narrow).

PREFLIGHT (universal) for table aria_business_memory — confirm live:
  kind CHECK   = [preference,fact,tried,decision,concern,goal]   (no 'pattern' yet)
  source_type CHECK = [conversation,action_outcome,signal,manual]
  columns include source_type + source_id ; there is NO 'source' column.

BUILD:
PART 1 — migration (additive widen, never drop-and-replace with a subset):
  ALTER TABLE aria_business_memory DROP CONSTRAINT aria_business_memory_kind_check;
  ALTER TABLE aria_business_memory ADD  CONSTRAINT aria_business_memory_kind_check
    CHECK (kind = ANY (ARRAY['preference','fact','tried','decision','concern','goal','pattern']));
  -- enumerate ALL 6 existing values + 'pattern'. Verify in pg_constraint after apply.

PART 2 — fix the detector/cron insert (pattern-detection.ts + cron/pattern-memory):
  kind='pattern'  ✓ (now valid)
  source_type='signal'   (valid existing value — patterns are signal-derived)
  source_id=null   notes/topic as before.  REMOVE any  source:'pattern_detector'  field (no such column).
  Keep superseded_by + is_active flow. Confidence ≥ 0.6 gate unchanged.

VERIFY LIVE (mandatory): apply migration → trigger cron with Bearer $CRON_SECRET →
  select kind,source_type,topic from aria_business_memory where kind='pattern' and business_id='ff5055a0-...';
  PASS = rows present (was 0 before). Recall "DATA PATTERNS" line now populates.

GATE: tsc 0 + build pass · migration applied · ONE commit fix(i3-rewire). STOP before push.
DO NOT: re-drop the migration. Do not add 'pattern_detector' to source_type. Do not write a 'source' column.

######################################################################
# I4 OUTCOME-LOOP  [WIRING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I4 OUTCOME-LOOP-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I1 HEALTH-SIGNALS deployed.

WHY (from audit):
- aria_outcomes table EXISTS with full schema (recommendation_type, acted_on, outcome_7d_cents, outcome_30d_cents, outcome_verdict, category, advice_weight_delta) — 6 rows, ZERO acted_on, ZERO verdicts
- aria_advice_weights table EXISTS with full schema (business_id, category, weight, positive/negative/neutral_outcomes, last_updated_at) — 0 rows
- outcome-check cron EXISTS — 27 runs, all status NOT 'success'
- aria_hypotheses has 1653 rows generated nightly, ZERO accepted, ZERO outcome_verdicts

This is the most underutilized intelligence asset in the entire codebase. The infrastructure is fully built. The wiring is missing.

PRE-FLIGHT (mandatory, exhaustive):
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. grep -rn "aria_outcomes\|aria_advice_weights" src --include="*.ts" — find every existing reference. PASTE VERBATIM. Document who writes / who reads.
3. Find src/app/api/cron/outcome-check/route.ts (or similar). Quote its current body. Document why it's failing (likely empty due to filters or bug).
4. Find where aria_actions.status transitions to 'executed' — that's the trigger point for outcome creation.
5. grep -rn "hypothesis" src/app/api/cron — find aria_hypotheses generator. Document its outcome-check logic if any.
6. Verify CHECK constraints on aria_outcomes.outcome_verdict and aria_outcomes.category (chat-Claude pulls)

BUILD (additive only):

PART 1 — Wire aria_actions.status='executed' → aria_outcomes insert
Find the action-execution endpoint (likely src/app/api/aria/actions/[id]/execute/route.ts or similar). After status update:
  INSERT INTO aria_outcomes (
    business_id, recommendation_type, recommendation_detail, recommended_at,
    acted_on=true, acted_on_at=now(), action_id, category, baseline_metric_cents
  ) VALUES (...)
- recommendation_type from aria_actions.category
- baseline_metric_cents: snapshot revenue last 7 days × 100 (so post-execution delta is computable)

PART 2 — Fix outcome-check cron
src/app/api/cron/outcome-check/route.ts (FIX existing, don't recreate):
- For each aria_outcomes WHERE acted_on=true AND outcome_verdict IS NULL:
  · If acted_on_at  baseline × 0.05, 'negative' if < -0.05 of baseline, 'neutral' otherwise
  · UPDATE aria_outcomes SET ... outcome_checked_at = now()
- Gate via SEC-1 CRON_SECRET
- Log via logAICallSafe agent_key='outcome_check' role='analysis' provider='other'

PART 3 — Wire aria_outcomes → aria_advice_weights
After each outcome_verdict update, UPDATE aria_advice_weights:
- If row exists for (business_id, category): increment positive/negative/neutral_outcomes; recompute weight via Laplace smoothing:
    weight = (positive + 1) / (positive + negative + neutral + 3)
- If row doesn't exist: INSERT initial row with the verdict counter set to 1
- This is the per-business per-category confidence multiplier the table comment promised

PART 4 — Surface aria_advice_weights to groundTruth
In src/app/api/aria/ask/route.ts (after I1 + I2):
- Read aria_advice_weights for current businessId
- Add to groundTruth.advice_weights = [{ category, weight, total_outcomes }]
- Synthesis can now reason: "I'm less confident about pricing changes for you because past pricing recommendations had weight=0.4"

PART 5 — Hypothesis outcome closure
Extend the outcome-check cron: for aria_hypotheses WHERE action_id IS NOT NULL AND outcome_checked_at IS NULL:
- Same 7d/30d computation against baseline_metric_cents
- Update outcome_verdict, outcome_checked_at
- This finally closes the 1653-row hypothesis loop

BUILD GATE:
- tsc 0 + build PASS · daily-max cron · function count ≤22
- ONE commit feat(i4-outcome-loop): wire aria_outcomes + aria_advice_weights + hypothesis closure
- STOP. Report MUST include:
  - Verbatim grep output of every existing reference to outcome tables
  - Diff of outcome-check cron (before vs after)
  - Confirmation no schema changes (additive ONLY to existing tables via inserts/updates)
  - Sample weight calculation showing Laplace smoothing

VERIFY POST-DEPLOY:
1. Execute one aria_action (chat-Claude updates status='executed' manually for a test action)
2. SQL: select * from aria_outcomes where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and acted_on=true;
   PASS: row exists with baseline_metric_cents set
3. Wait 7 days (or use chat-Claude to backdate acted_on_at to 8 days ago for test): cron sets outcome_verdict
4. SQL: select category, weight, positive_outcomes from aria_advice_weights where business_id='ff5055a0-c351-4ada-817a-1804961035f3';
   PASS: row exists with weight ≠ NULL
5. Fresh chat: groundTruth.advice_weights surfaces in context

DO NOT:
- Do not create new tables (everything exists)
- Do not modify existing aria_outcomes / aria_advice_weights schema
- Do not write outcome_verdict before 7d elapsed (statistical floor)
- Do not bypass SEC-1 CRON_SECRET

######################################################################
# I5 PLAN-PERSISTENCE  [WIRING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I5 PLAN-PERSISTENCE-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I4 OUTCOME-LOOP deployed.

WHY (from audit):
Aria suggests "test smoothie bundle" 3 weeks ago. Next chat: completely forgotten. Owner feels unseen. Aria misses outcome data point. With I4 wiring outcomes, this sprint surfaces the follow-up in conversation.

AUDIT FINDINGS:
- aria_actions has 434 rows with status field (pending, executed, dismissed, expired)
- aria_action_log: 7 rows of executed actions with before/after state
- aria_outcomes (post-I4): outcome_verdict populated after 7d/30d
- Currently NO chat surface for "you tried X last week — how did it go?"

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read I1 + I4 groundTruth additions
3. Find where ask_suggestions are generated (post-response follow-up questions). Quote signature.
4. SELECT count(*) from aria_actions where status='executed' GROUP BY business_id — chat-Claude pulls

BUILD (additive):

PART 1 — Open-loop detection
src/lib/aria/open-loops.ts (NEW)
Export getOpenLoops(businessId): Promise<OpenLoop[]>

Returns aria_actions WHERE status='executed' AND executed_by_user_id IS NOT NULL AND updated_at > now() - interval '60 days' AND id NOT IN (SELECT action_id FROM aria_outcomes WHERE acted_on=true)

Each open loop:
{
  action_id, title, executed_at, days_since_executed,
  baseline_revenue, current_revenue, observed_delta,
  outcome_status: 'too_soon' (< 7d) | 'ready_to_review' (≥ 7d) | 'closed' (verdict set)
}

PART 2 — Surface to groundTruth
groundTruth.open_loops = getOpenLoops(businessId) limited to 5 most recent

PART 3 — Add fact-pointer line to synthesis prompt (NOT a rule)
"OPEN_LOOPS: actions the owner executed but Aria hasn't followed up on. 
If outcome_status='ready_to_review', ASK about the result naturally in your response — 
this is data that helps you give better future advice."

PART 4 — Surface in ask_suggestions
The post-response suggestion generator (existing) gains awareness:
If groundTruth.open_loops has any with status='ready_to_review':
- Add suggestion: "How did [action title] work out?"
- When owner clicks: opens chat with that question → user response feeds aria_outcomes.notes

PART 5 — Owner-provided outcome route
src/app/api/aria/actions/[id]/outcome/route.ts (NEW, optional, owner-driven)
- POST with body { worked: boolean, notes: string }
- Updates aria_outcomes: acted_on_at if missing, outcome_verdict if owner indicates, notes
- This is the OWNER override of the cron's automatic 7d verdict

PART 6 — Log
logAICallSafe agent_key='open_loops' role='analysis' provider='other'
response_summary: JSON.stringify({ open_count, ready_to_review_count }).slice(0, 200)

BUILD GATE: tsc 0 + build PASS · ONE commit feat(i5-plan-persistence) · STOP.

VERIFY POST-DEPLOY:
1. chat-Claude sets one Sip aria_actions to status='executed' with executed_at = 10 days ago
2. Fresh chat "how am I doing this week?": 
   - Aria naturally asks "Last week you tried [X] — how did it go?" 
3. Owner replies "Yeah it worked great" or similar
4. SQL: select notes, outcome_verdict from aria_outcomes where action_id='<id>';
   PASS: notes populated, possibly verdict='positive' if owner used positive language
5. ask_suggestions includes the open loop as a clickable follow-up

DO NOT:
- Do not push open loops if outcome_status='too_soon' (statistical floor)
- Do not interrupt main question with open loop — surface in CONTEXT or ask_suggestions only
- Do not auto-set verdict from owner's notes — only if explicit positive/negative
- Do not modify aria_actions schema

######################################################################
# I6 INDUSTRY-KNOWLEDGE  [WIRING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I6 INDUSTRY-KNOWLEDGE-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.

WHY (from audit):
aria_skills has 12 rows: Accountant, Compliance officer, Growth advisor, HR coach, Inventory expert, Marketing strategist — each with rich system_prompt_addition (e.g. "Act as the business owner's accountant. Focus on cash flow, expenses, GST (10%), BAS lodgement..."). ALL CURRENTLY DISABLED (enabled=false). Industries (cafe/gym/realestate/retail/tradie/visa/warehouse) exist on businesses but skills don't filter by them.

This sprint:
1. Enables skills for owners by default
2. Adds industry-aware filtering
3. Wires skill.system_prompt_addition into council advisor selection

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. grep -rn "aria_skills" src --include="*.ts" — find existing references
3. Confirm businesses.industry values via SQL (cafe/gym/realestate/retail/tradie/visa/warehouse)
4. Read council.ts advisor invocation site to find injection point

BUILD (additive):

PART 1 — Migration (chat-Claude applies)
ALTER TABLE aria_skills ADD COLUMN IF NOT EXISTS industries text[] DEFAULT NULL;
-- NULL means applies to all industries
-- Populate built-in skills with industry hints (one-time UPDATE in migration):
UPDATE aria_skills SET industries = NULL WHERE built_in=true AND name IN ('Accountant', 'Compliance officer', 'HR coach'); -- universal
UPDATE aria_skills SET industries = ARRAY['cafe','retail','gym','tradie','warehouse'] WHERE built_in=true AND name = 'Inventory expert';
UPDATE aria_skills SET industries = ARRAY['cafe','retail','gym','realestate'] WHERE built_in=true AND name = 'Marketing strategist';
UPDATE aria_skills SET industries = ARRAY['cafe','retail','gym','tradie','realestate'] WHERE built_in=true AND name = 'Growth advisor';

PART 2 — Activation: bulk enable for relevant industries
UPDATE aria_skills SET enabled = true 
WHERE built_in = true 
  AND (industries IS NULL OR industries && ARRAY[(SELECT industry FROM businesses WHERE id = aria_skills.business_id)]);

(Note: built-in skills have business_id NULL probably; if so, need a different activation mechanism)

PART 3 — Council advisor skill injection
src/lib/aria/council.ts: at advisor invocation:
- Fetch active aria_skills for business: SELECT name, system_prompt_addition FROM aria_skills WHERE (business_id = ? OR business_id IS NULL) AND enabled=true AND (industries IS NULL OR ? = ANY(industries))
- Inject relevant skill's system_prompt_addition based on advisor role:
  - council_growth → Growth advisor + Marketing strategist
  - council_risk → Compliance officer + Accountant
  - council_strategy → Growth advisor
  - council_context → Inventory expert + HR coach
- Concatenate up to 2 skills per advisor

PART 4 — Settings UI surface (optional, additive)
src/app/dashboard/settings/skills/page.tsx (NEW or extend existing)
- List all aria_skills available for this business industry
- Toggle enabled per skill
- Owner control

PART 5 — Log skill usage
logAICallSafe row when skill is injected:
  agent_key: 'skill_inject', role: 'classify', provider: 'other'
  response_summary: JSON.stringify({ advisor, skills_injected: [name1, name2] }).slice(0, 200)

BUILD GATE: tsc 0 + build PASS · ONE commit feat(i6-industry-knowledge) · STOP.

VERIFY POST-DEPLOY:
1. Apply migration (chat-Claude)
2. SQL: select name, industries, enabled from aria_skills order by name;
   PASS: industries column populated, some skills enabled
3. Fresh chat for Sip (industry='cafe') asking growth question:
   - Aria's response shows Growth advisor + Marketing strategist style (specific terminology like "AOV", "table turn", "cover count")
4. SQL: select agent_key, response_summary from aria_ai_calls 
   where agent_key='skill_inject' and business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   and created_at > now() - interval '5 minutes';
   PASS: skills_injected array populated

DO NOT:
- Do not delete any aria_skills row
- Do not modify system_prompt_addition content (just enable)
- Do not inject more than 2 skills per advisor (prompt bloat)
- Do not skip the owner-toggleable UI affordance

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I6 — original intent stands (enable personas by industry, surface system_prompt_addition into advisor prompts).
# CORRECTION: aria_skills columns = name, icon, description, system_prompt_addition, built_in, enabled, business_id.
#   NO industry column. So:
PREFLIGHT add: select column_name from information_schema.columns where table_name='aria_skills';
  → confirm no 'industry' col; confirm businesses.industry EXISTS and is populated for test businesses.
BUILD: map industry→skill via an explicit code constant (INDUSTRY_SKILLS: Record),
  set enabled=true where business matches. Do NOT assume aria_skills.industry. Gate: if businesses.industry
  is null, enable only built_in=true general skills (no hollow enable).
Everything else (surfacing system_prompt_addition into the 4 advisors) unchanged.

######################################################################
# I7 TOOL-USE  [REASONING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I7 TOOL-USE-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I1 + I2 + I4 + I5 deployed (groundTruth is solid first).

WHY (from audit):
Today Aria gets ALL context upfront in groundTruth (15+ anchors, business memory, signal cache, health signals, goal context, open loops). Token-heavy and rigid. Aria can't decide "I need to look at the last 10 sales to answer this specific question."

Anthropic SDK supports tool_use mode natively. Existing agent_key 'product_lookup' (single fire June 13) proves the pattern works. This sprint formalizes it across 5 read-only tools.

PRE-FLIGHT (mandatory):
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read existing /api/aria/ask/route.ts model invocation. Quote the Anthropic SDK call signature.
3. grep -rn "tools:\|tool_use\|tool_choice" src — find any existing tool definitions
4. Find product_lookup implementation (single use). Quote its tool definition signature.
5. Read AUTOPILOT-FIX-1's verifyBusinessAccess pattern from SEC-2 — every tool must use this

BUILD (additive):

PART 1 — Tool definitions
src/lib/aria/tools/ (NEW directory)

Five tools, each a separate file:
1. query_pos_sales.ts — input: { hours_back: 1-720, group_by?: 'hour'|'day'|'item', limit?: 1-100 }
2. query_pos_products.ts — input: { search?: string, low_stock_only?: boolean, limit?: 1-50 }
3. query_customers.ts — input: { sort_by?: 'lifetime_value'|'recency'|'frequency', has_consent?: boolean, limit?: 1-50 }
4. query_inventory.ts — input: { product_id?: uuid, low_stock_threshold?: number, limit?: 1-50 }
5. query_calendar.ts — input: { days_ahead?: 1-90 } (queries business_hours + bookings + staff_leave)

Each tool:
- Takes businessId + input
- VERIFIES via SEC-2 verifyBusinessAccess pattern
- Returns structured JSON limited to safe row count
- Logs to aria_ai_calls via logAICallSafe (agent_key: tool name, role: 'data', provider: 'other')
- NEVER WRITES — read-only

PART 2 — Anthropic SDK integration
src/lib/aria/tools/index.ts:
- Export TOOLS array in Anthropic tool definition format (name, description, input_schema as JSON Schema)
- Export executeTool(toolName, input, businessId) — dispatches to handler

PART 3 — Wire to /api/aria/ask
- Add tools: TOOLS to the model call
- Loop on response.stop_reason:
  - if 'tool_use': execute the tool, append result, recall model
  - if 'end_turn': break
- Cap iterations at 4 (prevent runaway loops; AUTOPILOT-FIX-1 small-sample logic for safety)
- Log each tool call: agent_key='tool_call:<tool_name>', role='data'

PART 4 — Tool result validation
Tool results contain numbers that may end up in synthesis. Push every tool result into _anchor_values so V2 Check 6 can validate citations.

PART 5 — Add SHORT fact-pointer to synthesis prompt
"AVAILABLE_TOOLS: You can call query_pos_sales, query_pos_products, query_customers, 
query_inventory, query_calendar if you need fresh data beyond the upfront context. 
Each tool reads only the user's business data."

BUILD GATE: tsc 0 + build PASS · function count ≤22 · ONE commit feat(i7-tool-use) · STOP.

VERIFY POST-DEPLOY:
1. Fresh chat "How many flat whites did I sell yesterday?"
   - Aria triggers tool_use: query_pos_sales({ hours_back: 24, group_by: 'item' })
2. SQL: select agent_key, request_summary, response_summary 
   from aria_ai_calls 
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   and agent_key like 'tool_call:%' 
   and created_at > now() - interval '5 minutes';
   PASS: tool_call rows appear
3. Aria's response cites the tool result number, V2 Check 6 validates it against _anchor_values

DO NOT:
- Tools NEVER write to any table
- Cap iterations at 4 (prevent runaway)
- Verify business membership via SEC-2 every call
- Do not expose other businesses' data (RLS + verifyBusinessAccess both required)
- No filesystem / network access tools
- No new npm dependencies beyond what Anthropic SDK already provides

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I7 — original stands. ADD to preflight: for each of the 5 tools (query_pos_sales / products / customers /
# inventory / calendar), confirm the exact table + columns each selects, live:
#   pos_sales (total_amount, status, created_at, served_by:text) ; pos_products ; pos_customers (CANONICAL,
#   not 'customers') ; inventory source table ; calendar/bookings table.
# Each tool is READ-ONLY (select only). No RPC calls unless confirmed present. Revenue rule:
# total_amount WHERE status='completed', dollars not cents. business_id scope mandatory on every tool query.

######################################################################
# I8 SELF-VERIFY  [REASONING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I8 SELF-VERIFY-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I1 + I7 deployed.

WHY (from audit):
GROUNDING-TEETH-V2 strips bad numbers AFTER synthesis (Check 6 + advisor_guard). Smarter: Aria self-checks BEFORE emitting. ask_aria_verifier agent_key exists in code (fired 2026-06-07 once) — the hook is already there, just not invoked.

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. grep -rn "ask_aria_verifier" src — find the existing implementation
3. Quote what it does today
4. Read V2's Check 6 + advisor_guard to understand current verification

BUILD (additive):

PART 1 — Verify the existing verifier
Find ask_aria_verifier code. Three scenarios:
A. Exists and works but isn't called: WIRE IT
B. Exists but is broken: FIX + WIRE
C. Doesn't exist (despite agent_key in DB): CREATE

For C: create src/lib/aria/self-verify.ts with verifySynthesis(synthesis, groundTruth, advisors): Promise<VerifyResult>

VerifyResult: { ok: boolean; contradictions: string[]; suggestion?: string }

Logic:
1. Extract key claims from synthesis (numeric + assertive statements)
2. For each claim, check against:
   - groundTruth.business_health (e.g. claim "POS broken" vs health.pos_health.status='OK' → contradiction)
   - groundTruth._anchor_values (numeric validation, but V2 already covers this — skip if V2 ran)
   - groundTruth.advice_weights (claim with weight < 0.4 → low confidence, suggest soften)
3. If contradictions: return { ok: false, contradictions, suggestion: rewrite-hint }

PART 2 — Invoke before emission
In council.ts post-synthesis, before returning response:
- const verify = await verifySynthesis(synthesis, groundTruth, advisors)
- If !verify.ok:
  - Log to aria_ai_calls agent_key='ask_aria_verifier' role='other' learning_signal='self_verify_contradiction_found'
  - Options for handling (choose one in pre-flight):
    a) Retry synthesis with contradictions appended as guidance (cost: +1 model call)
    b) Strip the contradictory sentence (similar to V2 behavior, but earlier)
    c) Add a hedge: prepend "I want to verify — " to the contradictory claim
- Default to (c) — surgical, fastest, lowest cost. Document choice in report.

PART 3 — Log every check
logAICallSafe row per invocation:
  agent_key: 'ask_aria_verifier', role: 'other', provider: 'other'
  request_summary: 'verify_synthesis'
  response_summary: JSON.stringify({ ok: bool, contradiction_count }).slice(0, 200)
  learning_signal: contradictions[0] ? `self_verify:${contradictions[0]}`.slice(0,100) : 'self_verify:passed'

BUILD GATE: tsc 0 + build PASS · ONE commit feat(i8-self-verify) · STOP.

VERIFY POST-DEPLOY:
1. Force a contradiction test: manually set Sip's pos_health to OK, generate a synthesis claiming POS is broken (use a test endpoint or manually craft)
2. SQL: select agent_key, learning_signal from aria_ai_calls 
   where agent_key='ask_aria_verifier' 
   and business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   and created_at > now() - interval '5 minutes';
   PASS: row appears with learning_signal documenting the contradiction
3. Synthesis output is modified (hedge prepended) before reaching user

DO NOT:
- Do not retry synthesis more than once per request (cost cap)
- Do not delete contradictory sentences without trace (logged + hedged is safer)
- Do not skip if V2 Check 6 also fires — they're complementary
- Do not modify groundTruth structure

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I8 — original stands. Preflight: confirm agent_key 'ask_aria_verifier' is a valid AgentRole union member
# (LOGGING-AUDIT-3) before logging through logAICallSafe. role='analysis' provider='other'. No table writes.
# Self-verify must NOT assert numbers — it flags contradictions only; keep outputs out of _anchor_values.

######################################################################
# I9 DEEP-REASONING  [REASONING]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I9 DEEP-REASONING-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I7 TOOL-USE deployed (advisors can use tools).

WHY (from audit):
Council currently does parallel advisor calls + synthesis (5 LLM calls per chat). Each advisor reads context, emits observations + recommendations in ONE shot. Smarter: each advisor does plan→verify→conclude inside its turn. Plus surface conflicts between advisors before synthesis.

agent_council_proposals table has conflicts_with/synergises_with columns UNUSED (table only has 2 rows total since June 4). Wire them.

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read src/lib/aria/council.ts advisor invocation. Quote signature.
3. Check agent_council_proposals schema (already audited: has conflicts_with array, synergises_with array, council_decision, council_reasoning)

BUILD (additive):

PART 1 — Per-advisor 3-step reasoning
Modify each advisor's prompt template:
"Reason through this in 3 steps before concluding:
1. PLAN: What's the question really asking? What facts do you need?
2. VERIFY: Look at the relevant anchors in business_health + advice_weights + (tool calls if needed). What does the data say?
3. CONCLUDE: Your observations + recommendations.

Output JSON: { plan, verify_findings, observations, recommendations, confidence: 0-1 }"

This increases token cost ~2-3× per advisor but inference quality improves disproportionately. Anthropic prompt caching makes repeated context tokens cheaper.

PART 2 — Conflict detection between advisors
After all 4 advisors return:
src/lib/aria/council-conflicts.ts (NEW)
Detect:
- Numeric conflict: advisor A says "+$200 lift", advisor B says "no impact" — flag
- Recommendation conflict: A says "raise prices", B says "lower prices" — flag
- Confidence delta: one advisor confidence > 0.8, another  now() - interval '5 minutes';
   PASS: rows show learning_signal with plan_verify_conclude:0.X
3. SQL: select agent_type, conflicts_with, council_reasoning from agent_council_proposals 
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   order by created_at desc limit 5;
   PASS: conflicts captured if any
4. Synthesis output naturally addresses conflicts (e.g. "Growth and Risk advisors disagree on pricing — here's why I lean toward...")

DO NOT:
- Do not increase advisor count (4 is the limit; more = slower, not smarter)
- Do not bypass V2 stripping (still applies to plan + observations + recommendations)
- Do not skip cache layer (cache key still based on businessId + question hash)

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I9 — original stands. Preflight confirm: conflicts_with + synergises_with are ARRAY columns (they are);
# council_decision CHECK=[approved,rejected,modified,deferred]; confidence is numeric 0..1.
# Write conflicts_with as a uuid[] of proposal ids. Do not invent a 'conflict_score' column.

######################################################################
# I10 BENCHMARK  [KNOWLEDGE]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I10 BENCHMARK-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.

WHY (from audit):
Aria has 16 businesses across cafe/gym/realestate/retail/tradie/visa/warehouse. Cross-business benchmarks are an impossible-to-replicate moat. Privacy-safe via aggregates only (median, percentile, mean — never individual business identifiers).

AUDIT FINDINGS:
- 16 businesses with industry set
- No industry_benchmarks table exists
- pos_sales / pos_customers / pos_products are canonical aggregation sources

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Confirm industry values: SELECT industry, count(*) FROM businesses GROUP BY 1 (chat-Claude)
3. Read I1 health-signals + I2 goal-context patterns

BUILD (additive):

PART 1 — Migration: industry_benchmarks table (chat-Claude applies)
CREATE TABLE IF NOT EXISTS industry_benchmarks (
  id uuid primary key default gen_random_uuid(),
  industry text not null,
  metric_name text not null,
  metric_period text not null check (metric_period in ('daily','weekly','monthly')),
  sample_size int not null check (sample_size >= 5),  -- privacy floor
  p25 numeric, p50 numeric, p75 numeric, p90 numeric, mean numeric,
  computed_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days'),
  unique (industry, metric_name, metric_period, computed_at::date)
);
CREATE INDEX idx_industry_benchmarks_lookup ON industry_benchmarks(industry, metric_name, expires_at DESC);
-- RLS: read-only for any authenticated user

PART 2 — Aggregation cron
src/app/api/cron/industry-benchmarks/route.ts (NEW, weekly, CRON_SECRET via SEC-1)

Metrics to compute per industry per period:
- weekly_revenue_p25/p50/p75/p90/mean
- daily_avg_transactions_p50
- avg_basket_size_p50
- customer_count_p50
- new_vs_returning_pct_p50

Privacy guard: ONLY compute if sample_size ≥ 5 distinct businesses in that industry.
For industries with <5 businesses (e.g. visa), set sample_size=0 and don't insert benchmark.

PART 3 — Surface to groundTruth
src/lib/aria/benchmark-context.ts (NEW)
- For current business, fetch industry from businesses.industry
- Lookup latest non-expired benchmarks for that industry
- Compare business's actual metrics to industry p50:
  - "Your AOV $X is N% above/below industry median"
- Add groundTruth.industry_benchmarks = comparisons
- Push every benchmark number into _anchor_values

PART 4 — Add fact-pointer line
"INDUSTRY_BENCHMARKS: industry_benchmarks compares this business to anonymized industry peers. 
Cite these when relevant. Always include sample_size when citing a benchmark."

PART 5 — Log
logAICallSafe agent_key='industry_benchmark' role='analysis' provider='other'

BUILD GATE: tsc 0 + build PASS · function count ≤22 · daily-max cron · ONE commit feat(i10-benchmark) · STOP.

VERIFY POST-DEPLOY:
1. Apply migration
2. Trigger cron with CRON_SECRET
3. SQL: select industry, metric_name, sample_size, p50 from industry_benchmarks order by industry, metric_name;
   PASS: rows exist for cafe industry (Sip + others), null/empty for visa (sample < 5)
4. Fresh chat for Sip "how am I doing vs other cafes?":
   - Aria cites percentile rank with sample_size

DO NOT:
- Do not surface individual business names/IDs in benchmarks
- Do not compute benchmarks for industries with <5 businesses (privacy floor)
- Do not store anything beyond aggregates (no raw rows from other businesses)
- Do not skip RLS — read should be authenticated but data is non-identifying

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I10 — original intent stands (compute cross-business benchmarks, surface percentile in groundTruth).
# CONFIRMED: industry_benchmarks does NOT exist → CREATE it (this IS the approved new table).
PREFLIGHT: select to_regclass('public.industry_benchmarks');  → expect null, then create.
MIGRATION shape (verify columns before code references them):
  industry_benchmarks(id uuid pk, industry text, metric text, period date,
    p25 numeric, p50 numeric, p75 numeric, sample_size int, computed_at timestamptz)
PRIVACY FLOOR: only compute/emit a benchmark row where sample_size >= 5. Never expose another business's
  raw figure. Aggregate from pos_sales across businesses sharing businesses.industry.
Surface: groundTruth.industry_percentile = where this business sits vs p25/p50/p75 (only if its industry has ≥5).

######################################################################
# I11 COUNTERFACTUAL  [KNOWLEDGE]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I11 COUNTERFACTUAL-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I4 OUTCOME-LOOP (extends hypothesis outcome closure) deployed.

WHY (from audit):
aria_hypotheses table has 1,653 rows generated by the nightly hypothesis-engine cron. Categories: cashflow, customers, hours, inventory, marketing, pricing, staff. predicted_impact_cents, confidence, risk_level all populated. ZERO accepted_at, ZERO outcome_verdict. The owner never sees these.

This sprint:
1. Surfaces existing hypotheses in dashboard + chat
2. Allows owner to ask "what if I do X" interactively → live counterfactual computation
3. On accept, creates aria_action + tracks outcome (I4 wiring)

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read aria_hypotheses schema (audited: id, title, description, category, predicted_impact_cents, confidence, evidence_payload, status, accepted_at)
3. Read existing dashboard layout primitives to reuse
4. Find existing hypothesis-engine cron — quote scoring logic for live counterfactual reuse

BUILD (additive):

PART 1 — Surface existing hypotheses in chat groundTruth
src/lib/aria/hypothesis-context.ts (NEW)
- Fetch top 3 unaccepted aria_hypotheses for current business by confidence DESC, expires_at > now()
- Add groundTruth.live_hypotheses = [...]
- Synthesis can mention proactively: "Based on this week's data, I see 3 hypotheses worth testing"

PART 2 — Dashboard surface
src/app/dashboard/hypotheses/page.tsx (NEW or extend existing /dashboard)
- List unaccepted hypotheses, sortable by confidence/predicted_impact/category
- Each card: title, description, predicted_impact_label, evidence_summary expandable
- Actions: Accept (creates aria_action), Reject (sets rejected_at + reason), Snooze (extends expires_at)

PART 3 — Interactive counterfactual via /api/aria/ask
When owner asks "what if I [do X]":
- Detect counterfactual intent (regex on "what if", "would happen if", "should I")
- Call new tool counterfactual_simulate(business_id, scenario_description)
- Tool generates a synthetic hypothesis via Anthropic Haiku with grounded business context
- INSERT aria_hypotheses with status='interactive_query'
- Return predicted_impact + confidence + risk_level
- Tool logged: agent_key='counterfactual', role='forecast', provider='anthropic'
- All numbers pushed to _anchor_values for V2 validation

PART 4 — Accept flow
POST /api/aria/hypotheses/[id]/accept:
- Set aria_hypotheses.accepted_at = now()
- INSERT aria_action linking back via action_id
- Status='pending'
- Sets up I4 outcome tracking automatically

PART 5 — Log
logAICallSafe rows for hypothesis_surface, counterfactual_simulate, hypothesis_accept

BUILD GATE: tsc 0 + build PASS · ONE commit feat(i11-counterfactual) · STOP.

VERIFY POST-DEPLOY:
1. Fresh chat: "What would happen if I ran a Tuesday bundle?"
   - Aria triggers counterfactual_simulate
2. SQL: select id, title, predicted_impact_cents, confidence, status 
   from aria_hypotheses 
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   and status='interactive_query' 
   order by generated_at desc limit 3;
   PASS: new row exists from the interactive query
3. /dashboard/hypotheses shows existing 1,653 hypothesis backlog for Sip's business + new interactive ones
4. Accept one → aria_actions row created with action_id pointing back

DO NOT:
- Do not modify aria_hypotheses schema
- Do not auto-accept any hypothesis
- Do not bypass V2 for hypothesis numbers
- Do not skip evidence_payload — owner needs to see the reasoning

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I11 — original stands. Preflight confirm status CHECK includes 'accepted' (it does, not 'acted') and
# outcome_verdict CHECK = [worked,partial,neutral,backfired,unknown]. predicted_impact_cents is integer (cents).
# On accept: status='accepted', accepted_at=now(), action_id set. Feeds I4/I12 closure. No new columns needed.

######################################################################
# I12 CAUSAL  [KNOWLEDGE]
######################################################################
--- PREPEND THE VERIFY-OR-HALT PREFLIGHT ABOVE ---
I12 CAUSAL-1. CODE ONLY. SOLO. RULE 0 UPGRADE_ONLY.
DEPENDENCY: I3 PATTERN-MEMORY + I4 OUTCOME-LOOP deployed.

WHY (from audit):
Aria sees correlations but can't reason about causation. Did the May 12 staff change cause the revenue drop, or was it the weather, or the menu update? Temporal correlation + counterfactual baseline can produce probabilistic causal hypotheses.

intelligence_events table exists with 48 rows + clean schema for events (event_type, severity, title, body, data jsonb, triggered_at).

This sprint:
1. Expands event sources to include: pos_actions executed, staff changes, menu price changes, promotional starts, weather extremes
2. Computes 14-day pre/post revenue deltas around each event
3. Surfaces probabilistic causal hypotheses ("revenue change after event X is 73% likely caused by event X, given baseline volatility")

PRE-FLIGHT:
1. pwd confirms C:\Users\kansa\aria-saas-audit
2. Read intelligence_events schema (audited)
3. SELECT distinct event_type FROM intelligence_events (currently: stockout_imminent, visa_expiry_critical)
4. Find existing event-emission code

BUILD (additive):

PART 1 — Expand event sources
src/lib/aria/event-emitter.ts (NEW or extend existing)
Emit intelligence_events when:
- aria_actions transitions to status='executed' → event_type='action_executed', data={action_id, category, impact_expected}
- pos_products.cost_price or price changes by >10% → event_type='price_change', data={product_id, old, new}
- staff_members.is_active toggles → event_type='staff_change', data={staff_id, role}
- aria_signal_cache writes a 'weather_extreme' signal (rainfall >20mm or temp_c < 5 or > 35) → event_type='weather_extreme'
- aria_promotions creates a row → event_type='promo_started'

(Don't emit redundantly — check last identical event for 24h dedup window)

PART 2 — Causal inference function
src/lib/aria/causal-analysis.ts (NEW)
Export analyzeEvent(event_id): Promise<CausalHypothesis>

Per event:
- 14d pre/post revenue from pos_sales
- Baseline volatility: std dev of weekly revenue deltas last 12 weeks
- p_caused = (observed_delta / baseline_volatility) bounded [0, 1] via sigmoid
- For events with multiple co-occurring causes: assign fractional credit by recency

Returns: {
  event_id, observed_delta_cents, baseline_volatility,
  p_caused_pct, alternative_explanations: [...other events in window with credit %],
  reasoning: human-readable
}

PART 3 — Daily causal-analysis cron
src/app/api/cron/causal-analysis/route.ts (CRON_SECRET via SEC-1)
- For each intelligence_events row with severity in ('high','medium') and triggered_at 'causal_analysis'->>'p_caused_pct' as p, data->'causal_analysis'->>'observed_delta_cents' as delta 
   from intelligence_events 
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' 
   order by triggered_at desc;
   PASS: causal_analysis populated
4. Fresh chat "what happened in May?" — Aria cites causal hypothesis from intelligence_events

DO NOT:
- Do not claim causation with p < 0.6 (statistical floor)
- Do not skip alternative_explanations (always offer alternatives)
- Do not write to intelligence_events as fact when uncertain — use data.causal_analysis with explicit p
- Do not skip baseline_volatility (raw delta is meaningless without it)
- No external causal-inference dependencies (DoWhy etc) — keep it simple SQL + sigmoid

>>> REWRITE-DOC CORRECTION for this sprint (apply on top): <<<
# I12 — original stands EXCEPT three schema corrections:
DEPENDENCY: I3-REWIRE must be live first (it adds 'pattern' to the kind CHECK that PART 3 relies on).
1. PART 3 memory write: kind='pattern' (valid after I3-REWIRE), source_type='signal', source_id=null.
   REMOVE any 'source' field. (Without I3-REWIRE this insert is rejected → pattern silently never written.)
2. severity values: use [critical,high,medium,info] — NOT 'low'. The cron filter severity in ('high','medium') is fine.
3. "not already analyzed" gate: WHERE data->'causal_analysis' IS NULL  (there is no 'analyzed' column).
Everything else (event-emitter, 14d pre/post, sigmoid p_caused, alternatives, p<0.6 floor) unchanged.

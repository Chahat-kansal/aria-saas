# Prompt 214-218 — Dashboard Depth Sprint
# Intelligence + Profit Leaks + Social + Cash Flow + Daily Briefing

Read CLAUDE.md in full FIRST. Then read every file listed in each section before touching it.
One commit per task — 21 tasks total. Run npx tsc --noEmit + npm run build before every commit.
Push + verify git log origin/main..HEAD is empty after each commit.
UPGRADE-ONLY: never remove or downgrade any existing feature.
Model: claude-haiku-4-5-20251001 for all AI calls unless task says otherwise.
State "Build verified green, all commits pushed." when fully done.

════════════════════════════════════════════════
SECTION A — INTELLIGENCE: Actionable Events
File to read first: src/app/dashboard/intelligence/page.tsx (364 lines)
Also read: src/app/api/intelligence-events/ routes
════════════════════════════════════════════════

## A1 — One-click fix actions on every event card
Commit: "feat(intelligence): one-click fix actions wired to real endpoints"

Event type → action button:
- low_stock / reorder → "Create reorder" → POST /api/pos/purchase-orders { product_id from event.data }
- pricing_gap / price_below_cost → "Update price" → PATCH /api/pos/products/{id} { price: suggested_price from event.data }
- dead_stock → "Markdown 20%" → POST /api/pos/promotions { discount_pct: 20, product_id from event.data }
- slow_day / quiet_period → "Run a special" → router.push('/dashboard/promotions')
- churn_risk / lapsed_customers → "Send winback" → POST /api/aria/winback { customer_ids from event.data }
- review_unreplied → "Reply now" → router.push('/dashboard/reviews')
- expiry_alert → "View expiry" → router.push('/dashboard/warehouse?tab=expiry')
- all others → keep action_href link if present, else "Dismiss"

Add actionFiring: Record<string, boolean> state.
Each button: shows loading → on success marks event acknowledged + toast "Done" → on error shows inline error.
Log successful actions to aria_autopilot_actions { action_type: 'intelligence_action_taken', event_type, business_id }.

## A2 — Hypothesis outcome tracking
Commit: "feat(intelligence): hypothesis outcome validation — did Aria's suggestion work?"

When hypothesis.status === 'active' AND generated_at > 14 days ago:
- Show "Did this work?" inline below the hypothesis
- Three buttons: "✓ Yes, worked" | "✗ Didn't work" | "~ Inconclusive"
- POST /api/aria/hypotheses/{id}/outcome { verdict: 'worked'|'failed'|'inconclusive' }
- Updates hypothesis.outcome_verdict + status='closed'
- Log to aria_autopilot_actions

Create route if missing: src/app/api/aria/hypotheses/[id]/outcome/route.ts
PATCH { verdict } → update hypothesis row → return updated

Add a "Validated" section below active hypotheses: verdict badges in green/red/amber.

## A3 — Pattern memory on expanded event
Commit: "feat(intelligence): pattern memory — similar past events shown when event is expanded"

When an event card is selected (expanded state), fetch:
GET /api/intelligence-events/patterns?event_type={type}&business_id={bid}&limit=3

Create route if missing: src/app/api/intelligence-events/patterns/route.ts
Query: intelligence_events WHERE event_type=$type AND business_id=$bid AND triggered_at < NOW() - INTERVAL '7 days' ORDER BY triggered_at DESC LIMIT 3

In the expanded panel show "Pattern history":
- "This happened {N} times before" with date + what was done
- If 0 previous: "First time we've seen this"
- If 2+ occurrences: haiku generates 1-sentence pattern insight

## A4 — Feed outcomes into daily briefing context
Commit: "feat(intelligence): hypothesis outcomes feed into briefing context"

In buildAskAriaContext (or briefing API): add hypothesis success rate this month.
Format: "Aria's suggestions: X worked, Y didn't (Z% success rate this month)"

════════════════════════════════════════════════
SECTION B — PROFIT LEAKS: Fix-It Actions
File to read first: src/app/dashboard/profit-leaks/page.tsx (284 lines)
Also read: src/app/api/aria/profit-analysis/ routes
════════════════════════════════════════════════

## B1 — "Fix this" one-click actions per leak
Commit: "feat(profit-leaks): one-click fix actions per leak category"

Add a second button "Fix this →" next to the existing "Mark as fixed":
- pricing_gap → "Adjust price" → inline modal showing current + suggested price from leak.data → PATCH /api/pos/products/{id}
- dead_stock → "Markdown 20%" → POST /api/pos/promotions { discount_pct: 20, product_id } → then markFixed(id)
- waste / expiry → "Set expiry alert" → router.push('/dashboard/warehouse?tab=expiry')
- labour → "View shift breakdown" → router.push('/dashboard/staff?tab=performance')
- lost_sales / stockout → "Create reorder" → POST /api/pos/purchase-orders { product from leak.data }

Each: loading state → success toast + auto-calls markFixed(id) → error shown inline.
Log to aria_autopilot_actions { action_type: 'profit_leak_fixed', category }.

## B2 — Week-on-week trend per category
Commit: "feat(profit-leaks): week-on-week trend indicators per leak category"

history[] array already has weekly data. For each LEAK_CATEGORIES entry:
- Sum monthly_loss of current active leaks in that category
- Compare to previous history[] entry same category sum
- Show trend badge on category header: "↑ 23% vs last week" (red) | "↓ 15%" (green) | "→ stable" (amber, <5%)

Add a 1-sentence trend summary card at top. Haiku generates it from trend data.

## B3 — Staff profitability breakdown
Commit: "feat(profit-leaks): staff profitability — labour cost vs revenue per shift"

New section below leak list: "Staff profitability by shift"

Create route: GET /api/aria/staff-profitability?business_id=X&days=14
Logic: join pos_timesheets (clock_in, clock_out, pay_rate_cents) with pos_sales (created_at, total_amount).
For each shift: labour_cost = hours * rate. Revenue = SUM sales in that time window.
Ratio = revenue / labour_cost. Return top 14 days.

Table: Date | Staff | Hours | Labour cost | Revenue | Efficiency | Status
- Ratio > 3.0 = green "Profitable"
- 1.5–3.0 = amber "Break-even"
- < 1.5 = red "Loss-making"

Haiku: 1-sentence summary of worst shift pattern.

## B4 — Top leak in daily briefing
Commit: "feat(profit-leaks): worst active leak in daily briefing context"

In buildAskAriaContext: add top leak (highest monthly_loss, status != 'fixed').
Format: "Top profit leak: {title} — costing ${monthly_loss}/month. {fix_suggestion}"

════════════════════════════════════════════════
SECTION C — SOCIAL: Performance Intelligence
File to read first: src/app/dashboard/social/page.tsx (1100 lines — read in full)
Note: analytics tab + state already exists. BestTimesHeatmap already exists.
════════════════════════════════════════════════

## C1 — Community engagement analytics (data we control)
Commit: "feat(social/analytics): community engagement analytics from Aria Community posts"

Enhance /api/social/analytics to also query community_posts for this business:
- COUNT and SUM(likes_count + comments_count + saves_count) grouped by post type (reel/image/text)
- Top 5 posts by engagement
- Best posting times from created_at vs engagement correlation

In analytics tab UI add:
- "Content performance" bar chart: avg engagement by type
- "Top 5 posts" list with engagement numbers
- Insight: if reels outperform images: "Your reels get {X}x more engagement — Aria will create more"

## C2 — Manual Instagram metrics entry
Commit: "feat(social/analytics): manual metric entry for published posts"

On posts with status === 'published': add "Log metrics" button.
Opens inline form: Impressions | Likes | Comments | Shares | Saves (number inputs).
PATCH /api/social/posts/{id}/metrics { impressions, likes, comments, shares, saves }
Add columns to social_posts via Supabase MCP migration if missing.
Show logged metrics on post card. Roll up into analytics summary.

## C3 — Aria content intelligence
Commit: "feat(social/aria-learning): Aria learns from engagement patterns"

GET /api/aria/social-intelligence?business_id=X
Route: reads last 30 community posts + engagement → haiku generates 3 specific insights:
- Best day/time to post based on engagement
- Best performing content type
- Content characteristics that drive engagement
Returns { insights: string[], top_content_type, best_day, best_hour }

Show in analytics tab as "What Aria learned" sage-tinted insight cards. Log to aria_ai_calls.

## C4 — Generated posts use learned preferences
Commit: "feat(social/aria-learning): new posts use Aria's learned content preferences"

When generating a post (existing generate button), append to the AI prompt:
- top_content_type from social-intelligence
- best_day / best_hour as suggested scheduled_for
- Relevant insight about their best-performing content

════════════════════════════════════════════════
SECTION D — CASH FLOW: "So What" Intelligence
File to read first: src/app/dashboard/cash-flow/page.tsx (417 lines)
Also read: src/app/dashboard/cash-flow/BankTab.tsx
════════════════════════════════════════════════

## D1 — Aria cash flow commentary panel
Commit: "feat(cash-flow): Aria cash flow commentary — runway alert and burn rate"

The cumulative field in DayForecast[] already shows running cash position. Use it.

Compute after days[] loads:
- daily_burn = average net over last 7 past days (negative = burning)
- runway_days = if daily_burn < 0: current_balance / abs(daily_burn) else null
- lowest_point = min(cumulative) across all forecast days

Show "Aria's read" card at top of forecast tab:
- If runway_days < 30: red "⚠ At current burn rate, you'll need to top up in {runway_days} days"
- If runway_days 30-90: amber "Cash position tightens in {runway_days} days — plan ahead"
- If all positive: green "Cash position is healthy across the next 30 days"
- Always: "Daily burn: ${daily_burn}/day" and lowest point

POST /api/aria/cash-commentary { business_id, burn_rate, runway_days, lowest_point }
Returns 2-sentence Aria insight. Haiku model. Show with Aria indicator.

## D2 — Supplier payment timing optimiser
Commit: "feat(cash-flow): supplier payment timing optimiser"

New section below forecast chart: "Supplier payment timing"

Data: warehouse_purchase_orders WHERE status IN ('sent','partial').
For each outstanding PO: find latest date within payment terms where forecast cumulative is still positive.
Suggest paying on that date rather than immediately.

Table: Supplier | Amount due | Due date | Optimal pay date | Cash saved
"Pay ILG on June 16 (not June 8) — saves $2,400 cash float for 8 extra days"

If no outstanding POs: "No pending supplier invoices"

## D3 — Seasonal cash flow overlay
Commit: "feat(cash-flow): seasonal overlay — same period last year comparison"

Query pos_sales for same date range one year ago. Compute dow average.
Add as dashed secondary line on existing chart ("Last year").

Below chart: 1-sentence seasonal commentary. Haiku generates it.
- "This time last year revenue was X% higher/lower"
- If Dec: "December typically spikes revenue +40% but expenses +60%"
- If Jan-Feb: "Post-Christmas dip: January runs 25% below annual average"

## D4 — Cash position in daily briefing
Commit: "feat(cash-flow): cash position and runway in daily briefing context"

In buildAskAriaContext: add estimated cash position, runway_days if < 60, overdue suppliers.
Format: "Estimated cash position: ${X}. {runway alert if applicable}."

════════════════════════════════════════════════
SECTION E — DAILY BRIEFING: Predictive Signals
File to read first: src/app/dashboard/daily-briefing/page.tsx (344 lines)
Also find and read the daily briefing API route under src/app/api/aria/daily-briefing/
Also read: src/lib/aria/business-brain.ts (or wherever buildAskAriaContext lives)
════════════════════════════════════════════════

## E1 — 7-day weather + demand impact
Commit: "feat(briefing): 7-day weather with demand impact signal"

In the briefing API route, fetch 7 days from Open-Meteo (FREE, no API key needed):
https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Australia/Sydney&forecast_days=7

Map weathercode to plain English: 0=Sunny, 1-3=Mostly sunny, 45-48=Foggy, 51-67=Rainy, 80-82=Showers, 95-99=Stormy.

Compute demand_impact per day:
- Sunny weekend → "+30% foot traffic expected"
- Rainy weekday → "-15% foot traffic"
- Sunny public holiday → "+50% foot traffic"

Get lat/lng from businesses table (add columns if missing via Supabase MCP, default Sydney: -33.8688, 151.2093).
Pass to briefing prompt. UI: "Weather this week" horizontal scroll row with day/icon/temp/impact.

## E2 — Australian school holidays + public holiday signals
Commit: "feat(briefing): school holidays and public holidays with demand signals"

Hardcode Victoria 2026 school holiday dates (add other states too):
- Term 1 break: 28 Mar - 13 Apr 2026
- Term 2 break: 27 Jun - 13 Jul 2026
- Term 3 break: 19 Sep - 5 Oct 2026
- Term 4: 18 Dec 2026+

When current date is within 7 days of a holiday period:
- Cafe/retail: HIGH priority rec "School holidays in {X} days — expect more families, prep kids specials"
- Warehouse: "Delivery volumes may drop during school holidays"

Also use existing upcoming_holidays[] from data_snapshot:
- Public holiday 1-3 days away → HIGH priority rec with industry-specific action
- Cafe: "Open for trade? Stock up. Closed? Post on Aria Community."

## E3 — Quiet day detection + flash promo suggestion
Commit: "feat(briefing): quiet day detection flags slowest days in rolling 6-week window"

In briefing API: compute avg daily revenue by day-of-week over last 6 weeks.
If today's day-of-week average is bottom 20% of all days:
- Add HIGH priority rec: "Today is typically your quietest {day} — consider a flash promo or SMS blast"
- action_href: /dashboard/promotions

Also detect next 3 days below average → pre-warn with MEDIUM priority.

## E4 — Competitor price signal
Commit: "feat(briefing): competitor price drops surfaced in daily briefing"

Query competitor_snapshots WHERE business_id=X AND created_at > now()-7 days.
If any competitor price dropped > 5% since previous snapshot:
- MEDIUM priority rec: "Competitor dropped {product} price by {pct}% — review your pricing"
- action_href: /dashboard/competitors

## E5 — Briefing recommendations directly actionable
Commit: "feat(briefing): recommendation cards have real action buttons"

Each Rec card currently shows action_label as text. Replace with real button:

action_type → what happens:
- 'reorder' → POST /api/pos/purchase-orders with product from rec.metric → loading → success toast → dismiss rec
- 'winback' → POST /api/aria/winback (auto-triggers lapsed customers) → loading → success toast → dismiss
- 'promo' → router.push('/dashboard/promotions?prefill=flash_deal')
- 'review' → router.push('/dashboard/reviews')
- 'mark_as_done' → existing dismiss logic

Loading state per-rec. On success: dismiss + toast. Log to aria_autopilot_actions.

════════════════════════════════════════════════
COMPLETION CHECKLIST
════════════════════════════════════════════════
Before marking done:
- [ ] All 21 tasks committed and pushed
- [ ] npx tsc --noEmit passes
- [ ] npm run build passes
- [ ] git log origin/main..HEAD is empty
- [ ] Intelligence: action buttons fire real API calls
- [ ] Intelligence: hypothesis outcome "Did this work?" shown after 14 days
- [ ] Intelligence: pattern history shown on expanded event
- [ ] Profit Leaks: "Fix this →" buttons take real action per category
- [ ] Profit Leaks: trend badges on each category header
- [ ] Profit Leaks: staff profitability table present
- [ ] Social: community engagement analytics in analytics tab
- [ ] Social: "Log metrics" button on published posts
- [ ] Social: Aria learned insights shown in analytics tab
- [ ] Cash Flow: "Aria's read" card at top with runway/burn
- [ ] Cash Flow: supplier payment timing table (or empty state)
- [ ] Cash Flow: seasonal overlay on forecast chart
- [ ] Briefing: 7-day weather row showing
- [ ] Briefing: school holiday / public holiday signals appearing
- [ ] Briefing: quiet day detection triggering a rec
- [ ] Briefing: recommendation action buttons fire real endpoints

State "Build verified green, all commits pushed." when done.

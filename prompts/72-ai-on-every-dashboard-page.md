# Prompt 72 — AI Intelligence On Every Dashboard Page

## Goal
Turn every dashboard page from a passive report into an active advisor.
18 pages get a real AI insight feature. Plus one shared "Aria says" component
used across all of them for consistency.

## CRITICAL — scope + token discipline
This is LARGE. Build in PHASES, commit per phase. If limit runs low: finish
current phase, commit, STOP. Never leave the build broken.
Do NOT rewrite pages — ADD an AI insight card/section to each. str_replace, additive only.

## Pre-edit checklist (per page)
Read the page fully + its main API route + check the DB tables it uses.
Never edit a file not read in this session.

## Shared foundation — build FIRST

### The AriaSays component
Create `src/components/dashboard/AriaSays.tsx`:
- A consistent insight card — sage/forest Financial Trust palette
- Props: `businessId`, `context` (which page), `data` (the page's key data)
- Calls a shared endpoint, shows: a headline insight + 1-3 specific actions
- Loading shimmer while thinking, dismissable, "Ask Aria more" link
- Small, top-of-page placement — never blocks the page content

### Shared insight endpoint
Create `src/app/api/aria/page-insight/route.ts` — POST
- Takes `{ business_id, page, data }`
- Routes to the right analysis based on `page`
- Uses Haiku (claude-haiku-4-5-20251001) — cheap, fast
- Logs every call to aria_ai_calls
- Returns `{ headline, insights: [{text, action?}], severity }`
- Caches result 1 hour per page per business (avoid re-calling on every visit)

## PHASE 1 — Money + operations pages (highest value)

### cash-flow
AI reads the forecast. Warns of negative dips: "You dip to -A$340 on the 14th —
mainly the quarterly rent. Consider holding the supplier order until the 16th."
Feed it: the day-by-day forecast array, expenses, scenario.

### orders
AI flags unusual orders (much larger/smaller than typical), predicts return risk
from product + customer history, suggests fulfilment priority order.

### stocktake
AI predicts expected count per product from sales velocity vs last stocktake.
Flags only the variances worth investigating: "Expected ~40 of X, big gap likely."
Shown BEFORE counting so staff know where to look.

### variance
AI explains the WHY: "Tuesday's A$45 cash variance lines up with a new staff
member's first solo shift — likely a till error, not theft."

### suppliers
AI scores each supplier from delivery history (on-time %, price changes).
Suggests: "Supplier X late 4 of last 6 deliveries — worth a conversation."

### delivery
AI predicts late deliveries from carrier history + current status.
Suggests carrier switches: "StarTrack averaging 1.8d vs AusPost 3.1d regionally."

## PHASE 2 — Customer + revenue pages

### bookings
AI spots no-show risk per booking (from customer history + booking patterns).
Suggests overbooking level, flags gaps worth filling.

### quotes
AI suggests pricing from win/loss history of similar quotes.
Drafts the quote narrative/cover text.

### loyalty
AI suggests which customers to target with which reward.
Predicts who is about to lapse from the loyalty program.

### reviews
AI drafts a response for each review, spots recurring themes across all reviews,
flags reviews needing urgent reply (angry, low star, influential).

### customers
AI auto-segments (Champions, At Risk, etc), predicts lifetime value,
flags VIPs and at-risk customers at the top.

### marketing
AI writes campaign copy, suggests best send time, predicts open rate
from past campaign performance.

## PHASE 3 — Reporting + remaining pages

### weekly-reports
AI writes the narrative — "Here is what mattered this week and why" —
in plain owner language, not a data dump.

### shift-reports
AI summarises each shift, flags anomalies, compares to a typical shift.

### staff
AI already has demand forecast. Add: roster suggestion based on WHO sells
most on which day (staff sales performance by day-of-week).

### seo
AI already has fix routes. Add: prioritise which fixes will drive the most
traffic — rank the issue list by predicted impact.

### missed-demand
AI predicts what will run out next, before it happens, from velocity + lead time.

### slow-day
AI suggests the specific promo/action for THIS slow day — not generic advice.
Considers weather, day, what is overstocked, what is slow-moving.

## Rules for every page's AI feature
- Use the shared AriaSays component for consistency
- AI insight is ADDITIVE — placed at top of page, never replaces existing content
- All AI = Haiku, logged to aria_ai_calls
- Cache per page per business — never call AI on every page visit
- Insight must be SPECIFIC with real numbers from that business's data — never generic
- Good example: "You dip to -A$340 on the 14th" — Bad: "Watch your cash flow"
- Plain owner language — no consultant jargon (no "structural", "unsustainable")
- If a page has no data yet, AriaSays shows a friendly "Not enough data yet" state

## Execution — phase order, commit each
1. Build shared AriaSays component + page-insight endpoint, commit
2. Phase 1 (6 money/ops pages), npx tsc --noEmit, npm run build, commit
3. Phase 2 (6 customer pages), tsc, build, commit
4. Phase 3 (6 reporting pages), tsc, build, commit
5. Each phase its own commit so nothing is lost if limit runs out

## If limit runs low
Finish current phase, commit, STOP. Report which phases remain.

## Commit messages
- "feat: AriaSays component + page-insight endpoint — shared AI insight foundation"
- "feat: AI insights on cash-flow, orders, stocktake, variance, suppliers, delivery"
- "feat: AI insights on bookings, quotes, loyalty, reviews, customers, marketing"
- "feat: AI insights on weekly-reports, shift-reports, staff, seo, missed-demand, slow-day"

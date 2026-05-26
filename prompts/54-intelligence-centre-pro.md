# Prompt 54 — Intelligence Centre Pro Upgrade

## Category leader bar
Cradle: business signal detection, anomaly alerts, AI-driven action recommendations.
Klipfolio: real-time KPI monitoring, alert thresholds, signal feeds.
Aria Intelligence (9KB) currently: just an event list with read/unread. Needs to be the nerve centre of the business.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/intelligence/page.tsx` — full read (9KB)
2. `cat src/app/api/aria/intelligence/route.ts` — check what events it returns
3. Check DB: `aria_intelligence_events` OR `intelligence_events` table columns via Supabase MCP
4. Check: `aria_signal_cache`, `aria_hypotheses` tables — what do they contain?
5. `cat src/lib/aria/intelligence/` — list all files and read each

## What to build — full Intelligence Centre redesign

### 1. Priority scoring + triage
Each intelligence event gets a priority score: Critical / High / Medium / Low.
Scoring logic:
- Revenue impact > $500: Critical
- Revenue impact $100-500: High
- Stock issue: High
- Customer churn risk: Medium
- Opportunity: Medium/Low
Show events sorted by priority with coloured badges.
"Action required" section at top (Critical + High only).

### 2. Signal categories with tabs
**All** | **Revenue** | **Stock** | **Customers** | **Competitors** | **Opportunities**
Each tab shows filtered events with count badge.
Revenue signals: revenue drop, unusual spike, slow day alert.
Stock signals: low stock, dead stock, expiry alerts.
Customer signals: churn risk, VIP gone quiet, new high-value customer.
Competitor signals: from `aria_competitor_alerts`.
Opportunities: detected upsell, promotable product, revenue gap.

### 3. Signal detail panel
Click any event → right panel opens with full detail:
- What happened (plain English)
- Why it matters ($ impact estimate)
- What Aria recommends (3 specific actions)
- "Take action" button → pre-loads Ask Aria with context
- "Dismiss" / "Mark resolved" buttons
- Related signals (other events in same category)

### 4. Hypothesis tracking
Pull from `aria_hypotheses` table — Aria generates business hypotheses.
Show as "Aria is testing:" cards.
"Hypothesis: Promoting your top-margin product on Fridays would increase revenue by ~$200/week"
Status: testing / confirmed / rejected.
Confirmed hypotheses → become permanent recommendations.

### 5. Live signal feed
Supabase Realtime subscription on intelligence events table.
New signals appear at top with subtle animation.
"2 new signals" badge → click to scroll to new items.

### 6. Signal history + resolution rate
Footer: "You've resolved 23 of 31 signals this month (74% resolution rate)"
Chart: signals generated vs resolved per week (recharts BarChart).
"Most common signal type: Low stock (9 this month)"

## Design
- Priority badges: red=Critical, orange=High, yellow=Medium, grey=Low
- Event cards: dark glass surface, left border coloured by priority
- Detail panel: slides in from right, full height
- Live indicator: green pulsing dot in page header

## Execution
1. Read ALL pre-edit files and intelligence lib files
2. Full upgrade of `src/app/dashboard/intelligence/page.tsx`
3. Supabase Realtime subscription for live signals
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: intelligence — nerve centre with priority scoring, signal categories, hypothesis tracking, live feed, resolution tracking" && git push`

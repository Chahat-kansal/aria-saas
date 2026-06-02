# Prompt 218 — Daily Briefing: Predictive Signals + School Holidays + Quiet Day Detection

Read CLAUDE.md first. Read src/app/dashboard/daily-briefing/page.tsx IN FULL — 344 lines.
Read the daily briefing API route (find it under src/app/api/aria/daily-briefing/).
Read src/lib/aria/business-brain.ts or wherever buildAskAriaContext is defined.

## WHAT EXISTS
- Recommendations with priority (high/medium/low)
- 7-day history
- data_snapshot with weather_next_3_days[] and upcoming_holidays[]
- MetricCard row with yesterday revenue, 7-day revenue, trend, low stock, lapsed customers

## TASK 1 — Extend weather to 7 days + add demand impact
Commit: "feat(briefing): 7-day weather forecast with demand impact signal"

In the daily briefing API route, fetch 7 days of weather (not 3) from Open-Meteo (free, no API key):
URL: https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Australia/Sydney&forecast_days=7

Map weathercode to plain English: 0=Sunny, 1-3=Mostly sunny, 45-48=Foggy, 51-67=Rainy, 71-77=Snowy, 80-82=Showers, 95-99=Stormy.

For each forecast day, compute a demand_impact:
- Sunny Saturday/Sunday → "+30% foot traffic expected"
- Rainy weekday → "-15% foot traffic, consider delivery focus"
- Sunny Monday public holiday → "+50% foot traffic"

Pass to the briefing prompt and UI. Show in the briefing as "Weather this week" horizontal scroll with day/icon/temp/impact pills.

Business lat/lng: fetch from businesses.latitude and businesses.longitude (add columns via migration if missing, default to Sydney -33.8688, 151.2093).

## TASK 2 — Australian school holidays + public holiday demand signals
Commit: "feat(briefing): school holidays and public holidays with business-specific demand signals"

Hardcode 2026 Australian school holiday dates per state. Map business address to state (use businesses.state column — add if missing).

Victoria 2026 school holidays (example — add all states):
- Term 1 end: 27 Mar - 13 Apr
- Term 2 end: 26 Jun - 13 Jul
- Term 3 end: 18 Sep - 5 Oct
- Term 4 end: 18 Dec - end

When current date is within 7 days of a school holiday period, add a briefing signal:
- Cafe/retail: "School holidays start in {X} days — expect more families, plan kids-friendly specials"
- Warehouse: "School holidays — delivery volumes may drop, plan staff accordingly"

Also use the existing upcoming_holidays[] from the data_snapshot. When a public holiday is 1-3 days away:
- Add a HIGH priority recommendation: "Public holiday {name} in {days} days — {industry-specific action}"
- Cafe: "Open for trade? Prep extra stock. Closed? Let customers know on Aria Community."

## TASK 3 — Quiet day detection
Commit: "feat(briefing): quiet day detection — flags slowest days in rolling 6-week window"

In the briefing API route, compute:
- Average daily revenue by day-of-week over the last 6 weeks
- Today's day-of-week
- If today's average is in the bottom 20% of all weekdays → "quietest {day} in 6 weeks"

Generate a specific action recommendation for quiet days:
- "Today is typically your quietest Tuesday — consider a flash promo or SMS blast to lapsed customers"
- Link to /dashboard/promotions and /dashboard/winback

Also detect upcoming quiet windows (next 3 days below average) and pre-warn.

## TASK 4 — Competitor price signal in briefing
Commit: "feat(briefing): competitor price drops surfaced in daily briefing"

Query competitor_snapshots WHERE business_id = X AND created_at > now() - interval '7 days'.
If any competitor price dropped > 5% since previous snapshot:
- Add a MEDIUM priority recommendation: "Competitor {name} dropped {product} price by {pct}% — review your pricing"
- action_href: /dashboard/competitors

Also add: if Aria community has posts from competitor businesses in the same suburb (community_posts joined to businesses by suburb/industry), surface a "Competitor posted today" signal.

## TASK 5 — Make recommendations directly actionable
Commit: "feat(briefing): briefing recommendations have direct action buttons"

Each Rec card currently shows action_label and action_type. Add actual execution:

action_type → what happens:
- 'reorder' → POST /api/pos/purchase-orders with low-stock product from rec.metric
- 'winback' → POST /api/aria/winback (auto-triggers for all lapsed customers)
- 'promo' → redirect to /dashboard/promotions?prefill=flash_deal
- 'review' → redirect to /dashboard/reviews
- 'mark_as_done' → calls existing dismiss logic

Each action button replaces "→ {action_label}" text with a real clickable button that:
- Shows loading while in flight
- On success: dismisses the recommendation + shows success toast
- Logs to aria_autopilot_actions

## RULES
- Read daily briefing page AND API route fully before editing. One commit per task.
- npx tsc --noEmit + npm run build before every commit.
- UPGRADE-ONLY. Never remove existing recommendations, history, metric cards.
- Open-Meteo is free, no API key needed — use it directly in the API route.
- haiku for AI commentary. Amounts in dollars.

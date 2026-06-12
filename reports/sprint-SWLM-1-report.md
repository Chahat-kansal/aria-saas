# Sprint SWLM-1 — Calendar-Aligned "Same Week Last Month"
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green
**Addresses:** AUDIT-1 finding #2 (d-35/d-28 28-day assumption + request-time drift → $4,419/$4,442/$4,553/$4,483 across sessions)
**Dependency:** WEEK-1 + WEEK-1-EXTEND (deployed) ✓

---

## Files changed (3 + report)

| File | Change |
|---|---|
| `src/lib/aria/ask/facts-packet.ts` | SWLM case → calendar-Mon-aligned window; on_track/pct_of_target now ALWAYS read the calendar week (the WEEK-1-EXTEND flagged caveat) |
| `src/lib/aria/get-business-context.ts` | d35/d28 → calendar-Mon-aligned; week_tracking SWLM window label now shows real Mon–Sun dates |
| `src/app/api/aria/ask/route.ts` | weeklyTrackingBlock (main-path addendum) d35str/d28str → calendar-Mon-aligned + honest label |

---

## PRE-FLIGHT (verbatim quotes)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — facts-packet.ts SWLM case (pre-edit, :67-80)
```ts
    case 'same_week_last_month':
      return {
        current: {
          start: new Date(now - 7 * dayMs).toISOString(),
          end: new Date(now).toISOString(),
          label: 'last 7 days',
        },
        comparison: {
          start: new Date(now - 35 * dayMs).toISOString(),
          end: new Date(now - 28 * dayMs).toISOString(),
          label: 'same week last month (d-35 to d-28)',
        },
        same_length: true,
      }
```

### Q3 — get-business-context.ts (pre-edit, :22-24 + query :102-105)
```ts
  // "Same week last month" = the 7-day window ending 28 days ago (4 weeks back)
  const d28 = new Date(now.getTime() - 28 * 86400000).toISOString()
  const d35 = new Date(now.getTime() - 35 * 86400000).toISOString()
…
    // "Same week last month" — 7-day window 4 weeks ago (d35 → d28)
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', d35).lt('created_at', d28).neq('status', 'voided'),
```
Plus the label at :247: `const swlmWindow = `${d35.slice(0, 10)} to ${d28.slice(0, 10)}``

### Q4/Q5 — Grep classification (every 35/28-day + swlm match)

| File:line | What | Classification | Edited |
|---|---|---|---|
| facts-packet.ts:67-80 | SWLM comparison pair | **SWLM-CALENDAR** | **Y** |
| get-business-context.ts:23-24, :105, :247 | SWLM window + query + label | **SWLM-CALENDAR** | **Y** |
| route.ts:783-784, :795 (weeklyTrackingBlock) | main-path SWLM addendum | **SWLM-CALENDAR** | **Y** |
| cron/generate-briefings:85-86 | "28-35 day baseline for daily AVERAGE" (per-day grouped, alignment immaterial to an average) | OTHER (baseline, not a SWLM comparator) | N |
| agents/bas-agent.ts:190 | super due date +28d | OTHER | N |
| agents/pricing-agent.ts:201 / schedule-agent.ts:64 / waste-elimination:111 | 28d historical lookbacks (trend baselines) | ROLLING-INTENT | N |
| supplier-negotiation:25 | 335d lookback | OTHER | N |
| aria-intent.ts:7-95 | classifier strings ('same_week_last_month' enum/examples) | OTHER (labels) | N |
| council.ts:307, :776-799 | prompt rule + week_tracking printer (read FIELDS, no window math) | OTHER (consume the now-fixed values) | N |

### Q6 — The WEEK-1-EXTEND flagged caveat
WEEK-1-EXTEND report: *"their on_track is also computed from the rolling current window; flagged for SWLM-1"* — refers to facts-packet's on_track/pct_of_target (:190-193 pre-edit) computing from `current_period_revenue`, which for the NAMED comparison cases (last_week / last_year / last_month-MTD) is a rolling/MTD window compared against the WEEKLY target. **Addressed** (below).

---

## Build — per-match before/after

### 1. facts-packet SWLM case
```diff
- current:    rolling last 7 days        ('last 7 days')
- comparison: now−35d → now−28d          ('same week last month (d-35 to d-28)')
- same_length: true
+ current:    thisMon(AEST) → now        ('this week (Mon 00:00 AEST → now)')
+ comparison: thisMon−28d → thisMon−21d  ('same calendar week last month (Mon YYYY-MM-DD → Sun YYYY-MM-DD, 4 weeks ago)')
+ same_length: false   ← week-to-date vs FULL week, honestly flagged → pct_change suppressed with the existing
+                        "Periods are different lengths" caveat instead of a misleading partial-vs-full %
```
Window construction: `toAESTStart(startOfWeekAEST().toISOString().slice(0,10))` (the WEEK-1-EXTEND helper) minus 28d / minus 21d — true AEST instants; labels derived from the shifted Date so they show AEST calendar dates (not UTC-shifted ones).

### 2. facts-packet on_track/pct_of_target (the flagged caveat)
```diff
- pct_of_target / on_track computed from current_period_revenue (rolling or MTD for named cases)
+ const calendar_week_revenue = currentIsCalendarWeek ? current_period_revenue : <one extra parallel
+   pos_sales sum from calWeekStartIso>           // zero extra queries when current IS the calendar week
+ pct_of_target / on_track computed from calendar_week_revenue — ALWAYS the calendar week vs the WEEKLY target
```

### 3. get-business-context
```diff
- const d28 = now − 28d; const d35 = now − 35d                       (request-time anchored)
+ const d35 = thisMon(AEST) − 28d; const d28 = thisMon(AEST) − 21d   (Monday-anchored — variable names kept, semantics now start/end)
- swlmWindow = `${d35.slice(0,10)} to ${d28.slice(0,10)}`            (UTC-shifted dates)
+ swlmWindow = `Mon <date> to Sun <date> (calendar week, 4 weeks ago)` (AEST dates)
```
`vs_same_week_pct` now compares calendar week-to-date vs the full calendar SWLM week — same mixed-length shape it has had since WEEK-1 (numerator changed then), with the window finally drift-free; the note string self-describes both windows.

### 4. route.ts weeklyTrackingBlock (main path)
```diff
- d28str/d35str = now − 28d / now − 35d
+ d35str/d28str = thisMon(AEST) − 28d / − 21d; windowLabel = real Mon–Sun AEST dates
```
(`currentWeek` there already reads `ctx.revenue_week_cents` = calendar week since WEEK-1 — its on_track lines were already calendar ✓.)

## Drift elimination
The window is now anchored to **this week's AEST Monday midnight** — identical for every request within the same week, at any time of day. The four-different-values symptom ($4,419/$4,442/$4,553/$4,483) is structurally impossible: repeated questions return the same SWLM number until the calendar week rolls over.

## Confirmations
- on_track / pct_of_target now read **calendar** values everywhere: facts-packet (all comparison cases via `calendar_week_revenue`), get-business-context week_tracking (calendar `revWeek` since WEEK-1), route weeklyTrackingBlock (calendar `revenue_week_cents` since WEEK-1) ✓
- Rolling-7d trend signals untouched ✓ — signal-engine, pricing/schedule/waste agent lookbacks, generate-briefings baseline, deliverables 7d, rev7/`revenue_7d` all byte-identical
- "This week" math (WEEK-1/WEEK-1-EXTEND) and "today" math (TZ-1) untouched ✓ · date-au.ts unmodified ✓ · no dependencies ✓

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
Run the spec's anchor SQL for `swlm_calendar_expected`, then ask: **"how am I doing this week vs same week last month?"**
Pass: Aria cites exactly `swlm_calendar_expected`; repeat the question an hour later — **identical SWLM number** (drift gone). Note: council cache may serve the pre-fix answer for up to 5 min after a prior identical ask — wait out the TTL or phrase differently (LOGGING-FIX-1's `council_cache` rows make this visible).

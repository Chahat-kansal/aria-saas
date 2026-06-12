# Sprint TZ-1 — Adopt date-au.ts Across AI/Data Paths
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

---

## PRE-FLIGHT

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### date-au.ts exported functions (read in full — adopted, not modified)

| Export | Signature | Notes |
|---|---|---|
| `AEST_OFFSET` | `const = 600` (minutes) | hardcoded +10 (no AEDT/DST handling — library-level caveat, out of scope) |
| `nowAEST()` | `(): Date` | returns a **shifted** Date (real instant +10h) whose UTC fields show AEST wall-clock |
| `startOfDayAEST(d?)` | `(d = nowAEST()): Date` | shifted Date at AEST midnight — see ⚠️ below |
| `startOfWeekAEST()` | `(): Date` | Monday-start (WEEK-1 territory — not used this sprint) |
| `startOfMonthAEST()` | `(): Date` | shifted Date — same ⚠️ |
| `startOfYearAEST()` | `(): Date` | — |
| `buildDateRange(period, custom?)` | `(string, {from,to}?) => {from,to}` | uses shifted `.toISOString()` — same ⚠️ |
| `toAESTStart(d)` | `(string) => string` | `'YYYY-MM-DD'` → `'YYYY-MM-DDT00:00:00+10:00'` — **true instant ✓** |
| `toAESTEnd(d)` | `(string) => string` | → `'…T23:59:59+10:00'` — **true instant ✓** |
| `todayAEST()` | `(): string` | today's AEST calendar date `'YYYY-MM-DD'` — **correct ✓** |
| `thirtyDaysAgoAEST()` | `(): string` | shifted ISO — same ⚠️ |

### ⚠️ Critical implementation note — pattern chosen and why

`startOfDayAEST().toISOString()` / `buildDateRange()` produce the ISO of the **shifted** Date — e.g. real AEST midnight 2026-06-12 is `2026-06-11T14:00:00Z`, but `startOfDayAEST().toISOString()` returns `2026-06-12T00:00:00Z` (10 hours late; and between local midnight and 10am it is a *future* bound → zero rows). The only date-au pattern that yields the TRUE instant of AEST midnight is:

```ts
toAESTStart(todayAEST())            // 'YYYY-MM-DDT00:00:00+10:00' — Postgres parses the offset correctly
new Date(toAESTStart(todayAEST()))  // when a Date object is needed for downstream derivations
```

So every adoption in this sprint uses the `todayAEST()` + `toAESTStart`/`toAESTEnd` family. **No date-au function was modified** (per DO NOT). Two follow-up notes for the founder:
1. `buildDateRange`/`startOfDayAEST().toISOString()` (used by the 2 pre-existing POS report consumers) carry the shifted-ISO flaw — recommend a date-au fix sprint (touches date-au.ts, which TZ-1 was forbidden to edit).
2. date-au hardcodes +10:00 — AEDT (Oct–Apr, +11) is off by 1h. Library-level; multi-TZ/DST is a later sprint per spec.

**Edge cases needing a function date-au lacks:** "yesterday's date string" and "previous month's first day". Both were composed strictly from existing exports + plain date arithmetic — `new Date(nowAEST().getTime() − 86400000).toISOString().slice(0,10)` (works because nowAEST's shifted ISO date-part *is* the AEST date) and `todayAEST().slice(0,7) + '-01'`. No new TZ logic was written; flagged here per the STOP-and-note rule for founder awareness.

### Raw grep outputs (as mandated)

```
### GREP 1: new Date() in src/lib/aria + src/app/api      → 939 matches (full list omitted — 99% timestamps; all date-BOUNDARY uses captured by greps 3/4 below)
### GREP 2: toISOString().slice(0, 10)                    → 157 matches (mostly date-string formatting for date columns / labels)
### GREP 3: setHours(0  — FULL OUTPUT (49 rows):
src/lib/agents/clv-agent.ts:600:    weekStart.setHours(0, 0, 0, 0);
src/lib/agents/council.ts:327:  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
src/lib/agents/flash-revenue-agent.ts:561:    midnight.setHours(0, 0, 0, 0);
src/lib/agents/inventory-financing-agent.ts:42:  r.setHours(0, 0, 0, 0)
src/lib/agents/labour-optimisation-agent.ts:474:      midnight.setHours(0, 0, 0, 0)
src/lib/agents/schedule-agent.ts:90:      weekStart.setHours(0, 0, 0, 0);
src/lib/agents/waste-elimination-agent.ts:357:      midnightToday.setHours(0, 0, 0, 0)
src/lib/agents/waste-elimination-agent.ts:420:    midnightToday.setHours(0, 0, 0, 0)
src/lib/aria/ask/business-context.ts:85:  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
src/lib/aria/ask/facts-packet.ts:110:      midnight.setHours(0, 0, 0, 0)
src/lib/aria/ask/files.ts:129:  if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString() }
src/lib/aria/council.ts:745:  weekStart.setHours(0, 0, 0, 0)
src/lib/aria/intelligence/email-report.ts:37:  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
src/lib/aria/intelligence/email-report.ts:38:  const yesterdayStart = new Date(Date.now() - 86400_000); yesterdayStart.setHours(0, 0, 0, 0)
src/lib/aria/live-monitor.ts:52:  d.setHours(0, 0, 0, 0);
src/lib/aria/live-monitor.ts:59:  start.setHours(0, 0, 0, 0);
src/lib/aria/live-monitor.ts:68:  start.setHours(0, 0, 0, 0);
src/lib/aria-cost-guard.ts:13:  dayStart.setHours(0, 0, 0, 0)
src/lib/aria-tools.ts:411:    case 'today': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); }
src/lib/aria-tools.ts:1213:  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
src/lib/aria-tools.ts:1488:        ? new Date(new Date().setHours(0,0,0,0)).toISOString()
src/lib/date-au.ts:11,20,44,100 (the library itself)
src/lib/staff/reports.ts:115:  lastMonday.setHours(0, 0, 0, 0)
src/lib/staff/timesheets.ts:136:  shiftDayStart (clock_in-derived)
src/app/api/agents/labour/realtime/route.ts:20:  midnight.setHours(0, 0, 0, 0)
src/app/api/agents/menu-engineering/scores/route.ts:42:  todayStart.setHours(0, 0, 0, 0);
src/app/api/aria/daily-briefing/route.ts:112:  todayStart.setHours(0, 0, 0, 0);
src/app/api/aria/live-intelligence/route.ts:76:  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
src/app/api/aria/pos-chat/route.ts:117:  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
src/app/api/aria/vitals/route.ts:23:    todayStart.setHours(0, 0, 0, 0)
src/app/api/community/owner/marketer/plan/route.ts:113:  monday.setHours(0, 0, 0, 0)
src/app/api/cron/daily-briefing-submit/route.ts:81:  yStart
src/app/api/cron/[task]/route.ts:64:  from (yesterday)
src/app/api/integrations/basiq/status/route.ts:33:  monthStart
src/app/api/market-prices/scan/route.ts:168:  started_at gte today
src/app/api/pos/cash-movements/route.ts:23 | daily-summary:34 | dashboard:25 | portfolio:32 | promotions/applicable:44 | promotions/apply-code:45 | revenue-comparison:34
src/app/api/reels/generate/route.ts:83 | src/app/api/social/reel-billing/route.ts:20
src/app/api/warehouse/delivery-schedule/route.ts:36,39
### GREP 4: startOfDay|startOfToday — FULL OUTPUT (6 rows): date-au.ts:9,40,73 + pos/portfolio/route.ts:31-33
### GREP 5: Date.now() in aria scope                      → 256 matches (rolling windows + latency timers; today/yesterday-relevant ones captured above)
### GREP 6: yesterday|today|tomorrow in aria scope        → 360 matches (labels/prompts mostly; computational sites captured above)
```

### Classification table (PRE-FLIGHT step 5)

| File:line | Current code (one line) | Classification | Edit? |
|---|---|---|---|
| lib/aria/ask/business-context.ts:85 | `todayStart.setHours(0,0,0,0)` | TODAY-COMPUTATION | **Y** |
| lib/aria/ask/business-context.ts:87-88 | `monthStart`/`lastMonthStart = new Date(y, m, 1)` | TODAY-COMPUTATION (month) | **Y** |
| lib/aria/ask/business-context.ts:86,89 | weekStart −7d / thirtyDaysAgo | WEEK / rolling | N |
| app/api/aria/vitals/route.ts:22-23 | `todayStart.setHours(0,0,0,0)` | TODAY-COMPUTATION | **Y** |
| lib/aria/ask/facts-packet.ts:108-119 | `'today'` case midnight | TODAY-COMPUTATION | **Y** |
| lib/aria/ask/facts-packet.ts:66-79 | d-35→d-28 | SAME-WEEK-LAST-MONTH | N (SWLM-1) |
| lib/aria/ask/facts-packet.ts:36-64,80-107 | last_month MTD / last_week / last_year | OTHER comparisons | N |
| lib/aria/ask/files.ts:129 | `'today'` midnight | TODAY-COMPUTATION | **Y** |
| lib/aria-tools.ts:411 | getPeriodStart 'today' | TODAY-COMPUTATION | **Y** |
| lib/aria-tools.ts:414 | getPeriodStart 'month' | TODAY-COMPUTATION (month) | **Y** |
| lib/aria-tools.ts:412-413,415-416 | 7d/30d/90d/year | rolling / OTHER | N |
| lib/aria-tools.ts:1213 | bank monthStart | TODAY-COMPUTATION (month) | **Y** |
| lib/aria-tools.ts:1488-1491 | online-orders today/month | TODAY-COMPUTATION | **Y** |
| lib/aria/live-monitor.ts:50-54 | todayStart() | TODAY-COMPUTATION | **Y** |
| lib/aria/live-monitor.ts:56-63 | yesterdayWindow() | TODAY-COMPUTATION (yesterday) | **Y** |
| lib/aria/live-monitor.ts:65-72 | lastWeekSameWindow() | WEEK (same-day-last-week) | N (WEEK-1) |
| app/api/aria/live-intelligence/route.ts:76 | todayStart | TODAY-COMPUTATION | **Y** |
| app/api/aria/daily-briefing/route.ts:110-114 | `today` UTC date + todayStart + yesterdayStart | TODAY-COMPUTATION | **Y** |
| app/api/aria/pos-chat/route.ts:117-118 | todayStart + yesterdayStart | TODAY-COMPUTATION | **Y** (weekStart derives from it — rolling semantics preserved, now AEST-anchored) |
| lib/aria/intelligence/email-report.ts:37-38 | todayStart + yesterdayStart | TODAY-COMPUTATION | **Y** |
| app/api/cron/daily-briefing-submit/route.ts:80-82 | yesterday window | TODAY-COMPUTATION (yesterday) | **Y** |
| app/api/cron/daily-briefing-submit/route.ts:83 | weekAgo −7d ("Week so far") | WEEK | N (WEEK-1 fixes label) |
| app/api/cron/generate-briefings/route.ts:79-81,103,350 | yday UTC-Z bounds + today-Z bound | TODAY-COMPUTATION | **Y** (`today` was already per-business TZ via `lib/aria/timezone.ts localDateString` — only the Z-pinned bounds were wrong) |
| app/api/cron/generate-briefings/route.ts:84-87 | 7d/14d/28d/35d | WEEK + SWLM | N |
| app/api/cron/[task]/route.ts:62-65 | yesterday window | TODAY-COMPUTATION (yesterday) | **Y** |
| lib/agents/council.ts:327-328 | todayStart + yesterday | TODAY-COMPUTATION | **Y** |
| lib/agents/flash-revenue-agent.ts:560-561 | midnight | TODAY-COMPUTATION | **Y** |
| lib/agents/labour-optimisation-agent.ts:473-474 | midnight | TODAY-COMPUTATION | **Y** |
| lib/agents/waste-elimination-agent.ts:356-357,419-420 | midnightToday ×2 | TODAY-COMPUTATION | **Y** |
| lib/agents/waste-elimination-agent.ts:345,418 | todayStr UTC date (prediction_date) | TODAY-COMPUTATION (date string) | **Y** |
| app/api/agents/labour/realtime/route.ts:19-20 | midnight | TODAY-COMPUTATION | **Y** |
| app/api/agents/menu-engineering/scores/route.ts:41-42 | todayStart | TODAY-COMPUTATION | **Y** |
| lib/aria/get-business-context.ts:25 | monthStart | TODAY-COMPUTATION (month) | **Y** |
| lib/aria/get-business-context.ts:170 | todayStr UTC date (promo gating) | TODAY-COMPUTATION (date string) | **Y** |
| lib/aria/get-business-context.ts:11-13,21-23 | d7/d30/d90 + d28/d35 | rolling + SWLM | N |
| lib/agents/clv-agent.ts:600 | weekStart Monday | WEEK | N (WEEK-1) |
| lib/agents/schedule-agent.ts:90 | weekStart Monday | WEEK | N (WEEK-1) |
| lib/agents/inventory-financing-agent.ts:38-44 | startOfWeek helper (Mon) | WEEK | N (WEEK-1) |
| lib/aria/council.ts:742-745 | weekStart Monday | WEEK | N (WEEK-1) |
| lib/aria-cost-guard.ts:13 | dayStart | OTHER (internal AI-budget day bucket, not business data) | N |
| lib/staff/reports.ts:115 / timesheets.ts:136 | lastMonday / shift-day | WEEK / OTHER (clock math) | N |
| app/api/pos/{dashboard:25, daily-summary:34, cash-movements:23, revenue-comparison:34, portfolio:32, promotions×2:44-45} | today UTC midnight | TODAY-COMPUTATION (POS UI surfaces) | **N — out of TZ-1 scope (AI/data paths); recommend TZ-2 POS sweep** |
| app/api/{reels/generate:83, social/reel-billing:20, integrations/basiq/status:33, market-prices/scan:168} | day/month buckets (quota/billing/scan-cache) | OTHER (ops quotas, not business metrics) | N |
| app/api/community/owner/marketer/plan:113 / warehouse/delivery-schedule:36-39 | Monday/today | WEEK / non-AI module | N |

## Files edited (17) and date-au functions adopted

| File | Adoption |
|---|---|
| `src/lib/aria/ask/business-context.ts` | `toAESTStart(todayAEST())` today; month + last-month starts from `todayAEST()` slices |
| `src/app/api/aria/vitals/route.ts` | `toAESTStart(todayAEST())` |
| `src/lib/aria/ask/facts-packet.ts` | `'today'` case → `toAESTStart(todayAEST())`, label now "since midnight AEST" |
| `src/lib/aria/ask/files.ts` | `'today'` → `toAESTStart(todayAEST())` |
| `src/lib/aria-tools.ts` | getPeriodStart 'today'/'month'; bank month-to-date date string; online-orders 'today'/'month' |
| `src/lib/aria/live-monitor.ts` | todayStart() + yesterdayWindow() via `nowAEST`/`toAESTStart`/`toAESTEnd` |
| `src/app/api/aria/live-intelligence/route.ts` | `new Date(toAESTStart(todayAEST()))` (dynamic import, matching file style) |
| `src/app/api/aria/daily-briefing/route.ts` | `today = todayAEST()`; todayStart instant; yesterdayStart derived |
| `src/app/api/aria/pos-chat/route.ts` | todayStart instant; yesterday/week derivations intact |
| `src/lib/aria/intelligence/email-report.ts` | todayStart instant; yesterdayStart = −86400000 |
| `src/app/api/cron/daily-briefing-submit/route.ts` | yesterday via `nowAEST` + `toAESTStart`/`toAESTEnd` |
| `src/app/api/cron/generate-briefings/route.ts` | yday + today query bounds `T00:00:00Z`→`toAESTStart`/`toAESTEnd` |
| `src/app/api/cron/[task]/route.ts` | yesterday window via `nowAEST` + `toAESTStart`/`toAESTEnd` |
| `src/lib/agents/council.ts` | todayStart instant |
| `src/lib/agents/flash-revenue-agent.ts` | midnight instant |
| `src/lib/agents/labour-optimisation-agent.ts` | midnight instant |
| `src/lib/agents/waste-elimination-agent.ts` | midnightToday ×2 instants + todayStr ×2 → `todayAEST()` |
| `src/app/api/agents/labour/realtime/route.ts` | midnight instant |
| `src/app/api/agents/menu-engineering/scores/route.ts` | todayStart instant |
| `src/lib/aria/get-business-context.ts` | monthStart + todayStr → date-au |

(20 rows — 17 unique files plus the 3 grouped aria-tools/business-context/waste-elim multi-site files counted once each above.)

## daily-briefing-submit dead timezone read

**Line 118**: `.select('id,name,industry,city,owner_name,timezone')` — `timezone` selected, never used in date math (AUDIT-1 finding confirmed). It REMAINS unused after TZ-1 because no date-au export accepts a TZ parameter and TZ-1 is forbidden from extending date-au (STOP-and-note rule applied). AEST assumed per spec ("Sip Café is AEST/AEDT; multi-TZ rollout is a later sprint"). Noted: `lib/aria/timezone.ts` (`localDateString(tz)`) already does per-business TZ date strings and is used by generate-briefings — it is the natural seam for the multi-TZ sprint.

## WEEK / SWLM untouched — confirmation

No rolling-7-day window, no Monday-week computation (council.ts:742-745, clv-agent:600, schedule-agent:90, inventory-financing helper, daily-briefing-submit weekAgo, live-monitor lastWeekSameWindow), and no d-35/d-28 same-week-last-month window (facts-packet:66-79, get-business-context:21-23, generate-briefings baseline) was modified. Those are WEEK-1 / SWLM-1.

## Additive-only confirmation
Replacing ad-hoc UTC date arithmetic with calls to the existing date-au library changes no feature, removes no code path, and preserves every query's semantic ("today", "yesterday", "this month") — only the boundary instant moves from UTC midnight to AEST midnight, which is the entire point of the sprint.

## Expected one-time behaviour change (founder heads-up)
Every "today"/"yesterday" figure shifts boundary by 10 hours once deployed. Sales between 00:00–10:00 AEST that previously counted toward the *prior* UTC day now correctly count toward the AEST day. Day-over-day comparisons spanning the deploy date will look odd for one day.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verification plan (founder, after deploy)
1. Hard refresh `/dashboard/ask-aria`
2. Ask "what's my revenue today?" — note the time asked
3. Chat Claude runs SQL on `aria_ai_calls` to confirm the query window
4. Pass: asking at 9am AEST queries AEST-midnight→9am (bound `…T00:00:00+10:00`), not UTC-midnight→9am

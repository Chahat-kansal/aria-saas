# Sprint WEEK-1-EXTEND — The Council's Rolling-7d Gap
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green

> The "13th file" turned out to be **two council-internal reads**, both unedited by WEEK-1:
> (1) `facts-packet.ts:134` — the DEFAULT current window (no comparison period detected, exactly
> the "how am I doing this week?" case) fell back to **rolling now−7d**, and on_track/pct_of_target
> were computed from it against the WEEKLY target — then injected into the synthesis as
> "INTENT-GROUNDED FACTS (highest priority)". That is the $78.
> (2) `council.ts:717` — the VERIFIED FIGURES printer told the synthesis to use `revenue_7d`
> "verbatim" for week questions, and never printed WEEK-1's `current_week_revenue` at all.

---

## Files changed (2 + report)

| File | Change |
|---|---|
| `src/lib/aria/ask/facts-packet.ts` | Default (null-period) current window: rolling now−7d → calendar Mon 00:00 AEST → now; label 'last 7 days' → 'this week (Mon 00:00 AEST → now)'; `startOfWeekAEST` import |
| `src/lib/aria/council.ts` | `revenue_7d` relabelled as ROLLING trend (not "this week"); `current_week_revenue` line ADDED to the week-tracking printer (field existed since WEEK-1, was never surfaced) |

---

## PRE-FLIGHT

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Step 2 — Grep output (verbatim; GREP A total = 128 matches across src/lib+src/app/api — the aria-scope revenue-relevant lines below; non-aria ops/cron caching/expiry matches omitted from the table but counted)

```
### GREP A (src/lib/aria + src/app/api/aria, 7*86400/7*24*60 windows):
src/lib/aria/agents/automation-agent.ts:37:    .gt('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
src/lib/aria/deliverables.ts:355:  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
src/lib/aria/hypothesis/generate.ts:48:  const day7ago  = …
src/lib/aria/hypothesis/generate.ts:184:  expires_at: … + 7d
src/lib/aria/hypothesis/outcome-learning.ts:68,145,187,243: 7d windows
src/lib/aria/parallel-tasks.ts:17,41,78: week7 / since / weekStart = now − 7d
src/app/api/aria/briefing/route.ts:146,151: sevenDaysAgo
src/app/api/aria/business-health-quick/route.ts:64: sevenDaysAgo
src/app/api/aria/command/route.ts:199: sevenDaysAgo
src/app/api/aria/competitor-review-analysis/route.ts:67 | competitor-watches:40,126 | competitors:58
src/app/api/aria/daily-briefing/route.ts:321,338,482: 7d windows
src/app/api/aria/daily-narrative/route.ts:60: ago7d
src/app/api/aria/explain-metric/route.ts:76 | influencer/generate:103

### GREP B (revenue_7d|weekly_revenue|week_revenue|this week labels in src/lib/aria):
src/lib/aria/ask/facts-packet.ts:13,138,147-149,176-178,189: weekly_revenue_target machinery
src/lib/aria/ask/suggestions.ts:32: Revenue this week: $((ctx.revenue_week_cents)/100)   ← WEEK-1 source, calendar ✓
src/lib/aria/council.ts:290: prompt rule (weekly target)
src/lib/aria/council.ts:717: revenue_7d = … ← exact figure for "last week" / "7-day" revenue — use verbatim   ← THE LABEL
src/lib/aria/council.ts:738,751-757,769,788-793: weekly_revenue_target printer lines
```

### Step 3 — WEEK-1 exclusions
WEEK-1's 12 files (from reports/sprint-WEEK-1-report.md): business-context, ask/route.ts, daily-briefing-submit, council.ts(weekStart only), get-business-context, pos-chat, files.ts, aria-tools, roster, clv-agent, parallel-tasks(wording), + report. **council.ts's verified-figures printer and facts-packet.ts's default window were NOT touched by WEEK-1** — facts-packet was explicitly classified "N (comparison machinery)"; the null-period default was missed by that classification because it isn't a comparison — it's the no-comparison fallback.

### Step 4 — Classification table (non-WEEK-1 matches)

| File:line | Window | Read by council? | Classification | Edit |
|---|---|---|---|---|
| **facts-packet.ts:134 (default currentStart)** | now−7d | YES — buildFactsPacket called at route.ts:653 for EVERY council request; printed as INTENT-GROUNDED FACTS "highest priority" (council.ts:780-797) with on_track/pct vs WEEKLY target | **COUNCIL-READ** | **Y** |
| **council.ts:717 (revenue_7d label)** | (labels get-business-context rev7) | YES — the only weekly-ish dollar line the synthesis saw; current_week_revenue never printed | **COUNCIL-READ (label + missing line)** | **Y** |
| facts-packet.ts:80-107 (last_week / SWLM / last_year current+comparison windows) | now−7d pairs | yes, when a comparison IS named | ROLLING-INTENT (honest "last 7 days" like-for-like pairs; SWLM-1 adjacent) | N — caveat noted: their on_track is also computed from the rolling current window; flagged for SWLM-1 |
| parallel-tasks.ts:17,41,78 | now−7d | NO — briefing parallel tasks (buildBriefingTasks), not the chat council | OTHER (briefing pipeline; :78 labour metric honestly labelled "7-day" since WEEK-1) | N |
| hypothesis/generate.ts:48 + outcome-learning.ts ×4 | now−7d | NO — hypothesis cron | ROLLING-INTENT | N |
| deliverables.ts:355 | now−7d | NO — deliverable dashboards ("7d" labelled) | ROLLING-INTENT | N |
| briefing/route.ts:146,151 · daily-briefing:321,338,482 · daily-narrative:60 · business-health-quick:64 | now−7d | NO — briefing/dashboard context counts | ROLLING-INTENT / OTHER | N |
| command/route.ts:199 | now−7d | NO — AriaCommandBar surface (COMMAND-FIX-1 territory) | OTHER | N |
| competitor-*/influencer/explain-metric/automation-agent | now−7d | NO — caches, expiries, niche analyses | OTHER | N |
| get-business-context d7/rev7 (`revenue.last_7_days`) | now−7d | YES — but as the honestly-named rolling trend field; council.ts:717 label fix makes the synthesis treat it correctly | ROLLING-INTENT (kept per WEEK-1 decision) | N (label fixed council-side) |

Checked specifically per spec: `lib/aria/agents/*.ts` → only rostering-agent (param-driven) + message-agent/query-agent/automation-agent (no week revenue windows beyond automation:37 dedupe — OTHER). `memory/recall.ts` → no revenue windows (7-day summaries window is conversation recency, not revenue). `business-context-bundle.ts` → **does not exist**. `parallel-tasks.ts` → briefing-only (table above).

## Before/after diffs

**facts-packet.ts:134** (+ label at :154):
```diff
-  const currentStart = pair?.current.start ?? new Date(now - 7 * 86_400_000).toISOString()
+  // WEEK-1-EXTEND: when NO comparison period was detected … calendar week, not rolling 7 days
+  const currentStart = pair?.current.start ?? toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))
…
-  const current_window = pair?.current.label ?? 'last 7 days'
+  const current_window = pair?.current.label ?? 'this week (Mon 00:00 AEST → now)'
```

**council.ts:717 + week-tracking printer:**
```diff
-    if (rev7 != null) lines.push(`  revenue_7d = ${…}  ← exact figure for "last week" / "7-day" revenue — use verbatim`)
+    if (rev7 != null) lines.push(`  revenue_7d = ${…}  ← ROLLING last-7-days trend figure. NOT "this week" — for "this week" use current_week_revenue below`)
…
     const weekTracking = ctx?.week_tracking as {
+      current_week_revenue?: number | null
       same_week_last_month_revenue?: number | null
…
     if (weekTracking) {
+      if (weekTracking.current_week_revenue != null) {
+        lines.push(`  current_week_revenue = ${…}  ← "THIS WEEK" (calendar week, Mon 00:00 AEST → now). USE THIS for "this week" … — NEVER revenue_7d`)
+      }
```

## Rolling-intent untouched — confirmation
revenue_velocity / signal-engine windows, rev7 (`revenue.last_7_days`) itself, deliverables 7d, hypothesis windows, briefing context counts, live-monitor — all unmodified. SWLM d-35/d-28 untouched. date-au.ts unmodified. No WEEK-1 file's window re-edited (council.ts/facts-packet.ts edits touch lines WEEK-1 did not).

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
Ask: **"how am I doing this week?"** → expect the calendar-week number ($7 for Sip, NOT $78).
```sql
select
  (select coalesce(sum(total_amount),0) from pos_sales
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and status='completed'
   and created_at >= date_trunc('week', (now() at time zone 'Australia/Sydney')::date)::timestamp at time zone 'Australia/Sydney') as calendar_week,
  (select coalesce(sum(total_amount),0) from pos_sales
   where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and status='completed'
   and created_at >= now() - interval '7 days') as rolling_7d;
```
Pass: Aria's "this week" = `calendar_week`. The synthesis now receives the calendar figure THREE ways: facts-packet current_period_revenue (highest priority), week_tracking current_week_revenue (verified figures), and the rev7 line explicitly disclaiming itself.

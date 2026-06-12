# Sprint WEEK-1 — Calendar Week (Mon–Sun AEST) Replaces Rolling-7d
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green
**Addresses:** AUDIT-1 finding #3 (+ the council.ts:744 / clv-agent 3-way week split from AUDIT-1-COMPLETE §3 Metric 2)

---

## Pre-flight

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### date-au.ts week helpers confirmed
`startOfWeekAEST(): Date` — Monday-start (`diff = day === 0 ? -6 : 1 - day`), returns a *shifted* Date. Per the TZ-1 finding, the AEST-safe pattern used throughout this sprint is:
```ts
toAESTStart(startOfWeekAEST().toISOString().slice(0, 10))   // 'YYYY-MM-DDT00:00:00+10:00' — true instant of AEST Monday midnight
```
(The shifted Date's ISO date-part IS the AEST calendar date, and `toAESTStart` pins it to the +10:00 instant.) `date-au.ts` itself unmodified.

### Raw grep outputs

```
### GREP A: interval '7 days' / now() - interval '7   → ZERO matches (no raw-SQL interval usage in src)

### GREP B: this week | thisWeek | this_week | week_so_far | currentWeek (decisive rows; prompt-text/regex rows omitted from table but listed here)
src/lib/aria/ask/suggestions.ts:32: Revenue this week: $${((ctx.revenue_week_cents) / 100).toFixed(2)}
src/app/api/aria/ask/route.ts:721-733: currentWeek = ctx.revenue_week_cents / 100 → "Current 7-day revenue vs target"
src/lib/aria/signal-engine.ts:93,176,199-235: this_week payloads (trend signals vs 4-week baselines)
src/lib/aria/parallel-tasks.ts:99: "no clock-in data this week" (empty-state wording)
src/lib/aria/live-monitor.ts:18,264: urgency enum 'this_week' (not a window)
src/lib/aria/memory/extract.ts:43-47 / response-validator.ts:15 / intent.ts:81 / council.ts:315-414,724 / context-brain.ts:63-73 / system-prompt.ts:196: prompt text & regexes (no windows)
src/app/api/agents/reputation/route.ts:71: this_week_count

### GREP C: weekStart | startOfWeek | monday (computational rows)
src/lib/aria/ask/business-context.ts:91: weekStart = now − 7d              ← rolling labelled "this week"
src/lib/aria/council.ts:743-745: server-TZ Monday
src/app/api/aria/pos-chat/route.ts:121-122: todayStart − 7d → "THIS WEEK: A$" (line 289)
src/lib/aria/parallel-tasks.ts:78: now − 7d (labour ratio)
src/app/api/aria/roster/route.ts:44: server-TZ Monday default week_starting
src/lib/agents/clv-agent.ts:599-601: SUNDAY-anchored server-TZ week (dedup)
src/lib/agents/schedule-agent.ts:89-91: weekStart = TOMORROW (next-7-days roster forecast)
src/lib/aria/agents/rostering-agent.ts:31-139: weekStart is a caller-supplied param (no computation)
src/lib/aria/ask/action-executor.ts:247,337 / deliverables:230 / slow-day:21 / various: day-name arrays only
```

### Classification table

| File:line | Window | Label/use | Classification | Edited? |
|---|---|---|---|---|
| lib/aria/ask/business-context.ts:91,109 | now−7d | `revenue_week_cents` → "Revenue this week" in prompts/suggestions | **WEEK-INTENT** | **Y** |
| app/api/aria/ask/route.ts:728 | (consumes above) | "Current 7-day revenue vs target" addendum label | **WEEK-INTENT (label)** | **Y** (label now "This week (Mon 00:00 AEST → now)") |
| app/api/cron/daily-briefing-submit:83,101,141 | now−7d | prompt "Week so far: A$X" — the AUDIT-1 #3 verbatim mislabel | **WEEK-INTENT** | **Y** |
| lib/aria/council.ts:743-745 | server-TZ Monday | Gemini context-brain "Week starting:" | **WEEK-INTENT (wrong TZ)** | **Y** |
| lib/aria/get-business-context.ts week_tracking:231-263 | rev7 (now−7d) | "on track?" vs WEEKLY target + "vs current week" | **WEEK-INTENT** | **Y** (new calendar-week query added; rev7 kept for honest 7d trend fields) |
| app/api/aria/pos-chat:121-122,289 | todayStart−7d | "THIS WEEK: A$" | **WEEK-INTENT** | **Y** |
| lib/aria/ask/files.ts:130 | now−7d | export period 'week' | **WEEK-INTENT** | **Y** |
| lib/aria-tools.ts (online-orders 'week') | now−7d | query_online_orders period 'week' | **WEEK-INTENT** | **Y** |
| app/api/aria/roster/route.ts:44 | server-TZ Monday | default roster week_starting | **WEEK-INTENT (wrong TZ)** | **Y** |
| lib/agents/clv-agent.ts:599-601 | SUNDAY server-TZ | "already scored this week" dedup | **WEEK-INTENT (wrong anchor + TZ)** | **Y** (now Mon AEST — note: anchor change Sun→Mon documented) |
| lib/aria/parallel-tasks.ts:78,99-102 | now−7d | output label says "7-day labour cost" (honest); only the empty-state said "this week" | **ROLLING-INTENT** | wording fix only ("this week"→"in the last 7 days"), window kept |
| lib/aria/signal-engine.ts (5 windows) | now−7d vs 4-wk baseline | trend signals (payment drift, basket trend, day-of-week anomaly, velocity) | ROLLING-INTENT | N |
| lib/aria/get-business-context.ts d7/rev7 + top_products_7d | now−7d | fields named `*_7d` (honest) | ROLLING-INTENT | N (kept; also still feeds yoy_7d) |
| lib/aria/ask/facts-packet.ts last_week/SWLM/last_year current windows | now−7d | labelled "last 7 days" (honest); comparison machinery | ROLLING-INTENT / SWLM-1 adjacent | N |
| lib/aria-tools.ts getPeriodStart '7d' | now−7d | period literally named '7d' | ROLLING-INTENT | N |
| lib/aria/deliverables.ts rev7 | now−7d | 7-day dashboard | ROLLING-INTENT | N |
| lib/aria/live-monitor.ts lastWeekSameWindow | same day −7d | day-vs-same-day-last-week trend | ROLLING-INTENT | N |
| lib/agents/schedule-agent.ts:89-91 | tomorrow +7d | forward roster forecast (not "this week") | OTHER | N |
| lib/aria/agents/rostering-agent.ts | param | caller supplies week_starting | OTHER | N |
| lib/aria/live-monitor.ts:18,264 | — | 'this_week' urgency enum value | OTHER | N |
| memory/extract, response-validator, intent.ts, system-prompt.ts, context-brain prompt text | — | regexes/prompt copy | OTHER | N |

**Spec-target notes (honesty):**
- `src/lib/aria/facts-packet.ts` "the `week_so_far` case" — **no such case exists** in facts-packet.ts (cases: last_month, same_week_last_month, last_week, last_year, today). Its comparison windows are honestly labelled "last 7 days" and are SWLM-1-adjacent machinery — untouched.
- `src/lib/aria/aria-tools.ts` "query_business_data 'this_week' period resolver" — **query_business_data has no period resolver** (it takes since/until filters); the period resolvers are `getPeriodStart` (periods named '7d'/'30d' — honest, kept) and `query_online_orders`'s 'week' (converted ✓).
- `src/app/api/aria/briefing/route.ts` — its `sevenDaysAgo` windows feed "last 7 days" context counts (activity, cash sessions, market scans) — honest rolling stats, no "this week" label → not converted.
- schedule-agent uses no Monday math (forward-looking next-7-days) → untouched.

## Files edited (12)

| File | Change |
|---|---|
| `src/lib/aria/ask/business-context.ts` | `weekStart` → AEST Monday instant (revenue_week_cents = calendar week) |
| `src/app/api/aria/ask/route.ts` | addendum label "Current 7-day revenue" → "This week (Mon 00:00 AEST → now) revenue" (data-label only — system prompt rules untouched) |
| `src/app/api/cron/daily-briefing-submit/route.ts` | `weekAgo` → AEST Monday instant — "Week so far" now truthful |
| `src/lib/aria/council.ts` | server-TZ Monday → AEST Monday instant (feeds Gemini context-brain) |
| `src/lib/aria/get-business-context.ts` | NEW calendar-week pos_sales query (Mon AEST→now, voided-filtered); `week_tracking` now computes on_track/pct_of_target/vs_SWLM/note from `current_week_revenue`; `current_7d_revenue` field kept (additive) |
| `src/app/api/aria/pos-chat/route.ts` | weekStart → AEST Monday instant ("THIS WEEK" truthful) |
| `src/lib/aria/ask/files.ts` | export period 'week' → AEST Monday |
| `src/lib/aria-tools.ts` | query_online_orders 'week' → AEST Monday |
| `src/app/api/aria/roster/route.ts` | default week_starting → AEST Monday date |
| `src/lib/agents/clv-agent.ts` | weekly-scoring dedup window → Mon AEST (was Sunday server-TZ — anchor change means one transition week may re-score some customers once) |
| `src/lib/aria/parallel-tasks.ts` | empty-state wording "this week" → "in the last 7 days" (window unchanged — honest rolling metric) |
| `reports/sprint-WEEK-1-report.md` | this report |

## Out-of-scope confirmation
- d-35/d-28 same-week-last-month windows untouched (SWLM-1) — facts-packet:66-79, get-business-context d28/d35, generate-briefings baseline.
- "Today" math untouched (TZ-1 done).
- All legitimate rolling-7d trend signals kept (signal-engine ×5, deliverables, live-monitor, getPeriodStart '7d', rev7/top_products_7d).
- No UI components, no system-prompt rules, no BlockRenderer changes. No new dependencies. date-au.ts unmodified.

## Additive-only confirmation
Windows labelled "this week" now compute the calendar week they claim; rolling windows that honestly say "7-day" are untouched; `week_tracking` gained a field (`current_week_revenue`) without removing `current_7d_revenue`.

## Expected user-visible change
"This week" answers drop from rolling-7d figures (e.g. Sip $615.50) to true calendar-week figures (currently $7) — this IS the fix, per the sprint's why. Early-week numbers will look small on Mondays/Tuesdays because they are.

## Verification (founder + chat Claude, post-deploy)
```sql
select coalesce(sum(total_amount),0) from pos_sales
where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and status='completed'
and created_at >= (now() AT TIME ZONE 'Australia/Sydney')::date - extract(dow from now() AT TIME ZONE 'Australia/Sydney')::int + 1;
```
Then ask Aria: **"how am I doing this week?"** — PASS = the number matches the SQL (currently $7).
Also check the next morning briefing: "Week so far" should equal the same calendar-week sum, not the rolling-7d figure.
(Note: date-au is fixed +10:00 AEST while the SQL uses Australia/Sydney — during AEDT (Oct–Apr) they differ by 1h at the boundary; in June they agree. Library-level DST caveat carried over from TZ-1.)

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

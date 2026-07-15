# BRIEF-INTEGRITY-1 — Daily Briefing Integrity Fix

Live production bug. Fixed and verified this sprint; commit `b17b93d9`.

## Was it still live? Yes, at the moment this sprint started.

Full scan of `aria_daily_briefings` against the two confirmed scaffold markers
(`DO NOT open`, `prior briefings`), joined to `businesses` to separate real customers from test
fixtures:

| Business | Status | Leaked rows | Total rows | Date range | Latest leak |
|---|---|---|---|---|---|
| **Sip Café** | active, paying | **17** | 49 | 2026-05-22 → 2026-07-15 | 2026-07-14 |
| Global Liquor | trial | 5 | 6 | 2026-07-10 → 2026-07-15 | **2026-07-15 (today)** |
| Aria Test Liquor | trial, self-labeled test | 1 | 2 | 2026-07-11 → 2026-07-15 | 2026-07-15 |
| Sip (E2E Test) | trial, explicit E2E fixture | 0 | 1 | 2026-07-15 | — |

**Sip Café is the one real, active, paying customer.** Over a third of its stored briefings
(17/49) leaked raw prompt scaffolding, going back to the earliest row in the table
(2026-05-22 — this has likely been happening since the `generate-briefings.ts` "parallel"
pipeline was first shipped, not a recent regression).

**Global Liquor's briefing was actively leaking scaffold text at the moment this diagnosis ran**
(2026-07-15, before this sprint's fix was committed) — this was not a historical-only bug.

**Why Sip Café's own *today* (2026-07-15) row looked clean before the fix**: this repo runs two
independent briefing pipelines that write to the same `aria_daily_briefings` row with no
discriminator in the upsert key (`business_id, briefing_date` only — see "Related finding,
deferred" below). The Batch API pipeline (`daily-briefing-submit`/`daily-briefing-poll`, clean,
real prose) happened to run *after* the leaking "parallel" pipeline
(`generate-briefings.ts`) for 2026-07-15 and overwrote it. This was luck, not a fix — the
"parallel" pipeline runs on the same schedule every day and would have leaked again on
2026-07-16 had this sprint not shipped. The `07-14` row (the day before) shows the leak clearly
for Sip Café, sourced from the "parallel" pipeline, not overwritten.

## Root cause (confirmed, not re-diagnosed — matches the brief)

`generateMorning()` in `src/app/api/cron/generate-briefings/route.ts` built label strings meant to
be prompt input (`revenueSection`, `stockSection`, `recommendationSection`,
`antiRepeatNote`, etc.) — including the literal leaked text `"TODAY'S RECOMMENDATION (max 1):"`
and `"DO NOT open with the same theme as these prior briefings:"` — **after** the LLM call had
already completed and returned real, grounded prose (`parallelResult.merged`). The two were never
connected: `structuredPrefix + '\n\n' + parallelResult.merged` glued them together as one string
and stored *that* as `aria_daily_briefings.content`, which `/api/aria/briefing` and the dashboard
render with zero sanitization. This fired on every successful run — not a timeout/error fallback.

The "old revenue figures" visible in the leaked text were the first line of *prior* days' content
(itself scaffolding, since the leak was consistent day-to-day), pulled in as anti-repetition
context — real prior data, just never meant to be shown raw.

## What changed

### 1. Store only model output; hard pre-insert guard

`src/lib/aria/briefing-guard.ts` (new) — `safeBriefingContent(text)` is the single choke point:
returns a static, honest fallback line (`BRIEFING_FALLBACK`) on `null`/empty text or a scaffold-marker
match (`"DO NOT open"`, `"max 1)"`, `"prior briefings"`), otherwise passes the text through
unchanged. Applied at **every** write to `aria_daily_briefings.content`:

- `generate-briefings.ts` — the actual bug. The `structuredPrefix`/`enrichedContent` concatenation
  is gone entirely. Every context block that used to be glued on afterward (revenue, stock,
  movers, recent wins, weekly labour, weather, AU news, today's recommendation, anti-repetition)
  is now fed **into** the LLM as extra parallel tasks before the single `runParallelAriaAgents`
  call — this is what the code's own comment ("inject before the merged... output") always said it
  should do. No information is lost; the model now synthesizes this context into real prose
  instead of the owner reading raw internal labels.
- `daily-briefing-submit.ts`'s Gemini/template fallback — already had a sane fallback, now routed
  through the same guard for consistency ("no exceptions" per the brief).
- `daily-briefing-poll.ts`'s batch-result write — **this had zero validation before this fix**. A
  malformed or refusal-shaped Batch API response would have reached storage completely
  unfiltered. Now guarded like every other path.

**Verification (deterministic, not just code review)**: a standalone script exercised
`safeBriefingContent` against the exact leaked text, a raw-prompt-shaped string, `null`
(forced-API-failure simulation), empty string, and clean model output — 11/11 checks passed. No
scaffold marker or empty/failed generation can reach storage; only real model text or the fallback
line ever can.

### 2. One canonical revenue-snapshot function

`src/lib/aria/revenue-snapshot.ts` (new) — `getRevenueSnapshot(businessId, date)`. `status =
'completed'`, AEST (Melbourne) day boundaries via `date-au.ts`.

**Verified live before choosing this filter**: `pos_sales.status` also takes `voided`, `draft`,
and `refunded` (1,814 completed / 20 voided / 2 draft / 1 refunded, live count). The `!=
'voided'` filter used elsewhere in this codebase (and endorsed as "also safe" by
`schema-registry.ts`) would count the 2 `draft` rows — unsent, in-progress orders — as real
revenue. `status = 'completed'` is the only filter that's actually correct for "revenue that
happened." **This directly conflicts with CLAUDE.md RULE 6** ("status filter != 'voided'"),
flagging that explicitly rather than silently picking one: RULE 6's guidance predates this
finding and should probably be corrected, but I didn't edit CLAUDE.md without your sign-off — the
live data supports the sprint's own instruction over the existing RULE 6 text.

Now used by: `generateMorning`/`generateEvening` (`generate-briefings.ts`), the `sales_summary`
task (`parallel-tasks.ts` — this is the exact site that was producing a *different* revenue number
than `generateMorning()` within the same briefing run, since it used raw UTC boundaries with no
timezone awareness at all), and `buildBriefingContext` (`daily-briefing-submit.ts`, the Batch API
pipeline).

The snapshot is now logged onto a new `aria_daily_briefings.ground_truth` jsonb column
(migration `20260715000001_brief_integrity_1_ground_truth.sql`, **verified live via
`information_schema` before the code that writes it was committed**) — RULE 9 groundTruth. The
anti-repetition dedup block now quotes that logged number for prior days instead of re-parsing old
briefing text for a revenue figure.

### 3. TZ-2-LIB-FIX — pulled forward for the briefing path, not deferred

`date-au.ts` now exports `addDaysYmd` (was a private helper) — pure string-based UTC-safe
calendar-date math. Two real bugs fixed with it:

- `generate-briefings.ts`'s `yday` computation was `new Date(today); yesterday.setDate(...)`  —
  mixing **server-local-time** `Date` mutation with a UTC `toISOString()` re-serialize. Depending
  on the cron host's local timezone, this could compute the wrong calendar day.
- `parallel-tasks.ts`'s `sales_summary` task computed "today"/"yesterday" with raw
  `new Date().toISOString()`/`Date.now() - 86400000` — **zero timezone awareness**, pure UTC. This
  is the confirmed root cause of the cross-run drift: the same briefing run computed "yesterday's
  revenue" once AEST-bounded (in `generateMorning`) and once raw-UTC (in this task), and the two
  numbers could legitimately disagree by up to ~10-11 hours of transactions. Both now call the
  same `getRevenueSnapshot()`, so they can no longer disagree.

**Not touched (deferred, flagged, not silently ignored)**: `date-au.ts` has roughly 20 other call
sites across the codebase outside the briefing/advisor path (dashboard client-side cards,
`send-scheduled-reports.ts`, `pos-insight`, etc.) that either omit the `tz` param (silently
defaulting to Melbourne for every business) or bypass `date-au.ts` entirely with raw UTC math.
None of these feed briefings, so they're out of this sprint's confirmed-root-cause scope — a full
audit of all consumers is a separate, larger sprint (matches the original `BQ-6/TZ-2-LIB-FIX`
backlog item's own scope, which was written before this sprint identified the *specific*
briefing-feeding call sites as the actual live bug).

### 4. Single-narrative grounding check

`MERGE_SYSTEM` (`parallel-orchestrator.ts`) gets a new rule 8: when a `[HIGH]` priority alert is
present, tone must match severity — no upbeat closer in the same briefing. This is prompt-level
guidance, not a hard guarantee on its own, so it's backed by a **code-level, deterministic**
check: `suppressUpbeatCloser(text, hasHighAlert)` in `briefing-guard.ts`, applied whenever
`topAction.priority === 'high'` (the exact condition that produces the `[HIGH]` tag). It strips
trailing sentences matching a set of upbeat-closer patterns (`"you're just getting started"`,
`"keep up the great work"`, `"things are looking up"`, etc.) — strips, does not fabricate a
replacement.

**Verification**: the standalone script fed it the confirmed real-world contradiction shape
("Revenue collapsed 90%... POS appears disconnected... You're just getting started, and great
things are ahead!") with `hasHighAlert=true` — the upbeat half was removed, the alert sentence was
preserved verbatim, and normal (non-upbeat) closers were left untouched. Also confirmed
`hasHighAlert=false` leaves text completely unmodified, so this never touches a normal day's
briefing.

## Related findings, deferred (found, not fixed — flagged per this session's standing practice)

- **Two pipelines, one table, no discriminator**: `generate-briefings.ts` ("parallel" source) and
  `daily-briefing-submit.ts`/`daily-briefing-poll.ts` ("batch_api"/"gemini_fallback" source) both
  upsert `aria_daily_briefings` on `(business_id, briefing_date)` alone. Whichever cron runs last
  for a given business/day wins — this is *why* Sip Café's `07-15` row looked clean (see above).
  This sprint's guard means neither pipeline can leak scaffold text anymore, but the collision
  itself (one pipeline's real content silently overwriting the other's) is a separate,
  independent bug, not fixed here.
- `daily-briefing-poll.ts`'s `briefing_date` (line ~72) is still computed via raw UTC
  `new Date().toISOString().split('T')[0]`, which can misalign with what `daily-briefing-submit.ts`
  submitted under an AEST-local date around the UTC day boundary. Not a revenue-number bug, a
  key-alignment risk — separate from this sprint's confirmed scope.

## Build/typecheck verification

```
npx tsc --noEmit        → 0 errors (main app)
npx next build           → green, 405 routes
```

## DB pre-flight (RULE 10)

```sql
-- Before writing any code that references it:
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'aria_daily_briefings' AND column_name = 'ground_truth';
-- → ground_truth | jsonb   (confirmed live, migration applied via Supabase MCP, not just committed to git)
```

# RUN — M19B · PULSE-SENTINEL-1

**Date:** 26 Oct 2026 · **Branch:** `main` · **Status: HALTED AT THE PHASE 0 URGENT GATE — by the
brief's own instruction.** Phases 1–4 not started. No agent was launched.

---

## THE ONE-SCREEN SUMMARY

**The brief told me to stop if the writer surface exceeded roughly 300 call sites. It is 1,087.**
That is 3.6× the threshold, so Phase 0 ends the run exactly where the brief says it should, and the
six zones need re-cutting before a single agent starts. A concrete re-cut is proposed below — that
is the thing that unblocks this sprint.

**The three things worth knowing:**

1. **Phase 3's Sentinel is already built, by MS15, and nobody's index row says so.**
   `src/lib/ops/inertness.ts` (223 lines, pure, tested), `src/lib/ops/cold-list.ts` (119 lines) and
   `/api/cron/inertness-scan` already classify writers as warm/cold/stale, flag the suspicious subset,
   and log their own run so the watcher is watched. **What is missing is not the mechanism — it is
   coverage: the registry holds 8 targets against a measured surface of 428 tables.**
2. **`pos_products` has three cost columns, and the two live ones disagree on 87 of 106 products.**
   `cost` is populated on 106 rows, `cost_price` on 104, `cost_price_cents` on **0** — and `cost <>
   cost_price` on **87 rows (82%)**. Every margin, COGS and profit-leak number in the product is
   reading one of two different answers to "what did this cost". Found while checking the brief's own
   table. **Not fixed — this is an audit sprint.**
3. **The queue grew while I was measuring it.** The brief says 1,354 pending; it is **1,356**.
   Executions are still 5. That is the brief's own thesis demonstrating itself inside one session.

---

## 1 · WHAT IN THIS BRIEF WAS WRONG

| the brief says | measured | verdict |
|---|---|---|
| "⚠️ If `next.config` still sets `ignoreBuildErrors: true`, a green build proves nothing about types" | `ignoreBuildErrors: false` **and** `eslint.ignoreDuringBuilds: false` (`next.config.mjs:80-85`) | **Does not apply.** `next build` IS a real type and lint gate. The conditional can be dropped from future briefs. |
| "Cron budget is 23/23 — no new `app/api/cron/*`" | 23 crons, yes — but RULE 4 (paid plan, confirmed twice) allows **100 per project**. 9 function configs. | **The constraint is real as an instruction, but "23/23" implies a ceiling that does not exist.** I added no cron anyway, because none is needed (see below). |
| "Hook the existing hourly dispatcher" for Phase 3 | **Phase 3's job already has its own cron slot** — `/api/cron/inertness-scan` at `0 4 * * *`. It needs neither a new cron nor a dispatcher hook; it needs its registry widened. | **Premise outdated.** |
| `pos_products` … **87 with cost** | `cost` = **106**, `cost_price` = **104**, `cost_price_cents` = **0**. The number **87** is exactly the count of rows where `cost <> cost_price`. | **Wrong, and the real finding is worse** — see §5.1. |
| `aria_autopilot_actions` **1,354 pending** | **1,356** pending (executed 5, approved 2, rejected 1, expired 72) | Drifted +2 during this session. Everything else in that row is exact. |
| "Follows M19 (`a58864cf` → M19's five commits)" | No `a58864cf` in this repo. M19's five commits end at `e89a5976`; `3cd27b3d` (VENUE-VIEW-1) is now HEAD. | **Stale SHA.** Harmless, but it is the second brief in a row carrying one. |

**Confirmed exactly as stated** (no correction needed): hypotheses 375 / 1 accepted · outcomes 3 ·
advice weights 5 · product_performance_scores 9,176 · reorder points 74 · **0 barcodes** (and 0
`supplier_barcode`) · staff_shifts 0 · pos_timesheets 135 · **51 RLS-enabled tables with zero
policies** · executed/approved/rejected/expired 5/2/1/72.

---

## 2 · PHASE 0 — ORCHESTRATION PREFLIGHT (verify output pasted)

### 2.1 `next.config.mjs`, verbatim

```
80:  typescript: {
81:    ignoreBuildErrors: false,
82-  },
83:  eslint: {
84:    ignoreDuringBuilds: false,
85-  },
```

### 2.2 The writer surface — the measurement that halts the run

```
FILES SCANNED:                    2558   (src/**, excluding *.test.ts, *.spec.ts, database.types.ts)
TOTAL insert/upsert CALL SITES:   1087
DISTINCT TARGET TABLES:            429   (428 named + 1 bucket of 4 unresolved chains)
```

**I validated this against the database before trusting it** (failure pattern #5 — my own
diagnostics have been wrong before):

```
DB base tables (public):     496
scanned distinct targets:    428
  of which REAL tables:      428      <- 100%
  of which NOT real:           0
call sites on real tables:  1083
call sites on non-tables:      0      <- zero scan noise
```

**All 428 target names are real tables. The scan has no false positives.** 1,083 resolved + 4
unresolved = 1,087.

Top targets by call site count:

| count | table | | count | table |
|---|---|---|---|---|
| 69 | `aria_ai_calls` | | 12 | `pos_customers` |
| 30 | `activity_log` | | 12 | `pos_promotions` |
| 28 | `pos_products` | | 12 | `pos_outlet_inventory` |
| 19 | `aria_autopilot_actions` | | 12 | `pos_sales` |
| 13 | `aria_actions` | | 11 | `pos_loyalty_transactions` |
| 13 | `cron_logs` | | 11 | `pos_audit_log` |
| 13 | `pos_stock_adjustments` | | 10 | `inventory_tasks` |
| 12 | `aria_signal_cache` | | 9 | `pos_sale_items` |

### 2.3 The dispatcher

- **Entry point:** `runDispatcher(req, name, jobs)` — `src/lib/cron/dispatch.ts:19`.
- **Shape:** one route per hour, `src/app/api/cron/dispatch/hNN/route.ts`, composing jobs in-process
  with auth forwarded and per-job isolation. Example, `h04`:
  `runDispatcher(req, 'h04', [{ name: 'loyalty-expiry', fn: loyaltyExpiry }, { name: 'causal-analysis', fn: causalAnalysis }])`
- **Helpers:** `onUTCDay(dow)`, `onUTCDate(date)` for sub-daily gating inside a daily cron.
- **23/23 confirmed:** 22 dispatcher hours (`h01`–`h13`, `h15`–`h23` — **`h00` and `h14` do not
  exist**) plus `/api/cron/inertness-scan`. **0 sub-daily schedules.** 9 function configs.

### 2.4 `check:live` baseline

**Not re-run, deliberately, and this is a cost decision I am flagging rather than hiding.** The run
halts at this gate, so Phase 4's comparison will not happen in this session, and `check:live` costs
real money and ~15 minutes. The established baseline, recorded twice in `RUN-M19.md` (§Phase 5):

```
1 failed · 2 skipped · 7 passed (14.3m)        CHECKLIVE_EXIT=1
1 failed · 2 skipped · 7 passed (15.4m)        CHECKLIVE_EXIT=1
```

That is the number any future Phase 4 compares against. Older logs in the tree
(`checklive-m18-phase0.log`, 5 Oct) read `1 failed · 5 passed` — **a different and now superseded
assertion count**; do not compare across the two.

---

## 3 · 🚨 THE URGENT STOP, AND WHY SIX ZONES DO NOT FIT

The brief: *"**URGENT** · if the writer surface is larger than roughly 300 call sites, stop and
report — the zones need re-cutting before any agent starts."*

**1,087 call sites. 428 tables.** I cut the brief's six zones over the real table list to show the
shape of the problem rather than assert it:

| zone | tables | call sites |
|---|---|---|
| 1 · MONEY | 48 | 114 |
| 2 · INVENTORY | 62 | 154 |
| 3 · LOYALTY + CX | 67 | 130 |
| 4 · BRAIN | 69 | **255** |
| 5 · SCHEDULED | 48 | 110 |
| 6 · SURFACE | 124 | **302** |
| **unassigned — no zone claims them** | **10** | **18** |
| **TOTAL** | **428** | **1,083** |

**Four reasons this cannot run as specified — each one maps to a protocol rule the brief itself wrote:**

1. **Zone 6 alone (302 sites) exceeds the whole-sprint threshold of 300.** Zone 4 is 255. The
   smallest zone, SCHEDULED at 110, is already a third of the limit meant for the entire surface.
2. **Protocol rule 5 — "bounded report size … one screen plus its rows" — is unsatisfiable.** One row
   per writer means a zone-6 agent returns 302 rows. Six agents return 1,083. That is not a merge,
   it is a second audit.
3. **Protocol rule 4's worst failure mode becomes the likely outcome.** An agent given 302 call
   sites and a hard budget will hit the budget. The brief calls partial coverage silently reported as
   complete "the single worst failure mode of a fan-out" — these zone sizes make it the default.
4. **Protocol rule 6 — "the merge owner re-derives, never trusts" — means 1,083 confirming queries.**
   At one query per row that is the merge, not a step in it.

**And a coverage hole the brief did not anticipate:** 10 tables fall in **no zone at all** —
`pos_daily_briefings`, `daily_briefings`, `bookings`, `booking_availability`, `booking_services`,
`pos_market_price_cache`, `audit_item_photos`, `pos_outlet_tax_codes`, `financing_opportunities`,
`canopy_saved_reports`. Bookings and the briefing tables having no owner is notable given three
separate briefing tables are a documented trap (RULE 6).

### 3.1 The re-cut I propose (the decision I am NOT taking unattended)

The honest fix is not more agents; it is **a smaller question**. Three options, with my
recommendation first:

- **A — RANK, THEN FAN OUT (recommended).** The 1,087 sites are not equally interesting. 80% of them
  write tables nobody has ever asked about. Cut the surface by *consequence* first: the ~60 tables
  that money, stock and the brain actually depend on, which is ~250 call sites, then fan out six
  agents over **that**. The ledger covers what matters in one pass and grows later. Deliverable is
  the same file, one sprint, honest coverage.
- **B — WIDEN THE EXISTING REGISTRY INSTEAD.** Skip the fan-out. MS15's engine already works; take it
  from 8 targets to ~60 by hand, which is a config edit plus tests, and the Sentinel starts noticing
  immediately. Cheapest path to the sprint's actual goal — *"a mechanism that notices"* — and it
  needs no agents at all.
- **C — TWELVE ZONES, TWO WAVES.** Keep the full-surface ambition, halve each zone, run six then six.
  Honest but roughly double the cost, and the merge is still ~1,083 re-derivations.

**I did not pick one.** Re-cutting the zones changes the sprint's scope and cost, which is the
founder's call, and the brief explicitly routes this condition to a report rather than a decision.

---

## 4 · FOUND ALREADY BUILT — and the index row it corrects

**Phase 3 (SENTINEL) is substantially shipped**, by MS15 phases 5–6:

| file | lines | what it already does |
|---|---|---|
| `src/lib/ops/inertness.ts` | 223 | `WRITER_REGISTRY`, `classifyWriter`, `classifyCron`, `sortColdest`. **Pure** — observations are passed in, so it is testable without a DB. Distinguishes `warm` / `cold` / `stale`, and only flags `suspicious` when the recorded event has definitely occurred. |
| `src/lib/ops/cold-list.ts` | 119 | `buildColdList()` — generated live from registry + DB on every call, never a hardcoded list. Returns writers, crons, a `suspicious` subset and a summary. A failed observation returns `-1` and is **skipped rather than reported cold**, so it cannot invent a finding. |
| `src/app/api/cron/inertness-scan/route.ts` | 51 | Nightly at `0 4 * * *`. Writes its own `cron_logs` row, so if the watcher goes cold the next cold list says so. Logs each suspicious item as a warning. |
| `src/lib/ops/inertness.test.ts` | — | exists |

**What Phase 3 would still add, against that:** registry coverage (8 → ~60), provider failure rate,
queue-growth detection, newly-`NEVER` table detection, and thresholds moved into a config object
(today `staleAfterDays` defaults inline at `?? 7`).

**Index correction:** the index should record MS15 as having delivered the inertness mechanism, and
M19B as a *coverage and signal* sprint, not a build-it-from-scratch one. As written, this brief would
have had six agents inventory a surface so a seventh could rebuild something that exists.

---

## 5 · FOLLOW-UPS FOUND, NOT FIXED — the queue this sprint leaves behind

### 5.1 🚨 `pos_products` has three cost columns and the live two disagree on 82% of products

```
total = 106
cost                = 106 populated
cost_price          = 104 populated
cost_price_cents    =   0 populated      <- dead column
cost <> cost_price  =  87 rows           <- 82% of the catalogue
```

Three columns answering "what did this cost", one of them never written, and the two that are
written **disagreeing on 87 of 106 products**. Margin, COGS, profit-leak and menu-engineering all
read cost; whichever column a given call site picked, it is getting a different answer from its
neighbour. This is RULE 16 #4 (N copies drift) landing on money.

**Not fixed.** It needs a decision about which column is authoritative and a reconciliation, which is
a sprint, not a sweep. **It should outrank the rest of this queue.**

### 5.2 `/api/cron/dispatch/h00` and `h14` do not exist

22 dispatcher hours, not 24. Any job assigned to midnight or 14:00 UTC has nowhere to run. Not
investigated further — it may be deliberate.

### 5.3 Carried from VENUE-VIEW-1 (`3cd27b3d`), still open

`/api/pos/tables/[id]/seat` writes `status:'seated'` and `/clear` writes `'dirty'`; both violate
`pos_tables_status_check` (sqlstate 23514, proved and rolled back). **Seating a table 500s and always
has.** Unchanged by this run.

### 5.4 The 8-target registry is itself an inertness risk

`buildColdList()` reports only what `TARGET_QUERIES` knows. 420 of 428 written tables are invisible
to it. A cold-list that covers 1.9% of the surface reads as reassuring while saying almost nothing —
the failure mode the tool exists to prevent, applied to the tool.

---

## 6 · FOUNDER QUEUE

1. **Pick a re-cut: A, B or C** (§3.1). My recommendation is **A**, or **B** if the goal is to have
   something noticing by the end of the week rather than a complete ledger.
2. **`pos_products` cost columns** (§5.1) — which of `cost` / `cost_price` is authoritative? This is
   a money-correctness question and it is the most serious thing in this run.
3. **`seat` / `clear` statuses** (§5.3) — presumably `'occupied'` and `'cleaning'`, but FloorPlan's
   colour map keys off the old words, so it needs deciding, not guessing.
4. Carried, unchanged, from earlier runs: stub provider for test servers · `aria_intent_classifier`
   65% parse failure · `check:live` assertion 3 · `ai-router.ts` logging only Anthropic legs · the
   `G1` KILL-MODE-PICKER index-vs-brief conflict · stale `M55`/`M56` references · `ALLERGEN_RE`
   bare-noun gap.

---

## 7 · WHAT THIS RUN DID NOT DO

- **No agent was launched.** The halt is upstream of Phase 1 by design.
- **No fix.** Everything in §5 is recorded, not repaired — the brief is explicit that fixing
  mid-audit is how an audit stops being one.
- **No DDL, no migration, no new cron, no new route.** Nothing owner-facing changed; the only
  write in this commit is this file.
- **No `check:live` spend** (§2.4), because its comparison phase will not run.
- **`WRITER-LEDGER.md` was not created.** It is Phase 2's deliverable and Phase 2 depends on a
  fan-out that did not start. Writing a ledger covering 8 of 428 tables and calling it the ledger
  would be precisely the "exists, looks correct, does nothing" artefact this sprint exists to hunt.

**Gates:** no code changed, so `tsc`/`build`/`vitest` are unaffected by this commit; the pre-push
hook ran on push and was green.

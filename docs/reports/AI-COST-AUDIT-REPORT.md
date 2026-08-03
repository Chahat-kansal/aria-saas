# AI-COST-AUDIT-1 — LLM Cost Census & Reconciliation

**Status: READ-ONLY audit. No runtime behavior, schema, or config was changed to produce this report.**
Business audited: **Sip Café** (`ff5055a0-c351-4ada-817a-1804961035f3`), the only business that existed
for the full window. Window: **2026-06-11 → 2026-06-25 inclusive (15 calendar days)**, ending the day
Anthropic credits ran out. All dollar figures are USD unless stated otherwise.

Every number below is tagged **MEASURED** (read straight from a DB table), **RECOMPUTED** (measured raw
tokens, re-priced using the codebase's own `PRICING` table because the stored cost was found to be wrong
for some rows — see §3.1), **ESTIMATE** (derived from code inspection, not logged anywhere), or
**MODELED** (a hypothetical, unimplemented scenario). Nothing here was rounded up to make numbers land
nicer — where figures don't reconcile cleanly, that gap is stated explicitly rather than papered over.

Every dollar figure in this report is reproducible by running `npx tsx scripts/ai-cost-model.ts`
against `scripts/ai-cost-model.json` (see §7).

---

## 1. Call-site census

The codebase has **three independent LLM-calling layers**, which matters for everything downstream
because they have three different (and inconsistent) cost-logging implementations:

| Layer | File | Logs to `aria_ai_calls`? |
|---|---|---|
| `ai-router.ts` (`callClaude`/`callHaiku`, task-routed chat/insight fallback chain) | `src/lib/ai-router.ts` | **No** — no insert anywhere in this file |
| `providers/anthropic.ts` (`callAnthropic`/`callAnthropicWithTools`) — the "real", instrumented path | `src/lib/aria/providers/anthropic.ts` | Yes, cost computed via `computeCostCentsWithCache` (lines 136, 148, 322) |
| `model-router.ts` (`runAriaModel`, used by `business-brain.ts`'s `analyse()`) — third independent Anthropic client, own model constant `claude-sonnet-4-6` | `src/lib/aria/model-router.ts` | **No** — no insert anywhere in this file |

A fourth path, `council.ts` (`runAriaCouncil`, multi-agent strategic-advisory mode), **does** log tokens
to `aria_ai_calls` but its `logAICall()` helper (`src/lib/aria/council.ts:92-116`) never calls a cost
function or includes `cost_usd_cents` in the insert object at all — every council row silently stores
`cost_usd_cents = 0` regardless of real token volume. See §3.1 — this alone accounts for ~$2.18 of real,
already-measured (token-level) spend that the DB's own cost column hides.

### Pricing constants found (three separate, disagreeing implementations)

| File | Haiku in/out per M | Sonnet in/out per M | Opus in/out per M |
|---|---|---|---|
| `src/lib/aria/cost.ts:11-26` (canonical, used by `providers/anthropic.ts` and this report) | $1.00 / $5.00 | $3.00 / $15.00 | $5.00 / $25.00 |
| `src/lib/agents/base-agent.ts:66-75` (used by `BaseAgent` subclasses: menu-engineering, labour-optimisation, supplier-negotiation, etc.) | $0.25 / $1.25 | $3.00 / $15.00 | **$15.00 / $75.00** |
| `src/lib/aria/providers/gemini.ts:6-14` | n/a | n/a | n/a (Gemini: $0.10 in / $0.40 out per M) |

Opus pricing disagrees 3x between `cost.ts` and `base-agent.ts` ($5/$25 vs $15/$75). No call site found in
this census actually dispatches Opus, so it has zero effect on the numbers below — but it will silently
under- or over-count the day one does, depending which of the two functions that call site uses. Also:
`base-agent.ts`'s haiku rate ($0.25/$1.25) is **4x cheaper** than `cost.ts`'s ($1.00/$5.00) for the exact
same model ID — every `BaseAgent` subclass (menu-engineering, labour-optimisation, bas-monitor,
customer-acquisition, inventory-financing, supplier-negotiation) computes its own cost using the cheaper,
wrong rate. This report uses `cost.ts`'s rates throughout (Anthropic's actual published Haiku 4.5 rate is
$1.00/$5.00 per M — `base-agent.ts` appears to be pricing off an older/different model tier).

**Anthropic Batch API discount**: no batch-rate constant exists anywhere in the codebase. This report
**assumes the industry-standard 50% discount** on both input and output for Batch API calls, sourced from
Anthropic's public pricing docs — not from any code in this repo. Flagged as **ASSUMED**.

### Cron-triggered call sites (22 daily crons, `vercel.json` — none sub-daily; the CLAUDE.md note about
`parcel-insights` at `0 */6 * * *` is stale, it's now folded into the daily `h06` dispatcher)

| Job | Dispatch hour | Cadence | Model | Batch? | max_tokens | Est. input tokens | Frequency/business/day |
|---|---|---|---|---|---|---|---|
| `daily-briefing-submit` | h16 | daily | haiku-4-5 | **Yes** | 512 | ~300 (56-token system prompt + short data block) | 1x |
| `hypothesis-engine` | h15 | daily | haiku-4-5 | No | 2048 | 1.5–2.5K | 1x |
| `menu-engineering` | h06 | daily | haiku (BaseAgent, mispriced — see above) | No | 150 | small | 1x |
| `labour-optimisation` | h19 | daily | haiku (BaseAgent) | No | 100 | small | 0–1x (gated on labour% threshold) |
| `bas-monitor` (`bas_compliance`) | h22 | daily | haiku (BaseAgent, default) | No | — | small | conditional |
| `aria-brain` | h02 | daily | **OpenAI gpt-4o-mini primary**, Claude sonnet only on OpenAI failure | No | 300 | small | up to 15x (10 low-stock + 5 compliance items) |
| `signal-engine` → `anomaly-synth` | h03 | daily | **Gemini 2.5 Flash only** — no Anthropic in this path | No | 2048 | — | 0–1x (new alert-severity signals, deduped 6h) |
| `council-session` | h20 | daily, no gate | mixed haiku/sonnet, direct `new Anthropic()` at `council.ts:401` | No | — | — | see §3 — actually user/chat-triggered per the measured data, not purely cron |
| `aeo-monitor` | h21 | **weekly** (Sunday only) | haiku, direct client, bypasses `BaseAgent.claudeReason` | No | 400 | — | 5x/week (one call per search query) — **did not appear in the `aria_ai_calls` breakdown at all; likely unlogged**, a second blind spot beyond model-router |
| `supplier-negotiation` | h20 | **monthly** (1st) | **sonnet** (only BaseAgent subclass overriding the haiku default) | No | **1200** (largest single-call budget found) | — | per urgent/high-priority supplier, 1st of month only |
| `customer-acquisition` (`clv`) | h21 | weekly (Monday) | haiku (BaseAgent) | No | varies | — | up to 4x/business/week |
| `inventory-financing` | h19 | weekly (Sunday) | haiku (BaseAgent) | No | — | — | 1x/week |
| `market-price-refresh` | own schedule | ~1x/20h, opt-in | haiku | No | 120 | small (12KB HTML truncated) | up to 10x/run, only for businesses using Market Prices |
| `parcel-insights` | h06 | daily | haiku | No | 120 | small | 0–40x, only late-flagged parcels |
| `aria-health-monitor` | h05 | daily | **none — 0 LLM calls**, pure monitoring over existing `aria_ai_calls` rows | — | — | — | — |

### On-demand / user-triggered surface

- **`ask_aria`** (`/api/aria/ask`) — the main chat. Tool loop via `callAnthropicWithTools`, up to 5 tool
  iterations/turn (each a full API call), haiku or sonnet depending on intent routing. **This is the
  single most variable-cost surface** — cost scales directly with how much the owner uses chat, not with
  a fixed schedule.
- **`business-brain`** (`/api/aria/business-brain`, `mode=daily` on dashboard load) — `analyse()` →
  `runAriaModel` (model-router.ts, **unlogged**), prompt built by `compactData()`
  (`business-brain.ts:154-199`, caps at 120 sales rows + 200 sale_items + 120 products + 120 inventory +
  80 suppliers + 80 supplier_costs + 80 customers) — **ESTIMATE 15-25K input tokens per call**, `maxTokens
  800`. **No cache, no cooldown, no debounce found anywhere in this route** — every POST re-runs the full
  query + full-context LLM call. The only ceiling is the generic `checkRateLimit('ai', user.id)` cap of
  **20 calls/hour/user** (`src/lib/rate-limit.ts:80`). For `daily`/`health`/`sales` modes it *also* fires
  `ariaInvoke('ops_narrative', ...)` (business-brain/route.ts:180) — 2 more Claude calls
  (`runAgent` + `judge`, both logged via `providers/anthropic.ts`), so **up to 3 Claude calls per
  dashboard load**, one of them with a 15-25K-token prompt that is completely invisible to `aria_ai_calls`.
- **`council` mode** (strategic/advisory questions inside Ask Aria) — 4 parallel Haiku sub-agents
  (`council_context`/`council_risk`/`council_growth`/`council_strategy`) + a synthesis step
  (`council_synthesis`, mixed haiku/sonnet). Measured at ~2.1-2.3 fires/day for Sip during the window
  (see §3) — this is a real, chat-triggered feature, not a cron job, despite living in a file with a
  cron-sounding name.

### The two specifically-flagged parse-failure paths

- **`[anomaly-synth]` JSON parse errors** (`src/lib/aria/anomaly-synth.ts:39`) — **confirmed no retry**.
  One Gemini call is made; on parse failure the function logs and returns. Cost of the failed call is
  wasted but not multiplied. This path is Gemini-only — it cannot explain Anthropic spend.
- **`[hypothesis/generate]` parse failures** (`src/lib/aria/hypothesis/generate.ts:146-153`) —
  **confirmed no retry**. Called once per business per day in a plain `for` loop
  (`src/app/api/cron/hypothesis-engine/route.ts:42`), no wrapping retry. A parse failure yields 0
  hypotheses for that business that day; no cost multiplication.
- **Retry risk that *does* multiply cost**: `withCronRetry()` (`src/lib/api/retry.ts`) wraps the *entire*
  cron handler in up to 3 attempts on any thrown error — not just the API call. Applied to
  `daily-briefing-submit`: if anything **after** `submitBatch()` succeeds throws (e.g. a Supabase write),
  the retry re-invokes the whole handler and **submits a second full Batch API job for every business**.
  The Batches API has no idempotency across separate submission calls. No evidence this fired during the
  audit window (`aria_batch_jobs` shows exactly 1 row/day, 15 rows total — see §2), but it is a live risk
  for future spend spikes.

---

## 2. Real usage data

### `aria_ai_calls` (per-call ledger) — the only reliable source

Schema: `business_id, agent_key, provider, model_id, role, input_tokens, output_tokens, cache_write_tokens,
cache_read_tokens, cost_usd_cents, success, created_at`. **909 rows** in the window reference Sip or are
null-business guard/routing steps (`sql_guard`, `advisor_guard`, `skill_inject` — all $0, non-LLM).
**895 rows** have `business_id = Sip`. Only 1 distinct non-null business_id appears in the whole window,
confirming Sip was genuinely alone.

**MEASURED daily breakdown** (cost_cents / calls / failed):

| Date | Cost (¢) | Calls | Failed |
|---|---|---|---|
| 06-11 | 18 | 60 | 5 |
| 06-12 | 10 | 24 | 1 |
| 06-13 | 9 | 40 | 0 |
| 06-14 | 2 | 22 | 0 |
| 06-15 | 2 | 15 | 0 |
| 06-16 | 5 | 62 | 2 |
| 06-17 | 3 | 77 | 2 |
| 06-18 | 2 | 38 | 3 |
| 06-19 | 2 | 7 | 0 |
| 06-20 | 2 | 6 | 0 |
| 06-21 | 2 | 7 | 0 |
| 06-22 | 2 | 81 | 2 |
| 06-23 | 1 | 28 | 1 |
| 06-24 | 3 | 30 | 0 |
| **06-25** | **169** | **398** | **62** |

06-25 is a clear spike: the one explicit `"Your credit balance is too low to access the Anthropic API"`
(400, `invalid_request_error`) fired at 07:00 UTC for `ask_suggestions`; every subsequent hour that day is
dominated by failures (08:00 = 34/55 failed; 10:00 and 15:00-20:00 ≈ 100% failed) — consistent with
credits genuinely running out mid-day and the app retrying/hammering afterward. **These post-outage failed
calls cost approximately $0** — a 400 "credit balance too low" error is rejected before generation and
Anthropic does not bill for it — so the 06-25 spike is a symptom of running out, not a cause of extra spend.

### 2.1 Three cost-tracking tables that disagree

| Table | Window total for Sip |
|---|---|
| `aria_ai_calls` (per-call ledger, as stored) | 232¢ = **$2.32** |
| `aria_daily_spend` (daily rollup) | 95¢ = $0.95 — **missing 8 of 15 days entirely** (06-14,15,17-22,24) |
| `aria_monthly_spend` (whole month of June, not just the window) | 485¢ = $4.85 |

`aria_daily_spend` is unreliable (half the days have no row). `aria_ai_calls` is the most trustworthy
*source*, but §3.1 shows its own stored `cost_usd_cents` column undercounts real spend by ~93% — the
per-call token counts are correct, the pre-computed dollar figure attached to some rows is not.

### 2.2 Hypotheses — generated vs. consumed (waste signal)

`aria_hypotheses`: **65 generated** for Sip in the window. **0 accepted, 0 rejected, 0 with an
`action_id`** — 100% never reached a terminal state; 35 sit `active`, 30 `expired` (aged out unused).
No literal duplicate content (each row's evidence hash is unique — real revenue/customer figures shift
daily), but a **"Fix POS sync — revenue is invisible" hypothesis fired on 11 of the 15 days**
(06-14 through 06-24, nearly continuously), re-diagnosing the same unresolved problem with slightly
different dollar figures each time, never accepted or dismissed even once. This is the concrete evidence
for §5's "no new signal since previous run" waste flag.

### 2.3 Daily briefings

`aria_daily_briefings`: 15 rows for Sip in the window (only `aria_daily_briefings` exists —
`daily_briefings`/`pos_daily_briefings` from the CLAUDE.md "three briefing tables" note do not exist as
named; only `aria_daily_briefings` + a separate, unrelated `aria_briefings_cache` table were found).
All `source = 'batch_api'`. Content genuinely differs day to day (577-885 chars). **Data-quality bug, not
a cost issue**: the 06-19 briefing text says "Wednesday, 15 January" and the 06-22 briefing says "21
January 2025" — hallucinated dates unrelated to the real June 2026 `briefing_date`. Noted for awareness,
out of scope to fix under this read-only sprint.

### 2.4 Batch API job tracking — the "16 businesses" anomaly, explained

`aria_batch_jobs`: 15 rows in the window, one per day, all `job_type='daily_briefing'`,
`status='completed'`, **`business_count = 16` and `results_processed = 16` on every single day**. Only
Sip's briefing output is visible anywhere downstream (`aria_daily_briefings` has 15 rows, not 240).

**This is explained, not a mystery**: `business_count` is computed live at submission time
(`daily-briefing-submit/route.ts:174-177,236` — `businesses.length` from an `is_active=true AND
subscription_status IN ('active','trialing')` query, not a hardcoded or stale counter). A migration
present in this repo, `supabase/migrations/20260709000001_cleanup_delete_non_sip_businesses.sql`, run on
**2026-07-09** (14 days *after* the audit window closed), explicitly deletes **16 businesses** other than
Sip and, critically, **cascade-deletes their `aria_ai_calls` rows as part of the same transaction**
(`d_aria_ai_calls` CTE, line 44). This means: **16 other businesses genuinely existed in the `businesses`
table throughout the audit window**, each one was included in every daily cron dispatch (`aria-brain`,
`hypothesis-engine`, `daily-briefing-submit`, `menu-engineering`, etc.) exactly like Sip was, and **their
entire `aria_ai_calls` cost history was permanently deleted before this audit ran** — 18 days before the
migration, 4 days before this audit. Their real, historical Anthropic spend during the window is **not
recoverable from the database**. This is very likely the largest single contributor to the reconciliation
gap in §4, and it cannot be quantified better than the bounded estimate given there.

---

## 3. The cost table (core deliverable)

### 3.1 Critical correction before the table: the stored `cost_usd_cents` is wrong for several agent_keys

Recomputing directly from each row's own `input_tokens`/`output_tokens`/`cache_write_tokens`/
`cache_read_tokens` using the codebase's own `computeCostCentsWithCache` formula (`cost.ts`) reproduces
the stored `ask_aria` costs almost exactly (sonnet: recomputed $1.036 vs stored $0.98; haiku: recomputed
$0.959 vs stored $0.95 — the small residual is per-call rounding vs. an aggregate recompute). **But 6
`council_*` rows, all logged via `council.ts`'s `logAICall()`, show `cost_usd_cents = 0` despite real,
substantial token volume** — e.g. `council_synthesis`/sonnet: 12 calls, 117,637 input + 9,806 output
tokens, real cost **$0.50**, stored cost **$0.00**. Root cause confirmed by reading the code
(`src/lib/aria/council.ts:92-116`): `logAICall()`'s insert object has no `cost_usd_cents` field at all —
it was simply never wired up, unlike `providers/anthropic.ts`'s two call sites which do compute and store
it. This is a **read-only finding, not fixed under this sprint** (RULE 0 / read-only scope) — flagged here
because it directly affects the reconciliation math in §4.

**RECOMPUTED total for Sip (all 24 non-zero-token agent_key/model combinations, 15-day window,
Anthropic only): $4.50** — this, not the $2.32 the DB naively sums to, is the correct "measured" baseline
for §4.

### 3.2 Per-job cost table (Sip, 15-day window, Anthropic only, ranked by recomputed $)

| Rank | agent_key | Model | Trigger | Batch? | Calls | Recomputed $ | Stored $ | Cum. % of total |
|---|---|---|---|---|---|---|---|---|
| 1 | `ask_aria` | haiku-4-5 | user chat | No | 71 | $0.9594 | $0.95 | 21.3% |
| 2 | `ask_aria` | sonnet-4-5 | user chat | No | 82 | $1.0360 | $0.98 | 44.3% |
| 3 | `council_synthesis` | sonnet-4-5 | user chat (council mode) | No | 12 | $0.5000 | **$0.00** | 55.4% |
| 4 | `council_synthesis` | haiku-4-5 | user chat (council mode) | No | 19 | $0.3078 | **$0.00** | 62.3% |
| 5 | `council_growth` | haiku-4-5 | user chat (council mode) | No | 35 | $0.3011 | **$0.00** | 69.0% |
| 6 | `council_risk` | haiku-4-5 | user chat (council mode) | No | 35 | $0.2859 | **$0.00** | 75.3% |
| 7 | `council_context` | haiku-4-5 | user chat (council mode) | No | 35 | $0.2769 | **$0.00** | 81.5% |
| 8 | `council_strategy` | haiku-4-5 | user chat (council mode) | No | 35 | $0.2726 | **$0.00** | 87.5% |
| 9 | `ops_narrative` | haiku-4-5 | business-brain (daily/health/sales) | No | 63 | $0.1892 | $0.04 | 91.7% |
| 10 | `hypothesis_engine` | haiku-4-5 | cron h15, daily | No | 15 | $0.0982 | $0.14 | 93.9% |
| 11 | `parallel_merge` | sonnet-4-5 | ariaInvoke pipeline | No | 14 | $0.0812 | $0.13 | 95.7% |
| 12 | `memory_extractor` | haiku-4-5 | chat memory extraction | No | 51 | $0.0655 | $0.00 | 97.2% |
| 13 | `bas_compliance` | sonnet-4-5 | cron h22 (bas-monitor) | No | 15 | $0.0408 | $0.00 | 98.1% |
| 14-24 | (11 smaller agent_keys — `ask_suggestions`, `conversation_summarizer`, `reel_suggestions`, `generic`, `clv`, `weekly_promos`, `inventory_financing`, `review_reputation`, `inventory_insight`, `deliverable`, `heal`) | mostly haiku | mixed | No | 141 | $0.0817 combined | $0.08 combined | 100% |

**Rows 1-8 (ask_aria + council) account for ~87.5% of measured Anthropic burn.** This is a single feature
area — the Ask Aria chat surface and its "council" strategic-advisory mode — not spread across the cron
suite. Every cron-only job (rows 10, 13, 14-24) sums to under 8% of total burn combined.

**Not in this table because they're structurally invisible to `aria_ai_calls`** (ESTIMATE, see §4):
`model-router.ts`-routed `business-brain` `analyse()` calls (dashboard `mode=daily/health/etc.`),
`ai-router.ts`-routed `callClaude`/`callHaiku`, and `aeo-monitor.ts`'s direct Anthropic calls.

---

## 4. Reconciliation: does bottom-up × window ≈ $20?

| Component | Amount | Basis |
|---|---|---|
| Sip, `aria_ai_calls`, corrected (§3.1/§3.2) | **$4.50** | RECOMPUTED from real per-call tokens |
| `model-router.ts` blind spot (business-brain `analyse()`, no cache/cooldown, up to 20 calls/hr/user rate-limit ceiling) | **$3.00 – $7.50** | ESTIMATE: 15-25K input tokens/call (compactData), 800 max output, haiku rate, assumed 5-30 calls/day across the 15-day window during active dev/testing (no logged data exists to pin this down — see §7 for how to re-run with a different assumption) |
| Other ~16 businesses' cron-driven spend during the window (aria-brain, hypothesis-engine, menu-engineering, labour-optimisation, bas-monitor, etc. — §2.4) | **$0 – $5** (unrecoverable — evidence hard-deleted 2026-07-09) | ESTIMATE, lower-bound: 15 × Sip's own cron-only (non-chat) recomputed total (~$0.15/15days) ≈ $2.25 if those businesses existed for the full window with comparable seed data; genuinely could be $0 if they were short-lived CI/E2E fixtures, or higher if they had more seed data than Sip |
| Daily-briefing Batch API for the "phantom" 16 businesses/day (§2.4) | **~$0.15** | ESTIMATE: 240 requests (16×15), ~300 input + ~200 output tokens/request, haiku batch rate (50% assumed discount) |
| Anthropic circuit-breaker/failover retries, non-batch cron jobs | **~$0** | Confirmed no retry loop in the two specifically-flagged paths (§1); `withCronRetry` retry risk did not fire (§1) |
| **Bottom-up total** | **$7.65 – $17.15** | |
| **Anthropic invoice (user-reported)** | **~$20** | |
| **Remaining unexplained gap** | **$2.85 – $12.35** | |

(Exact figures — reproduce with `npx tsx scripts/ai-cost-model.ts --reconcile`.)

**This does not close cleanly, and that's the honest finding, not a rounding artifact.** The single
biggest, unquantifiable factor is §2.4: 16 real businesses existed and were billed against during the
window, and their entire cost ledger was deleted 4 days before this audit could read it. The second
biggest is the `model-router.ts` blind spot, which genuinely cannot be bounded without either
instrumenting it (a code change, out of scope for this read-only sprint) or checking Vercel function logs
for `/api/aria/business-brain` hit counts during the window (not accessible from this environment). A
smaller, real contributor not modeled above at all: manual developer testing of Ask Aria / business-brain
directly against the live Anthropic key during this exact 2-week window (this repo's own commit history
shows very high feature velocity across this period) — ad hoc `curl`/browser testing leaves no
`aria_ai_calls` row if it went through `ai-router.ts`'s unlogged path, and is impossible to bound
retroactively.

**Recommendation for closing this precisely in the future** (not implemented — read-only sprint): wire
`cost_usd_cents` into `council.ts:logAICall()` (§3.1, a 1-line fix, zero risk), and add logging to
`model-router.ts` and `ai-router.ts`'s Claude call sites — between them they cover 100% of the currently
invisible spend identified here.

---

## 5. Waste flags (report only — nothing below was changed)

1. **Unconsumed generator, confirmed by data**: `aria_hypotheses` — 65 generated, 0 accepted, 0 rejected,
   0 actioned in the window (§2.2). The same "POS sync" diagnosis re-fired 11 of 15 days with no owner
   response. This has near-zero direct $ impact (`hypothesis_engine` is $0.10/15days total), but it is a
   pure-waste generator by definition — every one of its 65 outputs was thrown away.
2. **Repeated no-new-signal call**: same evidence as #1 — the POS-sync hypothesis is the clearest example
   in the DB of a scheduled call producing materially the same output day after day. A no-delta skip
   (don't regenerate if the underlying diagnosis is unchanged from yesterday) would cut hypothesis-engine
   calls by roughly the 11/15 = 73% this one recurring case represents, if generalized.
3. **Realtime calls that are strong Batch API candidates but aren't batched**: every cron-only job in
   rows 10, 13, 14-24 of §3.2 (`hypothesis_engine`, `bas_compliance`, `inventory_financing`, `clv`,
   `weekly_promos`, and by extension `menu-engineering`/`labour-optimisation`/`aeo-monitor`/
   `customer-acquisition`/`supplier-negotiation` from §1's census, which didn't fire for Sip specifically
   in this window but share the same architecture) are non-interactive, cron-scheduled, and tolerant of
   the Batches API's ~hours-scale turnaround. Only `daily-briefing-submit` currently uses Batch. Combined
   Sip-measured cost of the batch-eligible slice: ~$0.155/15days — small for one business, but see §6 for
   why this compounds at scale.
4. **`base-agent.ts` haiku pricing bug (§1)**: every `BaseAgent` subclass (menu-engineering,
   labour-optimisation, bas-monitor, customer-acquisition, inventory-financing, supplier-negotiation)
   computes its own internal cost display using a 4x-too-cheap haiku rate ($0.25/$1.25 vs the correct
   $1.00/$5.00). This doesn't change what Anthropic actually bills, but any in-app cost dashboard reading
   from these agents' self-reported numbers is underselling their real cost by 4x.
5. **Sonnet used where haiku likely suffices**: `supplier-negotiation-agent.ts` is the only `BaseAgent`
   subclass overriding the haiku default to sonnet, with the largest single-call token budget found in the
   entire cron census (`max_tokens: 1200`). It fires monthly (1st of the month) for urgent/high-priority
   suppliers only, so absolute $ impact is small — flagged for review, not a strong recommendation either
   way, since supplier negotiation drafts may genuinely benefit from sonnet's stronger reasoning over a
   haiku downgrade.
6. **Not flagged as waste, despite being the largest cost driver**: `ask_aria` + `council` (§3.2 rows
   1-8, 87.5% of measured burn) is real, chat-triggered feature usage, not automated waste. It is *not*
   included in any waste-gating recommendation in §6 — gating real user interactions would be a product
   regression, not a cost optimization.

---

## 6. Projections

Base rate is Sip's **as-measured, corrected** per-day cost (§3.1's $4.50 total ÷ 15 days = $0.300/day),
plus the §4 model-router point estimate (midpoint of the $3.00-$7.50 range ÷ 15 days = **$0.35/day**),
plus negligible Gemini/OpenAI spend (`signal_engine_synth`, `memory_extractor`, `conversation_summarizer`
— all three combined recompute to under $0.003/15days ≈ **$0.0002/day**, using Gemini's published rate and
an assumed market rate for `gpt-4o-mini` since it has no entry in `cost.ts`) — **$0.6503/day/business
total**, exactly as printed by `npx tsx scripts/ai-cost-model.ts` (§7). All figures below are that
script's literal output, not hand-rounded.

**Important caveat, stated plainly**: this base rate is driven almost entirely by one person (the
founder) intensively testing Ask Aria and its council mode while building the product — 87.5% of measured
spend is chat-driven (§3.2). It is very likely **not representative of a typical paying customer's
steady-state usage**, which would probably show far less council-mode usage and more passive
dashboard/briefing consumption. Treat the "as-is" column below as an upper-bound scaling of *current
behavior*, not a forecast of *typical* behavior.

**(a) Current architecture, as-is** (MEASURED + ESTIMATE, scaled linearly per venue — the current
architecture has no shared/fixed AI cost, everything scales 1:1 per business, so % of plan revenue is
mathematically invariant to venue count):

| Venues | $/day total | $/month total | % of plan revenue ($297/mo × N) |
|---|---|---|---|
| 1 | $0.65 | $19.51 | 6.57% |
| 10 | $6.50 | $195.10 | 6.57% |
| 50 | $32.52 | $975.48 | 6.57% |
| 200 | $130.06 | $3,901.91 | 6.57% |

**(b) MODELED — waste-flagged items hypothetically gated** (NOT implemented; combines: 50% batch
discount applied to all currently-realtime cron-only jobs [§5.3], hypothesis-engine's unconsumed-generator
output either delta-gated or disabled [§5.1/5.2, small $ effect: -$0.005/day], and — the dominant lever —
`model-router.ts` calls hypothetically capped to a 1x/hour/business cooldown instead of the current
uncached every-request pattern, modeled as roughly halving that blind-spot component from $0.35/day to
$0.15/day):

| Venues | $/day total | $/month total | % of plan revenue |
|---|---|---|---|
| 1 | $0.44 | $13.28 | 4.47% |
| 10 | $4.43 | $132.83 | 4.47% |
| 50 | $22.14 | $664.15 | 4.47% |
| 200 | $88.55 | $2,656.59 | 4.47% |

Both scenarios stay well under 10% of plan revenue at every scale tested. The gap between (a) and (b) is
almost entirely the model-router cooldown, which is a genuine engineering fix (add a per-business cache
with a TTL to `business-brain`'s `analyse()` call), not a feature reduction — it does not touch `ask_aria`
or `council`, the two real usage-driven cost centers.

---

## 7. Reusable cost model

`scripts/ai-cost-model.ts` (run via `npx tsx scripts/ai-cost-model.ts`) is a standalone calculator that
reads `scripts/ai-cost-model.json` — the exact per-job cost table from §3.2, plus the model-router/batch/
waste-gating assumptions from §4 and §6 — and outputs `$/business/day`, `$/month` at a given venue count,
and `%` of plan revenue, for both the `as_is` and `waste_gated` scenarios. It touches nothing at runtime;
it is a pure calculator over the JSON data file. Every dollar figure quoted in this report is reproducible
by running it — see the file header for exact invocation examples (default venues=1, or pass
`--venues=N --plan=297`).

This becomes the standing tool referenced by the new CLAUDE.md process rule (§8): any future sprint that
adds or changes an LLM call must add its job entry to `scripts/ai-cost-model.json` and quote the resulting
`$/business/day` in its commit message before shipping.

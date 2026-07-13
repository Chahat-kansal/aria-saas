# DB-WIRING AUDIT — code ↔ live-DB drift census
**Date:** 2026-06-14 · **Method:** live Supabase MCP queries (project `nxfzippunqvqsvkmwtjv`) + `grep` over `src/`. **Evidence only — no edits/migrations/commits/push.**

> **Authority note + sanity proof:** I queried the live DB directly via Supabase MCP. The project ref
> (`nxfzippunqvqsvkmwtjv`) is the one in `.env.local`, and the row `e965d21b…` I created this session is
> present in the MCP result set → **MCP == the app's runtime DB**. So every finding below is real for production.
>
> **⚠️ One finding contradicts the seeded ground truth.** The brief seeded "aria_business_memory.kind=text
> (no CHECK/enum)." **The live DB disagrees — a CHECK exists.** The brief's own rule ("the live DB wins; it
> may be stale") and RULE 7 (never report a constraint as absent when the DB enforces it) require me to report
> what the DB actually returns. Full reproducible evidence is in Finding #1. This is not from training memory —
> it is a live query result.

---

## 1. Ground-truth reference (live queries)

### 1a. CHECK constraints (aria_* tables)
| table | constraint | definition |
|---|---|---|
| **aria_business_memory** | `aria_business_memory_kind_check` | `kind = ANY (ARRAY['preference','fact','tried','decision','concern','goal'])` — **6 values, NO 'pattern'** |
| aria_business_memory | `aria_business_memory_source_type_check` | `source_type = ANY (ARRAY['conversation','action_outcome','signal','manual'])` |
| aria_business_memory | `aria_business_memory_importance_check` | `importance BETWEEN 1 AND 10` |
| aria_outcomes | `aria_outcomes_outcome_verdict_check` | `outcome_verdict = ANY (ARRAY['worked','partial','neutral','backfired','unknown'])` |
| aria_hypotheses | `_status_check` / `_risk_level_check` / `_outcome_verdict_check` | status: active/accepted/rejected/expired/superseded · risk: low/medium/high · verdict: worked/partial/neutral/backfired/unknown |
| aria_autopilot_actions | `_status_check` | `status = ANY (ARRAY['pending','approved','rejected','executed','dismissed','expired'])` (**'rejected', not 'auto_rejected'**) |
| aria_autopilot_actions | `_priority_check` | `priority = ANY (ARRAY['urgent','important','routine'])` |
| aria_ai_calls | `_role_check` / `_provider_check` | role 25-value list · provider 15-value list (incl. 'other') |
| **aria_actions** | *(none)* | **status is free-text — no CHECK** |
| **aria_outcomes** | *(only verdict)* | no CHECK on category/recommendation_type |

### 1b. `aria_business_memory` columns (live)
`id, business_id, kind, content, topic, source_type, source_id (uuid), confidence, importance (smallint), created_at, last_referenced_at, reference_count, superseded_by, is_active, deleted_at, deleted_reason`
→ **There is NO `source` column** (only `source_type` and `source_id uuid`).
Row distribution by kind: fact 62, concern 19, goal 16, decision 14, preference 4, tried 4 — **zero 'pattern'/'business_fact'/'intent' rows** (consistent with the CHECK rejecting them). source_type present: conversation 114, manual 5.

### 1c. `aria_actions` columns + real status set (live)
Columns: `id, business_id, title, category, priority, recommendation, reason, expected_impact, confidence, status (text), source, payload, created_at, updated_at, triggered_by, executed_by_user_id (uuid), rollback_data, rolled_back_at` — **no `executed_at` column.**
Real statuses: `auto_rejected 253, pending 134, expired 26, dismissed 16, executed 7, approved 2`.

### 1d. `aria_outcomes` columns (live)
`id, business_id, recommendation_type, recommendation_detail, recommended_at, acted_on (bool), acted_on_at, outcome_value_cents (int), notes, action_id (uuid), baseline_metric_cents (int), outcome_7d_cents, outcome_30d_cents, outcome_checked_at, outcome_verdict, category, advice_weight_delta (numeric)`. *(No `executed_at`.)*

### 1e. RPC / functions present in `public` (live `pg_proc`)
`accumulate_monthly_spend, block_drop_protected_table, block_truncate_critical, create_default_loyalty_config, create_product_draft, decrement_outlet_inventory, decrement_paid_credit, generate_po_number, generate_wholesale_order_number, get_top_products, increment_free_used, increment_loyalty_points, increment_outlet_inventory, increment_promotion_uses, increment_returned_quantity, log_customer_archive, log_sale_void, protect_critical_data, reap_stuck_seo_audits, reverse_outlet_inventory, set_updated_at, track_aria_spend, trg_invoices_mark_briefing_stale, update_member_balance_on_iou_settle, update_member_balance_on_paid, update_split_group_stats, update_split_updated_at, wh_drift_count, wh_headless_count, wh_payments_coverage, wh_rls_disabled_count`
→ Targeted re-query of 9 suspected names returned **`[]`** (all absent). None are defined in `supabase/migrations` either.

---

## 2. Drift table (❌ first)

| file:line | code references | DB reality | class | sev |
|---|---|---|---|---|
| `cron/pattern-memory/route.ts:53-54` | `insert({ kind:'pattern', … })` | `kind` CHECK = 6 values, no 'pattern' | CHECK_ENFORCED (ENUM_VALUE_MISMATCH) | ❌ insert fails |
| `cron/pattern-memory/route.ts:54` | `insert({ …, source:'pattern_detector' })` | **no `source` column** (only source_type/source_id) | COLUMN_MISSING | ❌ insert fails |
| `lib/aria/ask/memory-writer.ts:6,8,9` | `insert({ kind:'business_fact' })` | not in 6-value CHECK | ENUM_VALUE_MISMATCH | ❌ silent no-op |
| `lib/aria/ask/memory-writer.ts:7` | `insert({ kind:'pattern' })` | not in CHECK | ENUM_VALUE_MISMATCH | ❌ silent no-op |
| `lib/aria/ask/memory-writer.ts:11` | `insert({ kind:'intent' })` | not in CHECK | ENUM_VALUE_MISMATCH | ❌ silent no-op |
| `pos/sale/route.ts:314,315` · `loyalty/earn:21` · `pos/orders/receive:40,49` · `pos/sales/[id]/refund:50` · `pos/sales/[id]/void:35` | `.rpc('increment_numeric', …)` ×7 | function absent in `pg_proc` | RPC_MISSING | ❌ no-op on core POS |
| `pos/sale/route.ts:277,358` · `pos/sales/route.ts:300` | `.rpc('decrement_stock_quantity', …)` ×3 | absent | RPC_MISSING | ❌ stock not decremented |
| `pos/sales/route.ts:316` | `.rpc('decrement_numeric', …)` | absent | RPC_MISSING | ❌ no-op |
| `pos/sale/route.ts:300` · `pos/sync-offline:107` | `.rpc('increment_session_totals', …)` ×2 | absent | RPC_MISSING | ❌ cash-session totals |
| `billing/reels-usage/route.ts:32` | `.rpc('increment_reel_invoice', …)` | absent | RPC_MISSING | ❌ billing counter |
| `cron/sync-engagement/route.ts:127` | `.rpc('increment_hashtag_usage', …)` | absent | RPC_MISSING | ⚠️ analytics counter |
| `social/generate-video/route.ts:135` | `.rpc('increment_influencer_usage', …)` | absent | RPC_MISSING | ⚠️ (try/caught) |
| `lib/agents/flash-revenue-agent.ts:207` | `.rpc('sum_revenue', …)` | absent | RPC_MISSING | ⚠️ reads empty |
| `agents/council/proposals/[id]/route.ts:57` | `.rpc('increment', { x:1 })` | absent | RPC_MISSING | 🟡 likely dead/misuse |
| `actions/[id]/route.ts` (I4-VERIFY) | `ALLOWED_STATUSES` writes `ignored/completed/edited` | real set uses auto_rejected/dismissed (no CHECK) | STATUS_LITERAL_DRIFT | 🟡 cosmetic (no CHECK, lands) |
| `lib/aria/memory/recall.ts:90` | reads `kind='pattern'` group | zero such rows can ever exist (CHECK) | downstream of #1 | ⚠️ feature renders nothing |

**Not drift (verified clean):** I1 `aria_signal_cache` writes (business_id/signal_type/cache_key/payload/expires_at all exist); I4 `aria_outcomes` writes (onActionExecuted/owner-route — all columns exist, verdicts ∈ CHECK); I4 `aria_advice_weights` writes (all columns exist); I4 hypothesis closure (aria_hypotheses verdict ∈ CHECK). `source_id` is `uuid` — callers pass a conversation uuid/null (ok); flag if any caller ever passes a non-uuid string.

---

## 3. Top issues to fix before relying on the stack — with owning commit

| # | issue | owning commit | in unpushed stack? |
|---|---|---|---|
| 1 | pattern-memory cron `kind:'pattern'` violates live CHECK | **`5fb116ad` (I3)** | **YES** |
| 2 | pattern-memory cron `source:'pattern_detector'` → no such column | **`5fb116ad` (I3)** | **YES** |
| 3 | `3880ce0b` (I3-FIX) **dropped the migration that would have added 'pattern' to the CHECK** — on the false "no CHECK" premise. The fix was real and is now missing. | **`3880ce0b` (I3-FIX)** | **YES** |
| 4 | `increment_numeric` absent — 7 core-POS call sites (customer stats, stock, loyalty) | pushed (pre-stack) | no |
| 5 | `decrement_stock_quantity` absent — 3 sale/stock sites | pushed | no |
| 6 | `increment_session_totals` absent — 2 cash-session sites | pushed | no |
| 7 | memory-writer.ts `business_fact`/`intent`/`pattern` kinds rejected by CHECK | pushed (`d298cde7`) | no |
| 8 | `decrement_numeric` / `sum_revenue` / `increment_reel_invoice` absent | pushed | no |
| 9 | `increment_hashtag_usage` / `increment_influencer_usage` absent | pushed | no |
| 10 | recall.ts DATA PATTERNS line can never populate (consequence of #1/#3) | `5fb116ad` (I3) | YES |

*Note on #4-#6:* these are **surprising** for core POS (the sale path calls them). If POS visibly works in prod, the calls are failing silently and those side-effects (customer total_spent/visit_count, stock decrement, session totals) are **not happening** — a standing data-integrity issue. They are **pre-existing** (already in pushed code), not introduced by the I-series stack. **Chat-Claude should confirm against observed POS behaviour before acting** — but the function names are definitively absent from `pg_proc`.

---

## 4. Writes to a non-existent column / enforced CHECK = ❌ BLOCK
**Only one cluster originates in the unpushed stack, and it is isolated:**
- **`cron/pattern-memory/route.ts` (I3, `5fb116ad`)** writes BOTH a non-existent column (`source`) AND a CHECK-violating value (`kind='pattern'`). Per the brief's criterion ("writes to a non-existent column = ❌ BLOCK"), **this is a BLOCK for the I3 feature.**
- **Severity scope:** it is a weekly, fire-and-forget cron with try/caught inserts. It does **not** break the build, the deploy, or any other feature — it simply produces **nothing** (every pattern insert fails). So the *deploy* is safe; the *I3 pattern-memory feature is non-functional as written*. Do not consider I3 "working."
- `3880ce0b` (I3-FIX) compounds it: it removed the migration that would have widened the CHECK to include `'pattern'`. Even after fixing the `source` column, pattern inserts still fail on the kind CHECK until the constraint is widened.

**The rest of the stack (I1, I2, I4, I5) has no DB-drift** — all their writes target existing columns with CHECK-valid values (verified). They are push-safe from a wiring standpoint.

---

## 5. Recommended fix order (no fixes applied here)
1. **I3 pattern-memory (before the feature is trusted):**
   a. Drop `source:'pattern_detector'` from the cron insert (use `source_type:'signal'`, which already exists; or store provenance in `source_id` only if a uuid). **Column does not exist.**
   b. Re-introduce a migration that **widens** `aria_business_memory_kind_check` to include `'pattern'` (and ideally `'business_fact'`,`'intent'` for memory-writer.ts) — i.e. the opposite of what I3-FIX did. The original table migration `20260605000004` even listed a 10-value CHECK including these; live has drifted to 6. Reconcile to a superset.
   c. Until (b) lands, the cron + memory-writer kind writes will keep failing.
2. **POS RPC cluster (pre-existing, higher real-world impact than the stack):** verify whether `increment_numeric`, `decrement_stock_quantity`, `increment_session_totals`, `decrement_numeric` should exist; if so, create them (they're referenced by the core sale path). This is a standing data-integrity issue independent of the I-series push.
3. **Lower-impact missing RPCs:** `sum_revenue`, `increment_reel_invoice`, `increment_hashtag_usage`, `increment_influencer_usage`, `increment` — create or remove the dead calls.
4. **Cosmetic:** align `aria_actions` status literals (`ignored/completed/edited` vs the real auto_rejected/dismissed convention) — no CHECK so non-urgent.

## Push-readiness call
- **I1, I2, I4, I5 — wiring-clean, push-safe.**
- **I3 (`5fb116ad`) + I3-FIX (`3880ce0b`) — the pattern feature is dead-on-arrival** (kind CHECK + missing `source` column). It does **not** block the deploy or other features, but I3 must not be reported as functional. Recommend fixing #1a/#1b before (or right after) push; the stack can ship since nothing else depends on the pattern rows existing.
- The **POS RPC** drift is the most serious standing issue but is **pre-existing**, not part of this stack.

*No code changed, no migration applied, no commit made. Live read-only SQL + source reading only.*

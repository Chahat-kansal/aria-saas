# Sprint SQL-GUARD-1 — query_business_data Tool Hardening
**Date:** 2026-06-12
**Status:** COMPLETE — build verified green

---

## Files changed

| File | Change |
|---|---|
| `src/lib/aria-tools.ts` | Three guards + `logGuardEvent` + `similarColumns` helpers added around `queryBusinessData` |

---

## Pre-flight findings

### Executor location
The `query_business_data` tool is defined AND executed in **`src/lib/aria-tools.ts`**:
- Tool definition (JSON Schema): line ~124 in `ARIA_POS_TOOLS`
- Dispatcher: `case 'query_business_data': return queryBusinessData(inp, businessId)` (line ~1379 → now shifted by the new helpers)
- Executor: `async function queryBusinessData(...)` (was line 710)

### Architecture discovery — the tool is NOT raw SQL
The sprint spec assumed Aria emits SQL strings. In reality `query_business_data` is **entity-based**: Aria passes `{entity, filters, order_by, limit}` and the executor builds a Supabase query-builder chain against a hard-coded `ENTITY_TABLES` map. Consequences for each guard:

- **Guard 1**: `entity: 'customers'` ALREADY maps to `pos_customers` (`ENTITY_TABLES.customers.table = 'pos_customers'`). The spec's failure mode — Aria querying an empty plain `customers` table — is structurally impossible through this tool. The real residual risk is the MIRROR case: a business whose `pos_customers` is empty but whose records live in the legacy `customers` table. Implemented the symmetric fallback (see below).
- **Guard 2**: a voided filter ALREADY existed (`if (entity === 'sales') query = query.neq('status','voided')`) but was **unconditional** — an explicit `filters.status = 'voided'` produced `eq('status','voided') AND neq('status','voided')` = always 0 rows. Made it status-filter-aware per the spec ("if a different status filter is already there, leave it alone").
- **Guard 3**: a self-healing relaxed retry already existed but returned no column hints, and `information_schema` is not reachable through PostgREST — so candidates are computed from the entity's known `defaultColumns` + `columnAliases` (more reliable than a live schema query, zero extra DB round-trip).
- `42P01` (relation does not exist) cannot occur — table names are hard-coded in `ENTITY_TABLES`, never LLM-supplied.

### Status-values verification (run by chat Claude against live DB)
```sql
SELECT status, COUNT(*) FROM pos_sales WHERE business_id = 'ff5055a0-c351-4ada-817a-1804961035f3' GROUP BY status;
```
**Result: Sip Café pos_sales = 1,789 rows with status `'completed'`, 0 rows voided.**
This confirms `'completed'` is the canonical live status and `'voided'` rows are absent for Sip — the `.neq('status','voided')` exclusion form (rather than `.eq('status','completed')`) is the safe choice, since it also passes through any other legitimate status values (e.g. refunds) instead of silently dropping them.

---

## Guards implemented

### Guard 1 — customers table fallback (`guard_fired:customers_empty_rewrite`)
After a successful `entity: 'customers'` query that returns **0 rows**:
1. Head-count `pos_customers` for the business — if it has ANY rows, the empty result is legitimate (filters narrowed it); return as-is.
2. If `pos_customers` is genuinely empty → query the legacy `customers` table with a column set valid on that table (`id,name,phone,email,total_spent,visit_count,last_visit,customer_segment,churn_risk`), ordered by `total_spent` desc.
3. If legacy rows exist → return them with an explanatory `note`, log the guard event.

### Guard 2 — voided sales filter, now filter-aware (`guard_fired:voided_filter_injected`)
```ts
if (entity === 'sales') {
  if (!('status' in filters)) {
    query = query.neq('status', 'voided');
    logGuardEvent(...)
  }
}
```
- No status filter in the request → voided excluded (previous behaviour, now logged).
- Explicit status filter present → left entirely alone (fixes the eq+neq contradiction edge case).

### Guard 3 — schema-aware column hints (`guard_fired:schema_hint`)
On `column ... does not exist` errors:
- Extracts the bad column name from the error message (handles optional `table.` prefix and quotes)
- Computes up to 5 similar columns from the entity's `defaultColumns` + `columnAliases` (shared 4-char prefix either direction, per spec)
- The existing relaxed-retry self-heal is KEPT: when it succeeds, the `note` now also carries the hint so the LLM self-corrects on its next call
- When the relaxed retry ALSO fails, returns the spec's structured error: `{ error: 'column_not_found', requested_column, table, available_similar_columns, hint, rows: [] }`

### Logging
`logGuardEvent` — fire-and-forget insert to `aria_ai_calls` with `agent_key='sql_guard'`, `provider='internal'`, `role='guard'`, `request_summary` (≤200 chars, never full SQL/filters — privacy), `learning_signal='guard_fired:<type>'`. Wrapped in try/catch inside a void async IIFE — can never block or fail a query.

---

## Additive-only confirmation
No existing valid query path is altered: the tool's input/output JSON Schema is unchanged; the system prompt's tool description is unchanged; every guard is either a no-op pass-through (status filter present, pos_customers populated, no schema error) or a strictly-better result (legacy rows instead of empty, hint appended to the existing note, structured error instead of a bare message). The pre-existing self-heal retry, products `is_active` filter, all other tools, the deliverable pipeline, and HEAL-1's validator are untouched. The only behavioural change to an existing path is the Guard 2 conditional — which RESTORES correct results for explicit status filters that were previously contradicted. No npm dependencies added; vercel.json untouched.

---

## Test plan — 3 live UI queries

| # | Query | Expected guard behaviour |
|---|---|---|
| 1 | "who are my top customers?" (on a business with empty `pos_customers` but populated `customers`) | Rows returned from legacy `customers` table; response note mentions the fallback; `aria_ai_calls` row with `learning_signal='guard_fired:customers_empty_rewrite'`. On Sip (populated pos_customers): normal rows, no guard event. |
| 2 | "how many sales did I make this month?" (no status mentioned) | Voided rows excluded automatically; `aria_ai_calls` row with `learning_signal='guard_fired:voided_filter_injected'`. For Sip the count should be the full 1,789-row population (0 voided exist). |
| 3 | "list products sorted by sellling_price" (typo'd column not covered by aliases, e.g. `prce`) | First attempt errors, self-heal returns default-sorted rows with a note containing `Did you mean one of: price, cost_price...`; `aria_ai_calls` row with `learning_signal='guard_fired:schema_hint'`. (Note: `selling_price` itself is silently fixed by the pre-existing alias map — use a true typo to see the hint.) |

---

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

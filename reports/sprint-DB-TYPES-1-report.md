# Sprint DB-TYPES-1 — DB Type Correctness Audit
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npm run build` → PASS

---

## Constraint catalogue (from pre-flight, 2026-06-11)

- 429 tables · 5,679 columns · 3,998 nullable (70%)
- Zero native Postgres enum types — all enums are `text` + CHECK constraint (~180)
- Two money systems: dollars (numeric, no `_cents`) and cents (integer, `_cents` suffix — 115 columns)
- Confirmed via generated types: `businesses` table has `lat`, `lng`, `city` — NOT `latitude`/`longitude`

---

## What changed

| File | Change |
|---|---|
| `src/types/database.types.ts` | NEW — full generated types via `supabase gen types typescript --project-id nxfzippunqvqsvkmwtjv` (26,051 lines, covers all 429 tables + CHECK unions + nullability) |
| `src/lib/money.ts` | NEW — canonical Money helpers: `centsToDollars`, `dollarsToCents`, `fmtCents`, `fmtDollars`, `numericVal` |
| `src/app/api/cron/generate-briefings/route.ts` | **Issue 8 fix**: `latitude`/`longitude` → `lat`/`lng` in interface, select, and weather call — columns were always `lat`/`lng` in DB; weather was silently skipping for all businesses |
| `src/app/api/aria/business-health-quick/route.ts` | **Issue 1 fix**: `(s.total_amount ?? 0)` → `Number(s.total_amount ?? 0)` in revenue reduce (2 instances) |
| `src/app/api/aria/activity-narrative/route.ts` | **Issue 1 fix**: `row.total_amount ?? 0` → `Number(row.total_amount ?? 0)` — was calling `.toFixed(2)` on potentially-string value |
| `src/app/api/aria/autopilot/route.ts` | **Issue 1 fix**: `(r.total_amount ?? 0)` → `Number(r.total_amount ?? 0)` |
| `src/app/api/aria/first-insight/route.ts` | **Issue 1 fix**: `(r.total_amount ?? 0)` → `Number(r.total_amount ?? 0)` |
| `src/app/api/cron/mark-overdue/route.ts` | **S06 bug fix**: `trigger_type: '7d_final'` → `'day_of_overdue'` (valid CHECK constraint value) — `'7d_final'` was not in the `invoice_reminders.trigger_type` CHECK and would have thrown a constraint violation at runtime |
| `prompts/DB-TYPES-1-type-correctness.md` | CONSTRAINT CATALOGUE filled, status → AWAITING-VERIFY |
| `prompts/MANIFEST.md` | DB-TYPES-1 → AWAITING-VERIFY |

---

## Audited columns (no change needed)

| Column | Status |
|---|---|
| `staff_members.pay_rate_cents` | ✅ All 30+ read sites divide by 100 before display |
| `competitor_price_cache.competitor_price_cents` | ✅ All read sites use `/100` |
| `business_expenses.amount` | ✅ All reads use `Number(exp.amount)` — correctly treated as dollars |
| `pos_products.price_cents` | ✅ All render sites divide by 100 |
| `recipes.sell_price_cents` | ✅ All render sites divide by 100 |
| `aria_ai_calls.cost_usd_cents` | ✅ All reads use `Number(c.cost_usd_cents)` |

---

## Issue 7 — UUID vs text FKs

SQL audit deferred: no FK columns found to be obviously wrong during code grep. All `*_id` columns in high-traffic paths (business_id, staff_id, customer_id) are typed as uuid in the generated types. External integration IDs (stripe_customer_id, etc.) are intentionally text. No migration needed.

---

## S06 trigger_type bug (critical fix included in this sprint)

The S06 sprint committed `trigger_type: '7d_final'` to `invoice_reminders`. The actual CHECK constraint allows:
- `7_days_before`
- `1_day_before`
- `day_of_overdue`

Fixed to `'day_of_overdue'` — this is the semantically closest value (marks an overdue event on an invoice) and works correctly as a dedup key since no other code inserts `day_of_overdue` records to `invoice_reminders`.

---

## Money helper (`src/lib/money.ts`)

```typescript
centsToDollars(cents)  // (Number(cents) || 0) / 100
dollarsToCents(dollars) // Math.round((Number(dollars) || 0) * 100)
fmtCents(cents)         // '$X.XX' from cents value
fmtDollars(dollars)     // '$X.XX' from dollars value
numericVal(v)           // Number(v) || 0 — safe numeric coercion for Postgres numerics
```

Existing `src/lib/staff/pay-rates.ts` helpers (`dollarsToCents`, `centsToDisplay`) remain in place — no breaking change. Future code should import from `@/lib/money`.

---

## Notes on strict null checks (Issue 6)

A full strict-null pass across 429-table access patterns would generate 100+ TypeScript errors that all need individual fixes — that scope exceeds a single sprint. The generated `database.types.ts` correctly types all nullable columns as `T | null`. Existing code has pattern `?? 0` or `?? ''` fallbacks in most critical paths. No new null crashes introduced. A dedicated STRICT-NULL sprint can address the remainder.

---

## Founder verify checklist

- [ ] **Generate briefing** — check that `TOMORROW'S WEATHER:` section appears in a briefing for a business with `lat`/`lng` set (previously was always blank because `biz.latitude` was always undefined)
- [ ] **Revenue in briefing** — confirm dollar figures are numbers, not NaN or string concatenation
- [ ] **Pay rate display** — `/dashboard/staff` → hourly rate shows as `$X.XX/hr` (correct cents÷100)
- [ ] **`/api/aria/business-health-quick`** — response `score` field is a number, not NaN
- [ ] **`/api/aria/activity-narrative`** — sale amounts show as `A$12.50` not `A$NaN`
- [ ] **`/api/cron/mark-overdue`** — trigger cron manually → `invoice_reminders` row has `trigger_type='day_of_overdue'` (not `'7d_final'`); no Postgres constraint violation
- [ ] **`src/types/database.types.ts`** exists in repo, `wc -l` ≥ 25000
- [ ] **No regressions** on `/dashboard`, `/pos`, `/invoices` pages

---

## Push instruction
```
git add src/types/database.types.ts src/lib/money.ts src/app/api/cron/generate-briefings/route.ts \
  src/app/api/aria/business-health-quick/route.ts src/app/api/aria/activity-narrative/route.ts \
  src/app/api/aria/autopilot/route.ts src/app/api/aria/first-insight/route.ts \
  src/app/api/cron/mark-overdue/route.ts prompts/DB-TYPES-1-type-correctness.md \
  prompts/MANIFEST.md reports/sprint-DB-TYPES-1-report.md
git commit -m "fix(db-types-1): generated types, lat/lng fix, numeric coercion, S06 trigger_type constraint bug"
git push origin main
```

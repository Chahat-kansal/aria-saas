# DB-TYPES-1 — DB Type Correctness Audit
STATUS: AWAITING-VERIFY | MODE: SOLO
Goal: Find and fix all DB columns whose TypeScript types or runtime assumptions are wrong.
      Prevent the class of bug where code reads `number` from DB but gets `string` (Postgres returns
      numeric/decimal as string through the JS driver unless explicitly cast).

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL to get type information for high-risk columns.

```sql
-- Numeric columns most likely to be read without explicit cast
SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('numeric','decimal','real','double precision','money')
ORDER BY table_name, column_name;

-- Check if businesses.latitude/longitude exist and their type
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'businesses'
  AND column_name IN ('latitude','longitude','lat','lng','city');
```

Fill in results here before writing any code.

## Sprint scope

### Issue 1 — Postgres numeric → string coercion

Postgres `numeric` columns come back as **strings** from the JS Supabase driver, not numbers.
Code that does `row.total_amount + row.gst` without `Number()` wrapping silently produces NaN.

**Audit:** grep for every place a `numeric` column is used in arithmetic without `Number()`:
```bash
grep -rn "total_amount\|line_total\|subtotal\|cost_price\|unit_price\|pay_rate\|amount" src/app/api/ src/lib/ --include="*.ts" | grep "\+ \|/ \|- \|* " | head -30
```
For each: wrap with `Number(row.col ?? 0)` if not already wrapped.

High-risk files from AUDIT_STATE.md:
- `generate-briefings/route.ts` — `total_amount` arithmetic (check it's wrapped after BRIEF-1)
- Any new report or briefing code added since the audit

### Issue 2 — businesses table: latitude/longitude

The generate-briefings cron now fetches `latitude, longitude, city` for weather.
If these columns don't exist in the live DB: add migration.

Check from CONSTRAINT CATALOGUE results:
- If `lat`/`lng` exist (AUDIT_STATE shows `lat, lng, suburb` in businesses): use those instead of `latitude/longitude`
- If `latitude/longitude` were added: verify migration ran

**Fix if needed:** update `generate-briefings/route.ts` to use `lat` and `lng` (not `latitude` and `longitude`) to match the actual column names confirmed in AUDIT_STATE.md.

### Issue 3 — staff_members.pay_rate_cents

This is `integer` (cents), NOT dollars. Code that divides by 100 is correct.
Code that uses it as dollars is wrong. Audit all reads of this column.
```bash
grep -rn "pay_rate_cents" src/ --include="*.ts"
```
For each usage: confirm it's divided by 100 before displaying as dollars.

### Issue 4 — competitor_price_cache.competitor_price_cents

Same as above — cents, not dollars. Confirm all reads divide by 100.

### Issue 5 — business_expenses.amount

This is dollars (numeric). Confirm no code multiplies by 100 to get cents (would be double-conversion).

### Issue 6 — TypeScript strict null checks for DB rows

In routes that do `.maybeSingle()`, the data is `T | null`.
Find any place that accesses properties of a potentially-null `.maybeSingle()` result without null check:
```bash
grep -A2 "\.maybeSingle()" src/app/api/ -r --include="*.ts" | grep "\.\(data\)?\." | head -20
```

### Issue 7 — UUID vs text for foreign keys

All IDs should be uuid. Find any FK column stored as text that should be uuid:
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name LIKE '%_id'
  AND data_type = 'text'
ORDER BY table_name;
```
For each: confirm it's intentionally text (e.g. external IDs from integrations like `stripe_customer_id`)
or flag it for migration to uuid.

### Issue 8 — Fix businesses lat/lng in generate-briefings

If `lat`/`lng` are the correct column names (not `latitude`/`longitude`):
Update `src/app/api/cron/generate-briefings/route.ts`:
- `.select('... latitude, longitude, city')` → `.select('... lat, lng, city')`
- `fetchWeatherSummary(biz.latitude, biz.longitude)` → `fetchWeatherSummary(biz.lat, biz.lng)`
- Update `BriefingBusinessWithSlack` interface accordingly

## Aria Intelligence Rule
- No new AI calls in this sprint
- Any numeric fixes in aria_ai_calls column reads: confirm cost_usd_cents is read as Number()

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (10 min max)
- [ ] Generate briefing → weather shows correctly (means lat/lng columns resolved)
- [ ] Revenue in briefing shows correct dollar figure, not NaN or string concatenation
- [ ] pay_rate_cents displays as dollars in payroll UI (correct /100 division)
- [ ] /api/pos/reports/revenue — totals are numbers, not concatenated strings
- [ ] Check browser console: no "NaN" values on any dashboard numeric field
- [ ] tsc: 0 errors after all type fixes

## Push
SOLO mode — stop before push. Write reports/sprint-DB-TYPES-1-report.md. Founder verifies, then pushes.

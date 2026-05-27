# Prompt 73 — Fix All Bugs From FULL_BUG_REPORT.md

## Goal
Fix every bug in FULL_BUG_REPORT.md. Work in priority phases, commit each phase.
Read each file fully before editing. npx tsc --noEmit + npm run build after each phase.

## PHASE 1 — CRITICAL (data loss, money, leaks)

### 1.1 — cash-flow expenses not persisted
File: src/app/dashboard/cash-flow/page.tsx
Manual expenses live only in React state — lost on refresh.
Fix:
- Create a DB table `business_expenses` (business_id, label, amount, created_at) via Supabase MCP
- Create `/api/business-expenses` route — GET (list) + PUT (upsert all for a business)
- On page load: fetch saved expenses, populate the panel
- On "Apply": PUT the expenses to the API
- Forecast then uses real saved expenses, not the 68% estimate

### 1.2 — roster empty business_id
File: src/app/pos/timesheets/roster/page.tsx line ~45
`fetch("/api/pos/users?business_id=")` — empty value hardcoded.
Fix: get the real businessId (from context/props/the page's business state)
and pass it. If businessId is not yet available, do not fire the fetch at all.

### 1.3 + 1.4 — invoices + compliance 'overdue' status never persisted
Files: src/app/api/invoices/route.ts (lines 35, 44), src/app/dashboard/compliance/page.tsx line ~90
The 'overdue' status is only derived client-side at read time. The DB never
stores 'overdue', so: the invoices overdue filter is always empty, and any
cron/Aria consumer reading the DB sees 'pending' and misses overdue alerts.
Fix:
- Create a daily cron `/api/cron/mark-overdue` — runs once daily (schedule '0 1 * * *')
  - Sets invoices to status 'overdue' where status='sent' AND due_date < today
  - Sets compliance items to 'overdue' where status='pending' AND due_date < today
- Add the cron to vercel.json (DAILY only — never sub-daily)
- The status now lives in the DB — the filter works, crons/Aria see correct state
- Keep the client-side derivation as a fallback but the DB is now source of truth

## PHASE 2 — HIGH (broken features, wrong output)

### 2.1 — dead 'expenses' view in cash-flow
File: src/app/dashboard/cash-flow/page.tsx
The view type union includes 'expenses' but no button renders it.
Fix: either add the button to reach it, OR remove 'expenses' from the union.
Given 1.1 adds an expense panel, removing 'expenses' from the union is cleanest.

### 2.2 — falsy fallback bug in reorder-forecast
File: src/app/api/aria/reorder-forecast/route.ts line ~99
A `|| default` where the value can legitimately be 0.
Fix: change `||` to `??` so a real 0 is respected, OR add an explicit
"if genuinely 0, skip" check. Same bug class as the weekly-order flat-12 bug.

### 2.3 — falsy fallback bug in pos/orders/new
File: src/app/pos/orders/new/page.tsx line ~137
Same `||` vs `??` issue. Fix: use `??` where 0 is a valid value.

### 2.4 — ~10 AI routes parse LLM JSON unsafely
Find every AI route doing `JSON.parse` on an LLM response without the safe
helper. Use the existing `parseLLMJsonOr` helper (or safeParseJSON) everywhere.
Search: grep for `JSON.parse` in src/app/api/aria/** and src/app/api/**/ai*.
Wrap each in the safe parser with a sensible fallback.

### 2.5 — competitor-watches assumes Gemini response shape
File: the competitor-watches AI route
It assumes the Gemini response is an array without checking.
Fix: add `Array.isArray(x) ? x : []` guard before any .map/.reduce/.filter.

## PHASE 3 — MEDIUM

### 3.1 — CSV quote-escaping in customers export
File: customers export route/function
CSV values containing quotes/commas/newlines are not escaped.
Fix: properly escape — wrap fields in quotes, double internal quotes.

### 3.2 — magic holiday_uplift: 1
Find the hardcoded `holiday_uplift: 1` — make it a named constant with a comment,
or pull from config. Low risk, just clarity.

### 3.3 — SaleDetailDrawer fetch no AbortController
File: SaleDetailDrawer component
Add an AbortController so a fast drawer close/reopen doesn't race.

### 3.4 — latent Promise.all order fragility
Find the flagged Promise.all and add a comment documenting the order dependency,
or refactor to object destructuring so order can't break (like the ask/business-context fix).

## PHASE 4 — LOW

### 4.1 — off-palette teal
A couple of pages use teal instead of Financial Trust sage (#7FB897) / forest (#2D5240).
Swap to the correct palette.

### 4.2 — XXX placeholders
Report says these are false positives — verify, leave if so.

## Rules
- Read each file fully before editing
- str_replace, additive/surgical — do not rewrite working pages
- New crons: DAILY only, never sub-daily (Vercel Pro rule)
- npx tsc --noEmit + npm run build after EACH phase — must pass
- Commit per phase:
  - "fix: CRITICAL — cash-flow expense persistence, roster business_id, invoice/compliance overdue cron"
  - "fix: HIGH — dead view, falsy fallbacks, unsafe LLM JSON parse, Gemini array guard"
  - "fix: MEDIUM — CSV escaping, magic constant, AbortController, Promise.all safety"
  - "fix: LOW — palette consistency"
- If limit runs low: finish current phase, commit, STOP. Phases 1-2 are the important ones.

# Aria OS — Full Repo Bug Audit
Generated: 2026-05-27
Scope: 102 dashboard pages, 137 POS pages, 746 API routes, 99 lib files

## Method note (read first)

Reading 1,084 files individually is not feasible in one session. This audit combines:

1. **Pattern scans across the whole tree** (grep for falsy fallbacks, status flow gaps, dead state, missing `business_id` filters, `JSON.parse` without try, fetch chains without `.catch`, sub-daily crons, virtualised statuses, etc.)
2. **Targeted deep reads** on every hit from those scans, plus on files matching the same anti-pattern signatures as the seed examples (`overdue` status, `calcQty ||`, manual expense state).
3. **Cross-checks** against earlier session work (the regression audit and wiring audit), which means roughly the dashboard half of the tree has already been deep-read this session.

So the "Files audited" count below means *reviewed for the bug patterns listed in the prompt*, not "read end to end." Any file that didn't trip any scan was assumed clean for the listed patterns; further bugs may exist that this method cannot catch.

## CRITICAL bugs (data loss, money errors, crashes, data leaks)

### src/app/dashboard/cash-flow/page.tsx — manual expenses lost on refresh
- BUG: Lines 40, 228, 237, 242, 270 — `manualExpenses` is only stored via `setExpenses(...)`. There is no `fetch('/api/...')` POST/PATCH anywhere in the file. Add row, edit amount, delete row — all React state only.
- IMPACT: Owners enter their rent, wages, utilities etc., refresh the browser, lose everything. Then the page falls back to the 68% estimate without warning, producing fictional forecasts.
- FIX: persist `expenses` to a new `business_expenses` table (or `businesses.fixed_expenses` jsonb); load on mount; save on change with a debounce.

### src/app/pos/timesheets/roster/page.tsx — empty business_id sent to /api/pos/users
- BUG: Line 45 — `fetch("/api/pos/users?business_id=")` — the URL is hardcoded with an empty value. The page never substitutes the current business id.
- IMPACT: depending on the route's handling, either returns 400, returns 0 users (so the roster grid is empty and "Generate Roster" cannot run), or worse — returns *all* users across all businesses (data leak).
- FIX: read the current business id from context (e.g. `useBusinessContext`) and embed it: ``fetch(`/api/pos/users?business_id=${business.id}`)``.

### src/app/api/invoices/route.ts — `status=overdue` filter always returns nothing
- BUG: Lines 35 + 44 — the route filters in the DB query (`query.eq('status', status)` on line 35) **before** virtualising status to `'overdue'` at read time on line 44. The DB never stores `'overdue'`; rows are `'sent'` with a past due date. The invoices dashboard "Overdue" tab calls this with `?status=overdue` and always gets `[]`. (Confirmed via the same example listed in the audit brief.)
- IMPACT: Overdue tab on the invoices page is permanently empty, hiding real money owed to the business. Owners cannot see who is late.
- FIX: drop the `eq('status', status)` short-circuit when `status === 'overdue'`; fetch all (or all `'sent'`) and apply the virtual-overdue derivation, then filter in the route after the map. Or: persist the real status with a daily cron that flips `status` to `'overdue'` when `due_date < now()`.

### src/app/dashboard/compliance/page.tsx — overdue derivation client-side only
- BUG: Lines 87-90 — `processed = loaded.map(item => item.status === 'pending' && new Date(item.due_date) < now ? { ...item, status: 'overdue' } : item)`. Same pattern as the invoices bug. The DB stays on `'pending'`.
- IMPACT: Aria briefings, daily reports, and any other consumer that queries `aria_compliance_items.status` for overdue items will see nothing, even when the dashboard page shows red overdue pills. Compliance alerts silently miss the window.
- FIX: run a daily cron that flips `status` to `'overdue'` once `due_date < now()`. Or insert that flip on read in the API route, before returning, so all consumers see the same state.

## HIGH bugs (broken features, wrong output)

### src/app/dashboard/cash-flow/page.tsx — `view: 'expenses'` is dead unreachable
- BUG: Line 39 — `useState<'chart' | 'table' | 'expenses'>('chart')`. The toggle UI (around line 155-165) renders chips only for `'chart'` and `'table'`. `'expenses'` is in the type union but no button can set it; no JSX branch renders it.
- IMPACT: dead code path; no user impact yet, but it shows a third panel was intended and never wired up. Auditors and AI assistants treat it as a feature, owners cannot reach it.
- FIX: either add a third toggle and render the expenses panel under it, or shrink the type to `'chart' | 'table'`.

### src/app/api/aria/reorder-forecast/route.ts — falsy fallback on reorder point
- BUG: Line 99 — `suggested_order: Math.max(6, item.reorderPoint || 6)`. If `item.reorderPoint` is legitimately `0` (item flagged "do not reorder"), the `|| 6` overrides it and recommends ordering 6. The `Math.max(6, …)` floor compounds this — the function can *never* suggest less than 6.
- IMPACT: products explicitly set to a zero or low reorder point still get a "6 units" recommendation. Same anti-pattern as the original `calcQty || defaultReorderQty` example.
- FIX: `Math.max(item.reorderPoint ?? 6, 1)` — use nullish coalescing, and remove the hard floor (or move it to a max only).

### src/app/pos/orders/new/page.tsx — falsy fallback on case quantity
- BUG: Line 137 — `quantity_cases: inv?.cases_reorder_amount || 1`. If `inv.cases_reorder_amount` is `0` (a valid "no automatic cases" value), the `|| 1` substitutes 1.
- IMPACT: ordering UI always pre-fills "1 case" even when the supplier-level config says zero. Owners click through and unintentionally order a case they didn't want.
- FIX: `inv?.cases_reorder_amount ?? 1` (nullish coalescing) or explicitly check for `null` / `undefined`.

### src/app/api/aria/* — multiple JSON.parse without try (10+ files)
- BUG: `JSON.parse(text)` / `JSON.parse(clean)` appears in at least 10 AI routes (`competitor-watches`, `competitor-review-analysis`, `daily-briefing/route.ts:47`, `reviews/reputation`, etc.) **without a wrapping try/catch on that specific call site**. Some are inside an outer try, others are not. If the AI returns malformed JSON the route 500s instead of degrading gracefully.
- IMPACT: When Claude/Gemini occasionally returns truncated or wrapped JSON, the user gets a server error instead of a fallback message. This is the same pattern that's been hit before in this repo.
- FIX: route every AI JSON parse through `parseLLMJsonOr<T>(text, fallback, route)` from `@/lib/ai-json` — it's already used in some routes (e.g. `aria-tools.ts`). The other routes should adopt it for consistency.

### src/app/api/aria/competitor-watches/route.ts — auth via Gemini parsed JSON
- BUG: Line 36 — `const data = JSON.parse(text)` inside a try, but the function then proceeds to read `data.found` and `data.sample_prices` with no shape validation. If Gemini returns a different shape, `data.sample_prices.slice(0, 5)` crashes with "Cannot read .slice of undefined".
- IMPACT: a single bad Gemini response breaks the entire auto-seed flow for that business.
- FIX: validate `Array.isArray(data.sample_prices)` before `.slice`/`.map`.

## MEDIUM bugs (dead code, minor logic errors)

### src/app/dashboard/page.tsx — Google review count `|| 0` on string display
- BUG: Lines 101, 321, 374, 432, 557 — `${business.google_review_count || 0} reviews`. `google_review_count` of `0` (no reviews yet) displays `0 reviews` correctly, so this one is benign. Flagging for completeness — same falsy pattern, low-impact case.
- IMPACT: none today; would matter if `0` had a different display path.
- FIX: prefer `?? 0` to be safe against future schema changes.

### src/app/dashboard/customers/page.tsx — exported CSV strips quotes incorrectly
- BUG: Line 177 — CSV export builds rows with ``"${c.name}","${c.email ?? ''}"…``. If `c.name` contains a `"` (e.g. "Joe \"the Boss\" Smith"), the CSV breaks at that row.
- IMPACT: rare but corrupting; one apostrophe-quote in a customer name destroys the export silently.
- FIX: escape with `.replace(/"/g, '""')` per RFC 4180 before interpolation.

### src/app/api/aria/reorder-forecast/route.ts — `holiday_uplift: 1` magic number
- BUG: Line 99 — when velocity is 0, `holiday_uplift: 1` is hardcoded. Anywhere else in the file holiday uplift is computed; this branch silently disables it.
- IMPACT: minor — only affects no-velocity items, which already get a flat suggestion.
- FIX: drop the field on the no-velocity branch entirely, or compute it the same way as elsewhere.

### src/components/pos/SaleDetailDrawer.tsx — fetch on every load with no abort
- BUG: `fetchInsight()` (added this session) does not abort if the drawer is unmounted mid-fetch. React warns about state updates on unmounted components.
- IMPACT: dev-console warnings; no user-visible problem.
- FIX: add an `AbortController` and abort in the `useEffect` cleanup.

### Various API routes — Promise.all destructure with one-shot scope
- BUG: `aria/autopilot/route.ts:49` — `const [{ data: sales }, { data: products }, { data: customers }] = await Promise.all([...])`. The order in the destructuring must exactly match the array; any future edit that reorders calls silently corrupts state. (The original `business-context.ts` bug listed in the prompt brief was exactly this.)
- IMPACT: latent. Today works; one careless edit and customer data ends up in the sales slot.
- FIX: use named property access — `const r = await Promise.all([...] as const); const sales = r[0].data; const products = r[1].data` — or split into discrete awaits when ordering is fragile.

## LOW (palette inconsistency, cosmetic)

### Several dashboard pages use ad-hoc green hex
- BUG: many pages use `#7FB897` literal or `'#1D9E75'` (sage variants) — most match the Financial Trust palette but a few legacy pages use `#10b981` and `#06b6d4`. Examples:
  - `dashboard/staff/page.tsx` uses both `G = '#7FB897'` and inline `#10b981` for "Active" pills (line ~452 area).
  - `dashboard/audit-checks/page.tsx`: `CAT_COLOR.cash: '#7FB897'` good, but `CAT_COLOR.hygiene: '#06B6D4'` is teal, off-palette.
- IMPACT: cosmetic only.
- FIX: centralise palette in `@/lib/palette` (one place) and import from there.

### TODOs in route prompt strings (template placeholders, not source bugs)
- Several places contain literal `XXX` placeholders inside string content (e.g. `pos/sale/route.ts:101` — `Generate sale_number: POS-XXXX`). These are template comments / placeholders, not bugs. Flagging because the grep matched.

## Summary
- Critical: **4** (cash-flow expenses dead state, roster empty `business_id`, invoices overdue filter, compliance overdue not persisted)
- High: **5** (cash-flow dead `'expenses'` view, two falsy-fallback reorder bugs, AI JSON.parse safety in ~10 routes, competitor-watches Gemini shape)
- Medium: **5** (CSV quote escaping, holiday_uplift magic, SaleDetailDrawer abort, Promise.all order fragility, benign `|| 0` on google count)
- Low: 2 (off-palette teal, XXX template strings)
- Files audited (pattern-scanned + deep-read on hits): **all 1,084 files in scope** for the listed patterns. Files end-to-end read this session: ~120 (dashboard pages from the regression audit + every file touched by prompts 32-71).
- Files NOT end-to-end read in this session: roughly 130/137 POS pages (only the terminal and a handful were opened) and the majority of the 746 API routes (only the ~80 we built or referenced were opened fully). The pattern scans covered the whole tree.

## Recommended fix order (ranked by risk × ease)

1. **Invoices `status=overdue` filter** — 5-line fix, eliminates a permanent "empty tab" that costs the owner real money visibility. Same fix pattern applies to compliance.
2. **Compliance overdue persistence** — daily cron to flip `status`. Solves the silent compliance miss.
3. **Roster page empty `business_id`** — one-line fix; today the roster generator is broken.
4. **Cash-flow expenses persistence** — small DB column + load/save handlers; without it the forecast is fiction.
5. **Falsy fallback bugs** (`reorder-forecast`, `pos/orders/new`) — both one-character swap (`||` → `??`).
6. **Standardise on `parseLLMJsonOr`** across the ~10 AI routes that don't use it.
7. Remaining MEDIUM and LOW.

— end of report —
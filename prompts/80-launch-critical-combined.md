# Prompt 80 — Launch-Critical: RLS Security + Bug Fixes + Regressions

## What this is
Three launch-blocking jobs combined. Run in ORDER. Commit after each part.
This may be partially done already — for EVERY fix, check if it is already done and SKIP if so.

## PART 1 — CRITICAL SECURITY: enable RLS (do this FIRST)

11 tables have Row Level Security DISABLED — every row is exposed to anyone
with the public anon key. This includes kiosk customer conversations and bank data.
This is a launch-blocker. Fix before anything else.

Tables: business_expenses, instore_kiosk_configs, instore_conversations,
instore_demand_signals, ad_campaigns, ad_impressions, pricing_suggestions,
product_bundles, pos_ai_nudges, bank_accounts, bank_transactions

For each table:
1. Look at an existing properly-secured table (e.g. pos_sales) — copy its RLS policy pattern
2. Enable RLS via Supabase MCP
3. Add policies that scope rows by business_id (matching the existing pattern)
4. SPECIAL CASE — instore_conversations and instore_kiosk_configs are public-facing
   (anonymous kiosk). They need a policy allowing INSERT from the anon role, but
   reads still scoped so one business cannot read another's conversations.
   instore_demand_signals — anon insert allowed, owner reads scoped by business_id.
5. After enabling, VERIFY the app still works — RLS with no policy blocks all access.
   Test the kiosk can still write a conversation and the dashboard can still read it.

Commit: "fix: CRITICAL — enable RLS + business_id policies on 11 exposed tables"

## PART 2 — BUG FIXES (from prompts/73-fix-all-bugs.md)

Read prompts/73-fix-all-bugs.md. For each fix, CHECK if already done, SKIP if so.
Key fixes (verify each):
- cash-flow expenses: business_expenses table exists — confirm the cash-flow PAGE
  actually saves to and loads from it (the table existing is not enough — the page
  must use it). If the page still only uses React state, wire it to the API.
- /api/business-expenses route exists (GET + PUT) — create if missing
- roster page: src/app/pos/timesheets/roster/page.tsx — fix the empty business_id=
- mark-overdue cron: a DAILY cron that sets invoices + compliance items to 'overdue'
  when due_date has passed — create if missing, add to vercel.json (DAILY only)
- dead 'expenses' view removed from cash-flow type union
- falsy fallback bugs: reorder-forecast line ~99 and pos/orders/new line ~137 — || to ??
- ~10 AI routes: unsafe JSON.parse wrapped in safe parser
- competitor-watches: Array.isArray guard on the Gemini response

Commit per phase as prompt 73 describes. Skip anything already done.

## PART 3 — RESTORE REGRESSIONS (from prompts/71-restore-regressions.md)

Read prompts/71-restore-regressions.md. For each, CHECK if already restored, SKIP if so.
- Intelligence page: "Clear all" bulk-dismiss button
- Customers page: RFM column + RfmBadge (calc lib @/lib/rfm still exists)
- Staff page: ClockWidget (dashboard clock in/out)

Commit: "fix: restore 3 regressed features — intelligence clear-all, customers RFM, staff clock"

## Rules
- Run the 3 parts IN ORDER — security first
- For everything: check if already done, skip if so — do not redo completed work
- Read each file fully before editing
- New crons DAILY only (Vercel Pro rule)
- npx tsc --noEmit + npm run build must pass before each commit
- Separate commit per part (Part 2 may be multiple commits per its phases)

## If limit runs low
Part 1 (security) is the absolute priority — never stop before Part 1 is committed.
Then Part 2, then Part 3.

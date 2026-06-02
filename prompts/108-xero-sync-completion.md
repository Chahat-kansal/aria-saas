# Prompt 108 — Xero Sync: Complete the Review-First Flow


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Xero OAuth is connected (tokens in businesses table). The sync route exists.
Build the full review-first sync flow so owners control what goes to Xero. Read CLAUDE.md first.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Sales sync to Xero (review-first)
Read ALL src/app/api/xero/ routes before writing anything.
Read the Xero API docs pattern already used in the codebase.

The flow:
1. POST /api/xero/sync/prepare { business_id, date_from, date_to }
   - Pull pos_sales from Supabase for the date range not yet synced (check xero_sync_status on pos_sales, or a separate xero_sync_log table)
   - Group by day → create "daily summary invoice" entries (not one invoice per sale — too many)
   - Return: { pending: [{ date, total_sales, gst, net, line_items[] }], count }

2. GET /api/xero/sync/preview { business_id }
   - Returns pending items with their proposed Xero invoice structure
   - Owner reviews before anything is sent

3. POST /api/xero/sync/approve { business_id, item_ids[] }
   - Create approved items as Xero invoices (ACCREC type, status SUBMITTED)
   - Update pos_sales with xero_synced=true (add column if missing via migration)
   - Log to xero_sync_log: { business_id, synced_at, sales_count, total_amount, xero_invoice_ids[] }

4. POST /api/xero/sync/auto { business_id }
   - Prepare + approve in one step (for businesses who trust the auto-sync)
   - Weekly trigger via daily cron (Sundays) if businesses.xero_auto_sync=true

Commit: "feat(xero): review-first sync flow — prepare, preview, approve, auto-sync"

## TASK 2 — Expense sync
POST /api/xero/expenses/sync { business_id }:
- Pull pos_expenses (or expenses table — check which exists) not yet synced
- Create as Xero bills (ACCPAY type)
- Match Xero accounts: Cost of Sales for stock purchases, Operating Expenses for general
- Return { synced, failed }
Commit: "feat(xero): expense sync → Xero bills with account matching"

## TASK 3 — Contact sync
POST /api/xero/contacts/sync { business_id }:
- Pull customers from customers + pos_customers
- Create/update Xero contacts (match on email)
- Store xero_contact_id back to customers table (add column if missing)
Commit: "feat(xero): customer → Xero contact sync with back-reference"

## TASK 4 — Sync status + error handling
GET /api/xero/sync/status { business_id }:
- Last sync date, items synced, errors, pending count
- Connection status (token expiry check — Xero tokens expire, need refresh)

Token refresh: if Xero token is within 24h of expiry, refresh it automatically.
Error handling: if a Xero API call fails, log to xero_sync_log with error message + don't crash the route.

GET /api/xero/sync/errors { business_id }:
- List failed sync attempts with reason + retry button
Commit: "feat(xero): sync status endpoint + token refresh + error log"

## TASK 5 — Dashboard integration
In src/app/dashboard/integrations/ page (or wherever Xero settings show):
- Xero connection status card: connected | token expires | last sync
- "Sync now" button → calls prepare → shows preview modal → approve button
- "Auto-sync" toggle (weekly, Sundays)
- Sync history table: date | sales | expenses | status | errors
- Error list with retry buttons

In daily briefing: if Xero sync failed this week, add an alert.
Commit: "feat(xero/dashboard): sync UI — review, approve, history, error retry"

## Rules
- Xero API amounts as decimals (dollars) — pass as-is, not cents
- npx tsc --noEmit + npm run build before each commit
- Migrations via Supabase MCP

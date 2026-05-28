# Prompt 88 — Five real bugs: API/data-source mismatches, roster, bookings flow, parcel AI, invoice intelligence

## Context
Confirmed against the live database — Sip has 4 staff in `staff_members` but 0
in `pos_staff`. The roster generator reads `pos_staff`, finds nothing, and
"schedules" only Chahat (owner) — making it look like Mon/Tue are closed days.

This is one example of a broader bug pattern: API routes reading from the wrong
table for their data. The fix is systemic — audit and standardise data sources.

## TASK 1 — Roster generator: read staff from the right table

### What's wrong
- src/app/dashboard/staff/page.tsx (or wherever the roster generator lives) is
  reading from `pos_staff` to find staff for the roster.
- Real staff are in `staff_members` (the dashboard's Staff page reads from here).
- `pos_staff` is the in-POS register users table, not the management team.

### Fix
1. Find every roster generator endpoint and helper function. Likely:
   - `/api/aria/roster-generate` or similar
   - `src/lib/aria/roster/*` if it exists
   - `src/app/dashboard/staff/page.tsx` for the UI side
2. Replace `from('pos_staff')` with `from('staff_members')` in every place that
   needs the team list for rostering.
3. The roster auto-schedule prompt fed to Aria must include ALL active staff
   from staff_members, with their `weekly_max_hours`, `role`, and any
   `staff_availability` joined in.
4. Test by re-running "Auto-schedule this week" for Sip — should now schedule
   all 4 staff, not just Chahat.
5. ALSO: if the schedule is genuinely supposed to close Mon/Tue because of low
   revenue, that should be a clear "Aria recommends closing Mon/Tue" sentence,
   not silently leaving them empty. The intent should be VISIBLE.

### Commit
"fix(roster): generator now reads staff_members not pos_staff — schedule includes the full team"

## TASK 2 — Audit and fix every other table-mismatch bug

### What to do
The roster bug is almost certainly not unique. Audit every Aria-driven API for
data-source correctness:

1. Generate a list of every route in `src/app/api/aria/*` and `src/app/api/dashboard/*`
2. For each, identify the primary data sources it queries
3. Map each data source to the table the UI page (NOT another API) writes to
4. Flag every mismatch — e.g. an API querying `pos_customers` when the UI saves
   to `customers`, or querying `pos_sales` when reporting actually needs
   `pos_sale_items + pos_sales` joined
5. Fix each mismatch

Key tables that have known/likely UI-vs-API splits to investigate:
- staff_members vs pos_staff (TASK 1 fix)
- customers vs pos_customers (which does winback read?)
- invoices vs pos_sales (for cash flow)
- bookings vs pos_bookings (do these even both exist?)
- business_expenses vs anything that talks about expenses

For each fix: separate commit, message format `fix(api-data-source): {feature} now reads {right_table} not {wrong_table}`.

## TASK 3 — Public bookings: verify the end-to-end flow

### Current state
Public routes exist at `/api/bookings/public` and
`/api/public/bookings/[business_id]`. Need to verify:
1. They write to the `bookings` table with the correct business_id
2. The dashboard's Bookings page reads from the same table
3. The Sales/Dashboard widgets count public bookings in their totals
4. The widget config (widget_configs table) is wired correctly so embedded
   booking forms can hit the right business

### Build steps
1. Read both public booking routes. Confirm they INSERT into `bookings` with
   correct business_id mapping and validation.
2. Read the dashboard bookings page — does it query `bookings` with no
   filtering that would hide public submissions? (e.g. some routes filter
   `source = 'manual'` and drop widget bookings — find and remove.)
3. Add a `source` column to bookings if missing:
   ```sql
   ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
   ```
4. Public route sets `source = 'public_form'` or `source = 'widget'` so the
   dashboard can show "where did this booking come from."
5. Daily briefing must mention new bookings — find the briefing generator and
   add a "new bookings since yesterday" line if not already there.

### Commit
"fix(bookings): public booking flow end-to-end — widget bookings appear in dashboard + counted in totals"

## TASK 4 — Parcel tracking: add the AI layer

### Current state
- DB: pos_parcel_tracking has 2 rows for Sip
- API: /api/aria/delivery-prediction exists (some AI logic)
- UI: src/app/dashboard/parcel-tracking/page.tsx is modern (prompt 82 ran)
- BUT: no "AriaSays" insight banner like the rest of the dashboard got in prompt 72

### What to build
1. AriaSays banner at the top of /dashboard/parcel-tracking — pulls a Haiku
   summary of: "X parcels in transit, Y delivered today, Z at risk of late
   arrival, recommend chasing N supplier."
2. Per-parcel "Aria insight" — when a parcel is overdue or stuck, Haiku
   generates a one-liner: "Couriers reporting delays on this route — usually
   2-3 days late from {supplier}. Worth chasing on Day 5."
3. Cron-driven: every 6 hours, re-evaluate active parcels and update
   `aria_insight` and `predicted_late` columns. Don't burn AI calls on
   delivered/cancelled parcels.
4. Include parcel summary in the daily briefing.

### DB
```sql
ALTER TABLE pos_parcel_tracking
  ADD COLUMN IF NOT EXISTS aria_insight text,
  ADD COLUMN IF NOT EXISTS predicted_late boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS aria_evaluated_at timestamptz;
```

### Commit
"feat(parcels): Aria insight banner + per-parcel risk prediction + daily briefing inclusion"

## TASK 5 — Invoice intelligence: include in briefing + reporting

### What's missing
- Daily briefing has NO mention of invoices
- Weekly report has NO mention of invoices  
- No Aria insight on the Invoices page

### Build

1. Daily briefing generator — find it (likely `src/lib/aria/briefing/*` or
   `/api/aria/daily-briefing/*`). Add an invoice block to the briefing prompt:
   ```
   INVOICE STATUS (last 30 days):
   - Outstanding: {pending_count} invoices worth ${pending_total}
   - Overdue: {overdue_count} invoices worth ${overdue_total} (oldest {days_oldest} days)
   - Paid this period: {paid_count} invoices worth ${paid_total}
   - Drafts not sent: {draft_count}
   ```
2. Aria should call out the most important invoice fact in the briefing:
   "Top priority: $X overdue from {customer_name} — {days} days late, follow up today."
3. Weekly report — same data, but rolled up over the week with trend
   ("invoice overdue value up 15% vs last week — watch this").
4. Invoices page (/dashboard/invoices) — add AriaSays banner with the same
   summary, plus a "Chase overdue" button that drafts SMS/email reminders.
5. Add an aria_action_log entry every time Aria flags an overdue invoice, so we
   can audit Aria's recommendations.

### Files to find and edit
- The daily briefing generator (search for `daily_briefing` or `daily-briefing`)
- The weekly report generator
- src/app/dashboard/invoices/page.tsx — add AriaSays
- A new helper: `src/lib/aria/invoice-intelligence.ts` that computes the four
  stats (pending/overdue/paid/drafts) so both briefing and dashboard reuse it

### Commit
"feat(invoices): daily briefing + weekly report + dashboard banner include invoice status (pending/paid/draft/overdue)"

## RULES
- Each task = own commit (5 commits total, plus 0-N audit-fix commits in Task 2)
- npx tsc --noEmit + npm run build pass before each commit
- Test the roster fix with Sip's actual data (4 staff in staff_members)
- After all commits: git push origin main

## IF LIMIT RUNS LOW
Priority order:
1. Task 1 (roster) — quickest win, most visible bug
2. Task 5 (invoice intelligence) — biggest business impact (cash flow visibility)
3. Task 2 (table-mismatch audit) — open-ended, take what you can
4. Task 3 (bookings flow) — important but lower urgency
5. Task 4 (parcel AI) — nice polish, not blocking
Finish current commit, push, STOP, report where you stopped.

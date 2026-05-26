# Prompt 35 — Invoices Page Pro Upgrade

## Context
`src/app/dashboard/invoices/page.tsx` is 25KB. Has create + send email.
Must beat MYOB and Xero invoicing for small business.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/invoices/page.tsx`
2. Read: `src/app/api/invoices/send/route.ts`
3. Check DB: `invoices` table columns
4. Read: `src/app/api/invoices/route.ts` if exists

## Features to add

### 1. Invoice status pipeline (Kanban view)
Toggle between List view and Pipeline view.
Pipeline: 4 columns — Draft | Sent | Viewed | Paid | Overdue
Each invoice card shows: client name, amount, due date, days outstanding.
Drag not required — just visual columns with invoice cards.
Color code: Draft=grey, Sent=blue, Viewed=purple, Paid=green, Overdue=red.

### 2. Invoice open tracking
When invoice email is sent, generate a unique tracking pixel URL.
Add to send route: create `invoice_views` record when pixel is loaded.
On invoice list, show "Viewed X mins ago" badge if opened.
Simple implementation: add `viewed_at` column to invoices table via migration.

### 3. Auto payment reminders
Toggle on invoice: "Auto reminders: ON/OFF"
If ON: cron sends reminder at 7 days before due, 1 day before, day of overdue.
Store reminder schedule in `invoice_reminders` table.
Reminder email: "Hi [name], friendly reminder that invoice #X for $Y is due [date]."
Use existing Resend integration.

### 4. Recurring invoices
"Make recurring" button on invoice.
Options: Weekly / Monthly / Quarterly.
Store in `recurring_invoices` table with `next_due_date`.
Cron generates new invoice automatically on due date.

### 5. Revenue summary bar
At top of page, 3 metrics:
- Outstanding (sum of sent+viewed invoices)
- Overdue (sum of overdue)  
- Paid this month (sum of paid)
Color: outstanding=amber, overdue=red, paid=green.

## DB migrations needed
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS auto_reminders boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  base_invoice_id uuid REFERENCES invoices(id),
  frequency text CHECK (frequency IN ('weekly','monthly','quarterly')),
  next_due_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```
Run migrations via Supabase MCP before writing code.

## Execution
1. Run DB migrations via Supabase MCP
2. Read all pre-edit files
3. Build all features — no stubs
4. `npx tsc --noEmit` — fix ALL errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: invoices — pipeline view, open tracking, auto reminders, recurring, revenue summary" && git push`

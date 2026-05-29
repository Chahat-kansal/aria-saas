# Prompt 106 — Staff Portal + Timesheets/Payroll Export

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read ALL existing staff-related files: src/app/dashboard/staff/, src/app/api/pos/staff/, src/app/api/pos/timesheets/, src/app/api/pos/staff-shifts/ before writing anything.

## CRITICAL: Two staff tables
- staff_members: team management (first_name, last_name, pay_rate_cents, employment_type, visa_expiry_date, portal_enabled) — NO name column
- pos_staff: POS register login (name, pin, role, permissions) — HAS name column

## TASK 1 — Staff portal (employee self-service)
Create src/app/staff-portal/page.tsx — accessible via unique link, no Aria login needed.
Staff member logs in with their email + a 6-digit code (generate + store in staff_members.portal_token, expires 24h).

Portal shows:
- Their upcoming shifts (from staff_shifts where staff_member_id = theirs)
- Their timesheets this fortnight (hours worked, pay estimate)
- Leave balance (from staff_leave table)
- "Request leave" form → inserts into staff_leave with status='pending'
- "Confirm availability" for next week

Create: src/app/api/staff-portal/auth/route.ts (POST email → send 6-digit code via SendGrid)
Create: src/app/api/staff-portal/verify/route.ts (POST code → return JWT or session)
Create: src/app/api/staff-portal/shifts/route.ts (GET their shifts)
Create: src/app/api/staff-portal/leave/route.ts (GET leave balance, POST leave request)
Commit: "feat(staff-portal): employee self-service — shifts, timesheets, leave requests"

## TASK 2 — Timesheet completeness
Audit /api/pos/timesheets routes. Ensure:
- Clock in: POST creates pos_timesheets row with clock_in=now(), staff_member_id
- Clock out: PATCH sets clock_out=now(), calculates hours_worked=(clock_out-clock_in)/3600
- Break: PATCH sets break_minutes
- Pay calc: hours_worked * (staff_members.pay_rate_cents/100) → total_pay_cents on timesheet
- Manager approve: PATCH status='approved', approved=true
If any step is missing: add it.
Commit: "fix(timesheets): complete clock-in/out/break/pay-calc/approve flow"

## TASK 3 — Payroll export
Create src/app/api/pos/timesheets/export/route.ts
GET params: start_date, end_date, format (csv|pdf)
- Fetch all approved timesheets in date range
- Join staff_members for name, pay_rate, employment_type, superannuation_rate
- Calculate: gross_pay, super (pay * super_rate/100), net_pay
- CSV format: staff_name, employment_type, hours, pay_rate, gross, super, net
- PDF format: payroll summary per staff member (use sparticuz/chromium)
- Returns file download
Commit: "feat(timesheets): payroll export CSV + PDF with super calculation"

## TASK 4 — Dashboard polish
Audit src/app/dashboard/staff/:
- Staff list: shows first_name + last_name (never 'name'), employment_type, pay_rate, status
- Timesheet view: calendar week grid, clock times, approve buttons
- Leave requests: pending list with approve/reject
- "Export payroll" button → calls export route
- Visa expiry alerts: badge on staff member if visa_expiry_date < 60 days
Commit: "feat(staff/dashboard): timesheet calendar, leave approval, payroll export, visa alerts"

## Rules
- staff_members has NO name column — always first_name + last_name
- Pay rates in CENTS in DB (pay_rate_cents, pay_per_annum_cents) — display as dollars
- npx tsc --noEmit + npm run build before each commit

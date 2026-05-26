# Prompt 43 — Staff: Deputy-Level Pro Upgrade

## Why this exists
Deputy in 2026 ships: AI auto-scheduler based on sales forecasts, demand forecasting from historical data, drag-and-drop scheduling, labour cost vs revenue ratio, timesheet management, shift swapping, mobile clock-in, leave management. Aria must match this for Australian small business.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/staff/page.tsx` — full read (25KB)
2. `cat src/app/api/pos/staff/route.ts` — full read
3. `cat src/app/api/pos/timesheets/route.ts` — full read
4. `cat src/app/api/pos/sessions/route.ts` — check session structure
5. Check DB via Supabase MCP: `staff_members`, `pos_timesheets`, `pos_staff` table columns — check ALL
6. `cat src/types/staff.ts` — full read
7. `cat src/app/api/staff/invite/resend/route.ts` — understand invite flow

## Features to build — every single one, no stubs

### 1. AI-powered schedule builder
New "Schedule" tab (main focus of the page).
Weekly schedule view: 7 columns (Mon-Sun), rows = staff members.
Each cell = shift block (start time → end time, role).
**AI auto-schedule button**: "Auto-schedule this week"
Logic:
- Pull last 4 weeks of `pos_sales` grouped by day + hour
- Identify peak hours per day (when revenue is highest)
- Calculate staff needed: revenue / $150 average revenue per staff hour (configurable)
- Generate schedule: more staff on busy days/hours, fewer on slow
- Show generated schedule for review before saving
- Owner can drag to adjust (visual only — no drag-and-drop library needed, use click-to-edit)
Store shifts in `staff_shifts` table:
```sql
CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  staff_id uuid,
  shift_date date,
  start_time time,
  end_time time,
  role text,
  is_confirmed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);
```

### 2. Demand forecasting
Below the schedule: "Next week forecast"
Bar chart (recharts): predicted revenue per day next week.
Based on: same day last 4 weeks average + day of week pattern from `pos_sales`.
Overlay: recommended staff count per day as a line.
"Tuesday looks busy — recommend 3 staff. Monday is slow — 1 staff sufficient."
This drives the AI auto-scheduler.

### 3. Labour cost vs revenue ratio
Header metrics strip:
- Labour cost this week: sum of (hours worked × hourly rate) from timesheets
- Revenue this week: from `pos_sales`
- Labour ratio: labour / revenue × 100% (industry benchmark: 25-35% for retail)
- Color: green <30%, amber 30-40%, red >40%
Store `hourly_rate` on staff: `ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS hourly_rate numeric DEFAULT 25`
If `staff_members` table doesn't exist, check `pos_staff` — use whichever exists.

### 4. Timesheet management
"Timesheets" tab.
Table: staff name | date | clock in | clock out | hours | rate | cost | status (pending/approved)
Manager "Approve" button per row.
Bulk approve: select all → approve.
Export to CSV: for payroll.
Weekly total per staff member at bottom.
Pull from existing `pos_timesheets` table (already has data).
Show scheduled vs actual hours side by side.

### 5. Leave management
"Leave" tab.
Staff can request leave (from POS mobile or manager enters manually).
Request fields: staff name | from date | to date | type (annual/sick/personal) | notes.
Manager approves/declines.
Shows on schedule as blocked out days.
Store in `staff_leave` table:
```sql
CREATE TABLE IF NOT EXISTS staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  staff_id uuid,
  staff_name text,
  leave_type text CHECK (leave_type IN ('annual','sick','personal','unpaid')),
  from_date date,
  to_date date,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  created_at timestamptz DEFAULT now()
);
```

### 6. Staff performance analytics
"Performance" tab (existing functionality upgraded).
Per staff member:
- Sales processed (from `pos_sales.served_by` — this is text field with staff name)
- Revenue attributed
- Average transaction value
- Hours worked
- Revenue per hour worked
Ranked leaderboard: most revenue per hour at top.
Trend: this month vs last month.

### 7. Who's on shift right now (live widget)
Top of page: horizontal strip showing currently clocked-in staff.
Poll `/api/pos/timesheets?status=active` every 2 minutes.
Show: staff avatar (initials in coloured circle) + name + "on shift X hrs Y mins"
Empty state: "No staff currently clocked in"

## DB migrations (run via Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  staff_id uuid,
  staff_name text,
  shift_date date,
  start_time time,
  end_time time,
  role text DEFAULT 'staff',
  is_confirmed boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  staff_id uuid,
  staff_name text,
  leave_type text,
  from_date date,
  to_date date,
  notes text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
```
Check if `hourly_rate` exists on staff table — add if missing.

## Routes to build
- `src/app/api/pos/staff-shifts/route.ts` — GET/POST/PUT/DELETE shifts
- `src/app/api/pos/staff-leave/route.ts` — GET/POST/PATCH leave requests
- `src/app/api/aria/staff-schedule/route.ts` — AI auto-schedule generator

## Page structure
5 tabs: **Schedule** | **Timesheets** | **Performance** | **Leave** | **Team**
"Team" tab = existing staff list/invite functionality (move existing code here).
"Schedule" tab = new, AI-powered weekly schedule.

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build staff-shifts route
4. Build staff-leave route
5. Build staff-schedule AI route
6. Rewrite `src/app/dashboard/staff/page.tsx` with 5 tabs
7. `npx tsc --noEmit` — fix ALL TS errors, zero tolerance
8. `npm run build` — must pass clean
9. `git add -A && git commit -m "feat: staff — Deputy-level AI scheduler, demand forecast, labour cost ratio, timesheets, leave management, performance analytics" && git push`

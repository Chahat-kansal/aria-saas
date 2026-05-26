# Prompt 52 — Shift Reports Pro Upgrade

## Category leader bar
Deputy: scheduled vs actual hours comparison, labour cost vs revenue, shift feedback/pulse, compliance reports, payroll export.
Tanda: shift cost forecast, award interpretation, overtime alerts, custom report builder.
Aria must match 80% + AI differentiation.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/shift-reports/page.tsx` — full read (6KB — very thin)
2. `cat src/app/api/pos/shift-reports/route.ts` — full read (6KB)
3. Check DB: `pos_shift_reports` table columns via Supabase MCP
4. Check: `pos_timesheets` table columns
5. Check: `pos_sales` has `served_by` text column (staff name)

## AI differentiation
- "Your Tuesday shifts are overstaffed — average labour cost 42% of revenue vs 28% on other days"
- Overtime prediction: "Sarah is on track to hit overtime this week — 2 hours away"
- Shift efficiency score: revenue per staff hour per shift

## Features to build

### 1. Full shift report view (redesign from 6KB)
Current state: just a list of reports. Full redesign needed.
Each shift report shows:
- Date, shift time (open → close)
- Staff who worked (from timesheets)
- Scheduled hours vs actual hours (from timesheets)
- Labour cost: hours × hourly rate
- Revenue during shift (from pos_sales in same time window)
- Labour/revenue ratio %
- Transaction count, average ticket
- Voids + refunds during shift
- Cash variance (expected vs actual from session)

### 2. Labour vs revenue chart
recharts ComposedChart: bars = revenue per shift, line = labour cost.
Filter: last 7 shifts / 14 / 30.
Show: best and worst labour efficiency shifts highlighted.

### 3. Staff hours summary
Per staff member across all shifts in period:
- Total hours, total pay, revenue attributed (pos_sales where served_by = staff name)
- Revenue per hour worked (efficiency metric)
- Overtime flag: if >38hrs/week (Australian Fair Work standard)
Export to CSV for payroll.

### 4. AI shift analysis
After viewing a shift: "Aria analysis" card.
Claude Haiku: given shift data → identify: overstaffed periods, revenue peaks with no extra staff, efficiency opportunities.
"Your 2pm-4pm window had 3 staff but only $120 revenue. Consider reducing to 1 staff in this window."
Log to `aria_ai_calls`.

### 5. Shift comparison
Select 2 shifts → compare side by side:
Labour %, revenue, transaction count, average ticket, top product.
"Shift A was 23% more efficient than Shift B"

### 6. Payroll export
Export timesheets for selected period → CSV with: staff name, hours, rate, total pay.
STP-ready format (Single Touch Payroll — Australian standard).

## Design
- Full dark theme matching dashboard
- Each shift card: expandable → shows full breakdown
- Labour ratio: colour-coded gauge (green<30%, amber 30-40%, red>40%)
- Charts: Financial Trust palette

## Execution
1. Read ALL pre-edit files fully
2. Full rewrite of `src/app/dashboard/shift-reports/page.tsx` (currently only 6KB — needs complete build)
3. Enhance `src/app/api/pos/shift-reports/route.ts` to return full data
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: shift-reports — Deputy-level labour vs revenue, staff hours, AI analysis, shift comparison, payroll export" && git push`

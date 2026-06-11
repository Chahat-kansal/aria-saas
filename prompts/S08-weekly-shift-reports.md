# S08 — Weekly & Shift Reports
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/13, 14, 15, 52, 53
Missing: scheduled PDF email delivery, labour cost drill-down by staff member

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%report%`, `%timesheet%`, `%roster%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL.
Tables: pos_timesheets, staff_members, pos_sales, pos_sale_items, businesses

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pos_timesheets'
ORDER BY ordinal_position;
-- Confirm: hours_worked (NOT total_minutes), staff_member_id, total_pay_cents
```

Fill in results here.

## Gap closure scope

### Gap 1 — Scheduled PDF email delivery
Cron `api/cron/weekly-report` already exists (0 22 * * 0).
Gap: it only generates data but does NOT email the PDF.
Fix:
- After generating the report, call existing PDF generation (check if /api/pos/shift-reports/[id]/pdf or similar exists)
- Send via Resend to business.owner_email (use businesses.email)
- Use businesses.weekly_report_email (boolean) — only send if enabled
- Use businesses.weekly_report_enabled — gate the cron call
Both columns confirmed in AUDIT_STATE.md.

### Gap 2 — Labour cost drill-down
In /dashboard/shift-reports or /dashboard/staff:
- Card: "Labour cost this week" with breakdown by employee
- Data: pos_timesheets JOIN staff_members (first_name + last_name, NOT name column)
  hours_worked, total_pay_cents per staff member, sorted by cost desc
- Computed: labour_pct = total_labour / total_revenue * 100
- Aria card: if labour_pct > 30% → show warning badge

## Aria Intelligence Rule
- Labour cost > 30% → upsertAriaAction category='staff', priority='high'
- Log weekly report AI calls to aria_ai_calls
- Feed weekly labour summary into aria_daily_briefings on Monday morning

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] weekly_report_enabled = true on test business → cron fires → email received with PDF attached
- [ ] /dashboard/shift-reports shows labour cost breakdown per staff member
- [ ] Labour % displayed correctly (no NaN — confirm Number() wrapping on total_pay_cents / total_amount)
- [ ] pos_timesheets uses hours_worked column (not total_minutes) — confirm in data

## Push
SOLO mode — stop before push. Write reports/sprint-S08-report.md.

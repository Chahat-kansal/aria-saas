# S34 — Weekly Reports Databox-level
STATUS: DONE ✅ batch-2026-06-11 | MODE: BATCH
Covers: prompts/53
Missing: custom KPI builder (let founder choose which metrics appear on weekly report), scheduled delivery

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_sales, pos_timesheets, pos_customers, businesses (weekly_report_enabled, weekly_report_email)
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Custom KPI builder
- /settings/reports → drag-and-drop KPI picker
- Available metrics: revenue, transactions, avg_order_value, labour_cost_pct, customer_count, new_customers, top_product, low_stock_count
- Store selection as JSON in businesses table (add `weekly_report_kpis` jsonb column if not present)
- Weekly report PDF renders only the selected KPIs

### Gap 2 — Scheduled delivery (already in S08, confirm it works here too)
- weekly-report cron: already fires 0 22 * * 0
- Confirm it uses businesses.weekly_report_enabled gate
- Confirm email is sent to businesses.email (or owner email)

## Aria Intelligence Rule
- No new AI calls
- Feed weekly report KPIs into aria_daily_briefings Monday morning summary

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] /settings/reports → KPI builder visible; selecting metrics saves to businesses table
- [ ] Weekly report PDF reflects only selected KPIs
- [ ] Weekly report email arrives on Monday (or manually trigger and confirm)

## Push
BATCH mode — all changes are UI-only. Push immediately after build gate passes.

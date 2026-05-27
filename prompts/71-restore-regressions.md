# Prompt 71 — Restore 3 Regressed Features

## Why
The regression audit (REGRESSION_AUDIT.md) found 3 features lost during pro-upgrade rewrites.
All 3 are small. Restore them — and make each one genuinely pro, not just re-added.

## Pre-edit checklist
Read each target page fully before editing. Read the supporting lib if mentioned.

## Restore 1 — Intelligence "Clear all" bulk dismiss
File: src/app/dashboard/intelligence/page.tsx
The old version had an acknowledgeAll / "Clear all" button that bulk-dismissed all alerts.
Restore it:
- Add a "Clear all" button in the intelligence page header
- On click: PATCH each open alert to acknowledged (loop, or a bulk endpoint if one exists)
- Show a confirm step ("Dismiss all N alerts?") before running
- After: refresh the list, show a toast "All alerts cleared"
- Disable the button while running

## Restore 2 — Customers RFM column
File: src/app/dashboard/customers/page.tsx
The RFM (Recency, Frequency, Monetary) column + RfmBadge were lost. The calc lib still exists at @/lib/rfm.
Restore it:
- Import calcRFM from @/lib/rfm
- Add an "RFM" column to the customers table
- For each customer, compute their RFM score and show a coloured RfmBadge
  (Champions green, Loyal teal, At Risk amber, Lost red, etc.)
- Make the column sortable by RFM segment
- If RfmBadge component was deleted, recreate it — small coloured pill with segment name

## Restore 3 — Staff ClockWidget
File: src/app/dashboard/staff/page.tsx
The dashboard clock in/out widget was lost. POS terminal clock-in still works, but solo
operators who don't open the POS terminal need a dashboard way to clock in/out.
Restore it:
- Add a ClockWidget to the staff page — shows current clock status for the logged-in user
- "Clock in" / "Clock out" button → writes to pos_timesheets
- Shows today's hours worked so far
- If ClockWidget component was deleted, recreate it cleanly

## Rules
- Read each file fully before editing
- str_replace / additive — do not break the existing pages
- These are restorations — match the current page's design (Financial Trust palette)
- npx tsc --noEmit — zero errors
- npm run build — must pass
- Single commit: "fix: restore 3 regressed features — intelligence clear-all, customers RFM column, staff clock widget"

# Sprint S08 — Weekly & Shift Reports (Gap Closure)
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS (EXIT:0)

---

## Goal
Close gaps identified in `prompts/S08-weekly-shift-reports.md`:
1. Wire weekly report PDF generation + email to cron
2. Labour cost drill-down card in shift-reports dashboard

---

## Gap 1 — Weekly PDF report email ✅ (already closed, documented)

Pre-flight reading of `src/lib/reports/weekly-cron.ts` confirmed this gap was fully implemented before S08 sprint ran:
- `runWeeklyReport` calls `generateWeeklyPDF` → `sendWeeklyReportEmail` → `saveWeeklyReportRecord`
- Email sent via Resend with PDF attachment (base64), branded HTML template
- Fallback chain: `weekly_report_email → business.email → auth.user.email`
- Gated on `weekly_report_enabled = true` or null (opt-out semantics)
- `src/app/api/cron/weekly-report/route.ts` already calls `runWeeklyReport` per business

**No code changes needed.** Gap 1 is closed.

---

## Gap 2 — Labour cost drill-down card in shift-reports dashboard ✅

### New API: `GET /api/pos/shift-reports/labour-this-week`

**`src/app/api/pos/shift-reports/labour-this-week/route.ts`**

Three parallel queries (via `supabaseAdmin` to bypass RLS):
- `pos_timesheets` — `hours_worked`, `total_pay_cents`, `pay_rate_cents`, `staff_member_id`, `staff_name` for `clock_in >= since`
- `staff_members` — `id`, `first_name`, `last_name` for name resolution
- `pos_sales` — `total_amount` (non-voided) for revenue denominator

Name resolution strategy:
1. Prefer `staff_member_id` → look up `first_name + last_name` in `staff_members`
2. Fall back to `pos_timesheets.staff_name` if `staff_member_id` is null

Pay computation: `total_pay_cents` if set, else `pay_rate_cents × hours_worked`

Returns:
```json
{
  "total_labour_dollars": 1240.50,
  "total_revenue": 5800.00,
  "labour_pct": 21.4,
  "by_staff": [
    { "name": "Sarah Chen", "hours": 38.5, "pay_dollars": 654.50 },
    { "name": "Jake Moreno", "hours": 32.0, "pay_dollars": 586.00 }
  ],
  "days": 7
}
```

Supports `?days=N` query param (max 90, default 7).

Aria Intelligence: if `labour_pct > 30%` AND `total_revenue >= A$100`, calls `upsertAriaAction` with:
- `category: 'staff'`, `priority: 'high'`
- Title: `"Labour cost is X.X% of revenue this week"`
- `source: 'labour_this_week'`, deduped via `upsertAriaAction`

### UI: Labour cost card in `shift-reports/page.tsx`

**`src/app/dashboard/shift-reports/page.tsx`**

Added above the chart/tabs section, always visible:

- Three stat boxes: **Labour cost (A$, amber)** | **Revenue (A$, green)** | **Labour % (color-coded)**
  - Labour % colours: green ≤ 20%, amber 20–30%, red > 30%
- Warning badge `⚠ High >30%` shown when labour_pct > 30% (red border on card too)
- Per-staff breakdown table sorted by pay_dollars DESC:
  - Columns: Staff member | Hours | Pay (A$) | % of labour
- Skeleton loading state (3 pulse bars) while fetching
- Empty state message if no data
- Fetches on mount from `/api/pos/shift-reports/labour-this-week`

### Weekly labour section in Monday morning briefings

**`src/app/api/cron/generate-briefings/route.ts`**

On Mondays only (`getUTCDay() === 1` of `today + 'T12:00:00Z'`), runs 2 extra parallel queries:
- `pos_timesheets` last 7 days → weekly labour cost
- `pos_sales` last 7 days → weekly revenue

Builds `weeklyLabourSection` string:
```
WEEKLY LABOUR REVIEW (last 7 days): Labour cost A$1240.50, Revenue A$5800.00 (21.4% of revenue — within benchmark).
```

Benchmark messaging:
- > 30%: `⚠ above 30% benchmark`
- < 20%: `well within benchmark`
- 20–30%: `within benchmark`

Inserted into `structuredPrefix` between `recentWinsSection` and `weatherSection` — becomes part of the Monday `aria_daily_briefings` upsert.

---

## Schema changes
None — all queries use existing tables and columns per RULE 6.

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/pos/shift-reports/labour-this-week/route.ts` | New — GET labour cost this week |
| `src/app/dashboard/shift-reports/page.tsx` | Add LabourWeek interface + state + fetch + card JSX |
| `src/app/api/cron/generate-briefings/route.ts` | Add Monday weekly labour section to structuredPrefix |
| `reports/sprint-S08-report.md` | This file |

---

## Column correctness (per RULE 6)
- `pos_timesheets.hours_worked` ✅ (not `total_minutes`)
- `pos_timesheets.total_pay_cents` ✅
- `pos_timesheets.clock_in` ✅ (not `start_time`)
- `staff_members.first_name + last_name` ✅ (not `name`)
- `pos_sales.total_amount` ✅ (not `total`)
- `pos_sales` filter: `status != 'voided'` ✅
- `supabaseAdmin` for all server-side reads ✅
- Ownership check (`getBid`) on every route ✅

---

## Aria Intelligence integration
- `upsertAriaAction` fired when labour > 30% (category: staff, priority: high)
- Monday briefings include weekly labour cost % with benchmark messaging
- All data flows through Aria Intelligence layer per RULE 8

---

## Founder verify checklist (5 min max)

- [ ] Open `/dashboard/shift-reports` → "Labour cost this week" card shows (even if zero)
- [ ] Card shows 3 stat boxes: labour cost, revenue, labour %
- [ ] Per-staff table renders rows sorted by pay DESC
- [ ] If labour_pct > 30% → warning badge and red border on card
- [ ] Check Supabase `aria_actions` → pending row for labour alert (if over threshold)
- [ ] On a Monday: check `aria_daily_briefings` content → contains "WEEKLY LABOUR REVIEW"

---

## Push instruction
```
git push origin main
git log origin/main..HEAD   # must be empty
```

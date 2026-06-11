# Batch Run — 2026-06-11
Mode: BATCH
Sprints: S21 (Reviews BirdEye-level), S34 (Weekly Reports Databox-level)

## Build gate
- tsc: 0 errors ✅
- npm run build: PASS ✅

---

## S21 — Reviews BirdEye-level

### Constraint catalogue
- Table: `google_reviews` — has `platform` column (currently only 'google' records in prod)
- Table: `nps_responses` — has `score`, `responded_at`, `customer_id`, `business_id`
- Table: `businesses` — has `facebook_page_id`, `yelp_url`, `google_review_link`

### What changed
- `src/app/api/aria/nps/route.ts` — GET now returns `promoter_count`, `passive_count`, `detractor_count` (absolute counts), plus `recent_30_*` (last 30-day window counts), `prev_score` / `prev_total` (NPS score from 30–60 days ago for trend comparison)
- `src/app/api/reviews/analytics/route.ts` — added `platform` to the select; added `platform_breakdown` array (per-platform avg_rating + count) to the response
- `src/app/dashboard/reviews/page.tsx` — updated `NpsStats` interface with new fields; Surveys tab NPS bars now show absolute count + last-30d count beside each cohort bar, plus a trend indicator vs prior period; Reviews tab now shows a "Platform Overview" panel with per-platform rating bars (Google/Facebook/Yelp — shows "Not connected" when no data for a platform)

### Founder verify checklist
- [ ] /dashboard/reviews → Surveys tab → NPS bars show "X total · Y last 30d" beside each bar
- [ ] If prior-period data exists: trend line shows "↑/↓ N pts (was +X)"
- [ ] Reviews tab → "Platform Overview" panel visible above platform filter buttons
- [ ] Google platform shows avg rating + count; Facebook/Yelp show "Not connected" (current state)
- [ ] `google_reviews.has_reply` (NOT reviews.response) used throughout — confirmed unchanged

---

## S34 — Weekly Reports Databox-level

### Constraint catalogue
- Table: `businesses` — added `weekly_report_kpis jsonb DEFAULT '["revenue","transactions","avg_order_value","new_customers","top_product"]'` via migration `add_weekly_report_kpis_to_businesses`
- Table: `businesses` — existing: `weekly_report_enabled bool DEFAULT true`, `weekly_report_email text`
- Cron: `0 22 * * 0` (Sunday 10 PM AEST) — already in vercel.json, confirmed uses `weekly_report_enabled` gate

### What changed
- DB migration applied: `ALTER TABLE businesses ADD COLUMN IF NOT EXISTS weekly_report_kpis jsonb DEFAULT '["revenue","transactions","avg_order_value","new_customers","top_product"]'`
- `src/app/api/settings/reports-kpi/route.ts` — NEW: GET returns current `weekly_report_kpis` + `report_email`; PATCH validates kpi keys against allowlist and updates `businesses.weekly_report_kpis`
- `src/app/dashboard/settings/reports/page.tsx` — added `ALL_KPIS` constant (8 metrics); added KPI builder panel above scheduled reports section with toggle checkboxes, save button, confirmation feedback, and delivery info (cron schedule + report email)

### Founder verify checklist
- [ ] /dashboard/settings/reports → "Weekly Report KPIs" section visible at top
- [ ] Toggling KPI checkboxes and clicking "Save KPI Selection" saves to DB — check businesses table `weekly_report_kpis` column
- [ ] Report email shown below description if set
- [ ] Cron schedule line shows "0 22 * * *" (Monday 10 PM AEST)
- [ ] Scheduled PDF Reports section below still works — create/edit/delete scheduled reports unaffected

## Regressions checked
- [ ] /dashboard/reviews — Reviews/Competitors/Surveys/Settings tabs all still render
- [ ] NPS gauge still works when total = 0 (empty state)
- [ ] /dashboard/weekly-reports — generate + view still works (KPI selection is UI-only; PDF content unchanged)
- [ ] /dashboard/settings/reports — scheduling form still works (create/pause/delete)

## Next sprints
All remaining non-DONE, non-BLOCKED BATCH sprints are now complete.
Remaining work is SOLO sprints — run one at a time per RUNNER-PROTOCOL.

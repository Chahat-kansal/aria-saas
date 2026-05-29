# Prompt 107 — Promotions + Price Lists (Full Feature)

Routes exist but UI is partial. Build to category-leading standard vs Square/Lightspeed.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read ALL existing files under src/app/api/pos/promotions/, src/app/api/pos/price-lists/, src/app/api/pos/timed-prices/, src/app/api/pos/scheduled-price-changes/ before writing anything.

## TASK 1 — Promotions engine audit + completion
Read the promotions route. Ensure it supports:
- discount_type: 'percent' | 'fixed' | 'bogo' | 'multibuy'
- applies_to: 'all' | 'category' | 'product' | 'customer_group'
- conditions: min_spend, min_qty, customer_segment
- Schedule: start_at, end_at (active only within window)
- Stackable: boolean (can stack with other promos?)
- Usage limit: max_uses, uses_count
If any of those fields are missing from the route logic: add them.
Commit: "feat(promotions): full promo engine — BOGO, multibuy, scheduled, usage limits"

## TASK 2 — Price lists
Price lists allow different prices for different customer groups (e.g. wholesale vs retail).
Ensure src/app/api/pos/price-lists/ supports:
- Create price list: { name, customer_group_ids[], description }
- Add product to price list: { product_id, override_price }
- POS checkout: if customer has a group, apply their price list automatically
- Export price list as CSV
Commit: "feat(price-lists): customer group price lists with POS auto-apply"

## TASK 3 — Scheduled price changes
Review src/app/api/pos/scheduled-price-changes/.
A scheduled price change sets a product price at a future date (e.g. price increase on Jan 1).
Ensure:
- POST: { product_id, new_price, effective_at, reason }
- Cron applies pending changes: merge into existing daily cron
- Owner gets a daily briefing mention when a scheduled change fires today
Commit: "feat(scheduled-prices): auto-apply scheduled price changes via cron"

## TASK 4 — Timed pricing
Review src/app/api/pos/timed-prices/.
Timed prices apply during specific hours (e.g. happy hour 4-6pm, 20% off cocktails).
Ensure:
- POST: { product_id or category_id, discount_pct, start_time (HH:MM), end_time, days_of_week[] }
- POS checkout applies timed price if current time falls in window
- Dashboard shows active timed prices now
Commit: "feat(timed-prices): time-of-day pricing with day-of-week control"

## TASK 5 — Dashboard UI
Create/complete src/app/dashboard/promotions/page.tsx:
Tabs: Promotions | Price Lists | Scheduled Changes | Timed Pricing

Promotions tab:
- Active promos table: name | type | discount | applies to | uses | end date | status badge
- Create promo modal: full form matching all promo types
- "Pause" / "End now" actions

Price Lists tab:
- List price lists with customer group assignments
- Click → show product override table, edit prices inline

Scheduled Changes tab:
- Timeline view: upcoming changes sorted by date
- "Cancel" button per change

Timed Pricing tab:
- Weekly grid showing which hours have active pricing rules
- Create/edit/delete timed price rules
Commit: "feat(promotions/dashboard): full promotions UI — 4 tabs, all promo types"

## Rules
- All prices in dollars (numeric)
- npx tsc --noEmit + npm run build before each commit
- Do not add new cron entries — merge into existing daily cron

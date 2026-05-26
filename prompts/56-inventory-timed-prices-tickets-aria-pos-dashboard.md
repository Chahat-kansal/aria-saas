# Prompt 56 — Inventory, Timed Prices, Price Tickets, Aria Dashboard, POS Dashboard — Full Build from Scratch

## Why these are all empty/stub
These pages are 0-2KB stubs. They need building from scratch. Each is a core feature.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/inventory/page.tsx` — read (2KB stub)
2. `cat src/app/dashboard/timed-prices/page.tsx` — read (1KB stub)
3. `cat src/app/dashboard/price-tickets/page.tsx` — read (1KB stub)
4. `cat src/app/dashboard/aria/page.tsx` — read (0KB)
5. `cat src/app/dashboard/pos/page.tsx` — read (0KB)
6. `cat src/app/api/pos/inventory/route.ts` — full read
7. `cat src/app/api/pos/scheduled-price-changes/route.ts` — check if exists
8. `cat src/app/api/pos/price-tickets/route.ts` — full read
9. Check DB via Supabase MCP: `pos_products`, `pos_inventory`, `scheduled_price_changes` tables

---

## INVENTORY (vs Cin7/DEAR — multi-location stock management)

### Build full inventory management page
Category leader Cin7 features: multi-location tracking, batch/serial numbers, stock adjustments, transfer between locations, stock valuation, reorder points, expiry tracking.

Sections:
1. **Stock overview** — all products with current stock, value (stock × cost), low stock alerts
2. **Stock movements** — history of all stock changes (sales, adjustments, transfers, received orders)
3. **Stock adjustment** — manual adjustment form: product + qty change + reason (damaged/found/counted)
4. **Stocktake integration** — link to `/pos/stocktake` page
5. **Valuation** — total inventory value (stock × cost price per product), by category
6. **Expiry tracking** — products with expiry dates approaching (pull from `pos_products.expiry_date` if exists)

Metrics strip:
- Total SKUs tracked
- Total inventory value ($)
- Items below reorder point
- Dead stock (0 sales in 90 days, >0 stock)

AI analysis: "Your inventory value is $34,200. Dead stock accounts for $2,100 (6.1%). Consider running a clearance promotion."
Log to `aria_ai_calls`.

---

## TIMED PRICES (vs Lightspeed happy hour pricing)

### Build timed price scheduling page
Feature: set automatic price changes for specific times/days.
Use cases: happy hour (liquor store 5-6pm), lunch specials (cafe 11am-2pm), weekend pricing.

Form: product search → select product → set price → set schedule (days + time range).
Store in `scheduled_price_changes` table (check if exists, create if not):
```sql
CREATE TABLE IF NOT EXISTS scheduled_price_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  product_id uuid REFERENCES pos_products(id),
  product_name text,
  original_price numeric,
  timed_price numeric,
  days_of_week integer[], -- 0=Sun, 1=Mon ... 6=Sat
  start_time time,
  end_time time,
  label text, -- "Happy Hour", "Lunch Special"
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```
Show active schedules as cards: product name + price + schedule + "Active now" badge if currently in effect.
Cron: every 15 minutes checks for active timed prices and updates product prices in `pos_products`.

---

## PRICE TICKETS (vs Lightspeed/Square shelf label printing)

### Build price ticket generator
Owners need to print shelf price labels for their store.
Select products → configure ticket format → print.

Ticket formats:
- Small: 50×30mm — product name + price + barcode
- Large: 100×60mm — product name + description + price + barcode
- A4 sheet: 24 tickets per page (standard Avery label sheet)

Features:
- Search/select products from catalogue
- Preview ticket before printing
- Bulk select: all products in category
- Print → generates printable HTML page → browser print dialog
- Custom: add promotional text ("SALE", "NEW", "SPECIAL")

No external library needed — generate SVG/HTML labels, open in new tab for print.

---

## ARIA DASHBOARD PAGE
This is `/dashboard/aria` — the Aria intelligence overview page.

Build a dedicated "Aria OS Status" page showing:
1. **Aria brain status** — all active AI features and their last run time
   - Daily briefing: last generated X hours ago ✅
   - Intelligence signals: X active signals ✅
   - Competitor monitoring: last checked X ✅
   - Customer scoring: last run X ✅
2. **AI usage this month** — pull from `aria_ai_calls`: total calls, cost estimate, breakdown by feature
3. **Autopilot actions** — pull from `aria_autopilot_actions`: what Aria has done automatically this week
4. **Memory** — pull from `aria_business_memory`: show what Aria knows about the business
5. **Tune Aria** — sliders/toggles for AI aggressiveness: Conservative / Balanced / Aggressive
6. **AI call log** — searchable table of all AI calls with: feature, model, tokens, timestamp

---

## POS DASHBOARD PAGE
This is `/dashboard/pos` — overview of POS system health.

Build a POS health dashboard showing:
1. **Today's POS stats** — revenue, transactions, average ticket (live from pos_sales)
2. **Active session** — is there an open session? Who opened it? What's the current float?
3. **Staff on till** — who's currently logged into POS
4. **Recent sales** — last 10 transactions with time + amount + payment method
5. **Quick links** — Open till, View reports, Stocktake, Suppliers, Price tickets
6. **POS health** — all POS API routes status (green/red checks)
7. **Hardware** — receipt printer connected? Cash drawer? Barcode scanner?

## Execution
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build all 5 pages — no stubs, no TODOs
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: inventory+timed-prices+price-tickets+aria-dashboard+pos-dashboard — full builds from scratch" && git push`

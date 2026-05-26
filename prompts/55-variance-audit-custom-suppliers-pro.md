# Prompt 55 — Variance, Audit Checks, Custom Features, Suppliers Pro Upgrade

## Why 4 in one prompt
These 4 pages are each 9-14KB — meaningful but not full builds. Each needs targeted upgrades, not full rewrites.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/variance/page.tsx` — full (12KB)
2. `cat src/app/dashboard/audit-checks/page.tsx` — full (11KB)
3. `cat src/app/dashboard/custom-features/page.tsx` — full (12KB)
4. `cat src/app/dashboard/suppliers/page.tsx` — full (14KB)
5. Check DB via Supabase MCP: `variance_items`, `shift_audits`, `audit_templates`, `business_features`, `pos_suppliers` tables — ALL columns
6. `cat src/app/api/pos/suppliers/route.ts` — full read

---

## VARIANCE upgrades (vs Lightspeed/Vend variance reporting)

### Add: Trend chart
recharts LineChart showing total variance amount per week for last 8 weeks.
"Your variance is trending up 34% — Aria recommends investigating."

### Add: Theft detection AI
When variance > 2% of revenue for same time period 3 weeks running:
Claude Haiku: given variance patterns, staff schedules, time-of-day — identify most likely cause.
"Aria detects a pattern: variance spikes occur during Tuesday afternoon shifts when staff member [X] is rostered. Recommend review."
Log to `aria_ai_calls`.
Show as "⚠️ Aria alert" card on variance page.

### Add: Category breakdown
Variance by product category: Spirits | Wine | Beer | Tobacco etc.
Shows which categories drive most shrinkage.
Bar chart: recharts BarChart.

---

## AUDIT CHECKS upgrades (vs SafetyCulture/iAuditor)

### Add: Audit score per check
Each audit gets a score: checks completed / total checks × 100%.
Show score as % with color coding: green>90%, amber 70-90%, red<70%.
Trend: audit scores over last 30 days.

### Add: Photo evidence upload
Each checklist item gets a "📷 Add photo" button.
Upload photo → stored in Vercel Blob → URL saved on audit item.
Photos show as thumbnails on completed audit.
Key for compliance — visual proof of completion.

### Add: Failed items action plan
When audit item marked "failed": mandatory "corrective action" text field.
"What will you do to fix this?" required before saving.
Track: unresolved failed items across audits.
Show: "3 recurring failures across last 5 audits — [item name]"

---

## CUSTOM FEATURES upgrades

### Add: Feature request status tracking
Currently: just a request form. Add full lifecycle:
Status: submitted → under review → in development → shipped → declined.
Owner sees their requests with status badges.
"You submitted 3 requests. 1 is in development, 2 are under review."
Admin (you) can update status from Supabase directly.

### Add: Upvote system
Show all submitted feature requests (anonymised).
Other customers can upvote.
Sort by upvotes → most popular at top.
This gives you real product feedback from all customers.
Store `upvotes` integer on `business_features`.

### Add: Feature roadmap view
Public roadmap tab: Now | Next | Later.
You populate this manually in Supabase.
Shows customers what's coming — builds confidence.
Store roadmap items in `feature_roadmap` table.

---

## SUPPLIERS upgrades (vs TradeGecko/Cin7 supplier management)

### Add: Supplier scorecard
For each supplier: on-time delivery rate %, average lead time (days), order accuracy %.
Calculate from `pos_purchase_orders`: ordered vs received dates + quantities.
Show supplier ranking: best → worst performer.

### Add: Price comparison table
For products you buy from multiple suppliers: show price per unit side by side.
"Coopers Pale Ale: ALM $2.10/unit | ILG $2.05/unit | Direct $1.98/unit → Save $0.12 by going direct"
AI recommendation: "Switch 3 products to cheaper supplier — saves est. $340/month"
Log to `aria_ai_calls`.

### Add: AI reorder suggestions
Smart reorder button per supplier.
Claude Haiku: given this supplier's products, current stock levels, sales velocity, lead time → generate draft purchase order.
Shows: product, current stock, suggested order qty, estimated cost.
One click → creates purchase order.
Log to `aria_ai_calls`.

### Add: Order history per supplier
Click supplier → see all past orders with: date, items, total cost, delivery status.
Total spend per supplier this month + this year.

## DB migrations
```sql
ALTER TABLE business_features ADD COLUMN IF NOT EXISTS upvotes integer DEFAULT 0;
ALTER TABLE business_features ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted';
CREATE TABLE IF NOT EXISTS feature_roadmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text, description text, status text CHECK (status IN ('now','next','later')),
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid, item_id uuid, photo_url text, uploaded_at timestamptz DEFAULT now()
);
```

## Execution
1. Run DB migrations via Supabase MCP
2. Read ALL 4 page files + their API routes
3. Build upgrades for all 4 pages — additive only
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: variance+audit+custom+suppliers — trend charts, theft detection AI, photo evidence, feature roadmap, supplier scorecards, AI reorder" && git push`

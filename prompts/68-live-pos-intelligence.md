# Prompt 68 — Live POS Intelligence: 10 Real-Time AI Features

## Goal
Turn the POS from a passive cash register into a live AI co-pilot.
Aria watches the till in real time and nudges staff while they trade.
10 features. All surface in the terminal as small, non-intrusive cards/badges.

## CRITICAL — token + scope discipline
This is a LARGE prompt. To avoid breaking things:
- Build features ONE AT A TIME, commit-test mentally after each
- Do NOT do a full rewrite of the 267KB terminal — use str_replace, additive only
- Each feature is a small addition — a card, a badge, a check
- If any feature is too complex, build a working stub and note it — never break the build

## Pre-edit checklist (MANDATORY)
1. `grep -n "AriaInlineCard\|POSAriaInsight\|getAriaSuggestions\|cart-intelligence" src/app/pos/(fullscreen)/terminal/page.tsx` — find existing AI hook points
2. `cat src/lib/terminal/aria-suggestions.ts` — existing suggestion logic
3. `cat src/components/terminal/AriaInlineCard.tsx` — existing card component
4. `cat src/app/api/pos/cart-intelligence/route.ts` — existing intelligence route
5. `cat src/app/api/pos/hourly-heatmap/route.ts` — existing heatmap
6. Check DB tables: pos_sales, pos_sale_items, pos_cash_sessions, pos_timesheets, pos_customers, pos_products

## The 10 features

### Feature 1: Live staffing intelligence
New route `/api/pos/live-staffing` — GET
- Compares current hour's revenue vs same hour over last 4 weeks (pos_sales)
- Counts staff currently clocked in (pos_timesheets where clock_out IS NULL)
- If revenue is >40% below average AND staff count > expected: flag overstaffed
- Returns: `{ status: 'overstaffed'|'understaffed'|'ok', message, estimated_saving }`
- Terminal: small amber card in header — "Quiet period — you have 3 staff on, 1 would cover it (~$45/hr saving)"
- Refresh every 30 minutes

### Feature 2: Smart upsell at till
Enhance existing `/api/pos/cart-intelligence`:
- When items are in cart, check pos_sale_items history for what's bought WITH those items
- "Customers who bought [coffee] often add [muffin] — suggest it"
- Terminal: subtle suggestion chip below cart — tap to add
- Use existing AriaInlineCard component

### Feature 3: Theft / variance pattern detection
New route `/api/pos/variance-intelligence` — GET
- Analyses pos_cash_sessions closing variances over last 30 days
- Cross-references which staff (served_by) worked sessions with high variance
- If a pattern: flag it (rules-based, no AI needed — just statistics)
- Surfaces in shift report + manager dashboard, NOT in front-of-house terminal
- Returns flagged patterns with staff name + variance trend

### Feature 4: Real-time slow-period alert
In terminal, track timestamp of last completed sale.
If no sale for 40+ minutes during trading hours:
- Show a card: "Quiet patch — 40 min since last sale. Want to push a flash promo?"
- Button: "Suggest a promo" → calls Haiku for a quick promo idea based on slow-movers
- Only during business hours (check business.opening_hours)

### Feature 5: Basket analysis (what sells with what)
New route `/api/pos/basket-analysis` — GET
- Analyses pos_sale_items: which products appear in the same sale frequently
- Returns top 5 product pairs with co-occurrence %
- Surfaces in product-intelligence dashboard: "Wine + cheese sell together 60% of the time — consider bundling"
- This is a daily computed insight, not real-time

### Feature 6: Live low-stock warning at till
In terminal, when a product is added to cart:
- Check its stock_quantity
- If stock <= 3 after this sale: show inline badge "⚠️ Last 3 units"
- If stock will hit 0: "⚠️ Last one — reorder soon"
- Pulls from product data already loaded — no extra API call

### Feature 7: Win-back trigger at point of sale
When a customer is attached to a sale in terminal:
- Check their last purchase date (pos_sales for that customer_id)
- If last visit > 30 days ago: show card "This customer hasn't visited in 6 weeks — offer them 10% to win them back?"
- Staff can apply the discount with one tap
- Uses customer data already fetched on attach

### Feature 8: Receipt scan auto cost update
Enhance existing receipt scan (Gemini Vision from prompt 59 if built, else note as dependency):
- When supplier invoice is scanned, extract product costs
- Match scanned product names to pos_products (fuzzy match)
- If match found: update product cost_price, recalculate margin
- Show summary: "Updated cost on 8 products — 2 now have margin under 20%, review pricing"

### Feature 9: Void/refund training flags
New route `/api/pos/staff-performance` — GET
- Count voids and refunds per staff member (served_by) over last 30 days
- Calculate average voids per staff
- Flag staff whose void rate is 3x+ above average
- Surfaces in staff dashboard: "[Name] has 3x the average void rate — may need register training"
- Rules-based statistics, no AI needed

### Feature 10: Dynamic pricing suggestions
New route `/api/pos/pricing-intelligence` — GET
- Analyses hourly sales velocity (use existing hourly-heatmap data)
- Identifies consistently quiet windows (e.g. 3-5pm)
- Suggests: "3-5pm is your quietest window. A happy-hour discount could lift revenue."
- Surfaces in pricing/dashboard, NOT auto-applied — suggestion only
- Owner decides whether to act

## Design rules for terminal cards
- All terminal AI cards: small, dismissable, non-blocking
- Never interrupt a sale in progress
- Use existing AriaInlineCard / POSAriaInsight components
- Amber for warnings, green for opportunities, subtle — not flashing
- Staff can dismiss any card — it stays dismissed for that session

## AI usage
- Features 1, 3, 5, 9, 10 — pure statistics, NO AI calls needed (cheap, fast, reliable)
- Features 2, 4, 8 — light Haiku calls only when triggered
- All Haiku calls log to aria_ai_calls
- Never call AI on every render — only on specific triggers

## DB migrations
```sql
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_completed_at timestamptz;
CREATE TABLE IF NOT EXISTS pos_ai_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  nudge_type text,
  message text,
  shown_at timestamptz DEFAULT now(),
  acted_on boolean DEFAULT false
);
```

## Execution order — ONE feature at a time
1. Run DB migrations via Supabase MCP
2. Read all pre-edit files
3. Build features 1, 3, 5, 9, 10 first (statistics-only, no AI, safest)
4. Then features 6, 7 (terminal-side, use existing data)
5. Then features 2, 4, 8 (need Haiku calls)
6. After EACH feature: mental check it doesn't break the build
7. `npx tsc --noEmit` — zero errors
8. `npm run build` — must pass
9. Single commit: "feat: live POS intelligence — 10 real-time AI features wired into terminal"

## If running low on context/limit
If you cannot complete all 10, complete features 1-7 cleanly and STOP.
Note which features remain. Never leave the build broken.
A partial working build is infinitely better than a complete broken one.

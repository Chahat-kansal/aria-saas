# Prompt 107 — Promotions + Price Lists: Full Feature to Category-Leading Standard


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Competitor benchmark: Square marketing, Lightspeed promotions, Shopify discounts. Match 80%+.
Routes exist but UI is partial. Read ALL existing files under promotions/price-lists/timed-prices/ before writing. Read CLAUDE.md first.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Promotions engine audit + completion
Read EVERY file under src/app/api/pos/promotions/ and src/app/api/pos/discounts/.
Check the promotions table schema via Supabase list_tables.

Ensure the engine supports ALL of:
- discount_type: 'percent' | 'fixed_amount' | 'bogo' | 'multibuy' | 'free_item'
- applies_to: 'all_products' | 'category' | 'specific_products' | 'customer_segment'
- conditions: min_spend, min_qty, customer_segment[], required_product_ids[]
- schedule: start_at, end_at (only active within window — check current timestamp)
- stackable: boolean (can combine with other active promos)
- usage_limit: max_uses (nullable = unlimited), uses_count (increment on use)
- promo_code: optional code (e.g. "WELCOME10") — POS can accept promo codes

BOGO logic: buy 1 of product A, get 1 of product B free (or same product at 0)
Multibuy logic: buy 3 for price of 2, buy 6 get 10% off

If any field missing from DB: add via apply_migration.
If any logic missing from route: add it.
Apply promos at POS checkout: POST /api/pos/sale should check active promos and apply the best applicable one.
Commit: "feat(promotions): complete promo engine — BOGO, multibuy, codes, stackable, usage limits"

## TASK 2 — Price lists (wholesale/retail/VIP)
Read src/app/api/pos/price-lists/ fully.
Price lists let businesses have different prices for different customer groups.

Ensure:
POST /price-lists: { name, description, customer_group: 'wholesale'|'staff'|'vip'|'custom' }
POST /price-lists/[id]/products: { product_id, override_price }
GET /price-lists/[id]: list with all product overrides
DELETE /price-lists/[id]/products/[product_id]: remove override

POS checkout integration: when a customer is loaded and they have a customer_group, auto-apply their price list.
Add customer_group to pos_customers (apply_migration if missing).
Export price list as CSV (GET /price-lists/[id]/export).
Commit: "feat(price-lists): customer group price lists + POS auto-apply + export"

## TASK 3 — Scheduled price changes
Read src/app/api/pos/scheduled-price-changes/ fully.
Ensure:
POST: { product_id, new_price, effective_at (ISO datetime), reason }
GET: list pending changes, sorted by effective_at
DELETE: cancel a pending change

Daily cron (merge into existing cron — do NOT add a new cron):
- Find scheduled_price_changes where effective_at <= now() AND applied=false
- Update pos_products.price = new_price
- Set applied=true, applied_at=now()
- Add briefing mention: "Price change applied today: {product} {old}→{new}"

Log applied changes to aria_autopilot_actions.
Commit: "feat(scheduled-prices): auto-apply scheduled price changes via cron + briefing alert"

## TASK 4 — Timed pricing (happy hour / time-of-day)
Read src/app/api/pos/timed-prices/ fully.
Ensure:
POST: { name, applies_to: product_id|category_id, discount_pct, start_time (HH:MM), end_time (HH:MM), days_of_week: number[] (0=Sun..6=Sat), active }
GET: list with currently_active flag (check current time against window)

POS integration: at checkout, check if any timed prices are active RIGHT NOW — apply if so.
Dashboard shows: "Happy Hour active now — 20% off cocktails" badge.
Commit: "feat(timed-prices): time-of-day/day-of-week pricing + POS auto-apply + active badge"

## TASK 5 — AI promo suggestions
src/app/api/pos/promotions/suggestions/route.ts:
POST { business_id }: generate AI promo suggestions
- Pull: slow-moving products (low sales last 30d), upcoming public holidays, current promotions
- AI suggests: "Run a 20% off Banana Bread Tuesday — it's your slowest product and Tuesday is your quietest day"
- Return: [{ title, discount_type, discount_value, applies_to, reason, estimated_lift_pct }]
- Model: claude-haiku-4-5-20251001
- Log to aria_ai_calls
Commit: "feat(promotions): AI promo suggestions based on sales patterns + slow movers"

## TASK 6 — Full promotions dashboard
src/app/dashboard/promotions/page.tsx — 5 tabs:

Promotions tab:
- Active promos: name | type | discount | applies_to | uses | end date | status badge
- Create promo modal: all fields including promo code, BOGO target, schedule
- Pause / End now / Duplicate actions
- AI suggestions panel (collapsible)

Price Lists tab:
- List price lists with group label
- Click → product override table, edit prices inline
- Export CSV button

Scheduled Changes tab:
- Timeline (sorted by effective_at): product | current price | new price | date | cancel button
- "Add scheduled change" button

Timed Pricing tab:
- Weekly grid showing which hours have active pricing rules
- Create/edit/delete timed price rules

Promo Codes tab:
- List codes with uses/limit, active status
- Quick "Add code" button

Feed into briefing: active promotions count, promo code usage stats.
Commit: "feat(promotions/dashboard): full 5-tab promotions UI — all promo types covered"

## Rules
- All prices in dollars (numeric)
- npx tsc --noEmit + npm run build before each commit
- Do NOT add new cron entries — merge into existing daily cron
- Migrations via Supabase MCP

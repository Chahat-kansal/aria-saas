# Prompt 104 — Customer Management: Full CRM to Category-Leading Standard


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Competitor benchmark: Klaviyo, Marsello, Lightspeed loyalty. Aria must match 80%+ of core CRM features.
Two customer tables exist: pos_customers (POS/loyalty) + customers (CRM). Read CLAUDE.md first.

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


## CRITICAL: Table schema
pos_customers: id, business_id, name, email, phone, loyalty_points, total_spent, visit_count, last_visit_at, segment, rfm_recency_score, rfm_frequency_score, rfm_monetary_score, deleted_at
customers: id, business_id, name, phone, email, last_visit, visit_count, total_spend, churn_risk, customer_segment, predicted_next_visit, ai_summary, tags, archived

Routes MUST read from both and merge on email/phone. Prefer customers data, supplement with pos_customers.

## TASK 1 — Customer list API (merged)
src/app/api/customers/route.ts — check if exists, read it fully, then update:
GET params: page (default 1), limit (default 50), search, segment, churn_risk, sort_by, sort_dir, tags
- LEFT JOIN pos_customers on (email match OR phone match)
- Merge: take name/email/phone from customers, supplement with loyalty_points/total_spent/visit_count from pos_customers
- Return: id, name, email, phone, total_spend, visit_count, last_visit, segment, churn_risk, loyalty_points, tags, predicted_next_visit, ai_summary
- Total count for pagination

POST { name, email, phone, tags }: create in customers table
Commit: "feat(customers): merged customer list API + pagination + filters"

## TASK 2 — Customer detail + history
src/app/api/customers/[id]/route.ts:
GET: full profile — all fields + last 20 sales from pos_sales (matched by customer_id or email) + loyalty transaction history
PATCH: update name, email, phone, notes, tags (do NOT allow changing total_spend or visit_count directly)
DELETE: set archived=true (never hard delete)

src/app/api/customers/[id]/ai-summary/route.ts:
POST: regenerate AI summary
- Pull: last 30 pos_sales + product names + amounts
- AI generates: "Emma is a loyal customer visiting 2-3x/week. Favourite: Acai Bowl ($18). Average spend $24.50. High churn risk — last visit 38 days ago."
- Update customers.ai_summary + pos_customers summary if exists
- Log to aria_ai_calls
Model: claude-haiku-4-5-20251001
Commit: "feat(customers): detail API + sales history + AI summary generation"

## TASK 3 — RFM scoring engine
src/app/api/customers/segment/route.ts:
POST { business_id? }: run RFM scoring for all business customers
Algorithm:
- Recency score (1-5): days since last_visit — <7d=5, 7-30d=4, 30-60d=3, 60-90d=2, >90d=1
- Frequency score (1-5): visit_count — <2=1, 2-5=2, 5-10=3, 10-20=4, >20=5
- Monetary score (1-5): total_spend — bottom 20%=1 ... top 20%=5 (use percentile within business)
- rfm_total = recency*0.4 + frequency*0.3 + monetary*0.3
- segment assignment: Champions (≥4), Loyal (3-4), At Risk (2-3), Lost (<2), New (visit_count=1)
- churn_risk: high (recency=1 + frequency≥3), medium (recency=2), low (rest)
- predicted_next_visit: last_visit + avg(days_between_visits)

Update both pos_customers and customers tables.
Add to daily briefing cron: run RFM scoring once per week (Sunday 9am AEST — merge into existing cron).
Commit: "feat(customers): RFM scoring engine + auto-segmentation + churn prediction"

## TASK 4 — Winback + bulk communication
src/app/api/customers/[id]/winback/route.ts:
POST { message_override? }: send personalised winback
- AI generates message based on their history and favourite products
- Send via Twilio SMS (if phone) or SendGrid email (if email)
- Log to aria_autopilot_actions { action_type: 'winback_sent', customer_id, message }

src/app/api/customers/bulk-winback/route.ts:
POST { customer_ids[], segment? }: bulk winback for a segment
- Rate limit: max 100 at once
- Stagger sends: 1 per second to avoid Twilio rate limits
Commit: "feat(customers): AI winback SMS/email + bulk segment winback"

## TASK 5 — Import + export
src/app/api/customers/import/route.ts:
POST multipart { file: CSV }: import customers
CSV columns: name, email, phone, tags, notes
Upsert on email — don't duplicate.
Return { imported, updated, failed, errors[] }

src/app/api/customers/export/route.ts:
GET: export all customers as CSV (name, email, phone, segment, total_spend, visit_count, last_visit, tags)
Commit: "feat(customers): CSV import (upsert) + CSV export"

## TASK 6 — Full CRM dashboard
src/app/dashboard/customers/page.tsx — complete UI:
Stats bar: total customers | active (visited <30d) | at risk (visited 30-90d) | lost (>90d) | avg LTV
Segment tabs: All | Champions | Loyal | At Risk | Lost | New
Customer table: name | total spend | visits | last visit | segment badge (coloured) | churn risk dot | tags
Row click → customer detail slide-over:
  - Profile: name, email, phone, tags (editable inline), notes
  - Spend chart: monthly spend bar chart (last 6 months)
  - Visit history: last 10 visits with product bought + amount
  - AI summary (with "Regenerate" button)
  - "Send winback" button (opens message preview)
  - Loyalty points + tier
Bulk actions: select multiple → bulk winback | bulk tag | bulk export
Import button (CSV) | Export button
"Recalculate segments" button (triggers RFM scoring)

Feed into Aria: add at-risk customer count + lost customer count to daily briefing.
Commit: "feat(customers/dashboard): full CRM UI — segments, detail, winback, import, export"

## Rules
- All amounts in dollars not cents
- npx tsc --noEmit + npm run build before each commit
- Model: claude-haiku-4-5-20251001 for all AI
- Migrations via Supabase MCP

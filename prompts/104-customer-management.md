# Prompt 104 — Customer Management (Full Feature)

The `customers` table exists. POS has pos_customers. Dashboard CRM is partial. Build the full feature.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

## CRITICAL: Two customer tables
- pos_customers: POS loyalty/spend tracking (id, business_id, name, email, phone, loyalty_points, total_spent, visit_count, last_visit_at, segment, rfm_recency_score, rfm_frequency_score, rfm_monetary_score)
- customers: CRM table (id, business_id, name, phone, email, last_visit, visit_count, total_spend, churn_risk, customer_segment, predicted_next_visit, ai_summary, tags, archived)

Routes should read from BOTH and merge where a customer appears in both (match on email/phone).

## TASK 1 — Customer list API
### src/app/api/customers/route.ts (check if exists — update if so)
GET params: page, limit, search, segment, churn_risk, sort_by, sort_dir
- Query customers table + left join pos_customers on email/phone
- Merge: prefer customers data, supplement with pos_customers spend/visit data
- Return: id, name, email, phone, total_spend, visit_count, last_visit, segment, churn_risk, loyalty_points, tags

POST: create customer (insert into customers)
Commit: "feat(customers): merged customer list API from both tables"

## TASK 2 — Customer detail + AI summary
### src/app/api/customers/[id]/route.ts
GET: full customer profile — personal info, spend history, visit history (from pos_sales), loyalty, tags, ai_summary
PATCH: update name, email, phone, notes, tags, archived
DELETE: archive (set archived=true, do not hard delete)

### src/app/api/customers/[id]/ai-summary/route.ts
POST: generate AI summary of this customer
- Pull last 20 sales from pos_sales (matched by customer_id or email)
- Generate: spending patterns, favourite products, visit frequency, churn risk assessment
- Update customers.ai_summary
- Model: claude-haiku-4-5-20251001
Commit: "feat(customers): detail API + AI summary generation"

## TASK 3 — Segments + RFM scoring
### src/app/api/customers/segment/route.ts
POST: recalculate RFM scores for all business customers
- Recency: days since last_visit (lower = better)
- Frequency: visit_count
- Monetary: total_spend
- Score each 1-5, assign segment: Champions / Loyal / At Risk / Lost / New
- Update customers: rfm_score_numeric, customer_segment, churn_risk
Run nightly via existing cron or add to a suitable existing cron.
Commit: "feat(customers): RFM scoring + auto-segmentation"

## TASK 4 — Winback + communication
### src/app/api/customers/[id]/winback/route.ts
POST: trigger winback for this customer
- Generate personalised winback message (AI, based on their history)
- Send via Twilio SMS if phone exists, or SendGrid if email exists
- Log to aria_autopilot_actions
Commit: "feat(customers): AI winback message + send via SMS/email"

## TASK 5 — Dashboard UI
src/app/dashboard/customers/page.tsx — full CRM view:
- Search bar + segment filter tabs (All / Champions / At Risk / Lost / New)
- Customer table: name | spend | visits | last visit | segment badge | churn risk
- Click → customer detail slide-over: profile, spend chart, visit history, AI summary, "Send winback" button
- "Recalculate segments" button
- Bulk select → bulk winback
- Import from CSV button (name, email, phone, spend)
Commit: "feat(customers/dashboard): full CRM UI — segments, detail, winback, import"

## Rules
- All amounts dollars not cents
- npx tsc --noEmit + npm run build before each commit
- Model: claude-haiku-4-5-20251001

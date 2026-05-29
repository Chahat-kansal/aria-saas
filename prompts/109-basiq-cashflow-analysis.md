# Prompt 109 — Basiq Bank Feed: Cash Flow Analysis

Basiq connection is now fixed. Build the downstream cash flow intelligence.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read src/app/api/integrations/basiq/ (all routes) and src/app/dashboard/cash-flow/ before writing anything.

## What Basiq gives us
After bank connection: we can fetch transactions from the user's bank accounts via Basiq API.
Endpoints available: GET /users/{id}/accounts, GET /users/{id}/transactions

## TASK 1 — Transaction sync
Create src/app/api/integrations/basiq/sync-transactions/route.ts
POST: { business_id }
- Get basiq_user_id from businesses table
- Fetch transactions: GET https://au-api.basiq.io/users/{basiq_user_id}/transactions?limit=500
- For each transaction: insert into bank_transactions table (create if not exists):
  id, business_id, basiq_transaction_id (unique), account_id, amount (dollars), direction (debit/credit), description, category (from Basiq), posted_date, created_at
- Skip already-synced transactions (upsert on basiq_transaction_id)
Commit: "feat(basiq): sync bank transactions to local DB"

## TASK 2 — Cash flow analysis API
Create src/app/api/pos/cash-flow/analysis/route.ts
GET params: period (7d|30d|90d)
- Pull bank_transactions for the period
- Pull pos_sales for same period (cash inflow)
- Categorise outflows: rent, wages, stock, utilities, other (use Basiq categories + keyword matching)
- Calculate: total_in, total_out, net_cash_flow, runway_days (current balance / avg daily outflow)
- AI insight: "Your biggest expense category is X at $Y/month. At this rate you have Z days of runway."
- Return structured analysis + AI commentary
Commit: "feat(cash-flow): bank transaction analysis + runway calculation + AI insight"

## TASK 3 — Cash flow sync cron
Add to existing daily cron:
- For every business with basiq_connected=true: call sync-transactions
- After sync: regenerate cash flow analysis + write to business brain
Commit: "feat(basiq/cron): daily bank transaction sync for connected businesses"

## TASK 4 — Dashboard UI
Update src/app/dashboard/cash-flow/page.tsx:
- If not connected: show Basiq connect CTA (link to integrations page)
- If connected:
  - Cash flow chart (bar: in vs out by week, recharts)
  - Expense breakdown donut chart by category
  - Runway gauge: X days of runway (red < 30, amber < 90, green > 90)
  - Recent transactions table: date | description | category | amount (colour-coded debit/credit)
  - "Sync now" button
  - AI Aria commentary card
Commit: "feat(cash-flow/dashboard): full cash flow UI — charts, runway, transactions, AI"

## DB table needed
bank_transactions: id, business_id, basiq_transaction_id (unique), account_id, amount (numeric dollars), direction (text), description, category, posted_date, created_at
Create via Supabase migration.

## Rules
- Amounts as dollars (numeric) — Basiq returns decimal amounts, store as-is
- Model: claude-haiku-4-5-20251001 for AI commentary
- npx tsc --noEmit + npm run build before each commit

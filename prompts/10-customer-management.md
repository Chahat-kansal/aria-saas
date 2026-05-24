# Aria OS — Prompt 10: Customer Management + AI CSV Import
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Prompt 19 (Aria Council) is deployed green before running this.
src/lib/aria/council.ts must exist.

## STEP 1 — READ BEFORE WRITING
Read how the customers table is currently used (winback / churn / reviews
features all read it — do not break them). Read a /dashboard sub-page for
the UI pattern and the sidebar. Read src/lib/aria/council.ts (the Aria
Council — you will use runAriaCouncil for high-value customer summaries).
Read how aria_ai_calls rows are written. Do NOT write code before reading.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
customers has: id, business_id, name, phone, email, last_visit, visit_count,
total_spend, total_spent, churn_risk, rfm_score, customer_segment,
predicted_next_visit, created_at, AND (already added): address, city,
postcode, notes, tags (text[]), company, source (default 'pos'), ai_summary,
ai_summary_at, archived (default false), updated_at.

customer_import_jobs: id, business_id, user_id, file_name, raw_headers
(jsonb), column_mapping (jsonb), rows_total, rows_imported, rows_skipped,
status ('pending'|'mapping'|'importing'|'complete'|'failed'), error_detail,
created_at.

## STEP 2 — CUSTOMER MANAGEMENT PAGE
Build /dashboard/customers with a new sidebar entry "Customers".
Shown to ALL businesses (product and service).

Features:
- Searchable, paginated customer list (name, contact, tags, segment, last
  visit). Exclude archived by default, with a toggle to show them.
- Add customer form: name, email, phone, company, address, city, postcode,
  tags, notes. On save, insert a customers row with source='manual'.
- Edit customer: same form, updates the row + updated_at.
- Archive customer: sets archived=true. Do NOT hard-delete.
- Customer detail view: shows analytics (segment, churn_risk, visit_count,
  total_spent) read-only, plus notes/tags editable.

## STEP 3 — AI CSV IMPORT (single model — correct answer, not strategic)
Use claude-sonnet-4-5-20250929 directly (NOT the council). Column mapping
has one correct answer — 3 arguing brains add noise, not value.

Flow:
1. Upload a .csv. Parse headers + first ~20 sample rows client-side using
   papaparse (npm install if needed, commit lockfile).
2. Create a customer_import_jobs row (status='mapping', raw_headers set).
3. POST /api/customers/import-map: send headers + sample rows to Claude
   (claude-sonnet-4-5-20250929). Strict JSON response only:
   { mapping: { "csvHeader": "customerField" } }
   Fields: name, email, phone, company, address, city, postcode, notes,
   tags, or 'ignore'. Parse safely (strip code fences).
   Log to aria_ai_calls (agent_key='customer_import_map').
4. Show proposed mapping — owner can correct each column. Store on import job.
5. POST /api/customers/import-run: insert customers rows (source='csv_import')
   applying the mapping. Dedupe on email or phone within the business (skip
   existing for v1, count as skipped). Update import job with rows_total /
   rows_imported / rows_skipped / status='complete'.

## STEP 4 — AI CUSTOMER SUMMARY (council for high-value, single model for others)
On the customer detail view, a "Summarise with Aria" button.

IMPORTANT: Use the Aria Council for high-value customers only:
  const isHighValue = (customer.total_spent ?? 0) > 500 ||
                      (customer.visit_count ?? 0) > 10

If isHighValue === true:
  Call runAriaCouncil(customerContext, businessId, 'ask_aria') from
  src/lib/aria/council.ts. Use council.final_briefing as the summary.
  The three brains will debate: Optimist sees a growth/upsell opportunity,
  Critic sees churn risk or declining frequency, Strategist synthesises.
  For a high-value customer this tension is genuinely useful.

If isHighValue === false:
  Call claude-sonnet-4-5-20250929 directly (fast, cheap, sufficient).
  Single call, same prompt. Return a one-line summary.

Both paths store the result in customers.ai_summary + ai_summary_at.
Both paths log to aria_ai_calls (agent_key='customer_summary').

customerContext string to pass to the council or single model:
  Customer: [name], [segment], [churn_risk]
  Visits: [visit_count] times, last [last_visit]
  Total spent: $[total_spent]
  Notes: [notes]
  Business: [trading_name], [industry], [city]

## AI RULES
- CSV mapping: always single model — one correct answer
- High-value customer summaries: council (runAriaCouncil)
- Low-value customer summaries: single model
- Every AI call logs to aria_ai_calls
- Never invent customer data

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest, #7FB897 sage
- Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Additive — do not break existing customer-reading features

## STEP 5 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.
Commit: feat(customers): customer management page + AI-mapped CSV import + Aria Council summaries for high-value customers + single-model summaries for others

# Aria OS — Prompt 10: Customer Management + AI CSV Import
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read how the customers table is currently used (winback / churn / reviews
features all read it — do not break them). Read a /dashboard sub-page for
the UI pattern and the sidebar. Read an existing route that calls Claude,
and how aria_ai_calls rows are written. Do NOT write code first.

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
- Archive customer: sets archived=true. Do NOT hard-delete — other features
  reference customers.
- Customer detail view: shows analytics (segment, churn_risk, visit_count,
  total_spent) read-only, plus notes/tags editable.

## STEP 3 — AI CSV IMPORT
An "Import from CSV" flow accessible from the customers page:

1. Upload a .csv. Parse the headers and first ~20 sample rows client-side
   using papaparse (npm install papaparse if needed, commit the lockfile).

2. Create a customer_import_jobs row (status='mapping', raw_headers set).

3. Call API route /api/customers/import-map: send CSV headers + sample rows
   to Claude (claude-sonnet-4-5-20250929) and ask it to map each CSV column
   to a customer field (name, email, phone, company, address, city, postcode,
   notes, tags) or 'ignore'. Claude returns STRICT JSON only:
   { mapping: { "csvHeader": "customerField" } }. Parse safely (strip code
   fences). Log the call to aria_ai_calls (feature='customer_import_map').

4. Show the proposed mapping to the owner in a UI where they can correct
   each column's mapping (dropdown per column). Store the final mapping on
   the import job.

5. On confirm, API route /api/customers/import-run inserts customers rows
   (source='csv_import') applying the mapping. Dedupe on email or phone
   within the same business (skip existing for v1, count as skipped).
   Update customer_import_jobs with rows_total / rows_imported / rows_skipped
   / status='complete'. If it errors, set status='failed' + error_detail.

## STEP 4 — AI CUSTOMER SUMMARY
On the customer detail view, a "Summarise with Aria" button calls an API
route that sends that customer's data (visits, spend, segment, last visit,
churn_risk) to Claude and returns a one-line plain-English summary (e.g.
"Loyal monthly regular, last in 3 weeks ago — a good win-back candidate").
Store in customers.ai_summary + ai_summary_at. Log to aria_ai_calls
(feature='customer_summary').

## AI RULES
- Every AI call logs to aria_ai_calls with model + token counts
- AI is used for mapping and summarising only — never invents customer data
- If Claude's mapping is uncertain for a column, default it to 'ignore'
  and let the owner correct it

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest, #7FB897 sage
- Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Additive — do not break existing customer-reading features

## STEP 5 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. ONE commit, ONE push.

Commit message:
feat(customers): customer management page + AI-mapped CSV import + Aria customer summaries — works without the POS for service businesses

# CLAUDE CODE PROMPT — 251: Deliverable Intelligence — make charts answer the ACTUAL question

Autonomous mode. Build gate + RENDERED OUTPUT VERIFICATION before commit. RULE 0 upgrade-only. `pwd` = `C:\Users\kansa\aria-saas-audit`.

## THE EMBARRASSING BUG (verified)
User asked "who is my best customer in terms of sales" → Aria returned a chart of PRODUCTS (Apple Juice, Big Breakfast). 

Root cause in `src/lib/aria/deliverables.ts`:
- `classifyDeliverableKind` matches "best" → `ranked_list`, with NO awareness of WHAT is being ranked.
- `generateRankedListHTML` ONLY ever renders `data.topProducts`. There is no concept of customers, staff, days, categories, or payment methods.
- `fetchDashboardData` fetches one fixed shape (revenue + top products + stock). It cannot answer "best customer", "busiest day", "top staff", etc.

So EVERY "best/top/rank/highest/lowest" query returns top products regardless of subject. This makes Aria look broken. The data exists — e.g. best customer (Charlotte Nguyen $557.50) is one query away in pos_customers.

## THE FIX — make ranked deliverables SUBJECT-AWARE
### Step 1: Detect the subject of a ranking question
Add a `detectRankSubject(message): 'customers' | 'products' | 'staff' | 'days' | 'categories' | 'payment_methods'` helper. Map keywords:
- customer/client/buyer/spender/loyal → customers
- product/item/seller/dish/menu/drink/coffee → products
- staff/employee/server/barista/team member/who sold → staff
- day/weekday/busiest day/slowest day → days
- category/department → categories
- payment/card/cash → payment_methods
- default when ambiguous → products (current behaviour) BUT only if no other subject matched.

### Step 2: Fetch the right data per subject
Add `fetchRankedData(businessId, subject)` that runs the correct query and returns a normalised shape `{ rows: {label, value, sub}[], valueLabel, subject }`:
- **customers**: `pos_customers` ORDER BY total_spent DESC LIMIT 10 → label=name, value=total_spent, sub=`${visit_count} visits`. valueLabel='Total spent'
- **products**: existing top-products logic (pos_sale_items grouped) → label=product_name, value=revenue, sub=`${units} sold`. valueLabel='Revenue'
- **staff**: pos_sales grouped by served_by (or join pos_staff) → label=staff_name, value=sum(total_amount), sub=`${count} sales`. valueLabel='Sales'. If served_by is mostly null, fall back gracefully (see Step 4).
- **days**: pos_sales grouped by day-of-week → label=weekday, value=sum(total_amount). valueLabel='Revenue'
- **categories**: join pos_sale_items→pos_products→pos_categories. valueLabel='Revenue'
- **payment_methods**: pos_sales grouped by payment_method. valueLabel='Revenue'
All amounts are dollars (numeric), NOT cents. Verify column names against live schema before writing queries (pos_customers has total_spent/visit_count; pos_sales has total_amount/served_by/payment_method/created_at; pos_sale_items has product_name/quantity/unit_price/line_total).

### Step 3: Generalise the ranked-list renderer
`generateRankedListHTML` takes the normalised `{rows, valueLabel, subject}` and renders ANY subject — title reflects the subject ("Top customers by spend", "Busiest days"), the value column uses valueLabel, the sub-line uses sub. Keep all existing interactivity (sortable, CSV download, hover). Match the refined style from prompt 250 if that's merged (big serif numbers, sage, spacing); otherwise keep current style but correct.

### Step 4: Honest fallback
If a subject's data is empty or a column is unavailable (e.g. served_by all null for staff), the deliverable must say so plainly in the output ("No staff attribution recorded on sales yet") rather than silently showing the wrong subject. NEVER fall back to products when the user asked for customers.

### Step 5: Wire title generation to subject
The title prompt already calls Haiku — pass the detected subject so the title is correct.

## VERIFICATION — RENDERED OUTPUT (mandatory)
1. tsc + build pass (paste exit codes).
2. For EACH subject, call generateDeliverable with a representative prompt against Sip (ff5055a0-c351-4ada-817a-1804961035f3) and PASTE the resulting rows:
   - "who is my best customer by sales" → MUST return customers (Charlotte Nguyen ~$557), NOT products
   - "top selling products" → products
   - "busiest day of the week" → days
   - "best staff member by sales" → staff or the honest fallback
3. Confirm "best customer" no longer returns Apple Juice. This is the acceptance test.

## HARD RULES
- A ranking deliverable must answer the SUBJECT the user asked about. Returning the wrong subject is a failure, not a fallback.
- Verify every column name against live DB before writing queries (no phantom columns — pos_products has NO stock_quantity/reorder_point; don't query them here).
- Amounts in dollars, not cents.
- Build gate + paste real rows as evidence before commit.

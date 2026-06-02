# Prompt 221 — Supplier Contract vs Invoice Price Comparison

Read CLAUDE.md in full first. Read every file listed before touching it.
One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Model: claude-haiku-4-5-20251001 for AI.
Run Prompt 220 first — this builds on top of supplier_invoices + supplier_invoice_items.

## WHAT EXISTS (after Prompt 220)
- supplier_invoices + supplier_invoice_items tables
- supplier_price_lists + supplier_price_items (uploaded supplier price lists)
- supplier_product_prices (cost price per product per supplier)
- pos_suppliers table

## WHAT WE'RE BUILDING
A standalone "Supplier Price Intelligence" module that:
1. Lets owners enter their negotiated CONTRACT prices per supplier per product
2. Compares contract prices against every invoice that comes in
3. Compares prices across multiple suppliers for the same product
4. Benchmarks against scraped market prices using Aria web search
5. Tracks cumulative savings from acting on Aria's suggestions

## TASK 1 — DB migrations
Commit: "feat(price-intel): DB migrations — supplier_contracts + cross_supplier_comparison + savings tables"

```sql
-- Negotiated contract prices (owner enters these once)
CREATE TABLE IF NOT EXISTS supplier_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE CASCADE,
  supplier_name text NOT NULL,
  product_name text NOT NULL,
  sku text,
  pos_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  contracted_unit_price numeric NOT NULL,
  contracted_case_price numeric,
  case_qty integer,
  currency text DEFAULT 'AUD',
  effective_from date DEFAULT CURRENT_DATE,
  effective_to date, -- null = ongoing
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_supplier_contracts" ON supplier_contracts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON supplier_contracts (business_id, supplier_id);
CREATE INDEX ON supplier_contracts (business_id, pos_product_id);
CREATE INDEX ON supplier_contracts (business_id, sku);

-- Cumulative price variance log (written whenever an invoice is processed)
CREATE TABLE IF NOT EXISTS supplier_price_variances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  pos_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  sku text,
  invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES supplier_contracts(id) ON DELETE SET NULL,
  contracted_price numeric,
  invoiced_price numeric NOT NULL,
  variance_amount numeric NOT NULL, -- invoiced - contracted (positive = overcharge)
  variance_pct numeric NOT NULL,
  quantity numeric DEFAULT 1,
  total_variance numeric, -- variance_amount * quantity
  status text DEFAULT 'open' CHECK (status IN ('open','disputed','resolved','accepted')),
  promoted_to_profit_leaks boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_price_variances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_supplier_price_variances" ON supplier_price_variances
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON supplier_price_variances (business_id, status);
CREATE INDEX ON supplier_price_variances (business_id, created_at DESC);

-- Savings tracker (logged when owner acts on a price suggestion)
CREATE TABLE IF NOT EXISTS supplier_price_savings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('supplier_switch','renegotiate','dispute_won','variance_recovered')),
  product_name text,
  from_supplier text,
  to_supplier text,
  old_price numeric,
  new_price numeric,
  quantity_per_month numeric,
  monthly_saving numeric,
  annual_saving numeric,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_price_savings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_supplier_price_savings" ON supplier_price_savings
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — Contracts API
Commit: "feat(price-intel): supplier contracts CRUD API"

### GET /api/supplier-contracts
List contracts for business. Params: supplier_id, product_id, active_only (only where effective_to IS NULL or > today).
Returns: { contracts, by_supplier: { [supplier_name]: contract[] } }

### POST /api/supplier-contracts
Create contract. Body: { supplier_id?, supplier_name, product_name, sku?, pos_product_id?, contracted_unit_price, contracted_case_price?, case_qty?, effective_from?, notes? }
On create: check if this product+supplier combo already has an active contract → if yes, set old one's effective_to = today, create new one.

### PATCH /api/supplier-contracts/[id]
Update price, dates, notes.

### DELETE /api/supplier-contracts/[id]
Set effective_to = today (soft expire).

### POST /api/supplier-contracts/bulk-import
Accept CSV with columns: supplier_name, product_name, sku, contracted_unit_price, contracted_case_price, case_qty
Parse and create contracts. Return { created, skipped, errors }.

## TASK 3 — Price comparison engine
Commit: "feat(price-intel): price comparison engine — cross-supplier + market benchmark"

### GET /api/supplier-price-intelligence
Returns the full price intelligence dashboard data:

1. CONTRACT VS INVOICE VARIANCES
Query supplier_price_variances WHERE business_id=X AND status='open' ORDER BY total_variance DESC.
Group by supplier. Compute: total overcharge per supplier, top 5 overcharged products.

2. CROSS-SUPPLIER COMPARISON
For each product that has prices from multiple suppliers (from supplier_price_items + supplier_product_prices):
Find cheapest supplier per product. Compute potential saving if switched.
Return top 10 switch opportunities by annual saving estimate.

3. MARKET BENCHMARK (AI-powered)
For the top 10 products by spend (from supplier_invoice_items, last 90 days):
Use haiku with web search to find current Australian wholesale prices for each product.
Compare against what the business is paying. Flag if paying >10% above market.
Cache results in a new column or redis-style in business brain.

4. SAVINGS SUMMARY
Total variances recovered (status=resolved), total savings logged in supplier_price_savings.

Returns: { variances, cross_supplier_opportunities, market_benchmarks, savings_summary }

### POST /api/supplier-price-intelligence/check-invoice
Called automatically when a new invoice is approved (from Prompt 220 flow).
Body: { invoice_id }
- For each invoice item with a pos_product_id:
  - Look up active supplier_contract for that product + supplier
  - If contract exists and invoiced_price > contracted_price * 1.02 (2% tolerance):
    - Insert supplier_price_variances row
    - If variance_pct > 10%: create intelligence_events row severity='high'
    - If variance_pct > 5%: create intelligence_events row severity='medium'
- Return: { variances_found, total_overcharge }

## TASK 4 — Dashboard page
Commit: "feat(price-intel): supplier price intelligence dashboard"

Create: src/app/dashboard/supplier-price-intelligence/page.tsx

Tabs: Contracts | Variances | Cross-Supplier | Market | Savings

Design: dark theme, Aria palette.

### Contracts tab
"Add contract" button → inline form (supplier name/autocomplete from pos_suppliers, product name/autocomplete from pos_products, unit price, case price, case qty, notes)
Contracts table: Supplier | Product | SKU | Contract price | Effective from | Expires | Actions (Edit/Expire)
Group by supplier (collapsible supplier sections)
"Import from CSV" button → file upload → POST /api/supplier-contracts/bulk-import

### Variances tab
Header stat: "You have been overcharged ${total} in the last 90 days"
Variance list: Supplier | Product | Invoice date | Contract price | Invoiced price | Overcharge $ | Overcharge %
Filter: by supplier, by status (open/disputed/resolved)
Per-row actions:
- "Dispute" → opens note input → PATCH status=disputed
- "Resolved" → opens resolution note → PATCH status=resolved
- "Accept" → PATCH status=accepted (you agreed to the higher price)
Cumulative bar at top: "Overcharged by ${x} this month across {n} suppliers"

### Cross-Supplier tab
Header: "Switch opportunities — you could save ${annual} per year"
Table: Product | Current supplier | Current price | Cheapest supplier | Their price | Saving/unit | Saving/month (est.) | Action
"Log switch" button → opens form to record that you switched → creates supplier_price_savings row
Sort by annual saving descending

### Market tab
Header: "Prices compared to Australian wholesale market rates"
Table: Product | Your price | Market rate | Difference | Last checked
"Benchmark now" button → POST /api/supplier-price-intelligence with refresh=true → triggers haiku web search
Show: "Aria last checked market prices: {timestamp}"
Flag products >10% above market in red

### Savings tab
Running total: "Total saved through Aria price intelligence: ${total}"
Timeline of logged savings: Date | Action | Product | From | To | Monthly saving
Projected annual saving based on logged switches
"Log manual saving" button for savings achieved outside the system

## TASK 5 — Wire into existing flows
Commit: "feat(price-intel): wire variance checking into invoice approval flow + Aria briefing"

1. When supplier invoice status is patched to 'approved' (in PATCH /api/supplier-invoices/[id]):
   - Automatically call POST /api/supplier-price-intelligence/check-invoice
   - If variances found: return variance_alerts in the PATCH response so the UI can show them

2. In buildAskAriaContext add:
   - Open variances: count + total overcharge amount
   - Top cross-supplier saving opportunity
   - Market benchmark alerts (paying >10% above market for key products)
   Format: "Supplier price intel: ${overcharge_total} in open variances. Top opportunity: switch {product} from {supplier_a} to {supplier_b} saves ${saving}/month."

3. Wire into profit_leaks: when a variance is created, POST to /api/aria/profit-analysis with a pricing_gap leak entry (only if variance_pct > 10%)

## TASK 6 — Sidebar link
Commit: "feat(price-intel): sidebar link"

'supplier-price-intelligence': { href: '/dashboard/supplier-price-intelligence', label: 'Price intelligence', icon: TrendingDownIcon, badge: 'AI', section: 'Intelligence' }

Add to retail, liquor, cafe, restaurant, warehouse industry configs.

## COMPLETION CHECKLIST
- [ ] 3 new tables with RLS
- [ ] Contracts CRUD + bulk CSV import
- [ ] Price comparison engine: variances + cross-supplier + market benchmark
- [ ] Auto-check on invoice approval
- [ ] Dashboard: all 5 tabs functional
- [ ] Variance dispute/resolve flow works
- [ ] Cross-supplier switch logging works
- [ ] Intelligence events fire for high variances
- [ ] Profit leaks wired
- [ ] Aria briefing context updated
- [ ] Sidebar link present
- [ ] npx tsc --noEmit passes
- [ ] npm run build passes
State "Build verified green, all commits pushed." when done.

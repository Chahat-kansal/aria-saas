# Prompt 229 — Autonomous BAS/Tax Compliance Agent
# What Basis AI raised $100M for. The most legally important agent in Aria.
# NO NEW ENV VARS NEEDED — uses existing Supabase + Anthropic keys only.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE
- src/lib/agents/base-agent.ts, types.ts, orchestrator.ts — DO NOT recreate
- DB: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()
- CONFIRMED AVAILABLE env vars: ANTHROPIC_API_KEY, RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, GOOGLE_PLACES_API_KEY, GOOGLE_CLIENT_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
- Open-Meteo weather API: FREE, no API key needed
- Basiq: check if BASIQ_API_KEY exists before using — it may not be set yet

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Models: haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## WHY THIS IS THE MOST VALUABLE AGENT
Every Australian business with an ABN is legally required to lodge BAS quarterly.
Aria has EVERYTHING needed to automate it: POS sales data, supplier invoices,
payroll timesheets, and bank feed. No other POS platform in Australia has all four.
This makes Aria "we can't cancel this — it does our tax" sticky.

## TASK 1 — DB migrations
Commit: "feat(bas-agent): DB migrations — tax_classifications + bas_drafts + payg_obligations"

```sql
-- Per-product GST classification (set once, used forever)
CREATE TABLE IF NOT EXISTS product_tax_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  gst_treatment text NOT NULL DEFAULT 'taxable' CHECK (gst_treatment IN (
    'taxable',         -- standard 10% GST applies
    'gst_free',        -- e.g. basic food, medical, education
    'input_taxed',     -- e.g. financial services, residential rent
    'out_of_scope'     -- e.g. wages, private expenses
  )),
  ato_tax_code text DEFAULT '1A', -- ATO tax code for reporting
  classification_source text DEFAULT 'manual' CHECK (classification_source IN ('manual','ai_suggested','confirmed')),
  ai_confidence numeric, -- 0-1 if AI classified it
  notes text,
  classified_at timestamptz DEFAULT now(),
  classified_by text DEFAULT 'owner',
  UNIQUE(business_id, product_id)
);
ALTER TABLE product_tax_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_tax_classifications" ON product_tax_classifications
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON product_tax_classifications (business_id, gst_treatment);

-- Quarterly BAS drafts
CREATE TABLE IF NOT EXISTS bas_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  quarter text NOT NULL, -- e.g. "Q1 FY2026" or "Jan-Mar 2026"
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft','reviewed','lodged','amended')),

  -- G1: Total sales (all sales including GST)
  g1_total_sales numeric DEFAULT 0,
  -- G2: Export sales (GST-free)
  g2_export_sales numeric DEFAULT 0,
  -- G3: Other GST-free sales
  g3_gst_free_sales numeric DEFAULT 0,
  -- G4: Input taxed sales
  g4_input_taxed_sales numeric DEFAULT 0,
  -- G8: Adjustments
  g8_adjustments numeric DEFAULT 0,
  -- 1A: GST on sales (G1 - G2 - G3 - G4 + G8) / 11
  field_1a_gst_on_sales numeric DEFAULT 0,

  -- 1B: GST credits on purchases
  field_1b_gst_credits numeric DEFAULT 0,
  -- G10: Capital purchases
  g10_capital_purchases numeric DEFAULT 0,
  -- G11: Non-capital purchases
  g11_noncapital_purchases numeric DEFAULT 0,

  -- Net GST (1A - 1B)
  net_gst numeric DEFAULT 0,

  -- PAYG Withholding
  w1_total_salary_wages numeric DEFAULT 0,
  w2_amounts_withheld numeric DEFAULT 0,

  -- PAYG Instalments (if applicable)
  t1_instalment_income numeric DEFAULT 0,
  t4_instalment_rate numeric DEFAULT 0,
  t7_credit_from_ato numeric DEFAULT 0,

  -- Total payable
  total_payable numeric DEFAULT 0,

  -- Reconciliation notes
  unclassified_sales_count integer DEFAULT 0,
  unclassified_purchases_count integer DEFAULT 0,
  reconciliation_gaps jsonb DEFAULT '[]',

  -- Accountant handover package
  handover_generated_at timestamptz,
  handover_summary text,

  generated_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  lodged_at timestamptz,
  UNIQUE(business_id, period_start)
);
ALTER TABLE bas_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_bas_drafts" ON bas_drafts
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON bas_drafts (business_id, period_end DESC);

-- Super guarantee tracking per employee per quarter
CREATE TABLE IF NOT EXISTS super_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  staff_member_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name text NOT NULL,
  quarter text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  ordinary_time_earnings numeric DEFAULT 0,
  super_rate_pct numeric DEFAULT 11.5, -- 2026 rate
  super_amount_owed numeric DEFAULT 0,
  super_fund_name text,
  super_fund_usi text,
  payment_due_date date,
  paid_at timestamptz,
  payment_amount numeric,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','partial')),
  UNIQUE(business_id, staff_member_id, period_start)
);
ALTER TABLE super_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_super_obligations" ON super_obligations
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — AI Product Classification
Commit: "feat(bas-agent): AI product GST classification — classifies all unclassified products"

Create: src/app/api/agents/bas/classify-products/route.ts
POST: classify all pos_products that don't have a product_tax_classifications row

For each unclassified product, call haiku:
System: "You are an Australian tax classification expert. Classify this product for GST purposes under Australian tax law."
User: "Product name: {name}. Category: {category}. Description: {description}. Business type: {industry}."
Response (JSON): { gst_treatment: "taxable"|"gst_free"|"input_taxed"|"out_of_scope", ato_tax_code: string, confidence: number, reasoning: string }

ATO tax codes to use:
- taxable → "1A" (GST on sales)
- gst_free → "5A" (GST-free)
- input_taxed → "7A"

GST-free rules for Australia:
- Basic food (unprepared food, bread, milk, fresh produce) → gst_free
- Prepared food sold to eat immediately (restaurant meals, cafe food) → taxable
- Medical, dental, childcare, education → gst_free
- Alcohol, tobacco, soft drinks, confectionery → taxable

Batch products in groups of 20. Insert product_tax_classifications rows.
Return: { classified: number, needs_review: [] (low confidence < 0.7) }

Create: src/app/api/agents/bas/classifications/route.ts
GET: all product_tax_classifications for business with product details
PATCH /{id}: owner overrides a classification

## TASK 3 — BAS Draft Generation
Commit: "feat(bas-agent): BAS draft generation — computes all ATO fields from POS + supplier data"

Create: src/lib/agents/bas-agent.ts
Extends BaseAgent. AgentType: 'bas_compliance'

```typescript
// generateBasDraft(business_id: string, period_start: Date, period_end: Date): Promise<BasDraft>

// STEP 1: G1 TOTAL SALES
// SUM(pos_sales.total_amount) WHERE business_id AND created_at BETWEEN period_start AND period_end
// This is all sales INCLUDING GST

// STEP 2: GST-FREE SALES (G3)
// JOIN pos_sale_items → product_tax_classifications WHERE gst_treatment = 'gst_free'
// SUM(line_total) for those items

// STEP 3: INPUT TAXED SALES (G4)
// Same join but gst_treatment = 'input_taxed'

// STEP 4: TAXABLE SALES
// G1 - G3 - G4 = taxable portion
// field_1a_gst_on_sales = taxable_sales / 11  (GST is 1/11th of GST-inclusive price)

// STEP 5: GST CREDITS (1B) — from supplier purchases
// If supplier_invoices table exists (prompt 220):
//   SUM(gst_amount) WHERE business_id AND invoice_date BETWEEN period + status != 'disputed'
// Also include: bank feed expenses classified as business purchases (from Basiq if connected)
// field_1b_gst_credits = total_gst_paid_on_purchases

// STEP 6: NET GST
// net_gst = field_1a_gst_on_sales - field_1b_gst_credits
// Positive = you owe ATO. Negative = ATO owes you a refund.

// STEP 7: PAYG WITHHOLDING
// w1_total_salary_wages = SUM(hours_worked * hourly_rate) from pos_timesheets
//   WHERE clock_in BETWEEN period_start AND period_end
// w2_amounts_withheld = w1_total_salary_wages * estimated_withholding_rate
//   (Use ATO 2026 tax tables: weekly earnings → withholding amount lookup)
//   For simplicity: approximate withholding as (w1 * 0.19) for workers earning < $87k/yr

// STEP 8: SUPER OBLIGATIONS
// For each staff member with timesheets in the period:
//   ordinary_time_earnings = regular hours * hourly_rate (exclude overtime)
//   super_owed = ordinary_time_earnings * 0.115 (11.5% rate in 2026)
// Upsert super_obligations rows

// STEP 9: UNCLASSIFIED PRODUCTS FLAG
// Find pos_sale_items in the period WHERE product_id NOT IN (SELECT product_id FROM product_tax_classifications)
// unclassified_sales_count = COUNT of these
// This is how many sales we couldn't classify — affects accuracy

// STEP 10: RECONCILIATION
// Total = net_gst + w2_amounts_withheld
// reconciliation_gaps = any issues found (unclassified products, missing supplier invoices, etc.)

// STEP 11: ACCOUNTANT HANDOVER PACKAGE
// Call sonnet to generate handover_summary:
// "Here is your {quarter} BAS summary for {business_name}:
//  GST collected: ${1a}. GST credits: ${1b}. Net GST: ${net}.
//  PAYG withholding: ${w2}. Super owed: ${super_total}.
//  Total payable by {due_date}: ${total}.
//  {unclassified_count} products need classification before lodgement.
//  All supporting records are attached."

// STEP 12: Upsert bas_drafts row
```

Create: src/app/api/agents/bas/draft/route.ts
POST: { period_start, period_end } → triggers generateBasDraft
GET: lists all bas_drafts for business

Create: src/app/api/agents/bas/draft/[id]/route.ts
GET: full draft with all fields + super_obligations for the period
PATCH: { status: 'reviewed'|'lodged', lodged_at } — owner marks as lodged

## TASK 4 — Deadline monitoring cron
Commit: "feat(bas-agent): BAS deadline monitor — auto-drafts + super payment alerts"

Create: src/app/api/cron/bas-monitor/route.ts
Schedule: "0 22 * * *" (10am AEST daily)

Logic:
1. For each active business: check if a BAS draft exists for the current quarter
2. If not AND we are 30 days from quarter end: auto-generate a draft
3. Australian BAS quarters:
   - Q1: Jul 1 - Sep 30, due Oct 28
   - Q2: Oct 1 - Dec 31, due Feb 28
   - Q3: Jan 1 - Mar 31, due Apr 28
   - Q4: Apr 1 - Jun 30, due Jul 28
4. If due date is 14 days away AND status != 'lodged': send reminder notification
5. Super obligations: if super payment_due_date is 14 days away AND status != 'paid': alert owner
   Super is due 28 days after each quarter end.

## TASK 5 — Dashboard page
Commit: "feat(bas-agent): BAS compliance dashboard — product classification + quarterly BAS + super"

Create: src/app/dashboard/bas/page.tsx

Read ui-ux-pro-max skill. This is a high-trust financial page — clean, precise, no decoration.

Tabs: Current Quarter | History | Product Classification | Super | Settings

### Current Quarter tab
Quarter header: "Q{n} FY{year} · {period} · Due {due_date}"
Status badge: "Draft" (grey) | "Reviewed" (amber) | "Lodged" (green)

BAS fields displayed as a proper ATO-style form (not a table, but labelled fields):
G1 Total sales: ${amount}
G3 GST-free sales: ${amount}
G4 Input-taxed sales: ${amount}
1A GST on sales: ${amount} ← highlighted in sage
1B GST credits on purchases: ${amount}
Net GST: ${amount} ← large, red if payable, green if refund

PAYG Withholding section:
W1 Total wages: ${amount}
W2 Tax withheld: ${amount}

Total payable to ATO: ${total} ← large Fraunces italic

Action buttons:
- "Mark as reviewed" → PATCH status=reviewed
- "Mark as lodged" → PATCH status=lodged
- "Download summary" → generates a PDF of the BAS figures + supporting schedules
- "Classify {N} unclassified products →" → opens Product Classification tab with filter

### Product Classification tab
Table: Product | Category | AI suggested treatment | Confidence | Your classification | Override button
Filter: show only "needs review" (confidence < 0.7 or unclassified)
Bulk action: "Apply AI suggestions for all high-confidence products (>0.85)"
Color coding: taxable=white, gst_free=sage tint, input_taxed=amber tint, needs_review=red tint

"Run AI classification" button → POST /api/agents/bas/classify-products → shows progress

### Super tab
Table per quarter: Staff name | Ordinary earnings | Super rate | Super owed | Fund | Due date | Status
"Mark paid" button per row → PATCH paid_at + status=paid
Total owed this quarter: ${amount}
Alert banner if due date < 14 days and status != paid

### History tab
Past BAS quarters: period, net GST, PAYG, total paid, status, lodged date
Click → expand to see all fields from that quarter

### Settings tab
- Business ABN (pulled from businesses.abn)
- GST registration date
- BAS frequency (quarterly/monthly — default quarterly)
- Accountant email (to CC on BAS drafts)
- Super fund defaults per staff member

## TASK 6 — Sidebar + Aria intelligence
Commit: "feat(bas-agent): sidebar link + BAS alerts in daily briefing"

Sidebar: 'bas': { href: '/dashboard/bas', label: 'Tax & BAS', icon: ReceiptIcon, section: 'Operations' }
Add to all industry configs.

In buildAskAriaContext:
- If BAS due in < 30 days and status != lodged: "BAS DUE: {quarter} BAS due {date}. Draft prepared. Net GST: ${amount}. Review needed."
- If super due in < 14 days: "SUPER DUE: ${amount} super owed across {N} staff. Payment due {date}."
- Unclassified products: "{N} products not yet classified for GST — affects BAS accuracy."

## COMPLETION CHECKLIST
- [ ] 3 new tables with RLS + all indexes
- [ ] AI product classification working (haiku)
- [ ] All ATO BAS fields (G1-G11, 1A, 1B, W1, W2) computed correctly
- [ ] Super obligations computed at 11.5% rate
- [ ] Quarterly BAS auto-draft 30 days before quarter end
- [ ] 14-day deadline alerts for BAS + super
- [ ] Dashboard: BAS form display, product classification, super table
- [ ] ATO quarter dates hardcoded correctly
- [ ] Handover summary generated by sonnet
- [ ] Sidebar link present
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

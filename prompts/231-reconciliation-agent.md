# Prompt 231 — Autonomous Financial Reconciliation Agent
# What HighRadius and BlackLine charge $50k+/year for. Now for Australian SMBs.
# NEEDS: BASIQ_API_KEY (for bank feed). If not set, agent runs in manual mode.
# All other env vars already set.

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

## WHAT THIS AGENT DOES
Daily: reconciles POS sales vs bank deposits. Flags discrepancies.
Weekly: matches supplier invoices to purchase orders. Flags unmatched invoices.
Monthly: generates full P&L with actual vs last-month comparison.
Quarter-end: produces clean accountant handover package.
Always: anomaly detection on any expense 2x the normal amount.

## TASK 1 — DB migrations
Commit: "feat(reconcile-agent): DB migrations — reconciliation + anomaly tables"

```sql
CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  recon_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- POS totals (source of truth for sales)
  pos_sales_count integer DEFAULT 0,
  pos_sales_total numeric DEFAULT 0,
  pos_cash_total numeric DEFAULT 0,
  pos_card_total numeric DEFAULT 0,
  pos_other_total numeric DEFAULT 0,
  
  -- Bank totals (from Basiq or manual entry)
  bank_deposits_total numeric DEFAULT 0, -- card settlements + cash deposits
  bank_data_source text DEFAULT 'manual' CHECK (bank_data_source IN ('basiq','manual','not_available')),
  
  -- Reconciliation result
  variance_amount numeric DEFAULT 0, -- pos_sales_total - bank_deposits_total
  variance_pct numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('balanced','variance','pending','explained')),
  explanation text,
  
  -- Timing adjustment (card settlements arrive 1-2 business days later)
  expected_settlement_date date,
  settlement_confirmed boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, recon_date)
);
ALTER TABLE daily_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_daily_recons" ON daily_reconciliations
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON daily_reconciliations (business_id, recon_date DESC);

CREATE TABLE IF NOT EXISTS expense_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  detected_at timestamptz DEFAULT now(),
  source text NOT NULL CHECK (source IN ('bank_feed','supplier_invoice','manual')),
  expense_category text,
  expense_description text,
  amount numeric NOT NULL,
  expected_range_low numeric,
  expected_range_high numeric,
  deviation_pct numeric,
  possible_causes text[],
  status text DEFAULT 'open' CHECK (status IN ('open','explained','error','accepted')),
  explanation text,
  resolved_at timestamptz
);
ALTER TABLE expense_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_expense_anomalies" ON expense_anomalies
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON expense_anomalies (business_id, status, detected_at DESC);

CREATE TABLE IF NOT EXISTS monthly_pl_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  period_month integer NOT NULL, -- 1-12
  period_year integer NOT NULL,
  
  -- Revenue
  gross_revenue numeric DEFAULT 0,
  refunds_total numeric DEFAULT 0,
  net_revenue numeric DEFAULT 0,
  
  -- COGS
  cogs_from_supplier_invoices numeric DEFAULT 0,
  gross_profit numeric DEFAULT 0,
  gross_margin_pct numeric DEFAULT 0,
  
  -- Expenses (from bank feed categories)
  labour_cost numeric DEFAULT 0,
  rent_utilities numeric DEFAULT 0,
  marketing_cost numeric DEFAULT 0,
  other_expenses numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  
  -- Net
  ebitda numeric DEFAULT 0,
  
  -- vs last month
  revenue_vs_last_month_pct numeric DEFAULT 0,
  margin_vs_last_month_pct numeric DEFAULT 0,
  
  -- Narrative
  summary_narrative text, -- haiku generated 3-sentence summary
  
  generated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, period_year, period_month)
);
ALTER TABLE monthly_pl_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_pl_reports" ON monthly_pl_reports
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — ReconciliationAgent class
Commit: "feat(reconcile-agent): ReconciliationAgent — daily recon + anomaly detection + P&L"

Create: src/lib/agents/reconciliation-agent.ts
Extends BaseAgent. AgentType: 'reconciliation'

```typescript
// run(business_id: string, target_date: Date = yesterday): Promise<AgentRunResult>

// STEP 1: DAILY POS RECONCILIATION
// pos_sales_total = SUM(total_amount) WHERE business_id AND date(created_at) = target_date
// pos_cash = SUM WHERE payment_method = 'cash'
// pos_card = SUM WHERE payment_method IN ('card','eftpos','credit','debit')
//
// Bank deposit total:
//   If BASIQ_API_KEY set: call /api/basiq/transactions?date=target_date&type=credit
//   Filter to transactions that look like POS settlements (merchant reference, card terminal ID)
//   bank_deposits_total = SUM of matching credits
//   If BASIQ not connected: bank_deposits_total = null, bank_data_source = 'not_available'
//
// variance = pos_sales_total - bank_deposits_total
// Note: card settlements typically arrive T+1 business days
// If variance < $5: status = 'balanced'
// If variance between $5-$50: create AgentDecision to notify owner (may be timing)
// If variance > $50: create AgentDecision with HIGH urgency
// Possible explanations haiku generates: timing, refund processed separately, bank error, POS error

// STEP 2: SUPPLIER INVOICE MATCHING (if supplier_invoices table exists from prompt 220)
// For each warehouse_purchase_order WHERE received_at IS NOT NULL AND status = 'received':
//   Look for matching supplier_invoices WHERE:
//     supplier_name matches AND total_amount within 2% AND invoice_date within 7 days of PO date
//   If no match found: create expense_anomaly (unmatched PO — possible phantom delivery or missing invoice)
//   If match found: mark as reconciled

// STEP 3: ANOMALY DETECTION
// For each bank transaction in last 7 days (if Basiq connected):
//   Categorise: rent, utilities, insurance, supplier, marketing, other
//   Compare to 3-month average for that category
//   If amount > category_avg * 2: create expense_anomaly
//   Call haiku with amount, category, description: generate possible_causes array
//   Examples: "Power bill is 2.3x normal ($1,840 vs $800 average). Possible causes: summer AC usage, meter error, billing period overlap."

// STEP 4: MONTHLY P&L (runs on 1st of each month for previous month)
// gross_revenue = SUM(pos_sales.total_amount) for the month
// refunds = SUM(refunded amounts) for the month (from pos_sales WHERE status='refunded')
// net_revenue = gross_revenue - refunds
// cogs = SUM(supplier_invoices.total) for the month (purchases)
// gross_profit = net_revenue - cogs
// gross_margin_pct = gross_profit / net_revenue * 100
// labour_cost = SUM(hours * hourly_rate) from pos_timesheets
// other expenses: from bank feed categories (if Basiq) or manual estimate
// ebitda = gross_profit - total_expenses
// Call haiku to generate summary_narrative (3 sentences: headline, driver, recommendation)

// STEP 5: QUARTER-END HANDOVER PACKAGE
// If today is end of quarter:
//   Generate a zip of: all daily_reconciliations for the quarter, monthly P&L reports x3,
//   all supplier_invoices as a list, bas_drafts for the period
//   Summary letter (sonnet): "Here is your Q{N} handover package. 
//     Revenue: ${X}. COGS: ${Y}. Gross margin: {Z}%.
//     {N} variances were detected and explained. All supporting records attached."
//   Send to accountant email if configured in agent_settings.config.accountant_email

// STEP 6: SAVE DECISIONS + LOG
```

## TASK 3 — Cron + API routes
Commit: "feat(reconcile-agent): crons + API routes"

Create: src/app/api/cron/reconciliation/route.ts
Schedule: "0 20 * * *" (6am AEST) — runs STEP 1-3 for yesterday's date

Monthly P&L: trigger at "0 20 1 * *" (6am AEST 1st of month) for previous month — merge into reconciliation cron or create new if under 22 limit.

Create: src/app/api/agents/reconciliation/daily/route.ts
GET: last 30 days of daily_reconciliations with status
Returns: { reconciliations[], total_variance_7d, unresolved_count }

Create: src/app/api/agents/reconciliation/anomalies/route.ts
GET: open expense_anomalies ordered by deviation_pct DESC
PATCH /{id}: { status: 'explained'|'accepted', explanation }

Create: src/app/api/agents/reconciliation/pl/route.ts
GET: monthly_pl_reports for last 12 months

## TASK 4 — Dashboard section
Commit: "feat(reconcile-agent): reconciliation dashboard — daily recon, anomalies, P&L"

Dashboard section — "Financial Reconciliation":

Daily Reconciliation panel:
- Status indicator per day (last 7 days): coloured dots (green=balanced, amber=timing, red=variance)
- Click any day → expand: POS total | Bank total | Variance | Explanation
- "Explain" button on variance → opens note input → PATCH status=explained

Anomaly alerts:
- List of open anomalies with severity (2x = amber, 3x+ = red)
- "Possible causes" dropdown per anomaly
- "Accept as normal" / "Flag as error" buttons

Monthly P&L:
- 12-month revenue bar chart
- Gross margin % trend line
- Current month vs last month comparison cards
- haiku narrative: "This month's highlights..."

Bank connection status:
- "Connected via Basiq ✓" or "Bank not connected — reconciliation is estimated"
- Connect bank button → /dashboard/integrations/basiq

## COMPLETION CHECKLIST
- [ ] 3 new tables with RLS + indexes
- [ ] ReconciliationAgent: daily POS vs bank reconciliation
- [ ] Supplier invoice to PO matching
- [ ] Anomaly detection with haiku explanations
- [ ] Monthly P&L from POS + supplier data
- [ ] Quarter-end handover package generation
- [ ] Cron running daily 6am AEST
- [ ] Dashboard: daily recon dots, anomalies, P&L chart
- [ ] Graceful degradation when Basiq not connected
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.

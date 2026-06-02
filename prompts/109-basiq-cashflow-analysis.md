# Prompt 109 — Basiq Bank Feed: Cash Flow Intelligence


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

Basiq connection is fixed and working. Build the downstream cash flow analysis.
Read CLAUDE.md first.

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


## TASK 1 — Transaction sync
Read src/app/api/integrations/basiq/ — understand current state.

Create src/app/api/basiq/transactions/sync/route.ts:
POST { business_id }:
1. Get Basiq user_id from businesses table
2. Call Basiq GET /users/{userId}/transactions (last 90 days)
3. Upsert into bank_transactions table:
   ```sql
   CREATE TABLE IF NOT EXISTS bank_transactions (
     id uuid primary key default gen_random_uuid(),
     business_id uuid references businesses(id) on delete cascade,
     basiq_transaction_id text unique,
     account_id text,
     amount numeric not null,
     direction text, -- 'debit' | 'credit'
     description text,
     category text,
     merchant_name text,
     transaction_date date,
     status text,
     balance numeric,
     created_at timestamptz default now()
   );
   CREATE INDEX ON bank_transactions (business_id, transaction_date DESC);
   ```
4. Return { synced, accounts_found, balance }

Daily cron: sync transactions for all connected businesses (merge into existing cron).
Commit: "feat(basiq): transaction sync → bank_transactions table with daily cron"

## TASK 2 — Cash flow analysis API
src/app/api/basiq/cashflow/route.ts:
GET { business_id, period: '30d'|'90d'|'12m' }:
- Total inflows vs outflows
- Weekly/monthly cash flow chart data
- Category breakdown (expenses by merchant category)
- Cash burn rate (avg daily outflow)
- Runway: current_balance / daily_burn_rate (in days)
- Largest expense categories
- Upcoming predicted expenses (based on recurring patterns)

Detect recurring expenses: transactions with same merchant and similar amount monthly → flag as recurring.
Model: haiku for pattern detection
Commit: "feat(basiq/cashflow): cash flow analysis — burn rate, runway, categories, recurring"

## TASK 3 — Cash flow vs revenue reconciliation
src/app/api/basiq/reconcile/route.ts:
GET { business_id, month }:
- Compare Aria POS revenue for the month vs bank deposits
- Flag discrepancies > 5% (possible missing Square settlement, cash not deposited, etc.)
- Return: { pos_revenue, bank_deposits, difference, reconciliation_status, flags[] }

Add to daily briefing: if bank balance drops below a threshold (businesses.low_balance_alert_threshold — add if missing), alert in briefing.
Commit: "feat(basiq/reconcile): revenue vs bank reconciliation + low balance alert"

## TASK 4 — AI cash flow commentary
src/app/api/basiq/ai-analysis/route.ts:
POST { business_id }:
- Pull: last 90 days transactions + pos revenue + current balance
- AI generates plain-English cash flow commentary:
  "Your cash burn is $340/day. At current balance ($18,420), you have 54 days runway. Your biggest expense is ALM invoices at $4,200/month — up 12% vs last quarter."
- Include: risks, opportunities, specific recommendations
- Log to aria_ai_calls
Model: claude-sonnet-4-5-20250929 (complex analysis)
Commit: "feat(basiq/ai): AI cash flow commentary with runway + risk analysis"

## TASK 5 — Dashboard
src/app/dashboard/cash-flow/page.tsx (or add to integrations/basiq):
- Account balance cards (one per connected account)
- Cash flow chart: inflows vs outflows by week (last 12 weeks)
- Runway meter: "54 days runway" with colour coding (>90d green, 30-90d amber, <30d red)
- Category breakdown donut chart
- Recurring expenses list with amounts
- Reconciliation status vs POS revenue
- "AI Analysis" card with commentary + "Refresh" button
- Transaction list with search + category filter

In daily briefing: current balance + runway + any reconciliation flags.
Commit: "feat(basiq/dashboard): cash flow dashboard — balance, runway, categories, reconciliation"

## Rules
- Model: claude-haiku-4-5-20251001 for data processing, sonnet for AI analysis only
- npx tsc --noEmit + npm run build before each commit
- Migrations via Supabase MCP

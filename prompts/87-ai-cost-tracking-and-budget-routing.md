# Prompt 87 — Real cost tracking + budget-based Sonnet→Haiku downgrade

## Goal
Replace the always-Haiku-for-simple-queries router (proposed in prompt 86 Task 3)
with a smarter design: every customer gets Sonnet by default, but once they hit
their plan's monthly Sonnet budget, Aria gracefully downgrades to Haiku for the
rest of the month. Quality stays high for normal use, costs stay bounded for
power users, customer always knows what mode they're in.

ALSO: build a real admin panel showing AI cost per business, per agent, with
daily and monthly aggregates and alerts for over-budget businesses.

If prompt 86 already merged a hardcoded Haiku-routing decision in
/api/aria/ask/route.ts: REVERT that piece. The new system is budget-based, not
complexity-based. Keep the BlockRenderer and data.blocks wire-up from prompt 86 —
those are separate and still valuable.

## DB schema

Spend caps already exist in `aria_daily_spend` but per-business monthly tracking
is missing. Add the table:

```sql
CREATE TABLE IF NOT EXISTS aria_monthly_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  year_month text NOT NULL,             -- e.g. '2026-05'
  sonnet_cents int DEFAULT 0,
  haiku_cents int DEFAULT 0,
  opus_cents int DEFAULT 0,
  other_cents int DEFAULT 0,            -- gemini, openai, etc.
  total_cents int DEFAULT 0,            -- denormalised for cheap reads
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, year_month)
);
ALTER TABLE aria_monthly_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_spend_owner" ON aria_monthly_spend
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE INDEX idx_monthly_spend_business_month ON aria_monthly_spend(business_id, year_month);
```

Plan budgets — store on `business_subscriptions` (verify the column doesn't exist already):
```sql
ALTER TABLE business_subscriptions 
  ADD COLUMN IF NOT EXISTS sonnet_monthly_budget_cents int DEFAULT 3000;  -- $30 default
```
Backfill defaults by plan tier when the route reads them:
- Starter → $10 (1000 cents)
- Growth → $30 (3000 cents) 
- Pro → $80 (8000 cents)

## Spend aggregation trigger (cheap, automatic)

```sql
CREATE OR REPLACE FUNCTION accumulate_monthly_spend() 
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  ym text := to_char(NEW.created_at, 'YYYY-MM');
  model_family text;
BEGIN
  IF NEW.business_id IS NULL OR NEW.cost_usd_cents IS NULL OR NEW.cost_usd_cents = 0 THEN
    RETURN NEW;
  END IF;
  
  model_family := CASE 
    WHEN NEW.model_id LIKE '%sonnet%' THEN 'sonnet'
    WHEN NEW.model_id LIKE '%haiku%' THEN 'haiku'
    WHEN NEW.model_id LIKE '%opus%' THEN 'opus'
    ELSE 'other'
  END;
  
  INSERT INTO aria_monthly_spend (business_id, year_month, sonnet_cents, haiku_cents, opus_cents, other_cents, total_cents)
  VALUES (
    NEW.business_id, ym,
    CASE WHEN model_family = 'sonnet' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'haiku' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'opus' THEN NEW.cost_usd_cents ELSE 0 END,
    CASE WHEN model_family = 'other' THEN NEW.cost_usd_cents ELSE 0 END,
    NEW.cost_usd_cents
  )
  ON CONFLICT (business_id, year_month) DO UPDATE SET
    sonnet_cents = aria_monthly_spend.sonnet_cents + CASE WHEN model_family = 'sonnet' THEN NEW.cost_usd_cents ELSE 0 END,
    haiku_cents = aria_monthly_spend.haiku_cents + CASE WHEN model_family = 'haiku' THEN NEW.cost_usd_cents ELSE 0 END,
    opus_cents = aria_monthly_spend.opus_cents + CASE WHEN model_family = 'opus' THEN NEW.cost_usd_cents ELSE 0 END,
    other_cents = aria_monthly_spend.other_cents + CASE WHEN model_family = 'other' THEN NEW.cost_usd_cents ELSE 0 END,
    total_cents = aria_monthly_spend.total_cents + NEW.cost_usd_cents,
    updated_at = now();
  
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_accumulate_spend ON aria_ai_calls;
CREATE TRIGGER trg_accumulate_spend
  AFTER INSERT ON aria_ai_calls
  FOR EACH ROW EXECUTE FUNCTION accumulate_monthly_spend();
```

Backfill historical data:
```sql
INSERT INTO aria_monthly_spend (business_id, year_month, sonnet_cents, haiku_cents, opus_cents, other_cents, total_cents)
SELECT 
  business_id,
  to_char(created_at, 'YYYY-MM') AS year_month,
  SUM(CASE WHEN model_id LIKE '%sonnet%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id LIKE '%haiku%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id LIKE '%opus%' THEN cost_usd_cents ELSE 0 END),
  SUM(CASE WHEN model_id NOT LIKE '%sonnet%' AND model_id NOT LIKE '%haiku%' AND model_id NOT LIKE '%opus%' THEN cost_usd_cents ELSE 0 END),
  SUM(cost_usd_cents)
FROM aria_ai_calls
WHERE business_id IS NOT NULL AND cost_usd_cents > 0
GROUP BY business_id, to_char(created_at, 'YYYY-MM')
ON CONFLICT (business_id, year_month) DO NOTHING;
```

## Budget-based routing in /api/aria/ask/route.ts

```typescript
// Before calling Anthropic, check this month's Sonnet spend
const ym = new Date().toISOString().slice(0, 7)  // '2026-05'
const { data: spend } = await supabaseAdmin
  .from('aria_monthly_spend')
  .select('sonnet_cents')
  .eq('business_id', bid)
  .eq('year_month', ym)
  .maybeSingle()

const { data: sub } = await supabaseAdmin
  .from('business_subscriptions')
  .select('sonnet_monthly_budget_cents, plan_tier')
  .eq('business_id', bid)
  .eq('status', 'active')
  .maybeSingle()

const budget = sub?.sonnet_monthly_budget_cents ?? 3000  // $30 default
const sonnetUsed = spend?.sonnet_cents ?? 0
const sonnetExhausted = sonnetUsed >= budget

// If Sonnet exhausted, downgrade to Haiku
// (Tool calls always need Sonnet — if tools required AND exhausted, still use Sonnet but flag overage)
const needsTools = /* existing tool-detection heuristic in the route */
const routedModel: 'haiku' | 'sonnet' = sonnetExhausted && !needsTools ? 'haiku' : 'sonnet'

// Telemetry
console.log('[ask-aria] route', { bid, sonnetUsed, budget, exhausted: sonnetExhausted, model: routedModel })
```

Pass `routedModel` into the Anthropic call (same as prompt 86 design, just driven
by budget instead of complexity).

## Response — let frontend know what mode it's in

In the JSON response, add:
```typescript
return NextResponse.json({
  response: finalResponse,
  /* existing fields */,
  ai_mode: routedModel,                          // 'haiku' or 'sonnet'
  sonnet_used_cents: sonnetUsed,
  sonnet_budget_cents: budget,
  sonnet_percent_used: Math.round((sonnetUsed / budget) * 100),
})
```

## Frontend — show the user what's happening

In src/app/pos/ask/page.tsx:

1. Track ai_mode/sonnet_percent_used in state from the response
2. When ai_mode === 'haiku' (budget exhausted): show a small subtle pill at the top of the chat panel:
   ```
   ⚡ Lite mode — premium AI budget hit for this month. 
   [Upgrade] for unlimited.
   ```
3. When percent_used >= 80 but < 100: show a softer banner once per session:
   ```
   You've used 80% of this month's premium AI. Aria stays available on lite mode after that.
   ```
4. Per-message indicator (small, optional): each Haiku reply gets a tiny "lite" badge in the corner. Sonnet replies are unbadged (current default).

## Admin panel — real cost visibility

### New page: /admin/ai-costs (gated to admin_users)

Three views, tab-switched:

**Tab 1 — Overview**
- Total Aria spend this month (one big number)
- Spend this month vs last month (% change)
- Top 10 spending businesses with their plan tier + budget + actual spend + over/under
- Spend by agent_key bar chart (ask_aria, daily_briefing, council, kiosk, intent_classifier, etc.) — sourced from aria_ai_calls grouped by agent_key for this month
- Spend by model_id pie chart (sonnet/haiku/opus/other)

**Tab 2 — Per business**
- Search/filter to a specific business
- Their last 30 days of spend, daily column chart
- Breakdown by agent_key for that business
- Their plan, budget, current month spend, % used
- Button: "Adjust budget" (input + save → updates business_subscriptions.sonnet_monthly_budget_cents)

**Tab 3 — Alerts**
- Businesses currently over their budget (>100% used)
- Businesses tracking to exceed budget (>80% used, with >25% of the month remaining)
- Businesses with anomalous spike (today's spend > 3× their 30-day avg) — possible runaway loop or attack

### Source SQL examples for the admin queries

```sql
-- Top 10 spenders this month
SELECT b.id, b.name, s.plan_tier, sub.sonnet_monthly_budget_cents AS budget, s.total_cents AS spent_cents
FROM aria_monthly_spend s
JOIN businesses b ON b.id = s.business_id
LEFT JOIN business_subscriptions sub ON sub.business_id = s.business_id AND sub.status = 'active'
WHERE s.year_month = to_char(now(), 'YYYY-MM')
ORDER BY s.total_cents DESC
LIMIT 10;

-- Spend by agent_key this month  
SELECT agent_key, SUM(cost_usd_cents) AS cents, COUNT(*) AS calls
FROM aria_ai_calls
WHERE created_at >= date_trunc('month', now())
GROUP BY agent_key
ORDER BY cents DESC;

-- Anomalous spike — today vs 30-day avg
WITH daily AS (
  SELECT business_id, date_trunc('day', created_at) AS d, SUM(cost_usd_cents) AS cents
  FROM aria_ai_calls
  WHERE created_at >= now() - INTERVAL '30 days'
  GROUP BY business_id, d
)
SELECT business_id, 
  SUM(CASE WHEN d = date_trunc('day', now()) THEN cents ELSE 0 END) AS today,
  AVG(cents) FILTER (WHERE d < date_trunc('day', now())) AS daily_avg
FROM daily
GROUP BY business_id
HAVING SUM(CASE WHEN d = date_trunc('day', now()) THEN cents ELSE 0 END) > 3 * AVG(cents) FILTER (WHERE d < date_trunc('day', now()))
   AND AVG(cents) FILTER (WHERE d < date_trunc('day', now())) > 50;
```

### Visualisation
Use Recharts (already a dep). Match the existing dashboard design language for charts/tables — do not introduce a new look.

## Settings — let owners see their own spend

New section on /dashboard/settings/billing or a new /dashboard/settings/ai-usage page:
- Their current month's Aria spend  
- Bar chart of last 30 days
- Breakdown by feature: Ask Aria, Daily briefings, etc.
- Current budget + % used
- Link to upgrade their plan (which auto-raises the budget)

## Rules

- The trigger on aria_ai_calls is the single source of truth — never compute spend in app code, always read from aria_monthly_spend
- Backfill historical data must run once on deploy (the migration includes it)
- Tool-heavy calls (Aria needs to call generate_report, send_sms, etc.) stay on Sonnet even when exhausted — those need tool-use reliability. Flag the overage in logs.
- The 80%/100% banner state is per-session, not per-message (don't nag every message)
- Admin panel queries must be gated to admin_users — never let a regular user view another business's spend
- npx tsc --noEmit + npm run build pass

## Commits
- "feat(db): aria_monthly_spend table + auto-accumulate trigger + backfill"
- "feat(ask-aria): budget-based Sonnet→Haiku downgrade with usage telemetry in response"
- "feat(ask-aria): frontend lite-mode pill + 80% warning banner"  
- "feat(admin): AI cost tracking dashboard at /admin/ai-costs (overview / per-business / alerts)"
- "feat(dashboard): customer-facing AI usage page at /dashboard/settings/ai-usage"
- Then: git push origin main

## If limit runs low
Priority order:
1. DB schema + trigger + backfill (do not split this commit)
2. Budget-based routing in the route (the actual cost-saver)  
3. Admin panel (you can ship without this — track spend manually for a week)
4. Customer-facing usage page (nice-to-have for launch)
Finish current commit, push, STOP.

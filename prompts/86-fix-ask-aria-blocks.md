# Prompt 86 — Ask Aria: rich blocks + cost tracking + budget-based routing

This prompt has TWO independent halves. Run them in order — they touch related
code but don't depend on each other and commit separately.

If a previous version of prompt 86 (with a hardcoded Haiku complexity-router)
was already partially run: REVERT the complexity-routing piece in
/api/aria/ask/route.ts. The new approach below is budget-based, not
complexity-based. KEEP the BlockRenderer and the data.blocks wire-up — those
are still valuable.

---

# PART A — Rich block rendering

## The bug (verified)

In `src/app/pos/ask/page.tsx`:
1. Line 21: `const SUGGESTED = [...]` — a hardcoded array of starter-prompt cards
   that render at L442 as suggestion chips. Fine for empty state, but they look
   like Aria's reply when the user actually expected a response.
2. Line 328-333: The response type declaration MISSES `blocks` entirely. Only
   `response`, `conversation_id`, `intent`, `action`, `downloads` are typed.
3. The API at /api/aria/ask actually returns `blocks: AskBlock[] | undefined`
   (see /api/aria/ask/route.ts) — but the frontend reads only `data.response`
   and silently drops `data.blocks`.
4. There's no `<BlockRenderer>` component anywhere — even if `data.blocks` were
   read, there's nothing to draw them.

End result: users see hardcoded suggestion cards on the empty state and a plain
text bubble when they ask something. The "graph cards" appearance is purely the
SUGGESTED array — never Aria's actual rich reply.

## What to build

### 1. Add `blocks` to the response type and message shape
In `src/app/pos/ask/page.tsx`:
- L328-332: update the response type to include
  `blocks?: import('@/lib/aria/ask-types').AskBlock[]`
- The `messages` state has shape `{ type, text, streaming, downloads? }`.
  Add `blocks?: AskBlock[]` to that shape.
- Wherever a message is pushed (L353, L369, L381), pass `data.blocks` through:
  `{ type: 'aria', text: reply, blocks: data.blocks, ... }`

### 2. Build a real `BlockRenderer` component
New file: `src/components/aria/BlockRenderer.tsx`

Read `src/lib/aria/ask-types.ts` to understand every block type the API returns.
Match exactly — do NOT invent new types. Common types likely include:

- `chart` — bar/line/pie via Recharts (already a dep — verify). Title above, legend, axes labels, accessible.
- `stat_grid` — 2-4 metric cards (label + big number + optional trend %). Match the existing dashboard metric-card design.
- `table` — sortable rows, plain HTML table styled to match dashboard.
- `list` — bulleted, supports clickable items if `href` present.
- `markdown` — render via react-markdown if installed, else preserve newlines.
- `callout` — info/warning/success card with an icon.
- `action_card` — title + body + 1-3 buttons that post follow-up messages back to /api/aria/ask.
- `image` — uploaded image with download link.

Unknown block types render a small `"Unsupported block: {type}"` debug pill — never crash, never silently drop.

### 3. Render blocks in message order, mixed with text
Find the message map (around L500 in page.tsx):
- Text bubble FIRST (existing behaviour)
- If `message.blocks` has length > 0: render `<BlockRenderer blocks={message.blocks} />` BELOW the text bubble in the same message group
- Width: full message column (not constrained to text bubble width)
- Spacing: 12px gap between text bubble and first block

### 4. Hide SUGGESTED once a conversation has started
The SUGGESTED cards at L442 should render ONLY when `isEmpty` is true. Check existing code — if already inside `{isEmpty && (...)}`, leave it. Otherwise wrap it.

### 5. Suggestion chips after a reply
Wire each `action_card` block button onClick to `setInput(label); send()` so tapping a suggestion sends as a new message.

### Files for Part A
- `src/app/pos/ask/page.tsx` — types, state shape, render order
- `src/components/aria/BlockRenderer.tsx` — NEW
- Verify `src/lib/aria/ask-types.ts` exists and matches API; if not, create it

### Rules for Part A
- Match EXISTING dashboard design (Financial Trust palette, same CSS vars used elsewhere in /pos/ask) — do NOT introduce a new look
- Recharts for charts (verify in package.json)
- All blocks keyboard-accessible — proper aria-labels on buttons
- Empty blocks array → render nothing extra
- npx tsc --noEmit + npm run build pass

### Commits for Part A
- "feat(ask-aria): add BlockRenderer component for chart/stat/table/callout blocks"
- "fix(ask-aria): wire data.blocks from API into rendered messages — was silently dropped"

---

# PART B — Cost tracking + budget-based Sonnet→Haiku downgrade

## Goal
Every customer gets Sonnet by default, but once they hit their plan's monthly
Sonnet budget, Aria gracefully downgrades to Haiku for the rest of the month.
Quality stays high for normal use, costs stay bounded for power users, customer
always knows what mode they're in.

Plus a real admin panel showing AI cost per business, per agent, with daily and
monthly aggregates and alerts for over-budget businesses.

## DB schema

```sql
CREATE TABLE IF NOT EXISTS aria_monthly_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  year_month text NOT NULL,             -- e.g. '2026-05'
  sonnet_cents int DEFAULT 0,
  haiku_cents int DEFAULT 0,
  opus_cents int DEFAULT 0,
  other_cents int DEFAULT 0,
  total_cents int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, year_month)
);
ALTER TABLE aria_monthly_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_spend_owner" ON aria_monthly_spend
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX idx_monthly_spend_business_month ON aria_monthly_spend(business_id, year_month);

ALTER TABLE business_subscriptions 
  ADD COLUMN IF NOT EXISTS sonnet_monthly_budget_cents int DEFAULT 3000;  -- $30 default
```

Per-plan defaults (apply at the route, since the column is one-size-fits-all otherwise):
- Starter → 1000 cents ($10)
- Growth → 3000 cents ($30)
- Pro → 8000 cents ($80)

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

Backfill historical spend (run once):
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
const ym = new Date().toISOString().slice(0, 7)
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

// Per-plan default if budget column not yet set per-business
const planDefaults: Record<string, number> = { starter: 1000, growth: 3000, pro: 8000 }
const budget = sub?.sonnet_monthly_budget_cents ?? planDefaults[sub?.plan_tier ?? ''] ?? 3000
const sonnetUsed = spend?.sonnet_cents ?? 0
const sonnetExhausted = sonnetUsed >= budget

// Tool-heavy calls always need Sonnet — Haiku tool-use reliability is lower
const needsTools = /* existing tool-trigger heuristic in the route */
const routedModel: 'haiku' | 'sonnet' = sonnetExhausted && !needsTools ? 'haiku' : 'sonnet'

console.log('[ask-aria] route', { bid, sonnetUsed, budget, exhausted: sonnetExhausted, model: routedModel })
```

Pass `routedModel` into the Anthropic call. Find every site in this route that hardcodes 'sonnet' or omits the model — update each.

## Response telemetry for the frontend

```typescript
return NextResponse.json({
  response: finalResponse,
  /* existing fields */,
  ai_mode: routedModel,
  sonnet_used_cents: sonnetUsed,
  sonnet_budget_cents: budget,
  sonnet_percent_used: Math.min(100, Math.round((sonnetUsed / budget) * 100)),
})
```

## Frontend lite-mode UX

In `src/app/pos/ask/page.tsx`:
1. Track `ai_mode` and `sonnet_percent_used` in state from each response.
2. When `ai_mode === 'haiku'` (budget exhausted) — small subtle pill at the top of the chat panel:
   ```
   ⚡ Lite mode — premium AI budget reached for this month. [Upgrade] for unlimited.
   ```
3. When `percent_used >= 80 && < 100` — softer banner, dismissible, shown once per session:
   ```
   You've used 80% of this month's premium AI. Aria stays available on lite mode after that.
   ```
4. Per-message indicator (subtle, optional): each Haiku reply gets a tiny "lite" badge in the corner. Sonnet replies are unbadged.

## Admin panel — /admin/ai-costs (gated to admin_users)

Three tabs:

**Overview**
- Total Aria spend this month (one big number)
- This month vs last month (% change)
- Top 10 spending businesses with plan tier, budget, actual spend, over/under
- Spend by agent_key bar chart for this month
- Spend by model_id pie chart

**Per business**
- Search/filter to a specific business
- Last 30 days daily column chart
- Breakdown by agent_key
- Their plan, budget, current month spend, % used
- "Adjust budget" input that updates `business_subscriptions.sonnet_monthly_budget_cents`

**Alerts**
- Businesses currently over budget (>100% used)
- Businesses tracking to exceed (>80% with >25% of month remaining)
- Businesses with anomalous spike (today's spend > 3× their 30-day avg)

### Source SQL examples

```sql
-- Top 10 spenders this month
SELECT b.id, b.name, sub.plan_tier, sub.sonnet_monthly_budget_cents AS budget, s.total_cents AS spent_cents
FROM aria_monthly_spend s
JOIN businesses b ON b.id = s.business_id
LEFT JOIN business_subscriptions sub ON sub.business_id = s.business_id AND sub.status = 'active'
WHERE s.year_month = to_char(now(), 'YYYY-MM')
ORDER BY s.total_cents DESC LIMIT 10;

-- Spend by agent_key this month
SELECT agent_key, SUM(cost_usd_cents) AS cents, COUNT(*) AS calls
FROM aria_ai_calls
WHERE created_at >= date_trunc('month', now())
GROUP BY agent_key ORDER BY cents DESC;

-- Anomalous spike
WITH daily AS (
  SELECT business_id, date_trunc('day', created_at) AS d, SUM(cost_usd_cents) AS cents
  FROM aria_ai_calls
  WHERE created_at >= now() - INTERVAL '30 days'
  GROUP BY business_id, d
)
SELECT business_id,
  SUM(CASE WHEN d = date_trunc('day', now()) THEN cents ELSE 0 END) AS today,
  AVG(cents) FILTER (WHERE d < date_trunc('day', now())) AS daily_avg
FROM daily GROUP BY business_id
HAVING SUM(CASE WHEN d = date_trunc('day', now()) THEN cents ELSE 0 END) > 3 * AVG(cents) FILTER (WHERE d < date_trunc('day', now()))
   AND AVG(cents) FILTER (WHERE d < date_trunc('day', now())) > 50;
```

Use Recharts for visualisation. Match existing dashboard design.

## Customer-facing usage page — /dashboard/settings/ai-usage

- Current month's Aria spend
- 30-day bar chart
- Breakdown by feature (Ask Aria, Daily briefings, etc.)
- Current budget + % used
- Link to upgrade plan

## Rules for Part B

- Trigger on aria_ai_calls is single source of truth — never compute spend in app code, always read aria_monthly_spend
- Backfill runs once on deploy (in the migration above)
- Tool-heavy Aria calls stay on Sonnet even when exhausted — log the overage
- 80%/100% banner is per-session, not per-message (don't nag)
- Admin panel gated to admin_users — never let a regular user view another business's spend
- npx tsc --noEmit + npm run build pass

## Commits for Part B
- "feat(db): aria_monthly_spend table + auto-accumulate trigger + backfill"
- "feat(ask-aria): budget-based Sonnet→Haiku downgrade with usage telemetry in response"
- "feat(ask-aria): frontend lite-mode pill + 80% warning banner"
- "feat(admin): AI cost dashboard at /admin/ai-costs (overview / per-business / alerts)"
- "feat(dashboard): customer-facing AI usage page at /dashboard/settings/ai-usage"

---

# Final
After all commits: `git push origin main`

## If limit runs low
Priority order across both parts:
1. Part B section 1 — DB schema + trigger + backfill (do NOT split this commit)
2. Part B section 2 — Budget-based routing (the actual cost-saver)
3. Part A — BlockRenderer + wire-up (medium-priority UX win)
4. Part B section 3 — Frontend lite-mode UX
5. Part B section 4 — Admin panel (can ship without; SQL queries work fine for a week)
6. Part B section 5 — Customer-facing usage page

Finish current commit, push, STOP, tell me where you stopped.

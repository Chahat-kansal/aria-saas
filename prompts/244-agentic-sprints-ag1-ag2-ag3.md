# CLAUDE CODE PROMPT — Aria Agentic Sprints AG-1, AG-2, AG-3

Paste each sprint section separately to Claude Code. One section at a time, in order. Build gate before every commit. RULE 0: never remove or weaken anything existing. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

# SPRINT AG-1 — Parallel Agent Orchestration

## READ FIRST (all of these, fully)
- `src/app/api/aria/ask/route.ts` — Ask Aria POST handler
- `src/lib/aria/ask/business-context.ts` — getBusinessContext / buildAskAriaContext
- `src/app/api/cron/generate-briefings/route.ts` — daily briefing generator
- `src/lib/aria/agents/orchestrator.ts` (103 lines) — existing Aria orchestrator
- `src/lib/aria-cost-guard.ts` + `src/lib/aria/cost-guard.ts` — both cost guards
- `src/lib/aria-tools.ts` — parseLLMJsonOr utility location

## VERIFIED SCHEMA (trust these, do NOT assume)
```
aria_ai_calls: agent_key(text NOT NULL), provider(text NOT NULL), role(text NOT NULL),
  model_id(text), input_tokens(int), output_tokens(int), cost_usd_cents(int),
  cache_read_tokens(int), cache_write_tokens(int), latency_ms(int),
  success(bool NOT NULL default true), error_message(text), request_summary(text),
  response_summary(text), business_id(uuid), model_provider(text default 'anthropic'),
  created_at(timestamptz)

aria_autopilot_actions: business_id(uuid NOT NULL), agent_type(text), triggered_by(text),
  status(text), title(text), description(text), action_data(jsonb), action_type(text),
  category(text), priority(text), estimated_impact(text), reasoning(text),
  confidence(numeric), summary(text), created_at(timestamptz)

aria_daily_briefings: business_id(uuid NOT NULL), briefing_date(date NOT NULL),
  content(text NOT NULL), source(text default 'realtime'), generated_at(timestamptz)
```

## NO DB MIGRATION NEEDED for this sprint.

---

## PHASE 1 — Create `src/lib/aria/parallel-orchestrator.ts`

This is the new parallel agent system. It runs Ask Aria data-fetch tasks concurrently.

```ts
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ─── Types ────────────────────────────────────────────────────────────────────
export type ParallelTask = {
  key: string          // e.g. 'sales_summary' | 'top_products' | 'low_stock' | 'staff_costs' | 'customer_signals'
  label: string        // human-readable e.g. "Sales summary"
  priority: 'high' | 'medium' | 'low'
  fn: () => Promise<string>  // returns a short text summary of findings (max 600 chars)
}

export type ParallelRunResult = {
  merged: string                // Sonnet-synthesised briefing
  task_results: Array<{ key: string; label: string; result: string | null; error: boolean; ms: number }>
  total_ms: number
  total_cost_cents: number
  actions_queued: number
}

// ─── Budget caps (cents) ──────────────────────────────────────────────────────
const BUDGET_CAPS: Record<string, number> = {
  trial: 50, starter: 50, growth: 100, pro: 200,
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
export async function runParallelAriaAgents(
  businessId: string,
  tasks: ParallelTask[],
  subscriptionTier: string = 'starter',
): Promise<ParallelRunResult> {
  const CONCURRENCY = 4 // hard cap — never more than 4 simultaneous AI/DB calls
  const budgetCap = BUDGET_CAPS[subscriptionTier] ?? 50
  let totalCostCents = 0
  const taskResults: ParallelRunResult['task_results'] = []

  // Sort: high priority first; skip low-priority tasks when over 80% of budget
  const sorted = [...tasks].sort((a, b) =>
    a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0
  )

  // Run in batches capped at CONCURRENCY
  for (let i = 0; i < sorted.length; i += CONCURRENCY) {
    const batch = sorted.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(async task => {
        // Budget guard: skip low-priority if over 80% spent
        if (task.priority === 'low' && totalCostCents > budgetCap * 0.8) {
          return { key: task.key, label: task.label, result: null, error: false, ms: 0, skipped: true }
        }
        const start = Date.now()
        try {
          const result = await task.fn()
          const ms = Date.now() - start
          // Estimate cost: each task fn may use Haiku (~$1/M input) → ~500 tokens → ~0.05 cents
          totalCostCents += 0.05
          return { key: task.key, label: task.label, result, error: false, ms }
        } catch (err) {
          return { key: task.key, label: task.label, result: null, error: true, ms: Date.now() - start }
        }
      })
    )
    for (const r of batchResults) {
      if (r.status === 'fulfilled') taskResults.push(r.value)
      else taskResults.push({ key: 'unknown', label: 'Unknown', result: null, error: true, ms: 0 })
    }
  }

  // Build merge input — include successful results, flag failed domains
  const successResults = taskResults.filter(r => r.result && !r.error)
  const failedDomains = taskResults.filter(r => r.error || (!r.result && !('skipped' in r))).map(r => r.label)
  const skippedDomains = taskResults.filter(r => ('skipped' in r)).map(r => r.label)

  const mergeInput = successResults.map(r => `[${r.label}]\n${r.result}`).join('\n\n')
    + (failedDomains.length ? `\n\n[UNAVAILABLE: ${failedDomains.join(', ')} — data could not be fetched]` : '')
    + (skippedDomains.length ? `\n\n[SKIPPED (budget): ${skippedDomains.join(', ')}]` : '')

  // Sonnet merge call
  const mergeStart = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  let merged = ''
  let mergeTokensIn = 0, mergeTokensOut = 0

  const MERGE_SYSTEM = `You are Aria, the AI business co-operator. You have just received parallel data feeds from multiple business intelligence tasks.

MANDATORY: Synthesise — do NOT concatenate. Lead with the single most important insight first. Use plain English the owner can act on. If a domain is unavailable, acknowledge the gap in one sentence and move on.

GOOD: "Your Tuesday sales dropped 18% — this lines up with the roster showing 1 fewer staff on Tuesday afternoons. Consider adding a shift."
BAD: "[Sales summary]: Tuesday was $X. [Staff costs]: costs were $Y. [Inventory]: stock is OK."

Structure: 2-3 sentence headline insight → 2-4 bullet points → 1 suggested action (or none if unclear). Max 350 words. Industry-aware. Never fabricate numbers not in the data.`

  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system: MERGE_SYSTEM,
      messages: [{ role: 'user', content: mergeInput || 'No data available for any domain.' }],
    })
    merged = res.content[0].type === 'text' ? res.content[0].text : ''
    mergeTokensIn = res.usage?.input_tokens ?? 0
    mergeTokensOut = res.usage?.output_tokens ?? 0
    // Sonnet: $3/M input + $15/M output → in cents
    const mergeCost = Math.round((mergeTokensIn / 1e6) * 300 + (mergeTokensOut / 1e6) * 1500)
    totalCostCents += mergeCost

    // Log merge call to aria_ai_calls
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId,
      agent_key: 'parallel_merge',
      provider: 'anthropic',
      model_id: 'claude-sonnet-4-5-20250929',
      model_provider: 'anthropic',
      role: 'merge',
      input_tokens: mergeTokensIn,
      output_tokens: mergeTokensOut,
      cost_usd_cents: mergeCost,
      latency_ms: Date.now() - mergeStart,
      success: true,
      request_summary: `parallel_merge/${successResults.length}_domains`,
      response_summary: merged.slice(0, 200),
    })
  } catch (err) {
    merged = successResults.map(r => `${r.label}: ${r.result}`).join('\n\n')
      || 'Unable to generate briefing — all data sources unavailable.'
  }

  // Detect action opportunities in the merged output and queue to autopilot
  let actionsQueued = 0
  const ACTION_TRIGGERS = /\b(reorder|out of stock|low on|margin drop|slow|missed|opportunity|consider|recommend)\b/gi
  if (ACTION_TRIGGERS.test(merged)) {
    try {
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id: businessId,
        agent_type: 'parallel_review',
        triggered_by: 'parallel_orchestrator',
        status: 'pending',
        title: 'Parallel briefing insight — review recommended',
        description: merged.slice(0, 400),
        action_type: 'review',
        category: 'briefing',
        priority: 'medium',
        confidence: 0.7,
        summary: `${successResults.length} data domains analysed in parallel`,
      })
      actionsQueued = 1
    } catch { /* non-fatal */ }
  }

  return {
    merged,
    task_results: taskResults,
    total_ms: taskResults.reduce((s, r) => s + r.ms, 0),
    total_cost_cents: Math.round(totalCostCents),
    actions_queued: actionsQueued,
  }
}
```

## PHASE 2 — Create task definitions: `src/lib/aria/parallel-tasks.ts`

These are the concrete task functions. Each queries real DB data and returns a short string summary. Each logs its own `aria_ai_calls` row if it uses an AI call.

```ts
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import type { ParallelTask } from './parallel-orchestrator'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

function fmt(n: number | null | undefined) {
  return '$' + (Number(n) || 0).toFixed(2)
}

export function buildBriefingTasks(businessId: string, industry: string): ParallelTask[] {
  return [
    {
      key: 'sales_summary',
      label: 'Sales summary',
      priority: 'high',
      fn: async () => {
        const today = new Date().toISOString().split('T')[0]
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
        const [todayRes, yestRes] = await Promise.all([
          supabaseAdmin.from('pos_transactions').select('total_amount').eq('business_id', businessId).gte('created_at', today),
          supabaseAdmin.from('pos_transactions').select('total_amount').eq('business_id', businessId).gte('created_at', yesterday).lt('created_at', today),
        ])
        const todayRev = (todayRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const yestRev = (yestRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const delta = yestRev > 0 ? ((todayRev - yestRev) / yestRev * 100).toFixed(1) : 'N/A'
        return `Today: ${fmt(todayRev)} (${todayRes.data?.length ?? 0} transactions). Yesterday: ${fmt(yestRev)}. Delta: ${delta}%.`
      },
    },
    {
      key: 'top_products',
      label: 'Top products',
      priority: 'high',
      fn: async () => {
        const since = new Date(Date.now() - 7 * 86400000).toISOString()
        const { data } = await supabaseAdmin.from('pos_transaction_items')
          .select('product_name, quantity, unit_price')
          .eq('business_id', businessId)
          .gte('created_at', since)
        if (!data?.length) return 'No product sales data in the last 7 days.'
        const totals: Record<string, number> = {}
        for (const item of data) {
          totals[item.product_name] = (totals[item.product_name] || 0) + Number(item.quantity || 1) * Number(item.unit_price || 0)
        }
        const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3)
        return `Top 7-day products: ${top.map(([n, v]) => `${n} (${fmt(v)})`).join(', ')}.`
      },
    },
    {
      key: 'low_stock',
      label: 'Low stock',
      priority: 'high',
      fn: async () => {
        const { data } = await supabaseAdmin.from('pos_products')
          .select('name, stock_quantity, reorder_point')
          .eq('business_id', businessId)
          .eq('is_active', true)
          .not('stock_quantity', 'is', null)
          .not('reorder_point', 'is', null)
        if (!data?.length) return 'Stock data unavailable.'
        const low = data.filter(p => Number(p.stock_quantity) <= Number(p.reorder_point))
        if (!low.length) return 'All products are adequately stocked.'
        return `${low.length} items at or below reorder point: ${low.slice(0, 4).map(p => `${p.name} (${p.stock_quantity} left)`).join(', ')}${low.length > 4 ? ` + ${low.length - 4} more` : ''}.`
      },
    },
    {
      key: 'staff_costs',
      label: 'Staff costs',
      priority: 'medium',
      fn: async () => {
        const weekStart = new Date(Date.now() - 7 * 86400000).toISOString()
        const [staffRes, salesRes] = await Promise.all([
          supabaseAdmin.from('pos_timesheets').select('hours_worked, hourly_rate').eq('business_id', businessId).gte('created_at', weekStart),
          supabaseAdmin.from('pos_transactions').select('total_amount').eq('business_id', businessId).gte('created_at', weekStart),
        ])
        const labourCost = (staffRes.data ?? []).reduce((s: number, r: { hours_worked: number; hourly_rate: number }) => s + Number(r.hours_worked || 0) * Number(r.hourly_rate || 0), 0)
        const revenue = (salesRes.data ?? []).reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
        const ratio = revenue > 0 ? ((labourCost / revenue) * 100).toFixed(1) : 'N/A'
        return `7-day labour cost: ${fmt(labourCost)}. Revenue: ${fmt(revenue)}. Labour ratio: ${ratio}%. Target: <35%.`
      },
    },
    {
      key: 'customer_signals',
      label: 'Customer signals',
      priority: 'low',
      fn: async () => {
        const since = new Date(Date.now() - 30 * 86400000).toISOString()
        const { data } = await supabaseAdmin.from('pos_customers')
          .select('id, last_visit_at, loyalty_points')
          .eq('business_id', businessId)
          .gte('created_at', since)
        if (!data?.length) return 'No recent customer data.'
        const active = data.filter(c => c.last_visit_at && new Date(c.last_visit_at) > new Date(Date.now() - 14 * 86400000)).length
        return `${data.length} customers in last 30 days. ${active} visited in last 14 days (${((active / data.length) * 100).toFixed(0)}% retention).`
      },
    },
  ]
}
```

## PHASE 3 — Wire into daily briefing generator

**File:** `src/app/api/cron/generate-briefings/route.ts`

Read the file fully first. Find where briefing content is generated. Add a parallel run path alongside the existing path (RULE 0 — keep existing path).

After the existing briefing content is generated, add:

```ts
// Import at top of file:
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'

// Inside the briefing generation loop, AFTER existing content generation:
try {
  const tasks = buildBriefingTasks(business.id, business.industry ?? 'retail')
  const parallelResult = await runParallelAriaAgents(business.id, tasks, business.subscription_tier ?? 'starter')
  
  // Write parallel briefing to aria_daily_briefings with source='parallel'
  await supabaseAdmin.from('aria_daily_briefings').upsert({
    business_id: business.id,
    briefing_date: new Date().toISOString().split('T')[0],
    content: parallelResult.merged,
    source: 'parallel',
    generated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,briefing_date' })
} catch (err) {
  // Non-fatal — existing briefing is already written
  console.error('Parallel briefing failed:', err)
}
```

## PHASE 4 — Wire into Ask Aria for multi-domain questions

**File:** `src/app/api/aria/ask/route.ts`

Read the file fully. Find the section after intent classification. Add a multi-domain path — keep the existing single-call fast path completely intact (RULE 0).

Add after intent classification (~line 715):

```ts
// Import at top:
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'

// Multi-domain detection: fire parallel agents for broad overview questions
const MULTI_DOMAIN_TRIGGERS = /\b(weekly review|full summary|how (is|are) (everything|my business)|give me (an? )?overview|how (did|am) (i|we) (do|doing)|complete briefing|all (of )?my metrics|overall (performance|status))\b/i

const isMultiDomain = intent.type === 'question' && MULTI_DOMAIN_TRIGGERS.test(message)

if (isMultiDomain) {
  try {
    const tasks = buildBriefingTasks(bid, ctx.industry ?? 'retail')
    const parallelResult = await runParallelAriaAgents(bid, tasks, ctx.subscription_tier ?? 'starter')
    
    // Mark conversation as multi_domain
    await supabaseAdmin.from('aria_conversations').update({ last_intent: 'multi_domain' }).eq('id', conversationId)
    
    // Return the merged result as the response — stream it as a normal message
    // Use the existing streaming/response path — just replace the prompt with the merged output
    // Prepend a brief framing sentence then the parallel result
    cleanResponse = `Here's your full business overview:\n\n${parallelResult.merged}`
    
    // Skip the main AI call for this turn — parallel orchestrator already synthesised
    // Jump to the save + return section (adjust based on actual code structure)
  } catch (err) {
    // Non-fatal — fall through to single-call path
    console.error('Parallel Ask Aria failed, falling back:', err)
  }
}
// [existing single-call path continues]
```

**IMPORTANT:** Do not break the streaming response. Read exactly how the existing route handles streaming/non-streaming before writing the integration. If the route streams to the client, the parallel result must be streamed too. If it returns JSON, return JSON.

## PHASE 5 — Commits and verification

**Commits (3):**
1. `feat(parallel): parallel-orchestrator.ts + parallel-tasks.ts (AG-1 foundation)`
2. `feat(parallel): wire parallel agents into daily briefing generator`
3. `feat(parallel): multi-domain Ask Aria path with parallel orchestration`

**Verification (must confirm before declaring done):**
1. `npx tsc --noEmit` + `npm run build` pass
2. Trigger the generate-briefings cron for Sip café (or call it with business_id) — query `aria_ai_calls WHERE agent_key IN ('parallel_merge', 'parallel_review')` — rows must exist
3. Query `aria_daily_briefings WHERE source='parallel' AND business_id='ff5055a0...'` — row must exist with content
4. Ask Aria "how is everything going?" — `aria_conversations` must show `last_intent='multi_domain'`
5. Confirm `aria_autopilot_actions` has a row with `triggered_by='parallel_orchestrator'`
6. Show all 5 SQL query results as evidence before declaring done

---

# SPRINT AG-2 — Task Execution Deliverables

**Depends on AG-1 being fully deployed.**

## READ FIRST (all of these, fully)
- `src/app/api/aria/ask/route.ts` — current handler (fully, post-AG-1)
- `src/lib/aria/ask/business-context.ts` — context builder
- All existing live_render / iframe / sandbox components — find them via tree search
- `src/lib/reports/weekly-pdf.ts` — the PDF generator (391 lines) — understand the SVG chart pattern
- `src/lib/aria/parallel-orchestrator.ts` + `src/lib/aria/parallel-tasks.ts` — from AG-1
- Check which charting lib is bundled: search `package.json` for 'recharts','chart.js','d3' — use ONLY what's already there, never add a second

## DB FIRST — apply this migration BEFORE writing code

```sql
-- Confirm it doesn't exist first:
SELECT table_name FROM information_schema.tables WHERE table_name='aria_task_outputs';

-- If empty, create:
CREATE TABLE public.aria_task_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid,
  conversation_id uuid,
  title text NOT NULL,
  task_prompt text NOT NULL,
  output_kind text NOT NULL DEFAULT 'dashboard'
    CHECK (output_kind IN ('dashboard','comparison','ranked_list','scorecard')),
  render_html text,
  data_snapshot jsonb DEFAULT '{}'::jsonb,
  pdf_url text,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready','generating','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aria_task_outputs ENABLE ROW LEVEL SECURITY;

-- RLS verbatim from aria_studio_assets:
CREATE POLICY "business owner access" ON public.aria_task_outputs
  FOR ALL
  USING (business_id IN (
    SELECT id FROM public.businesses WHERE user_id = auth.uid()
  ));

CREATE INDEX aria_task_outputs_biz_created_idx
  ON public.aria_task_outputs (business_id, created_at DESC);
```

**DO NOT add a hard-delete trigger** — aria_task_outputs is regenerable derived content, same category as aria_studio_assets. The protect_critical_data() trigger is reserved for irreplaceable business data only (verified).

After applying: `SELECT COUNT(*) FROM aria_task_outputs WHERE business_id != 'ff5055a0-c351-4ada-817a-1804961035f3'` — must return 0 (RLS check).

---

## PHASE 1 — Create `src/lib/aria/deliverables.ts`

```ts
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })

export type DeliverableKind = 'dashboard' | 'comparison' | 'ranked_list' | 'scorecard'

export interface DeliverableResult {
  outputId: string
  html: string
  kind: DeliverableKind
  title: string
  data_snapshot: Record<string, unknown>
}

// ─── Kind classifier ──────────────────────────────────────────────────────────
export function classifyDeliverableKind(message: string): DeliverableKind | null {
  const m = message.toLowerCase()
  if (/\b(show me|build|create|give me|dashboard|overview chart|visuali[sz]e)\b/.test(m)) return 'dashboard'
  if (/\b(compare|vs|versus|side.by.side|against|benchmark)\b/.test(m)) return 'comparison'
  if (/\b(rank|top \d+|best|worst|highest|lowest|list of)\b/.test(m)) return 'ranked_list'
  if (/\b(scorecard|kpi|performance card|how (am|are) (i|we) (doing|performing))\b/.test(m)) return 'scorecard'
  return null
}

// ─── Data fetchers (return real data, used in data_snapshot) ─────────────────
async function fetchDashboardData(businessId: string) {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()
  const [txn7, txn30, products, stock] = await Promise.allSettled([
    supabaseAdmin.from('pos_transactions').select('total_amount, created_at').eq('business_id', businessId).gte('created_at', since7d),
    supabaseAdmin.from('pos_transactions').select('total_amount').eq('business_id', businessId).gte('created_at', since30d),
    supabaseAdmin.from('pos_transaction_items').select('product_name, quantity, unit_price').eq('business_id', businessId).gte('created_at', since7d),
    supabaseAdmin.from('pos_products').select('name, stock_quantity, reorder_point').eq('business_id', businessId).eq('is_active', true).not('stock_quantity', 'is', null),
  ])
  const txn7Data = txn7.status === 'fulfilled' ? txn7.value.data ?? [] : []
  const txn30Data = txn30.status === 'fulfilled' ? txn30.value.data ?? [] : []
  const productsData = products.status === 'fulfilled' ? products.value.data ?? [] : []
  const stockData = stock.status === 'fulfilled' ? stock.value.data ?? [] : []

  const rev7 = txn7Data.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)
  const rev30 = txn30Data.reduce((s: number, r: { total_amount: number }) => s + Number(r.total_amount || 0), 0)

  // Revenue by day (last 7 days)
  const byDay: Record<string, number> = {}
  for (const t of txn7Data) {
    const day = t.created_at?.slice(0, 10) ?? ''
    byDay[day] = (byDay[day] || 0) + Number(t.total_amount || 0)
  }

  // Top products by revenue
  const prodTotals: Record<string, number> = {}
  for (const item of productsData) {
    prodTotals[item.product_name] = (prodTotals[item.product_name] || 0) + Number(item.quantity || 1) * Number(item.unit_price || 0)
  }
  const topProducts = Object.entries(prodTotals).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const lowStock = stockData.filter((p: { stock_quantity: number; reorder_point: number }) => Number(p.stock_quantity) <= Number(p.reorder_point)).length

  return { rev7, rev30, byDay, topProducts, lowStock, txCount7: txn7Data.length }
}

// ─── HTML generators (one per kind — real data wired in) ──────────────────────
function generateDashboardHTML(data: Awaited<ReturnType<typeof fetchDashboardData>>, title: string): string {
  const dayEntries = Object.entries(data.byDay).sort()
  const maxRev = Math.max(...dayEntries.map(([, v]) => v), 1)
  const barWidth = 100 / Math.max(dayEntries.length, 1)

  const bars = dayEntries.map(([day, rev]) => {
    const pct = (rev / maxRev * 100).toFixed(1)
    const label = new Date(day).toLocaleDateString('en-AU', { weekday: 'short' })
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="font-size:10px;color:#9da3aa">$${rev.toFixed(0)}</div>
      <div style="height:${pct}%;min-height:4px;width:70%;background:#7FB897;border-radius:3px 3px 0 0"></div>
      <div style="font-size:10px;color:#9da3aa">${label}</div>
    </div>`
  }).join('')

  const topProdRows = data.topProducts.map(([name, rev]) =>
    `<tr><td style="padding:6px 4px;color:#e8ecf4;font-size:12px">${name}</td><td style="padding:6px 4px;text-align:right;color:#7FB897;font-size:12px;font-variant-numeric:tabular-nums">$${rev.toFixed(2)}</td></tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}
body{background:#0d1117;color:#e8ecf4;padding:16px}
.card{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;margin-bottom:12px}
.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.value{font-size:22px;font-weight:600;color:#7FB897}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
table{width:100%;border-collapse:collapse}
th{font-size:10px;color:#8b949e;text-align:left;padding:6px 4px;border-bottom:0.5px solid rgba(255,255,255,0.08)}
</style></head><body>
<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">${title}</div>
<div class="grid">
  <div class="card"><div class="label">7-day revenue</div><div class="value">$${data.rev7.toFixed(2)}</div></div>
  <div class="card"><div class="label">30-day revenue</div><div class="value">$${data.rev30.toFixed(2)}</div></div>
  <div class="card"><div class="label">Transactions (7d)</div><div class="value">${data.txCount7}</div></div>
</div>
<div class="card">
  <div class="label" style="margin-bottom:10px">Revenue by day (last 7 days)</div>
  <div style="display:flex;align-items:flex-end;height:100px;gap:4px">${bars}</div>
</div>
<div class="card">
  <div class="label" style="margin-bottom:8px">Top products (7d)</div>
  <table><tr><th>Product</th><th style="text-align:right">Revenue</th></tr>${topProdRows}</table>
</div>
${data.lowStock > 0 ? `<div class="card" style="border-color:rgba(224,159,62,0.4)"><div class="label" style="color:#e09f3e">⚠ Low stock alert</div><div style="font-size:13px;color:#e8ecf4;margin-top:4px">${data.lowStock} product${data.lowStock > 1 ? 's' : ''} at or below reorder point</div></div>` : ''}
<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ${new Date().toLocaleDateString('en-AU')}</div>
</body></html>`
}

function generateRankedListHTML(data: Awaited<ReturnType<typeof fetchDashboardData>>, title: string): string {
  const rows = data.topProducts.map(([name, rev], i) =>
    `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:0.5px solid rgba(255,255,255,0.06)">
      <div style="width:24px;height:24px;border-radius:50%;background:${i===0?'#7FB897':i===1?'#2D5240':'#1a1f2a'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:${i<2?'#0d1117':'#9da3aa'};flex-shrink:0">${i+1}</div>
      <div style="flex:1;font-size:13px;color:#e8ecf4">${name}</div>
      <div style="font-size:13px;font-weight:600;color:#7FB897;font-variant-numeric:tabular-nums">$${rev.toFixed(2)}</div>
    </div>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}</style>
</head><body>
<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:14px">${title}</div>
<div style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px">${rows || '<div style="color:#8b949e;font-size:13px">No product data available for this period.</div>'}</div>
<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ${new Date().toLocaleDateString('en-AU')}</div>
</body></html>`
}

function generateScorecardHTML(data: Awaited<ReturnType<typeof fetchDashboardData>>, title: string): string {
  const avgTx = data.txCount7 > 0 ? data.rev7 / data.txCount7 : 0
  const labourRatio = 38 // placeholder — wire from parallel-tasks if available
  const metrics = [
    { label: 'Revenue (7d)', value: `$${data.rev7.toFixed(2)}`, status: data.rev7 > 0 ? '✓' : '—', color: '#7FB897' },
    { label: 'Transactions', value: String(data.txCount7), status: data.txCount7 > 0 ? '✓' : '—', color: '#7FB897' },
    { label: 'Avg ticket', value: `$${avgTx.toFixed(2)}`, status: avgTx > 15 ? '✓' : '↓', color: avgTx > 15 ? '#7FB897' : '#e09f3e' },
    { label: 'Low stock items', value: String(data.lowStock), status: data.lowStock === 0 ? '✓' : '⚠', color: data.lowStock === 0 ? '#7FB897' : '#e09f3e' },
  ]
  const cards = metrics.map(m => `<div style="background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${m.label}</div>
        <div style="font-size:20px;font-weight:600;color:${m.color}">${m.value}</div>
      </div>
      <div style="font-size:16px">${m.status}</div>
    </div>
  </div>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;padding:16px}</style>
</head><body>
<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">${title}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards}</div>
<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ${new Date().toLocaleDateString('en-AU')}</div>
</body></html>`
}

function generateComparisonHTML(data: Awaited<ReturnType<typeof fetchDashboardData>>, title: string): string {
  const weekly = data.rev7
  const monthlyAvgWeek = data.rev30 / 4.3
  const delta = monthlyAvgWeek > 0 ? ((weekly - monthlyAvgWeek) / monthlyAvgWeek * 100).toFixed(1) : '0'
  const positive = Number(delta) >= 0

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}body{background:#0d1117;color:#e8ecf4;padding:16px}
.col{background:#161b22;border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;flex:1}
.label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.val{font-size:20px;font-weight:600;color:#7FB897}</style>
</head><body>
<div style="font-size:14px;font-weight:600;color:#f0f0f4;margin-bottom:12px">${title}</div>
<div style="display:flex;gap:10px;margin-bottom:10px">
  <div class="col"><div class="label">This week</div><div class="val">$${weekly.toFixed(2)}</div></div>
  <div class="col"><div class="label">Avg week (30d)</div><div class="val">$${monthlyAvgWeek.toFixed(2)}</div></div>
</div>
<div style="background:#161b22;border:0.5px solid ${positive?'rgba(127,184,151,0.35)':'rgba(224,159,62,0.35)'};border-radius:10px;padding:14px;text-align:center">
  <div style="font-size:11px;color:#8b949e;margin-bottom:4px">vs 30-day weekly average</div>
  <div style="font-size:28px;font-weight:700;color:${positive?'#7FB897':'#e09f3e'}">${positive?'+':''}${delta}%</div>
</div>
<div style="font-size:10px;color:#4a5568;margin-top:8px;text-align:right">Generated by Aria OS · ${new Date().toLocaleDateString('en-AU')}</div>
</body></html>`
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generateDeliverable(
  businessId: string,
  conversationId: string | null,
  taskPrompt: string,
  kind: DeliverableKind,
  industry: string = 'retail',
): Promise<DeliverableResult> {
  const start = Date.now()

  // 1. Fetch real data
  const data = await fetchDashboardData(businessId)

  // 2. Generate title via Haiku (cheap)
  const titleRes = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{ role: 'user', content: `Write a short 4-6 word title for this deliverable. Task: "${taskPrompt}". Kind: ${kind}. Return only the title, no quotes.` }],
  })
  const title = titleRes.content[0].type === 'text' ? titleRes.content[0].text.trim() : 'Business Overview'

  // 3. Generate HTML from real data (no AI call needed — deterministic from data)
  let html = ''
  switch (kind) {
    case 'dashboard':    html = generateDashboardHTML(data, title); break
    case 'ranked_list':  html = generateRankedListHTML(data, title); break
    case 'scorecard':    html = generateScorecardHTML(data, title); break
    case 'comparison':   html = generateComparisonHTML(data, title); break
  }

  // 4. Persist to aria_task_outputs
  const { data: inserted, error } = await supabaseAdmin.from('aria_task_outputs').insert({
    business_id: businessId,
    conversation_id: conversationId,
    title,
    task_prompt: taskPrompt,
    output_kind: kind,
    render_html: html,
    data_snapshot: data as unknown as Record<string, unknown>,
    status: 'ready',
  }).select('id').single()

  if (error || !inserted) {
    throw new Error(`Failed to persist deliverable: ${error?.message}`)
  }

  // 5. Log AI call
  await supabaseAdmin.from('aria_ai_calls').insert({
    business_id: businessId,
    agent_key: 'deliverable',
    provider: 'anthropic',
    model_id: 'claude-haiku-4-5-20251001',
    model_provider: 'anthropic',
    role: kind,
    input_tokens: titleRes.usage?.input_tokens ?? 0,
    output_tokens: titleRes.usage?.output_tokens ?? 0,
    cost_usd_cents: 1,
    latency_ms: Date.now() - start,
    success: true,
    request_summary: `deliverable/${kind}`,
    response_summary: title,
  })

  return { outputId: inserted.id, html, kind, title, data_snapshot: data as unknown as Record<string, unknown> }
}
```

## PHASE 2 — Wire into Ask Aria route

**File:** `src/app/api/aria/ask/route.ts`

Read the file. Find where the final response is assembled. After intent classification, add:

```ts
import { classifyDeliverableKind, generateDeliverable } from '@/lib/aria/deliverables'

// After intent classification:
const deliverableKind = classifyDeliverableKind(message)

if (deliverableKind) {
  try {
    const result = await generateDeliverable(bid, conversationId ?? null, message, deliverableKind, ctx.industry ?? 'retail')
    // Return the deliverable inline: short text intro + the task_output_id for the UI to render
    // The cleanResponse should include a brief Aria intro sentence + signal the UI to render the iframe
    // Format: text + a sentinel the frontend can parse to render the iframe
    cleanResponse = `Here's your ${result.title}:\n\n[DELIVERABLE:${result.outputId}]\n\n${result.html.slice(0, 200)}...`
    // NOTE: read the actual response format the frontend expects before finalising this.
    // If live_render is already used, match that format exactly.
  } catch (err) {
    console.error('Deliverable generation failed, falling back to text:', err)
    // RULE 0: fall through to normal text response — never break the conversation
  }
}
```

**IMPORTANT before finalising:** Read how `live_render` blocks are currently returned in Ask Aria responses. Match that EXACT format. Do not invent a new protocol.

## PHASE 3 — Deliverables list on the Ask Aria dashboard page

Find the Ask Aria dashboard page (`src/app/dashboard/ask-aria/page.tsx` or equivalent). Add a "Recent deliverables" section that:
- Queries `aria_task_outputs WHERE business_id = [current] ORDER BY created_at DESC LIMIT 10`
- Shows title, kind badge, date
- Click → re-renders the stored `render_html` in a sandboxed iframe

## PHASE 4 — Commits and verification

**Commits (3):**
1. `feat(deliverables): aria_task_outputs migration + deliverables.ts generator (AG-2)`
2. `feat(deliverables): wire deliverable kind classifier into Ask Aria response path`
3. `feat(deliverables): recent deliverables list on Ask Aria dashboard`

**Verification (show SQL evidence before declaring done):**
1. `npx tsc --noEmit` + `npm run build` pass
2. Ask Aria "show me my top products" — `aria_task_outputs` must have a row with `output_kind='ranked_list'`, `data_snapshot` populated (not `{}`), `status='ready'`
3. Ask Aria "build a dashboard for me" — `aria_task_outputs` row with `output_kind='dashboard'`
4. `SELECT business_id, COUNT(*) FROM aria_task_outputs GROUP BY business_id` — only one business_id (RLS working)
5. `aria_ai_calls WHERE agent_key='deliverable'` — rows exist

---

# SPRINT AG-3 — Multi-Format Output

**Depends on AG-1 and AG-2 being fully deployed.**

## READ FIRST (all of these, fully)
- `src/lib/reports/weekly-pdf.ts` (391 lines) — the SVG/HTML PDF generator — reuse this pattern
- `src/lib/aria/deliverables.ts` — AG-2's generator
- `src/app/api/cron/send-scheduled-reports/route.ts` — existing scheduled reports cron
- `src/app/api/scheduled-reports/route.ts` — scheduled reports API
- `src/lib/reports/weekly-email.ts` — existing email report sender
- All SendGrid usage in the codebase
- `vercel.json` — confirm 22 functions before and after

## DB FIRST — apply this migration

```sql
-- Confirm deliverable_spec doesn't exist:
SELECT column_name FROM information_schema.columns
WHERE table_name='aria_scheduled_reports' AND column_name='deliverable_spec';

-- If empty, add:
ALTER TABLE public.aria_scheduled_reports
  ADD COLUMN IF NOT EXISTS deliverable_spec jsonb DEFAULT NULL;
-- Stores: { task_prompt: string, output_kind: string }
-- No CHECK constraint needed — verified no constraints on this table
```

## PHASE 1 — `src/lib/aria/deliverable-pdf.ts`

Reuse the HTML generation pattern from AG-2 + the SVG chart pattern from `weekly-pdf.ts`. Generate a structured PDF (NOT a screenshot) using the existing PDF lib already in the project.

**Read `package.json` first** to confirm which PDF lib is in use (puppeteer-core, jsPDF, html-pdf-node, etc.). Use ONLY that lib. Do not add a new one.

The PDF must include:
- Aria OS branded header (sage green #7FB897, business name, date range)
- KPI summary row (4 metrics: 7d revenue, transactions, avg ticket, low stock count)
- Revenue bar chart (SVG, same pattern as weekly-pdf.ts — inline SVG, not canvas)
- Top products table
- Footer: "Generated by Aria OS for [Business Name] on [date]"
- Industry-aware: café shows "covers/transactions", retail shows "units sold"

```ts
export async function exportDeliverablePdf(outputId: string, businessId: string): Promise<string> {
  // 1. Load aria_task_outputs row — check pdf_url first (idempotent)
  const { data: output } = await supabaseAdmin.from('aria_task_outputs').select('*').eq('id', outputId).eq('business_id', businessId).single()
  if (!output) throw new Error('Deliverable not found')
  if (output.pdf_url) return output.pdf_url // idempotent — already exported

  // 2. Generate PDF from render_html (use existing PDF lib)
  // ... [use whatever PDF lib is in package.json]

  // 3. Upload to Vercel Blob — use existing Blob helper
  // ... const blobUrl = await put(`deliverables/${outputId}.pdf`, pdfBuffer, { access: 'public' })

  // 4. Write pdf_url back
  await supabaseAdmin.from('aria_task_outputs').update({ pdf_url: blobUrl }).eq('id', outputId)

  return blobUrl
}
```

## PHASE 2 — Format toolbar in Ask Aria UI

**Find the Ask Aria chat component.** After every assistant message that has an associated `aria_task_outputs` row, render a toolbar below the message:

```
[📊 Chart] [📝 Summary] [⬇ Download PDF] [✉ Email] [🗓 Schedule]
```

- **Chart** — toggles showing the rendered HTML iframe vs text summary
- **Summary** — toggles to text-only view
- **Download PDF** — calls `/api/aria/deliverable-pdf` → returns download link
- **Email** — opens a modal: prefilled with owner email, sends PDF via SendGrid
- **Schedule** — opens a modal: frequency (daily/weekly), day/time, recipients → creates `aria_scheduled_reports` row

**Suppress the toolbar** on messages that have no `aria_task_outputs` row. No extra AI call.

## PHASE 3 — `/api/aria/deliverable-pdf/route.ts`

```ts
// POST { outputId: string }
// Auth: supabase session
// Returns: { pdf_url: string }
// Calls exportDeliverablePdf(), returns the Blob URL
// Logs to aria_ai_calls (agent_key: 'deliverable_pdf', role: 'export')
```

This is a NEW route. Check vercel.json — it must have exactly 22 functions after adding this. If at 22, discuss with user before adding.

## PHASE 4 — `/api/aria/deliverable-email/route.ts`

```ts
// POST { outputId: string, recipients: string[], subject?: string }
// Auth: supabase session
// 1. Call exportDeliverablePdf() to get pdf_url (idempotent)
// 2. Send via existing SendGrid helper — attach PDF, branded template
// 3. Log to aria_ai_calls (agent_key: 'deliverable_email', role: 'email')
// Returns: { sent: true }
```

Reuse the email template from `src/lib/reports/weekly-email.ts` exactly. Do not create a new template.

## PHASE 5 — Wire scheduled deliverables into existing cron

**File:** `src/app/api/cron/send-scheduled-reports/route.ts`

Read it fully. It already loops `aria_scheduled_reports` and sends reports. Add a branch for `report_type = 'deliverable'`:

```ts
// Existing loop processes daily_summary etc.
// ADD a new case — do NOT change existing cases (RULE 0):
if (report.report_type === 'deliverable' && report.deliverable_spec) {
  const spec = report.deliverable_spec as { task_prompt: string; output_kind: DeliverableKind }
  // 1. Generate fresh deliverable via generateDeliverable()
  // 2. Export to PDF via exportDeliverablePdf()
  // 3. Email to report.recipients via existing SendGrid helper
  // 4. Update last_sent_at
}
```

NO new cron entry. `vercel.json` stays at exactly 22 functions.

## PHASE 6 — Commits and verification

**Commits (4):**
1. `feat(multiformat): aria_scheduled_reports deliverable_spec migration + deliverable-pdf.ts (AG-3)`
2. `feat(multiformat): /api/aria/deliverable-pdf + /api/aria/deliverable-email routes`
3. `feat(multiformat): format toolbar in Ask Aria chat UI`
4. `feat(multiformat): wire deliverable scheduling into existing send-scheduled-reports cron`

**Verification (show evidence before declaring done):**
1. `npx tsc --noEmit` + `npm run build` pass
2. `SELECT COUNT(*) FROM information_schema.routines WHERE routine_name LIKE '%cron%'` — confirm no new cron jobs added
3. Check `vercel.json` — still exactly 22 functions
4. Export a PDF for a deliverable — `aria_task_outputs` row must have `pdf_url` set (non-null, starts with `https://`)
5. Schedule a deliverable — `aria_scheduled_reports` must have a row with `report_type='deliverable'` and `deliverable_spec` populated (not null)
6. Confirm second PDF export for same output_id returns the same URL (idempotent)

---

## WHAT ALL THREE SPRINTS TOGETHER DELIVER

After AG-1 + AG-2 + AG-3 are done and verified:

- Ask Aria "how is everything going?" → 5 agents run in parallel → Sonnet synthesises in ~3s → one coherent briefing with action queued to autopilot
- Ask Aria "show me my top products" → interactive ranked list dashboard renders inline as iframe → Download PDF button appears → Schedule button creates weekly email delivery
- The daily briefing cron runs parallel agents for all active businesses and writes a richer `source='parallel'` briefing
- Every deliverable is stored in `aria_task_outputs` for replay, audit, and scheduling

## GLOBAL RULES (apply to all three sprints)
- `cost_usd_cents` in `aria_ai_calls` is in CENTS (integer) — never dollars
- `outcome_revenue_cents` in `aria_autopilot_actions` is in CENTS
- Money in `pos_transactions.total_amount` is in DOLLARS (numeric)
- Model IDs: `claude-haiku-4-5-20251001` / `claude-sonnet-4-5-20250929` / `claude-opus-4-5-20251101`
- Never sub-daily cron schedules
- vercel.json must stay at exactly 22 functions
- Build gate before every commit
- RULE 0: never remove or weaken any existing feature

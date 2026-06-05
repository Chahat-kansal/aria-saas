# CLAUDE CODE PROMPT — Ask Aria Intelligence Upgrade (5 fixes)

Paste this whole file to Claude Code. One commit per phase. Build gate before every commit. RULE 0: never remove or weaken anything existing. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

## CRITICAL PRE-READ — verified live before writing this prompt

Read these files in full before writing a single line:
- `src/lib/aria/ask/business-context.ts` (410 lines) — context builder
- `src/lib/aria/ask/system-prompt.ts` (131 lines) — system prompt builder
- `src/lib/aria/ask/intent.ts` (108 lines) — intent classifier
- `src/lib/aria/ask/memory-writer.ts` (46 lines) — memory writer
- `src/lib/aria/memory/extract.ts` (156 lines) — memory extractor
- `src/app/api/aria/ask/route.ts` (1089 lines) — main route

### Verified live DB facts — trust these over assumptions:

**Memory system is BROKEN at the DB level (most important finding):**
- `memory-writer.ts` writes to `aria_memories` table — **DOES NOT EXIST**
- `business-context.ts` reads from `aria_business_memory` table — **DOES NOT EXIST**
- `extract.ts` writes extracted memories — also going to `aria_memories` (non-existent)
- Result: **every conversation has been memoryless since launch.** Aria never remembered anything.

**Tables that DO exist (use these):**
- `aria_outcomes` — columns: id, business_id, recommendation_type, recommendation_detail, recommended_at, acted_on (bool), acted_on_at, outcome_value_cents, notes, action_id, baseline_metric_cents, outcome_7d_cents, outcome_30d_cents, outcome_checked_at, outcome_verdict (text), category, advice_weight_delta (numeric)
- `aria_advice_weights` — columns: id, business_id, category, weight (numeric), positive_outcomes (int), negative_outcomes (int), neutral_outcomes (int), last_updated_at
- `aria_hypotheses` — columns: id, business_id, title, description, category, predicted_impact_cents, predicted_impact_label, risk_level, confidence (numeric), evidence_summary, evidence_payload (jsonb), status, generated_at, expires_at, accepted_at, rejected_at, rejection_reason, action_id, baseline_metric_cents, outcome_7d_cents, outcome_30d_cents, outcome_checked_at, outcome_verdict
- `aria_business_memory` — **DOES NOT EXIST** (needs migration — see Phase 4)
- `aria_conversations`, `aria_action_log`, `aria_ai_calls`, `aria_signal_cache` — all exist

**Intent routing (live, confirmed):**
- `intent.type` = 'question' | 'file_export' | 'troubleshoot' | 'escalate' | 'smalltalk' | 'technical'
- `intent.complexity` = 'simple' | 'complex'
- thinking enabled for: troubleshoot, escalate, complex (budget 2000 for complex, 4000 for escalate)
- model: haiku for simple, sonnet for complex/troubleshoot/technical

---

## PHASE 1 — Fix the broken memory system (highest priority — zero risk)

The memory system architecture is correct — the DB tables are just missing. Fix before anything else.

### 1.1 Create `aria_business_memory` table (migration)

```sql
-- Run this migration FIRST. Check if it exists before running:
SELECT table_name FROM information_schema.tables WHERE table_name='aria_business_memory';
-- If empty result, create it:

CREATE TABLE aria_business_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('preference','fact','tried','decision','concern','goal')),
  content text NOT NULL,
  topic text,
  importance numeric NOT NULL DEFAULT 0.7 CHECK (importance >= 0 AND importance <= 1),
  confidence numeric NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL DEFAULT 'ask_aria_conversation',
  is_active boolean NOT NULL DEFAULT true,
  last_referenced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE aria_business_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON aria_business_memory
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX idx_aria_business_memory_business ON aria_business_memory(business_id, is_active, importance DESC);
```

### 1.2 Fix `memory-writer.ts` — point at the correct table

Change every `.from('aria_memories')` → `.from('aria_business_memory')`. That's it. The rest of the logic is correct.

### 1.3 Fix `extract.ts` — point at the correct table

Find every Supabase write targeting `aria_memories` → change to `aria_business_memory`. Verify the columns being written match the new table schema (id, business_id, kind, content, topic, importance, confidence, source, is_active).

### 1.4 Verify the read works

`business-context.ts` line ~294 already reads from `aria_business_memory` with the correct column list (`id, kind, content, topic, importance`). After the migration, this will start returning real data. No code change needed here.

**Commit:** `fix(memory): create aria_business_memory table + fix write targets (memory was silently broken)`

**Acceptance:** after a conversation, query `SELECT * FROM aria_business_memory WHERE business_id = '[sip-cafe-id]' LIMIT 5` — rows should appear. Next conversation should receive memories in context.

---

## PHASE 2 — Dynamic context loading

**Problem:** `buildAskAriaContext` loads 25+ data points for every question regardless of what was asked. "What's my bank balance?" loads top customers, loyalty stats, BAS data, staff rosters, purchase orders, etc. This wastes context space and dilutes relevance.

**File:** `src/lib/aria/ask/business-context.ts`

### 2.1 Create a `ContextScope` type

Add at the top of `business-context.ts`:
```ts
export type ContextScope =
  | 'revenue'      // sales, transactions, revenue snapshots, predictions
  | 'inventory'    // products, stock, purchase orders, suppliers
  | 'staff'        // staff, timesheets, rosters, labour
  | 'customers'    // customers, loyalty, reviews, reputation
  | 'finance'      // BAS, cashflow, expenses, bank balance
  | 'marketing'    // competitors, campaigns, SEO
  | 'full'         // everything (used for: escalate, complex cross-domain questions)
```

### 2.2 Add `inferScope` function

```ts
export function inferScope(intent: { type: string; complexity?: string }, message: string): ContextScope {
  const m = message.toLowerCase()

  // Always full for escalate or complex cross-domain
  if (intent.type === 'escalate') return 'full'
  if (intent.type === 'troubleshoot') return 'full'

  // Revenue signals
  if (/revenue|sales|transaction|money|income|profit|margin|takings|till|eftpos|cash|daily|weekly|monthly|tuesday|wednesday|slow day|busy day|peak|quiet/i.test(m)) return 'revenue'

  // Inventory signals
  if (/stock|product|inventory|reorder|supplier|order|purchase|item|sku|low stock|out of|shelf|menu/i.test(m)) return 'inventory'

  // Staff signals
  if (/staff|roster|shift|hours|wage|employee|hire|fire|leave|timesheet|labour|labor|team|barista|manager/i.test(m)) return 'staff'

  // Customer signals
  if (/customer|loyalty|review|google|rating|feedback|repeat|churn|member|points|returning|new customer/i.test(m)) return 'customers'

  // Finance signals
  if (/bas|gst|tax|super|payg|invoice|expense|cost|cash.?flow|bank|balance|budget|profit.*loss|p&l/i.test(m)) return 'finance'

  // Marketing signals
  if (/competitor|seo|social|instagram|tiktok|campaign|promotion|ad|marketing|google.*business|rank/i.test(m)) return 'marketing'

  // Default: if complex, load full; if simple, load revenue (most common question type)
  return intent.complexity === 'complex' ? 'full' : 'revenue'
}
```

### 2.3 Make `buildAskAriaContext` scope-aware

Change the function signature:
```ts
export async function buildAskAriaContext(
  businessId: string,
  conversationId?: string,
  scope: ContextScope = 'full',    // ADD this parameter
): Promise<AskAriaContext>
```

Then wrap each data-loading group in a scope check. Keep the existing Promise.all structure but gate expensive queries:

```ts
// Always load (needed for every response):
// - business basics (name, industry, city, owner)
// - revenue_today/week/month (tiny query, always useful)
// - memories (already lightweight)
// - conversation history

// Load only when scope matches:
const loadInventory = scope === 'inventory' || scope === 'full'
const loadStaff     = scope === 'staff'     || scope === 'full'
const loadCustomers = scope === 'customers' || scope === 'full'
const loadFinance   = scope === 'finance'   || scope === 'full'
const loadMarketing = scope === 'marketing' || scope === 'full'
const loadRevenue   = scope === 'revenue'   || scope === 'full'

// Gate each Promise.all group:
// - low_stock_items, pending_purchase_orders, top_products → only if loadInventory
// - staff_count, staff_on_shift_today → only if loadStaff
// - top_customers_month, loyalty_stats → only if loadCustomers
// - bas_current_quarter → only if loadFinance
// - competitor_intelligence → only if loadMarketing
// - prediction, hourly breakdown → only if loadRevenue
// Return null/[] for unloaded fields — they already have defaults in AskAriaContext
```

### 2.4 Wire scope into the ask route

In `src/app/api/aria/ask/route.ts`, after intent classification (~line 715), derive the scope and pass it:

```ts
// After: const intent = await classifyIntent(message, ...)
const { inferScope } = await import('@/lib/aria/ask/business-context')
const scope = inferScope(intent, message)
const ctx = await buildAskAriaContext(bid, conversationId, scope)
```

**Commit:** `feat(ask-aria): dynamic context loading — scope-aware context reduces noise + cost`

**Acceptance:** ask "how are my sales today?" and confirm (via aria_ai_calls input_tokens) that token count is lower than before. Ask a cross-domain question ("why is profit down and should I cut staff?") and confirm it loads full context.

---

## PHASE 3 — Tiered thinking budget (conservative launch, scales with revenue)

**Files:** `src/app/api/aria/ask/route.ts` + `src/lib/aria/ask/business-context.ts`

### 3.1 Cost analysis (verified before writing this)
Extended thinking tokens are billed as Sonnet output tokens ($15/million).
- Current budget: 2000 tokens → ~$0.03 added per complex call
- 4k budget:     4000 tokens → ~$0.06 added per complex call (+$0.03)
- 12k budget:   12000 tokens → ~$0.18 added per complex call (+$0.15)

At launch with pre-revenue users: use 4k max (doubles quality, cost is ~$2.96/customer/month vs $1.61 current — sustainable at $297/month plan pricing). Once paying customers are in, ramp the Pro tier to 16k via the tier map below.

### 3.2 Add tier-based budget constants

In `src/app/api/aria/ask/route.ts`, add near the top of the request handler (after `ctx` is available):

```ts
// Tiered thinking budgets — indexed by subscription_tier from ctx
// Launch: all tiers capped at 4k (conservative). Raise per-tier after first paying customers.
const THINKING_BUDGETS: Record<string, number> = {
  trial:   4000,   // 14-day trial — same as starter, prove value
  starter: 4000,   // $297/mo — double current, safe launch budget
  growth:  4000,   // $597/mo — same for now, raise to 8000 post-launch
  pro:     4000,   // $997/mo — same for now, raise to 16000 post-launch
}
const tierBudget = THINKING_BUDGETS[ctx.subscription_tier ?? 'trial'] ?? 4000
```

**IMPORTANT:** these are intentionally all 4000 at launch. After you have paying customers and can watch `aria_ai_calls` cost per tier for a week, run this single-line change to unlock higher tiers:
```ts
// Post-launch upgrade (one commit when ready):
growth: 8000,
pro:    16000,
```
Do NOT ship the higher values at launch. Ship 4000 across the board.

### 3.3 Replace the thinking budget lines

Find the thinking budget section (~line 879–880). Replace:

```ts
// CURRENT:
const useThinking = routedModel !== 'haiku' && (intent.complexity === 'complex' || intent.type === 'troubleshoot' || intent.type === 'escalate')
const thinkingBudget = intent.type === 'escalate' ? 4000 : 2000

// REPLACE WITH:
const useThinking = routedModel !== 'haiku' && (
  intent.complexity === 'complex' ||
  intent.type === 'troubleshoot' ||
  intent.type === 'escalate'
)

// Thinking budget scales by subscription tier (see THINKING_BUDGETS above).
// Intent-specific caps: escalate and troubleshoot get the full tier budget;
// complex questions get the tier budget; simple stays at 0 (no thinking).
const thinkingBudget = (() => {
  if (!useThinking) return 0
  // All capped at tierBudget (max 4000 at launch)
  if (intent.type === 'escalate')    return tierBudget
  if (intent.type === 'troubleshoot') return tierBudget
  if (intent.complexity === 'complex') return tierBudget
  return 0
})()

// Raise maxTokens to accommodate thinking output — thinking tokens count against maxTokens
// Find the maxTokens assignment (~line 933) and add after it:
// if (useThinking) maxTokens = Math.max(maxTokens, thinkingBudget + 2000)
```

### 3.4 Log tier + budget to aria_ai_calls

After the thinking budget is set, add to the metadata passed to the AI call (so you can monitor cost by tier in the DB):
```ts
// Include in the callAnthropicWithTools params or as a comment in the log:
// agentKey: 'ask_aria', role: 'chat' — already set
// Add thinking_budget to the request_summary so aria_ai_calls captures it:
// request_summary: `intent:${intent.type}/complexity:${intent.complexity}/thinking:${thinkingBudget}/tier:${ctx.subscription_tier}`
```

**Commit:** `feat(ask-aria): tiered thinking budget — 4k at launch across all plans, scalable post-revenue`

**Acceptance:**
- Ask a strategy question — response should show noticeably more reasoned output than the current 2000-token budget allows.
- Query `aria_ai_calls WHERE agent_key='ask_aria'` — confirm `output_tokens` includes thinking tokens (will be higher than before).
- Confirm `aria_daily_spend` stays well under $5.00 ceiling for a heavy test user (50 questions, 30% complex).
- Confirm the `THINKING_BUDGETS` object is the only place to change when ramping up post-launch — no other hardcoded values.

---

## PHASE 4 — Decision-outcome memory

This is the most impactful long-term improvement. When Aria makes a recommendation, it should later check whether it worked — and use that to inform future advice.

### 4.1 `aria_outcomes` is already the right table

Verified columns: recommendation_type, recommendation_detail, recommended_at, acted_on, baseline_metric_cents, outcome_7d_cents, outcome_30d_cents, outcome_verdict, category, advice_weight_delta.

`aria_advice_weights` is the aggregated learning: per category, how often has Aria's advice worked?

### 4.2 Write outcomes when Aria makes a recommendation

In `src/lib/aria/ask/memory-writer.ts`, add a new export alongside `maybeWriteMemory`:

```ts
export async function maybeWriteOutcome(
  businessId: string,
  assistantResponse: string,
  intentType: string,
  currentRevenueCents: number,  // pass from ctx.revenue_today_cents * 100 (already in dollars, convert)
): Promise<void> {
  // Only track outcomes for question/complex responses that contain a recommendation
  if (!['question'].includes(intentType)) return

  // Detect recommendation patterns — does the response contain an explicit "I recommend", "you should", "consider", "suggest"?
  const hasRecommendation = /\b(recommend|suggest|consider|should|try|worth|could|opportunity|increase|decrease|raise|lower|hire|cut|drop|add|remove)\b/i.test(assistantResponse)
  if (!hasRecommendation) return

  // Extract the category from the response content
  const categoryMap: Array<[RegExp, string]> = [
    [/price|pricing|margin/i, 'pricing'],
    [/staff|roster|hire|labour/i, 'staff'],
    [/stock|inventory|reorder|supplier/i, 'inventory'],
    [/customer|loyalty|review|marketing/i, 'customers'],
    [/hours|open|close|trading/i, 'hours'],
    [/cash.?flow|expense|bas|tax/i, 'cashflow'],
  ]
  let category = 'general'
  for (const [pattern, cat] of categoryMap) {
    if (pattern.test(assistantResponse)) { category = cat; break }
  }

  // Store the recommendation for outcome tracking
  // The cron job (or a future check) will fill in outcome_7d/30d
  void supabaseAdmin.from('aria_outcomes').insert({
    business_id: businessId,
    recommendation_type: intentType,
    recommendation_detail: assistantResponse.slice(0, 500), // first 500 chars
    recommended_at: new Date().toISOString(),
    acted_on: false,
    baseline_metric_cents: currentRevenueCents,
    category,
  }).then(() => {}).catch(() => {}) // fire-and-forget, never throws
}
```

### 4.3 Surface outcomes in context

In `buildAskAriaContext`, add a query for recent outcomes with verdicts:

```ts
const { data: outcomeRows } = await supabaseAdmin
  .from('aria_outcomes')
  .select('recommendation_detail, category, outcome_verdict, outcome_7d_cents, baseline_metric_cents, recommended_at')
  .eq('business_id', businessId)
  .not('outcome_verdict', 'is', null)  // only ones that have been measured
  .order('recommended_at', { ascending: false })
  .limit(5)
```

Add to `AskAriaContext`:
```ts
recent_outcomes: Array<{
  recommendation_detail: string
  category: string
  outcome_verdict: string        // 'positive' | 'negative' | 'neutral'
  outcome_7d_cents: number | null
  baseline_metric_cents: number | null
  recommended_at: string
}>
```

### 4.4 Add outcomes to system prompt

In `system-prompt.ts`, add a section after the existing `weightsBlock`:

```ts
const outcomesBlock = ctx.recent_outcomes && ctx.recent_outcomes.length > 0
  ? `\n## What Aria advised recently and what happened\n` +
    ctx.recent_outcomes.map(o => {
      const delta = o.outcome_7d_cents && o.baseline_metric_cents
        ? ` (revenue ${o.outcome_7d_cents > o.baseline_metric_cents ? '+' : ''}${Math.round((o.outcome_7d_cents - (o.baseline_metric_cents || 0)) / 100)} in 7d)`
        : ''
      return `- [${o.category}] ${o.recommendation_detail.slice(0, 120)}... → ${o.outcome_verdict}${delta}`
    }).join('\n') +
    `\n\nUse this to calibrate your current advice. If a similar recommendation was negative, say so and explain what to do differently this time.`
  : ''
```

### 4.5 Wire `maybeWriteOutcome` into the ask route

In `src/app/api/aria/ask/route.ts`, after the main response is generated, add:
```ts
// After cleanResponse is computed, fire-and-forget:
waitUntil(maybeWriteOutcome(bid, cleanResponse, intent.type, ctx.revenue_today_cents * 100))
```

**Commit:** `feat(ask-aria): decision-outcome memory — Aria tracks what it recommended and whether it worked`

---

## PHASE 5 — Chain-of-thought forcing for strategy questions

**File:** `src/app/api/aria/ask/route.ts`

### 5.1 Detect strategy questions

In the intent classification section (after `classifyIntent`), add a local detector:

```ts
const STRATEGY_TRIGGERS = /\b(should i|should we|is it worth|help me decide|what would happen|what if i|what if we|is it a good idea|do you think i should|recommend|advice on|strategy for|how do i grow|how should i|ought to|better to|worth it)\b/i

const isStrategyQuestion = intent.type === 'question' &&
  intent.complexity === 'complex' &&
  STRATEGY_TRIGGERS.test(message)
```

### 5.2 Add chain-of-thought addendum for strategy questions

In `system-prompt.ts`, add a new export:

```ts
export function buildStrategyAddendum(question: string): string {
  return `
## MANDATORY REASONING SEQUENCE FOR THIS QUESTION
The owner is asking a strategic decision question. Before giving your recommendation, work through these 5 steps — show them briefly in your response:

**1. What does the DATA show?** (numbers only — no opinions yet)
**2. What is the ONE root cause or driver behind this situation?**
**3. Biggest risk of taking action:**
**4. Biggest risk of doing nothing:**
**5. What information would change your answer if you had it?**

THEN give your recommendation.

Do not skip steps. Do not merge steps. Each step = one concrete sentence from the data.
After the 5 steps, give a clear recommendation: "Based on this, I recommend X because Y."

The owner asked: "${question.slice(0, 200)}"
`
}
```

### 5.3 Wire into the ask route

In the system prompt assembly section (after line ~730 where troubleshoot addendum is added):

```ts
// After troubleshoot addendum block:
if (isStrategyQuestion) {
  systemPrompt += buildStrategyAddendum(message)
}
```

### 5.4 Also add to the main system prompt permanently

In `system-prompt.ts` in `buildSystemPrompt`, find the HOW YOU THINK section (already exists). Add after the existing 5-step thinking block:

```ts
## FOR STRATEGY QUESTIONS — ADDITIONAL RULES
If the owner is asking "should I", "is it worth", "help me decide":
- NEVER give a recommendation without first stating the relevant numbers
- ALWAYS name the single biggest risk on both sides
- If you'd give different advice depending on unknown information, SAY SO: "This depends on whether X — if yes, do A; if no, do B"
- NEVER say "it depends" as a complete answer — that is a non-answer. "It depends on X, and here's how to find out" is acceptable.
```

**Commit:** `feat(ask-aria): chain-of-thought forcing for strategy questions — structured 5-step reasoning`

---

## PHASE 6 — Verification pass

For complex and strategy questions, after generating the main response, run a fast Haiku check that flags obvious problems before returning to the user.

**File:** `src/app/api/aria/ask/route.ts`

### 6.1 Add the verifier

```ts
async function verifyResponse(
  response: string,
  businessData: { revenue_today_cents: number; revenue_week_cents: number },
  question: string,
): Promise<{ verified: boolean; issues: string[]; patched_response?: string }> {
  try {
    const result = await callAnthropic({
      model: 'haiku', // cheap — just a checker
      systemPrompt: `You are a fact-checker for an AI business assistant. Given the business data and the AI's response, identify any of these problems:
1. A number in the response that contradicts the data
2. A recommendation that directly contradicts itself  
3. A claim that is impossible given the data (e.g. "revenue is up 20%" when data shows it's down)
4. A statement that is dangerously vague for a business decision ("it depends" with no further guidance)

Return JSON only: {"issues": ["specific issue 1", ...], "safe": true/false}
If no issues, return {"issues": [], "safe": true}`,
      userPrompt: `Business data: today_revenue=$${(businessData.revenue_today_cents/100).toFixed(2)}, week_revenue=$${(businessData.revenue_week_cents/100).toFixed(2)}
Owner asked: "${question.slice(0,200)}"
AI responded: "${response.slice(0,1500)}"`,
      maxTokens: 300,
      agentKey: 'ask_aria_verifier',
      role: 'verification',
    })
    const parsed = result.data as { issues?: string[]; safe?: boolean }
    return {
      verified: parsed.safe !== false,
      issues: parsed.issues ?? [],
    }
  } catch {
    return { verified: true, issues: [] } // verifier failure never blocks response
  }
}
```

### 6.2 Wire into route — only for complex + strategy questions

After `cleanResponse` is computed (before saving conversation), add:

```ts
// Verification pass — only for complex/strategy, never blocks response
if ((intent.complexity === 'complex' || isStrategyQuestion) && cleanResponse.length > 200) {
  try {
    const verification = await verifyResponse(cleanResponse, {
      revenue_today_cents: ctx.revenue_today_cents,
      revenue_week_cents: ctx.revenue_week_cents,
    }, message)

    if (!verification.verified && verification.issues.length > 0) {
      // Append a caveat rather than regenerating (faster, safer)
      cleanResponse += `\n\n*Note: I want to flag some uncertainty in the above — ${verification.issues[0].toLowerCase()}. Please verify this against your own records before acting.*`
    }
  } catch { /* non-fatal — verifier never blocks */ }
}
```

**Commit:** `feat(ask-aria): Haiku verification pass for complex/strategy responses — catches contradictions`

---

## PHASE 7 — VERIFICATION (must pass before declaring done)

1. `npx tsc --noEmit` + `npm run build` pass.
2. **Memory fix:** start a conversation with Sip café, say "we always close Mondays." Then start a new conversation and ask "what do you know about us?" — Aria should recall the Monday closure. Query `aria_business_memory` directly to confirm rows exist.
3. **Dynamic context:** check `aria_ai_calls` table — `input_tokens` for a simple revenue question should be lower than before. A cross-domain complex question should have higher input_tokens (full context).
4. **Thinking budget:** ask "should I drop my Monday shift given it's always slow?" — response should be more reasoned than before. Then query `aria_ai_calls WHERE agent_key='ask_aria'` and confirm: (a) `output_tokens` is higher on this complex call (thinking tokens are billed as output), (b) `request_summary` contains `thinking:4000`, (c) the budget never exceeded 4000. Confirm `aria_daily_spend` stays under $5.00 for a heavy test session. **Do NOT change THINKING_BUDGETS values above 4000 until first paying customers are live — the tier escalation is a post-launch task.**
5. **Decision outcomes:** after a response with a recommendation, query `aria_outcomes` — a row should appear with `recommendation_detail` populated and `acted_on: false`.
6. **Chain-of-thought:** ask a strategy question — response must show the 5 numbered steps before the recommendation. No step may be skipped.
7. **Verification pass:** ask a question with a deliberately weird premise ("assuming my revenue doubled yesterday, should I...") — Aria should append a caveat noting the inconsistency.
8. Confirm no existing feature/tab/route removed or weakened.

## ORDER
Phase 1 (fix broken memory — MUST be first) → Phase 2 (dynamic context) → Phase 3 (thinking budget) → Phase 4 (decision outcomes) → Phase 5 (chain-of-thought) → Phase 6 (verification pass) → Phase 7 (verify all). Stop and flag if anything contradicts live code.

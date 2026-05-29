# Prompt 102 — Ask Aria cost router: Haiku first, Sonnet only when needed

## What this fixes

Right now Ask Aria uses Sonnet by default for EVERY message. Sonnet costs
~$3 per million input tokens, ~$15 per million output tokens.

With live_render (prompt 101) now generating complex HTML, token counts per
message are going up. This makes the current "Sonnet first" logic actively
harmful to the cost structure.

The fix: flip the default. **Haiku first. Sonnet only when genuinely needed.**

Haiku costs ~$0.25 per million input tokens, ~$1.25 per million output tokens.
That is 12x cheaper on input, 12x cheaper on output.

For most Ask Aria questions (charts, emails, simple analysis, advice, writing
tasks, simple data lookups) Haiku is more than capable.

Sonnet is only needed when:
- The question requires multi-step reasoning across many data sources
- The question asks Aria to generate complex live_render HTML with calculations
- The owner is doing deep business strategy analysis
- The intent classifier says complexity = "complex"

Opus is only needed for:
- Explicit escalation requests
- Keep this as-is — it is correct

## TASK 1 — Rewrite the model routing logic

In `src/app/api/aria/ask/route.ts`, find the budget-based model routing
section (around line 618). Replace the entire routing block with:

```typescript
// ── Cost-optimised model routing ─────────────────────────────────────────
// Haiku first by default. Escalate to Sonnet only for genuinely complex
// requests. Opus only for explicit escalation. This is 12x cheaper than
// the previous "Sonnet first" logic while maintaining output quality for
// the vast majority of questions.

const ym = new Date().toISOString().slice(0, 7)
const [{ data: spend }, { data: sub }] = await Promise.all([
  supabaseAdmin.from('aria_monthly_spend').select('sonnet_cents, haiku_cents').eq('business_id', bid).eq('year_month', ym).maybeSingle(),
  supabaseAdmin.from('business_subscriptions').select('sonnet_monthly_budget_cents, tier').eq('business_id', bid).eq('status', 'active').maybeSingle(),
])

// Monthly Sonnet budget — used as a hard cap, not as the default
const planDefaults: Record<string, number> = { starter: 1000, growth: 3000, pro: 8000 }
const sonnetBudget = sub?.sonnet_monthly_budget_cents ?? planDefaults[sub?.tier ?? ''] ?? 3000
const sonnetUsed = spend?.sonnet_cents ?? 0
const sonnetExhausted = sonnetUsed >= sonnetBudget

// Signals that this request genuinely needs Sonnet
const needsSonnet =
  intent.complexity === 'complex' ||           // intent classifier says complex
  intent.type === 'troubleshoot' ||            // technical troubleshooting
  attachments.length > 0 ||                   // image/document analysis
  /(live.?render|generate.?html|heatmap|complex.?chart|analysis|compare.*week|
     profit.*if|what.*happen|should.*hire|strategy|forecast|predict|
     multi.?step|deep.?dive|breakdown|reconcil|cash.?flow.*analysis)/i.test(message)

// Signals that even Haiku needs to be careful (bigger context window needed)
const needsTools =
  /(export|download|report|spreadsheet|csv|pdf|send|sms|email|restock|
     reorder|purchase.?order|schedule|roster|invoice|generate|create|
     update|set.?price|change.?price)/i.test(message) ||
  attachments.length > 0

let routedModel: 'haiku' | 'sonnet' | 'opus'

if (intent.type === 'escalate') {
  routedModel = 'opus'                         // explicit escalation only
} else if (sonnetExhausted) {
  routedModel = 'haiku'                        // hard cap — never go over budget
} else if (needsSonnet) {
  routedModel = 'sonnet'                       // genuinely complex — use Sonnet
} else {
  routedModel = 'haiku'                        // default — most messages
}

console.log('[ask-aria] route', {
  bid,
  sonnetUsed,
  budget: sonnetBudget,
  exhausted: sonnetExhausted,
  needsSonnet,
  model: routedModel,
  intent: intent.type,
  complexity: intent.complexity,
})
```

## TASK 2 — Tune max_tokens by model

Haiku is fast and cheap but has a smaller effective context. Set appropriate
token limits by model:

Find the callAnthropicWithTools call (around line 700). Update maxTokens:

```typescript
// Token limits by model — Haiku is fast, Sonnet has more capacity
const maxTokens = routedModel === 'haiku'
  ? (needsTools ? 2000 : 1500)     // Haiku: tight limit, still enough for charts + emails
  : routedModel === 'sonnet'
  ? (useThinking ? 4096 : 3500)    // Sonnet: generous, supports live_render HTML generation
  : 4096                            // Opus: maximum

const toolResult = await callAnthropicWithTools({
  model: routedModel,
  systemPrompt,
  userPrompt,
  priorMessages: historyMessages,
  tools: allTools,
  executeTool: (name, input) => executePOSTool(name, input, bid),
  maxTokens,                        // use the model-appropriate limit
  maxIterations: routedModel === 'haiku' ? 4 : 8,  // Haiku: fewer iterations
  thinking: useThinking ? { enabled: true, budget_tokens: thinkingBudget } : undefined,
  timeoutMs: routedModel === 'haiku' ? 30_000 : 55_000,  // Haiku times out faster
})
```

## TASK 3 — Track Haiku spend separately (already works, just verify)

The aria_monthly_spend table already has haiku_cents column. The existing
cost tracking (aria_ai_calls insert + aria_monthly_spend trigger) already
tracks Haiku separately. Just verify the trigger correctly identifies the
model from model_id and routes to haiku_cents vs sonnet_cents.

If not, the trigger should check:
```sql
-- In the trigger that updates aria_monthly_spend
haiku_cents = haiku_cents + CASE WHEN NEW.model_id LIKE '%haiku%' THEN NEW.cost_usd_cents ELSE 0 END,
sonnet_cents = sonnet_cents + CASE WHEN NEW.model_id LIKE '%sonnet%' THEN NEW.cost_usd_cents ELSE 0 END,
opus_cents = opus_cents + CASE WHEN NEW.model_id LIKE '%opus%' THEN NEW.cost_usd_cents ELSE 0 END,
```

## TASK 4 — Add a cost indicator to the Ask Aria UI

In the Ask Aria frontend, after each response, show a tiny indicator of what
model was used. Owners appreciate transparency. It also validates the routing
is working correctly.

The API response already returns `intent` and the model is logged — add
`model_used: routedModel` to the JSON response.

In the UI, below each Aria response bubble, show a tiny pill:
- Haiku responses: "⚡ Fast response" (no model name needed — just signals speed)
- Sonnet responses: "🧠 Deep analysis"
- Opus responses: "🔬 Expert analysis"

This helps the owner understand why some responses are faster than others
without exposing the underlying model names.

## Expected cost impact

Assume 50 Ask Aria messages per active business per month.
Before this change (all Sonnet):
  50 msgs × ~2000 tokens avg × $3/1M = ~$0.30 per business per month input
  50 msgs × ~800 tokens output × $15/1M = ~$0.60 per business per month output
  Total: ~$0.90/business/month just for Ask Aria

After this change (~80% Haiku, ~20% Sonnet):
  40 Haiku × 2000 tokens × $0.25/1M = $0.02 input
  40 Haiku × 800 tokens × $1.25/1M = $0.04 output
  10 Sonnet × 2000 tokens × $3/1M = $0.06 input
  10 Sonnet × 800 tokens × $15/1M = $0.12 output
  Total: ~$0.24/business/month — 73% cheaper

At 100 active businesses: saves ~$66/month.
At 1000 active businesses: saves ~$660/month.
This is a real number that matters for unit economics.

## Rules
- npx tsc --noEmit + npm run build pass before commit
- The routing logic is the only thing changing — do not touch the system
  prompt, tools, or response format
- The "needsSonnet" regex should be conservative — when in doubt, Haiku
  handles it fine. Sonnet is NOT needed for: simple data lookups, basic
  charts, emails, advice, plain text answers
- git push origin main after commit

## Commit
"feat(ask-aria): cost router — Haiku first by default, Sonnet only for complex requests (73% cheaper)"

## After this ships — test these in Ask Aria
These should all use Haiku (fast, cheap):
- "What are my top 5 products this month?"
- "Write me an email to lapsed customers"
- "Show me a bar chart of daily sales"
- "What are my GST obligations?"
- "How do I connect my Xero?"

These should escalate to Sonnet:
- "Compare this month vs last month and tell me what changed and why"
- "What would happen to my profit if I raised all prices by 10%?"
- "Generate a heatmap of my busiest hours"
- "Deep dive into why my Tuesday revenue is always low"

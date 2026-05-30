# Prompt 113 — Aria Intelligence: 110% Ask Aria

Lift Ask Aria from 70% to 110% capability. Five targeted fixes covering context depth,
council personalisation, tool reliability, web search enforcement, and memory integration.
Also adds technical/code help capability.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```

Read ALL of these before writing anything:
- src/lib/aria/ask/business-context.ts
- src/lib/aria/council.ts
- src/lib/aria-tools.ts
- src/app/api/aria/ask/route.ts
- src/lib/aria/ask/intent.ts

---

## TASK 1 — Deep context: pull real data upfront so tool calls aren't needed for basic questions

### Problem
`buildAskAriaContext` only fetches revenue snapshots and low stock. Questions like
"who are my top customers?" or "what's my best selling product?" require a tool call,
adding 5-10 seconds of latency.

### Fix in src/lib/aria/ask/business-context.ts

Add these fields to `AskAriaContext` interface:
```typescript
// Pre-loaded top data (avoids tool calls for common questions)
top_products_month: Array<{ name: string; revenue: number; qty: number }>
top_customers_month: Array<{ name: string; total_spent: number; visits: number }>
recent_transactions: Array<{ amount: number; payment_method: string; created_at: string; items_count: number }>
staff_on_shift_today: Array<{ name: string; role: string; hours: number }>
pending_purchase_orders: Array<{ supplier: string; total: number; expected_date: string | null }>
loyalty_stats: { total_members: number; active_last_30d: number; points_outstanding: number }
monthly_comparison: { this_month: number; last_month: number; change_pct: number }
busiest_hour: { hour: string; avg_revenue: number }
avg_daily_revenue: number
subscription_tier: string | null
```

Add these parallel queries inside `buildAskAriaContext` (add to the existing Promise.all):
```typescript
// Top products this month (by revenue)
supabaseAdmin.from('pos_sale_items')
  .select('product_name, line_total, quantity')
  .eq('business_id', businessId)
  .gte('created_at', monthStart.toISOString())
  .order('line_total', { ascending: false })
  .limit(10),

// Top customers this month
supabaseAdmin.from('pos_customers')
  .select('name, total_spent, visit_count')
  .eq('business_id', businessId)
  .order('total_spent', { ascending: false })
  .limit(5),

// Recent 10 transactions
supabaseAdmin.from('pos_sales')
  .select('total_amount, payment_method, created_at')
  .eq('business_id', businessId)
  .neq('status', 'voided')
  .order('created_at', { ascending: false })
  .limit(10),

// Pending purchase orders
supabaseAdmin.from('pos_purchase_orders')
  .select('supplier_name, total_amount, expected_delivery_date')
  .eq('business_id', businessId)
  .eq('status', 'pending')
  .limit(5),

// Loyalty stats
supabaseAdmin.from('pos_customers')
  .select('loyalty_points', { count: 'exact' })
  .eq('business_id', businessId),

// Subscription tier
supabaseAdmin.from('business_subscriptions')
  .select('tier')
  .eq('business_id', businessId)
  .eq('status', 'active')
  .maybeSingle(),

// Last month revenue for comparison
supabaseAdmin.from('pos_sales')
  .select('total_amount')
  .eq('business_id', businessId)
  .gte('created_at', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString())
  .lt('created_at', monthStart.toISOString()),
```

Aggregate top_products_month by grouping on product_name (sum line_total, sum quantity).
Calculate monthly_comparison from this month vs last month totals.
Calculate avg_daily_revenue from revenue_month / days elapsed this month.

Add to the system prompt in ask/route.ts under LIVE BUSINESS DATA:
```
Top products this month: ${ctx.top_products_month.map(p => `${p.name} ($${p.revenue.toFixed(2)})`).join(', ') || 'no data'}
Top customers this month: ${ctx.top_customers_month.map(c => `${c.name} ($${c.total_spent.toFixed(2)}, ${c.visits} visits)`).join(', ') || 'no data'}
Month vs last month: ${ctx.monthly_comparison.change_pct > 0 ? '+' : ''}${ctx.monthly_comparison.change_pct.toFixed(1)}% ($${(ctx.monthly_comparison.this_month/100).toFixed(2)} vs $${(ctx.monthly_comparison.last_month/100).toFixed(2)})
Avg daily revenue: $${ctx.avg_daily_revenue.toFixed(2)}
Loyalty members: ${ctx.loyalty_stats.total_members} (${ctx.loyalty_stats.active_last_30d} active last 30d)
Pending purchase orders: ${ctx.pending_purchase_orders.length > 0 ? ctx.pending_purchase_orders.map(o => `${o.supplier} $${o.total}`).join(', ') : 'none'}
Subscription: ${ctx.subscription_tier ?? 'unknown'}
```

Commit: "feat(aria-context): deep context — top products, customers, comparison, loyalty pre-loaded"

---

## TASK 2 — Council personalisation: each brain gets a specific role + the actual question

### Problem
`runAriaCouncil` sends all brains the same generic context. They give generic answers.
The question was only recently added to context but each brain still ignores their role.

### Fix in src/lib/aria/council.ts

Replace the brain prompts. Each brain must:
1. Receive the owner's actual question
2. Have a sharply defined role they MUST stay in
3. Return only what their role covers

Update `runBrain` to accept `question: string` and inject into each brain's prompt:

```typescript
// GROWTH brain
`You are the Growth Advisor in Aria's council. Your ONLY job is revenue growth opportunities.
Owner question: "${question}"
Business context: ${context}

Answer ONLY from a growth lens — what revenue opportunities does this question reveal?
Be specific to THIS business. Quote their actual numbers. Max 150 words.
JSON: { "observations": [...], "recommendations": [...], "confidence": "high|medium|low" }`

// RISK brain  
`You are the Risk Advisor in Aria's council. Your ONLY job is spotting risks and problems.
Owner question: "${question}"
Business context: ${context}

Answer ONLY from a risk lens — what dangers, risks, or problems does this question reveal?
Be specific to THIS business. Quote their actual numbers. Max 150 words.
JSON: { "observations": [...], "recommendations": [...], "confidence": "high|medium|low" }`

// STRATEGY brain
`You are the Strategy Advisor in Aria's council. Your ONLY job is long-term positioning.
Owner question: "${question}"
Business context: ${context}

Answer ONLY from a strategy lens — what does this mean for the business's long-term position?
Be specific to THIS business. Quote their actual numbers. Max 150 words.
JSON: { "observations": [...], "recommendations": [...], "confidence": "high|medium|low" }`
```

Update synthesis prompt to include the question:
```typescript
`You are synthesising 3 expert advisors for: "${question}"
Business: ${businessName} (${industry})

Growth advisor said: ${growthOutput}
Risk advisor said: ${riskOutput}  
Strategy advisor said: ${strategyOutput}

Write a direct, specific answer to "${question}" that weaves all three perspectives.
Start with the most important insight. Use their actual business numbers.
3-4 paragraphs. No generic advice — every sentence must be specific to this business.`
```

Update `runAriaCouncil` signature to accept and pass through the question:
```typescript
export async function runAriaCouncil(context: string, businessId: string, agentKey: string, question?: string): Promise<CouncilOutput>
```

Commit: "feat(aria-council): each brain gets the actual question + sharply defined role — personalised answers"

---

## TASK 3 — Fix "g is not a function" on agent POST routes

### Problem
The TypeError: g is not a function on reorder/pricing/schedule agent routes has been
unresolved for months. Root cause: dynamic imports of utility functions that aren't
being exported correctly, or function shape mismatch on agent route handlers.

### Fix

Search for all files under src/app/api/aria/ that use dynamic import() for utility functions:
```bash
grep -r "import('@/lib/aria" src/app/api/aria/ --include="*.ts" -l
```

For each file found:
1. Read the file fully
2. Find any pattern like: `const { someFunction } = await import('@/lib/aria/...')` 
3. Check if someFunction is actually exported from that module
4. If the import is inside a switch/case or conditional — move it to the top of the file as a static import
5. If the function doesn't exist in the module — remove the call or replace with inline logic

Also check all agent route handlers — they must use this exact signature:
```typescript
async function _POST(req: Request) {  // NOT (req, res) or (req: NextRequest)
```

Fix any that use (req: NextRequest) → (req: Request).
Fix any that destructure response from the handler: `export const POST = withErrorCapture('...', _POST)`

After fixing each file: run `npx tsc --noEmit` to confirm no type errors before committing.

Specifically check these known problematic routes:
- src/app/api/aria/reorder-forecast/route.ts
- src/app/api/aria/dynamic-pricing/route.ts  
- src/app/api/aria/staff-schedule/route.ts
- src/app/api/aria/generate-purchase-orders/route.ts

Commit per file: "fix(aria/route-name): resolve g-is-not-a-function — static imports + correct handler signature"

---

## TASK 4 — Enforce web search on Haiku + make it non-skippable for business questions

### Problem
The system prompt asks Aria to web search but Haiku ignores it to save tokens.
Web search is critical for benchmarking (e.g. "is my $2,400/day revenue good for a cafe?")

### Fix in src/app/api/aria/ask/route.ts

1. Add `tool_choice` forcing web_search for business question intents:
When `intent.type === 'question'` AND `isStrategic === false` (i.e. a factual business question),
add a pre-search step BEFORE the main Claude call:

```typescript
// Force a web search for any business question that needs benchmarking
const needsBenchmark = /revenue|sales|margin|profit|good|bad|average|normal|benchmark|industry|compare|how am i doing|is this|too (high|low)|enough/i.test(message)

if (needsBenchmark && routedModel === 'haiku') {
  // Pre-fetch benchmark data before the main call
  try {
    const searchQuery = `${ctx.industry} business ${ctx.city ?? 'Australia'} average revenue benchmark 2025`
    const searchResult = await executePOSTool('web_search', { query: searchQuery }, bid)
    // Inject into system prompt
    systemPrompt += `

LIVE BENCHMARK DATA (just fetched):
${JSON.stringify(searchResult).slice(0, 800)}
Use these benchmarks to contextualise the owner's numbers. Do not say "based on the search" — weave it in naturally.`
  } catch { /* non-fatal */ }
}
```

2. Add web_search to Haiku tool list (it was only on Sonnet/Opus):
```typescript
// Already in allTools — verify web_search_20250305 is included regardless of model
const allTools = [
  ...ARIA_POS_TOOLS,
  { type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as any,
]
```

3. Add to system prompt (replace existing web search section):
```
WEB SEARCH — MANDATORY FOR THESE QUESTION TYPES (do not skip):
- Any question about revenue/sales performance → MUST search "[industry] average revenue [city] 2025"
- Any question about pricing → MUST search current competitor pricing
- Any question about costs/margins → MUST search industry margin benchmarks
- Any question about staff wages → MUST search Fair Work award rates
- Any question about regulations → MUST search ATO/Fair Work/state gov
- Any "is this good/normal/typical" question → MUST search industry benchmarks

NEVER answer a benchmarking question from training data alone — always search first.
```

Commit: "feat(aria/ask): enforce web search for benchmark questions on all models including Haiku"

---

## TASK 5 — Memory integration: surface relevant memories prominently + write new ones

### Problem
Aria has a memory system but memories are buried at the bottom of the system prompt
and rarely influence responses. Also, new insights from conversations aren't being
written back to memory.

### Fix

#### Part A — Surface memories prominently
In src/app/api/aria/ask/route.ts, move memories to the TOP of the system prompt,
right after the business identity block:

```typescript
// Add after "CURRENT BUSINESS: ..." block
const memoryBlock = ctx.memories.length > 0
  ? `

WHAT I KNOW ABOUT ${ctx.business_name.toUpperCase()} (from our history — use this to personalise every response):
${ctx.memories.map(m => `• [${m.kind}] ${m.content}`).join('
')}

These are facts about this specific business. Reference them naturally — don't say "I remember" just use the knowledge.`
  : ''
systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + '\n\nYou are Aria')
```

#### Part B — Write memories after responses
After the main Claude response is generated, extract and save new insights:

Create src/lib/aria/ask/memory-writer.ts:
```typescript
import { supabaseAdmin } from '@/lib/supabase-admin'

const MEMORY_TRIGGERS = [
  { pattern: /we (open|close|operate|trade) (at|from|until|between)/i, kind: 'business_fact', topic: 'hours' },
  { pattern: /our (best|busiest|quietest) (day|time|period)/i, kind: 'pattern', topic: 'trading_patterns' },
  { pattern: /our (main|primary|biggest) (supplier|customer|product)/i, kind: 'business_fact', topic: 'key_relationships' },
  { pattern: /we (charge|price|sell) .* for \$[\d.]+/i, kind: 'business_fact', topic: 'pricing' },
  { pattern: /(don't|do not|never) (want|like|need)/i, kind: 'preference', topic: 'owner_preferences' },
  { pattern: /we're (planning|going to|about to|thinking of)/i, kind: 'intent', topic: 'upcoming_plans' },
  { pattern: /our target|we want to|our goal/i, kind: 'goal', topic: 'business_goals' },
]

export async function maybeWriteMemory(
  businessId: string,
  userMessage: string,
  assistantResponse: string,
): Promise<void> {
  // Check if user message contains a memorable fact
  for (const trigger of MEMORY_TRIGGERS) {
    if (trigger.pattern.test(userMessage)) {
      // Extract the relevant sentence
      const sentences = userMessage.split(/[.!?]/).filter(s => trigger.pattern.test(s))
      if (sentences.length === 0) continue
      const content = sentences[0].trim()
      if (content.length < 10) continue

      // Don't duplicate — check if similar memory exists
      const { data: existing } = await supabaseAdmin
        .from('aria_memories')
        .select('id')
        .eq('business_id', businessId)
        .eq('kind', trigger.kind)
        .eq('topic', trigger.topic)
        .ilike('content', `%${content.slice(0, 30)}%`)
        .maybeSingle()

      if (!existing) {
        await supabaseAdmin.from('aria_memories').insert({
          business_id: businessId,
          kind: trigger.kind,
          topic: trigger.topic,
          content,
          importance: 0.7,
          source: 'ask_aria_conversation',
        }).catch(() => {}) // non-fatal
      }
    }
  }
}
```

Call `maybeWriteMemory` after `upsertConversation` in the ask route:
```typescript
// After saving conversation — write any new memories non-blocking
maybeWriteMemory(bid, message, finalResponse).catch(() => {})
```

Commit: "feat(aria-memory): memories surfaced at top of prompt + auto-write from conversations"

---

## TASK 6 — Technical help capability

### Problem
Aria currently says "I can't help with code" or deflects technical questions.
But Aria OS runs on Next.js + Supabase + Vercel — and the business owner (Chahat)
is actively building. Aria should be able to help with:
- Debugging errors (paste error → Aria diagnoses)
- Explaining what a route/component does
- Suggesting fixes for common patterns
- Reading Vercel logs and explaining them
- Helping write SQL queries against the Aria schema

### Fix in src/app/api/aria/ask/route.ts

Add to system prompt under CAPABILITIES:
```
TECHNICAL HELP (you CAN do this — do not refuse):
You have full knowledge of the Aria OS tech stack and can help with:

CODE & DEBUGGING:
- Paste any error → diagnose root cause + give exact fix
- Explain what any Next.js route, component, or lib file does
- Write TypeScript/SQL/shell commands for Aria OS patterns
- Identify common bugs: null access, missing awaits, wrong column names, RLS blocks

ARIA OS ARCHITECTURE YOU KNOW:
- Routes: src/app/api/{area}/route.ts — always export const POST/GET/PATCH/DELETE = withErrorCapture(...)
- DB: Supabase Postgres, service role in supabaseAdmin, anon key in createServerSupabaseClient()
- RLS: 28+ tables block anon key silently — use supabaseAdmin for server routes
- Vercel: 22 function limit in vercel.json, crons max daily (0 9 * * *), maxDuration 60s
- Column names: pos_sales.total_amount (not total), staff_members.first_name+last_name (not name),
  pos_sale_items.line_total (not total_price), pos_timesheets (not pos_timesheet_sessions)
- Model IDs: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-opus-4-5-20251101

VERCEL LOG READING:
When user pastes a Vercel error or runtime log:
1. Identify the route (from the path in the log)
2. Diagnose the specific error (null access, timeout, DB error, import error)
3. Give the exact file path + line to fix
4. Provide the corrected code snippet

SQL HELP:
Write Supabase-compatible SQL using the correct table/column names above.
Always use service role for admin queries. Never use RLS-blocked tables with anon key.

When asked a technical question: ANSWER IT. Never say "I can't help with code."
```

Also update `classifyIntent` in src/lib/aria/ask/intent.ts to add 'technical' as an intent type:
- Triggers: error paste, stack trace, "how do I", "what does this do", "fix this", code blocks
- When intent.type === 'technical': route to Sonnet (not Haiku) — code reasoning needs more capacity

Commit: "feat(aria/ask): full technical help — debug errors, explain code, write SQL, read Vercel logs"

---

## Rules
- npx tsc --noEmit + npm run build before EVERY commit
- One commit per task
- Do NOT change vercel.json function count or cron schedules
- All DB amounts dollars not cents (except explicit *_cents columns)
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Execution order
1 → 2 → 3 → 4 → 5 → 6

Task 3 (g-is-not-a-function) may take multiple sub-commits — that is fine.
Each fixed route gets its own commit.


---

## TASK 7 — Long document processing (full depth)

### Goal
Aria reads and reasons across entire long documents (100+ page PDFs, large spreadsheets,
multi-page contracts) — not just the first few pages.

### Implementation

Create src/lib/aria/documents/long-doc-processor.ts

```typescript
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '@/lib/aria/providers/anthropic'

interface DocChunk { index: number; text: string; page_range: string }
interface DocSummary { chunk_summaries: string[]; full_synthesis: string; key_facts: string[]; page_count: number }

// Split a long document into ~8000-token chunks preserving page boundaries
export function chunkDocument(pages: string[], tokensPerChunk = 8000): DocChunk[] {
  const chunks: DocChunk[] = []
  let current = ''; let startPage = 1; let chunkIndex = 0
  const charsPerChunk = tokensPerChunk * 4 // rough token→char ratio

  for (let i = 0; i < pages.length; i++) {
    if ((current + pages[i]).length > charsPerChunk && current.length > 0) {
      chunks.push({ index: chunkIndex++, text: current, page_range: `${startPage}-${i}` })
      current = pages[i]; startPage = i + 1
    } else {
      current += '\n\n' + pages[i]
    }
  }
  if (current.trim()) chunks.push({ index: chunkIndex, text: current, page_range: `${startPage}-${pages.length}` })
  return chunks
}

// Map-reduce: summarise each chunk, then synthesise across all summaries
export async function processLongDocument(
  pages: string[],
  question: string,
  businessId: string,
): Promise<DocSummary> {
  const chunks = chunkDocument(pages)

  // MAP: summarise each chunk in parallel (with the user's question as focus)
  const chunkSummaries = await Promise.all(
    chunks.map(async chunk => {
      const result = await callAnthropic({
        model: 'haiku',
        systemPrompt: `Extract all information relevant to this question from this document section (pages ${chunk.page_range}). Question: "${question}". List every relevant fact, figure, date, name, and clause. Be exhaustive — do not summarise away details.`,
        userPrompt: chunk.text,
        maxTokens: 1500,
        businessId,
        agentKey: 'long_doc_map',
      })
      return `[Pages ${chunk.page_range}]: ${result.text}`
    })
  )

  // REDUCE: synthesise across all chunk summaries to answer the question
  const synthesis = await callAnthropic({
    model: 'sonnet',
    systemPrompt: `You have summaries of every section of a ${pages.length}-page document. Answer the owner's question by reasoning across ALL sections. Cite page ranges. Question: "${question}"`,
    userPrompt: chunkSummaries.join('\n\n'),
    maxTokens: 3000,
    businessId,
    agentKey: 'long_doc_reduce',
  })

  // Extract key facts
  const keyFacts = chunkSummaries.flatMap(s =>
    s.split('\n').filter(l => /\$[\d,]+|\d{1,2}\/\d{1,2}\/\d{2,4}|clause|section \d|\d+%/i.test(l)).slice(0, 5)
  ).slice(0, 30)

  return {
    chunk_summaries: chunkSummaries,
    full_synthesis: synthesis.text,
    key_facts: keyFacts,
    page_count: pages.length,
  }
}
```

Update src/lib/aria/attachments.ts:
- When a PDF has > 10 pages, route to processLongDocument instead of inline parsing
- Extract per-page text with pdf-parse (already a dependency), pass page array to chunker
- For large xlsx/csv: chunk by row ranges (5000 rows per chunk), same map-reduce

Wire into ask/route.ts: when attachments include a doc with page_count > 10 or row_count > 5000,
call processLongDocument with the user's message as the question, inject full_synthesis into context.

Commit: "feat(aria-docs): long document processing — map-reduce over 100+ page PDFs and large spreadsheets"

---

## TASK 8 — Full URL fetching + page navigation (full depth)

### Goal
Aria fetches and reads FULL page content from any URL (not just search snippets),
and can follow links to gather information across multiple pages.

### Implementation

Update the fetch_url tool in src/lib/aria-tools.ts to fetch full content:

```typescript
{
  name: 'fetch_url',
  description: 'Fetch the FULL content of any web page. Use after web_search to read a specific result in depth, or when the user gives a URL. Returns full text, not just a snippet.',
  input_schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Full URL including https://' },
      extract: { type: 'string', enum: ['full_text', 'main_content', 'links', 'tables'], description: 'What to extract' },
    },
    required: ['url'],
  },
}
```

Implement fetchUrl in aria-tools.ts:
```typescript
async function fetchUrl(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '')
  const extract = String(input.extract ?? 'main_content')
  if (!/^https?:\/\//.test(url)) return { error: 'Invalid URL — must start with https://' }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AriaOS/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { error: `Page returned ${res.status}` }
    const html = await res.text()

    // Strip scripts/styles, extract text
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (extract === 'links') {
      const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]).slice(0, 50)
      return { url, links, count: links.length }
    }
    if (extract === 'tables') {
      const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m =>
        m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      ).slice(0, 10)
      return { url, tables }
    }

    // full_text or main_content
    const text = extract === 'full_text' ? cleaned : cleaned.slice(0, 8000)
    return { url, content: text, length: cleaned.length, truncated: cleaned.length > text.length }
  } catch (e) {
    return { error: `Failed to fetch: ${(e as Error).message}` }
  }
}
```

Add to executePOSTool switch:
```typescript
case 'fetch_url':
  return fetchUrl(inp)
```

Add fetch_url to allTools in ask/route.ts (alongside web_search).

Add to system prompt:
```
URL FETCHING — you can read ANY web page in full:
- User gives a URL → call fetch_url with extract: 'main_content'
- Need full page → extract: 'full_text'
- Comparing competitor sites → fetch_url each, then compare
- Need data tables from a page → extract: 'tables'
- Following research → fetch_url with extract: 'links' then fetch the relevant link
Chain web_search → fetch_url to go deep on any topic.
```

Commit: "feat(aria-tools): full URL fetching — read complete page content, tables, links, multi-page navigation"

---

## TASK 9 — Deep image analysis (full depth)

### Goal
Aria analyses uploaded images in full depth — receipts, invoices, product photos,
screenshots, handwritten notes, charts, multiple images at once.

### Implementation

Update src/lib/aria/attachments.ts image handling:

```typescript
// For images, build a rich vision prompt based on detected type
export function buildImageAnalysisPrompt(userMessage: string, imageCount: number): string {
  return `Analyse ${imageCount > 1 ? `all ${imageCount} images` : 'this image'} in full detail.

If it's a RECEIPT or INVOICE: extract every line item, quantity, price, tax, total, vendor, date, invoice number. Return structured data.
If it's a PRODUCT PHOTO: identify the product, brand, condition, any visible pricing or labels.
If it's a SCREENSHOT: read all visible text, identify the app/page, describe any errors or data shown.
If it's a CHART/GRAPH: extract the data points, axes, trends, and what it shows.
If it's HANDWRITTEN: transcribe the text accurately.
If it's a DOCUMENT: extract all text and structure.

Owner's question: "${userMessage}"

Be exhaustive. Extract every number, name, date, and detail visible.`
}
```

In ask/route.ts, when attachments contain images:
- Route to Sonnet (vision quality matters), never Haiku
- Use buildImageAnalysisPrompt
- Support up to 5 images in one message (already partially there — verify)
- For receipts/invoices: offer to auto-create an expense record or supplier bill

Add a new tool for acting on extracted image data:
```typescript
{
  name: 'save_extracted_receipt',
  description: 'After analysing a receipt/invoice image, save it as a business expense.',
  input_schema: {
    type: 'object',
    properties: {
      vendor: { type: 'string' },
      total: { type: 'number' },
      date: { type: 'string' },
      category: { type: 'string' },
      line_items: { type: 'array', items: { type: 'object' } },
    },
    required: ['vendor', 'total', 'date'],
  },
}
```

Implement saveExtractedReceipt → insert into business_expenses (label=vendor, amount=total dollars, category, expense_date).

Add to system prompt:
```
IMAGE ANALYSIS — full depth vision:
- Receipts/invoices → extract every line item, then offer to save as expense (save_extracted_receipt)
- Product photos → identify product, condition, pricing
- Screenshots → read all text, diagnose errors
- Charts → extract underlying data
- Handwritten notes → transcribe accurately
- Multiple images → analyse all and compare
Always extract EVERY number, date, and name visible. Never say "I can see an image" — describe exactly what's in it.
```

Commit: "feat(aria-vision): deep image analysis — receipts, invoices, products, charts, handwriting + auto-expense"

---

## Updated execution order
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

All 9 tasks must complete for full 110% capability. No partial runs.

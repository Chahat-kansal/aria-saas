# Prompt 234 — Aria Intelligence Upgrade: Memory, Honesty, Reasoning Depth, Multi-Session Context
# The most important intelligence prompt ever written for Aria.
# Every gap between what Aria does and what I (Claude) do closes here.
# NO NEW ENV VARS. Uses existing Anthropic, Supabase, Gemini keys.

## SKILLS — READ BEFORE ANY CODE
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md

## EXISTING INFRASTRUCTURE — READ ALL OF THESE IN FULL BEFORE WRITING A LINE
- src/lib/aria/council.ts — the 4-brain council + synthesis system
- src/lib/aria/get-business-context.ts — what data is assembled per session
- src/lib/aria/get-system-prompt.ts — Aria's voice and industry knowledge
- src/lib/aria/context-brain.ts — Gemini web search brain
- src/lib/aria/memory/extract.ts — ExtractedMemory schema + extractor prompt (ALREADY EXISTS)
- src/lib/aria/memory/onboarding-seed.ts — seeds first memories from onboarding
- src/lib/aria/AGENT_RULES.md — 3-pass judge architecture (Deterministic → Opus → GPT-5)
- src/lib/aria/business-brain.ts — AriaObservation schema with confidence fields
- src/lib/aria/write-outcome.ts — aria_outcomes table writer
- DB tables already confirmed: aria_business_memory, aria_outcomes, aria_hypotheses,
  council_runs, council_cache, aria_ai_calls, agent_decisions, aria_autopilot_actions

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY — never remove or weaken existing capability.
Amounts in dollars. haiku for extraction/fast calls, sonnet for reasoning, haiku for synthesis (current).
State "Build verified green, all commits pushed." when done.

---

## WHAT THIS PROMPT FIXES — 6 SPECIFIC GAPS

### GAP 1: HONESTY — The most critical fix. Costs money if wrong.
### GAP 2: PERSISTENT MEMORY — Aria forgets everything between sessions
### GAP 3: MULTI-SESSION CONTEXT — Council has no memory of past conversations
### GAP 4: REASONING DEPTH — All brains use haiku including synthesis
### GAP 5: PUSHBACK ON BAD IDEAS — Aria never flags contradictions
### GAP 6: CREATIVE/ANALYTICAL DEPTH — Image analysis, document reading, uncertainty

---

## TASK 1 — HONESTY SYSTEM: Confidence scoring, uncertainty language, data quality flags
Commit: "feat(intelligence): honesty system — confidence scoring, uncertainty language, data quality"

This is the most important task. An AI that sounds confident when it's guessing
can cost a business real money. Aria must communicate uncertainty at every level.

### 1a. DB migration — add data_quality tracking

```sql
-- Track data quality per business per day so Aria knows when to hedge
CREATE TABLE IF NOT EXISTS aria_data_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  assessed_at timestamptz DEFAULT now(),
  
  -- Data completeness scores (0-100)
  pos_data_score integer DEFAULT 0,       -- do we have enough sales data?
  customer_data_score integer DEFAULT 0,  -- do we have customer records?
  inventory_data_score integer DEFAULT 0, -- is stock tracked?
  staff_data_score integer DEFAULT 0,     -- are timesheets in?
  supplier_data_score integer DEFAULT 0,  -- are invoices imported?
  overall_score integer DEFAULT 0,        -- weighted average
  
  -- What's missing
  missing_critical text[],   -- things that make advice unreliable
  missing_helpful text[],    -- things that would improve advice
  
  -- Data age issues
  last_pos_sale_at timestamptz,
  last_stock_take_at timestamptz,
  pos_connected boolean DEFAULT false,
  
  UNIQUE(business_id, date_trunc('day', assessed_at))
);
ALTER TABLE aria_data_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_data_quality" ON aria_data_quality
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Add confidence tracking to council_runs
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS data_quality_score integer;
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS honesty_flags text[];
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS recommendations_hedged integer DEFAULT 0;
```

### 1b. src/lib/aria/data-quality.ts — NEW FILE

```typescript
// Assesses data quality for a business and returns a score + what's missing
// Called before every council run so brains know when to hedge

export interface DataQualityReport {
  overall_score: number  // 0-100
  pos_score: number
  customer_score: number
  inventory_score: number
  staff_score: number
  supplier_score: number
  missing_critical: string[]
  missing_helpful: string[]
  reliability_statement: string  // what Aria should say about data reliability
  hedge_level: 'none' | 'light' | 'moderate' | 'heavy'
  // none = data is complete, speak confidently
  // light = minor gaps, note them once
  // moderate = significant gaps, hedge recommendations
  // heavy = too little data to advise reliably — say so clearly
}

export async function assessDataQuality(businessId: string): Promise<DataQualityReport> {
  // Run all checks in parallel
  const [salesCheck, customerCheck, stockCheck, staffCheck, supplierCheck] = 
    await Promise.allSettled([
      // POS DATA: how many sales in last 30 days?
      // score 100 = 100+ transactions, 50 = 20-50 tx, 0 = <5 tx
      supabaseAdmin.from('pos_sales').select('id', { count: 'exact' })
        .eq('business_id', businessId).neq('status', 'voided')
        .gte('created_at', new Date(Date.now()-30*86400000).toISOString()),
      
      // CUSTOMER DATA: do we have customers with real data?
      supabaseAdmin.from('pos_customers').select('id', { count: 'exact' })
        .eq('business_id', businessId).not('last_visited_at', 'is', null),
      
      // INVENTORY: is stock quantity being tracked?
      supabaseAdmin.from('pos_products').select('id', { count: 'exact' })
        .eq('business_id', businessId).eq('is_active', true)
        .not('stock_quantity', 'is', null),
      
      // STAFF: timesheets in last 14 days?
      supabaseAdmin.from('pos_timesheets').select('id', { count: 'exact' })
        .eq('business_id', businessId)
        .gte('clock_in', new Date(Date.now()-14*86400000).toISOString()),
      
      // SUPPLIERS: invoices imported?
      supabaseAdmin.from('supplier_invoices').select('id', { count: 'exact' })
        .eq('business_id', businessId)
        .gte('invoice_date', new Date(Date.now()-90*86400000).toISOString()),
    ])

  const salesCount = salesCheck.status === 'fulfilled' ? (salesCheck.value.count ?? 0) : 0
  const customerCount = customerCheck.status === 'fulfilled' ? (customerCheck.value.count ?? 0) : 0
  const stockCount = stockCheck.status === 'fulfilled' ? (stockCheck.value.count ?? 0) : 0
  const staffCount = staffCheck.status === 'fulfilled' ? (staffCheck.value.count ?? 0) : 0
  const supplierCount = supplierCheck.status === 'fulfilled' ? (supplierCheck.value.count ?? 0) : 0

  // Scoring
  const pos_score = Math.min(100, Math.round(salesCount / 1.0))  // 100 tx = 100 score
  const customer_score = Math.min(100, Math.round(customerCount * 5))
  const inventory_score = stockCount > 0 ? Math.min(100, Math.round(stockCount * 5)) : 0
  const staff_score = staffCount > 0 ? 100 : 0
  const supplier_score = supplierCount > 0 ? 100 : 0

  const overall_score = Math.round(
    pos_score * 0.40 +
    customer_score * 0.20 +
    inventory_score * 0.20 +
    staff_score * 0.10 +
    supplier_score * 0.10
  )

  const missing_critical: string[] = []
  const missing_helpful: string[] = []

  if (salesCount < 10) missing_critical.push('Less than 10 sales recorded — revenue analysis unreliable')
  if (salesCount < 50) missing_helpful.push(`Only ${salesCount} sales in 30 days — patterns may not be statistically significant`)
  if (customerCount < 5) missing_critical.push('No customer data — customer analysis not possible')
  if (stockCount === 0) missing_helpful.push('Stock quantities not tracked — inventory recommendations are estimates')
  if (staffCount === 0) missing_helpful.push('No timesheet data — labour cost analysis not available')
  if (supplierCount === 0) missing_helpful.push('No supplier invoices imported — COGS and margin calculations are estimated')

  // Determine hedge level
  let hedge_level: DataQualityReport['hedge_level'] = 'none'
  if (overall_score < 20) hedge_level = 'heavy'
  else if (overall_score < 50) hedge_level = 'moderate'
  else if (overall_score < 75) hedge_level = 'light'

  // Build the honesty statement Aria injects into her briefing
  const reliability_statement = hedge_level === 'heavy'
    ? `⚠ Data warning: With only ${salesCount} sales recorded, my analysis has low reliability. 
       I'm working with limited information. Treat these as directional signals, not firm conclusions.`
    : hedge_level === 'moderate'
    ? `Based on ${salesCount} sales this month. ${missing_critical[0] ?? 'Some gaps in data — see below.'}`
    : hedge_level === 'light'
    ? ''  // just note specific gaps inline
    : ''   // full confidence — no statement needed

  return {
    overall_score, pos_score, customer_score, inventory_score, staff_score, supplier_score,
    missing_critical, missing_helpful, reliability_statement, hedge_level
  }
}
```

### 1c. Inject data quality into council.ts

In `runAriaCouncil()`:
1. Call `assessDataQuality(businessId)` in parallel with bizInfo fetch
2. Prepend to `businessContext` string passed to all brains:

```
DATA QUALITY REPORT:
Overall reliability: ${quality.overall_score}/100 (${quality.hedge_level} hedging required)
${quality.missing_critical.length > 0 ? 'CRITICAL GAPS: ' + quality.missing_critical.join('; ') : ''}
${quality.missing_helpful.length > 0 ? 'GAPS: ' + quality.missing_helpful.join('; ') : ''}
${quality.reliability_statement}
```

3. Add to each brain prompt:
```
DATA RELIABILITY: ${quality.hedge_level} hedging required.
${quality.hedge_level === 'heavy' ? 'WARNING: Data is very thin. Lead with what you DON\'t know before what you do. Never sound confident with thin data.' : ''}
${quality.hedge_level === 'moderate' ? 'Be honest about what the data shows vs what you're inferring.' : ''}
If data is insufficient for a recommendation, say: "Not enough data to advise on this — need at least X to be reliable."
```

4. Inject into synthesis prompt:
```
DATA QUALITY: ${quality.overall_score}/100 — hedge level: ${quality.hedge_level}
${quality.reliability_statement}
HONESTY RULES FOR SYNTHESIS:
- If hedge_level is 'heavy': open with the data warning. Don't bury it.
- NEVER state a percentage change when salesCount < 10 — say "too few sales to calculate trends reliably"
- NEVER recommend a price change without stating what margin data it's based on
- NEVER claim a product is "your top seller" without citing the actual sales count
- If advisors disagree AND data is thin: present the disagreement honestly as "advisors are split and data is too thin to resolve this"
- Confidence language: use "looks like", "suggests", "early signal" for low-confidence findings
  Use "clearly", "definitely", "the data shows" ONLY for findings with 20+ supporting data points
```

5. Add `honesty_flags` to council result:
```typescript
honesty_flags: quality.missing_critical.map(m => `LOW_DATA: ${m}`)
```

### 1d. API route — expose data quality to dashboard

Create: src/app/api/aria/data-quality/route.ts
GET: runs assessDataQuality for business, returns DataQualityReport
Upserts to aria_data_quality table

Add to AriaBriefingCard: if data_quality?.hedge_level is 'heavy' or 'moderate':
Show a small amber/red banner: "⚠ Analysis based on limited data — {missing_critical[0]}"
This must appear ABOVE the briefing, not buried after it.

---

## TASK 2 — PERSISTENT MEMORY: Aria remembers across sessions
Commit: "feat(intelligence): persistent memory — extract, store, inject memories into every council run"

The memory extractor (src/lib/aria/memory/extract.ts) already exists.
The aria_business_memory table already exists.
This task wires them into the council so Aria actually USES memories.

### 2a. Check and confirm aria_business_memory schema
Read the actual columns first via Supabase MCP. Expected:
  id, business_id, kind, content, topic, source_type, source_id,
  confidence, importance, created_at, last_confirmed_at, confirmed_count

### 2b. src/lib/aria/memory/recall.ts — NEW FILE

```typescript
// Recalls relevant memories for a given question/context
// Called before every council run

export interface RecalledMemory {
  kind: string
  content: string
  topic: string | null
  importance: number
  age_days: number  // how old this memory is
}

export async function recallMemories(
  businessId: string,
  question: string,
  limit = 12
): Promise<RecalledMemory[]> {
  // Pull the most important + most recent memories
  // Importance-weighted, recency-boosted
  const { data } = await supabaseAdmin
    .from('aria_business_memory')
    .select('kind, content, topic, importance, created_at')
    .eq('business_id', businessId)
    .gte('confidence', 0.6)  // only use memories we're confident about
    .order('importance', { ascending: false })
    .limit(limit * 3)  // over-fetch to allow topic filtering
  
  if (!data || data.length === 0) return []
  
  // Simple relevance: if question mentions a topic keyword, boost those memories
  const qLower = question.toLowerCase()
  const topicKeywords: Record<string, string[]> = {
    pricing: ['price', 'cost', 'margin', 'discount', 'charge'],
    staff: ['staff', 'labour', 'roster', 'hours', 'shift', 'employee'],
    inventory: ['stock', 'inventory', 'product', 'order', 'supplier'],
    customers: ['customer', 'loyalty', 'churn', 'winback', 'regular'],
    cashflow: ['cash', 'payment', 'invoice', 'expense', 'revenue'],
    marketing: ['marketing', 'promotion', 'campaign', 'sms', 'social'],
  }
  
  // Score each memory: base = importance, bonus if topic matches question
  const scored = data.map((m: any) => {
    let score = m.importance
    if (m.topic) {
      const keywords = topicKeywords[m.topic] ?? []
      if (keywords.some(k => qLower.includes(k))) score += 3
    }
    // Always include core identity memories (importance >= 9)
    if (m.importance >= 9) score += 5
    return { ...m, _score: score }
  })
  
  // Sort and take top N
  scored.sort((a: any, b: any) => b._score - a._score)
  
  return scored.slice(0, limit).map((m: any) => ({
    kind: m.kind,
    content: m.content,
    topic: m.topic,
    importance: m.importance,
    age_days: Math.round((Date.now() - new Date(m.created_at).getTime()) / 86400000)
  }))
}

export function formatMemoriesForPrompt(memories: RecalledMemory[]): string {
  if (memories.length === 0) return ''
  
  const grouped: Record<string, RecalledMemory[]> = {}
  for (const m of memories) {
    const k = m.kind
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(m)
  }
  
  const lines: string[] = ['OWNER MEMORY (what Aria knows about this business from past conversations):']
  
  // Facts first (most stable)
  if (grouped.fact) {
    lines.push('Facts: ' + grouped.fact.map(m => m.content).join(' | '))
  }
  if (grouped.preference) {
    lines.push('Owner preferences: ' + grouped.preference.map(m => m.content).join(' | '))
  }
  if (grouped.goal) {
    lines.push('Goals: ' + grouped.goal.map(m => m.content).join(' | '))
  }
  if (grouped.concern) {
    lines.push('Ongoing concerns: ' + grouped.concern.map(m => m.content).join(' | '))
  }
  if (grouped.decision) {
    lines.push('Past decisions: ' + grouped.decision.map(m => m.content).join(' | '))
  }
  if (grouped.tried) {
    lines.push('Things tried: ' + grouped.tried.map(m => m.content).join(' | '))
  }
  
  lines.push('Use this context to personalise advice. Reference past decisions when relevant. Never re-recommend something the owner already dismissed.')
  
  return lines.join('\n')
}
```

### 2c. Wire recall into council.ts

In `runAriaCouncil()`, alongside data quality assessment:

```typescript
// Fetch memories in parallel with everything else
const memoriesPromise = recallMemories(businessId, activeQuestion)

// Add to Promise.all alongside brains
const [growth, risk, strategy, context, ctxOutput, bizInfo, memories, quality] = 
  await Promise.all([...existing..., memoriesPromise, dataQualityPromise])

// Prepend to businessContext:
const memoryBlock = formatMemoriesForPrompt(memories)
const fullContext = [memoryBlock, businessContext].filter(Boolean).join('\n\n')
// Use fullContext instead of businessContext in synthesisInput and userPrompt
```

### 2d. Wire EXTRACTION into Ask Aria — after every conversation turn

In src/app/api/aria/ask/route.ts (or wherever Ask Aria conversations are saved):

After each successful Aria response, fire-and-forget memory extraction:

```typescript
// After sending response — don't await, never block the response
extractAndStoreMemories(businessId, userMessage, ariaResponse).catch(() => {})

// In extract.ts, the function:
async function extractAndStoreMemories(
  businessId: string,
  userMessage: string,
  ariaResponse: string
): Promise<void> {
  // Only extract if the conversation was substantive (> 50 words combined)
  if ((userMessage + ariaResponse).split(' ').length < 50) return
  
  const memories = await runMemoryExtractor(businessId, userMessage, ariaResponse)
  
  if (memories.length === 0) return
  
  // Upsert memories — use content as dedup key (within same business)
  for (const memory of memories) {
    await supabaseAdmin.from('aria_business_memory').upsert({
      business_id: businessId,
      kind: memory.kind,
      content: memory.content,
      topic: memory.topic,
      importance: memory.importance,
      confidence: memory.confidence,
      source_type: 'conversation',
      last_confirmed_at: new Date().toISOString(),
    }, {
      onConflict: 'business_id,content',  // adjust to actual unique constraint
      ignoreDuplicates: false,  // update confidence/importance on re-encounter
    })
  }
}
```

Note: check actual unique constraint on aria_business_memory before writing the upsert.
If no unique constraint on content: query for existing by content ILIKE match and update instead.

### 2e. Daily memory consolidation cron

Create: src/app/api/cron/memory-consolidate/route.ts
Schedule: "0 18 * * *" (4am AEST daily) — within vercel.json ≤22 cron limit

For each active business:
1. Find memories with age > 30 days AND confirmed_count < 2 AND importance < 6
   → mark as expired (or delete if importance < 3)
2. Find duplicate content (semantic similarity > 0.85) → merge, keep highest importance
3. Find memories from aria_outcomes WHERE acted_on = true → boost those memories' importance by 1

---

## TASK 3 — REASONING DEPTH: Escalate complex questions to Sonnet
Commit: "feat(intelligence): reasoning depth — escalate complex/high-stakes questions to Sonnet"

Currently ALL council calls use haiku for brains AND synthesis. For complex or high-stakes
questions, synthesis should use Sonnet. For the most critical (price changes > 10%,
BAS-impacting advice, supplier contract decisions), use Opus.

### 3a. Add question complexity classifier

In council.ts, before running brains, classify the question:

```typescript
function classifyQuestionComplexity(question: string, quality: DataQualityReport): {
  synthesis_model: string
  brain_model: string
  reason: string
} {
  const q = question.toLowerCase()
  
  // HIGH STAKES — use Opus for synthesis (these can cost money if wrong)
  const highStakesSignals = [
    q.includes('bas') || q.includes('tax') || q.includes('gst'),
    q.includes('supplier') && (q.includes('contract') || q.includes('negotiate')),
    q.includes('hire') || q.includes('fire') || q.includes('redundan'),
    q.includes('price') && (q.includes('increase') || q.includes('raise') || q.includes('change')),
    q.includes('invest') || q.includes('expand') || q.includes('open') && q.includes('new'),
    q.includes('legal') || q.includes('compliance') || q.includes('licence'),
  ]
  
  // COMPLEX — use Sonnet for synthesis
  const complexSignals = [
    q.length > 100,  // long nuanced question
    q.includes('should i') || q.includes('what would you do'),
    q.includes('why') && q.includes('revenue'),
    q.includes('strategy') || q.includes('plan') || q.includes('future'),
    question.split('?').length > 2,  // multiple questions
    quality.hedge_level === 'heavy',  // thin data needs more careful reasoning
  ]
  
  const highStakes = highStakesSignals.some(Boolean)
  const complex = complexSignals.filter(Boolean).length >= 2
  
  if (highStakes) return {
    synthesis_model: 'claude-opus-4-5-20251101',
    brain_model: 'claude-haiku-4-5-20251001',
    reason: 'High-stakes question — Opus synthesis for maximum accuracy'
  }
  
  if (complex) return {
    synthesis_model: 'claude-sonnet-4-5-20250929',
    brain_model: 'claude-haiku-4-5-20251001',
    reason: 'Complex question — Sonnet synthesis'
  }
  
  return {
    synthesis_model: 'claude-haiku-4-5-20251001',
    brain_model: 'claude-haiku-4-5-20251001',
    reason: 'Standard question — Haiku for speed and cost'
  }
}
```

Use `complexity.synthesis_model` instead of the hardcoded HAIKU in the synthesis call.
Log the model escalation to aria_ai_calls.
Log `reason` to council_runs in a new `escalation_reason` column.

Add to council_runs:
```sql
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS synthesis_model text;
ALTER TABLE council_runs ADD COLUMN IF NOT EXISTS escalation_reason text;
```

### 3b. Briefing mode always uses Sonnet for synthesis

For `mode === 'briefing'`:
Always use Sonnet for synthesis regardless of complexity.
The daily briefing is the most important output Aria produces — it sets the owner's 
priorities for the whole day. Haiku is too cost-optimised for this purpose.

---

## TASK 4 — PUSHBACK SYSTEM: Aria flags contradictions and bad ideas
Commit: "feat(intelligence): pushback system — Aria flags when advice contradicts past decisions"

### 4a. Contradiction detection in council.ts

After recalling memories but before synthesis, check for contradictions:

```typescript
function detectContradictions(
  question: string,
  memories: RecalledMemory[],
  brainRecommendations: string[]
): ContradictionWarning[] {
  const warnings: ContradictionWarning[] = []
  
  // Check each brain recommendation against past decisions/dismissals
  for (const rec of brainRecommendations) {
    const recLower = rec.toLowerCase()
    
    for (const memory of memories) {
      // Past decision being contradicted
      if (memory.kind === 'decision') {
        const memLower = memory.content.toLowerCase()
        // E.g., memory says "decided not to raise prices this quarter"
        // but brain recommends "raise prices"
        if (
          (recLower.includes('raise price') && memLower.includes('decided not to raise')) ||
          (recLower.includes('hire') && memLower.includes('decided not to hire')) ||
          (recLower.includes('discount') && memLower.includes('decided not to discount')) ||
          (recLower.includes('fire') && memLower.includes('decided to keep'))
        ) {
          warnings.push({
            recommendation: rec,
            contradicts_memory: memory.content,
            memory_age_days: memory.age_days,
            severity: memory.importance >= 8 ? 'high' : 'medium'
          })
        }
      }
      
      // Previously tried and failed
      if (memory.kind === 'tried') {
        const memLower = memory.content.toLowerCase()
        if (memLower.includes('did not work') || memLower.includes('failed') || memLower.includes('no improvement')) {
          if (recLower.split(' ').some(w => memLower.includes(w) && w.length > 5)) {
            warnings.push({
              recommendation: rec,
              contradicts_memory: memory.content,
              memory_age_days: memory.age_days,
              severity: 'medium'
            })
          }
        }
      }
    }
  }
  
  return warnings
}
```

Inject contradictions into synthesis input:
```
CONTRADICTION WARNINGS (must address these explicitly in final_briefing):
${contradictions.map(c => `
- Recommendation "${c.recommendation}" contradicts a past decision: "${c.contradicts_memory}" (${c.memory_age_days} days ago)
  Aria MUST mention this contradiction. If the owner changed their mind, acknowledge it.
  If the recommendation still stands despite past decision, explain why circumstances changed.
`).join('\n')}
```

Add a new block type to SYNTHESIS_PROMPT_BODY:
```
- "pushback": use when a recommendation contradicts a past decision or failed experiment.
  {"type":"pushback","title":"Heads up — this conflicts with a past decision","content":"You decided last month not to raise prices. Circumstances have changed: [reason]. Still worth reconsidering now because [evidence].","severity":"high|medium"}
```

### 4b. Wire pushback into dashboard UI

In AriaBriefingCard.tsx: render the "pushback" block type with amber/red styling:
- amber border, ⚠ icon, "This conflicts with a past decision" header
- The content explains the conflict and why advice might still be valid
- Small "This is different because..." expandable section

---

## TASK 5 — MULTI-SESSION CONTEXT: Council sees past conversation summaries
Commit: "feat(intelligence): multi-session context — council includes recent conversation summaries"

### 5a. Conversation summary table

```sql
CREATE TABLE IF NOT EXISTS aria_conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  summarised_at timestamptz DEFAULT now(),
  conversation_date date NOT NULL,
  mode text NOT NULL,  -- 'ask_aria', 'briefing', 'weekly_report'
  summary text NOT NULL,  -- 2-3 sentence summary of what was discussed
  key_decisions text[],   -- explicit decisions made in this conversation
  key_concerns text[],    -- concerns raised
  followup_promised text[], -- things Aria promised to check on
  UNIQUE(business_id, conversation_date, mode)
);
ALTER TABLE aria_conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_conv_summaries" ON aria_conversation_summaries
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON aria_conversation_summaries (business_id, conversation_date DESC);
```

### 5b. Conversation summariser — fire at end of Ask Aria session

In Ask Aria route, on conversation end (when user closes or after 30 min inactivity):
Call haiku to generate a 2-3 sentence summary of the conversation:

```typescript
async function summariseConversation(
  businessId: string,
  messages: {role: string, content: string}[]
): Promise<void> {
  if (messages.length < 4) return  // too short to summarise
  
  const transcript = messages
    .map(m => `${m.role === 'user' ? 'Owner' : 'Aria'}: ${m.content}`)
    .join('\n')
    .slice(0, 4000)  // trim to avoid token bloat
  
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'Summarise this Aria conversation for future reference. Return JSON only.',
    messages: [{
      role: 'user',
      content: `Conversation:\n${transcript}\n\nReturn JSON:
      {
        "summary": "2-3 sentence summary of what was discussed and decided",
        "key_decisions": ["explicit decision 1", "decision 2"],
        "key_concerns": ["concern raised by owner"],
        "followup_promised": ["things Aria said it would check on or follow up"]
      }`
    }]
  })
  
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('')
  const parsed = safeParseJSON(text)
  if (!parsed) return
  
  await supabaseAdmin.from('aria_conversation_summaries').upsert({
    business_id: businessId,
    conversation_date: new Date().toISOString().slice(0, 10),
    mode: 'ask_aria',
    summary: parsed.summary ?? '',
    key_decisions: parsed.key_decisions ?? [],
    key_concerns: parsed.key_concerns ?? [],
    followup_promised: parsed.followup_promised ?? [],
  }, { onConflict: 'business_id,conversation_date,mode' })
}
```

### 5c. Inject last 7 days of summaries into council context

In recallMemories (or alongside it), also fetch recent conversation summaries:

```typescript
const { data: recentSummaries } = await supabaseAdmin
  .from('aria_conversation_summaries')
  .select('conversation_date, summary, key_decisions, key_concerns, followup_promised')
  .eq('business_id', businessId)
  .gte('conversation_date', new Date(Date.now()-7*86400000).toISOString().slice(0, 10))
  .order('conversation_date', { ascending: false })
  .limit(5)

if (recentSummaries && recentSummaries.length > 0) {
  const summaryBlock = [
    'RECENT CONVERSATIONS (last 7 days):',
    ...recentSummaries.map((s: any) => 
      `${s.conversation_date}: ${s.summary}` +
      (s.key_decisions?.length ? ' Decisions: ' + s.key_decisions.join(', ') : '') +
      (s.followup_promised?.length ? ' Aria promised to check: ' + s.followup_promised.join(', ') : '')
    ),
    'If you promised to follow up on something, do it now. Reference what was discussed.',
  ].join('\n')
  
  // Prepend to context
  fullContext = summaryBlock + '\n\n' + fullContext
}
```

---

## TASK 6 — IMAGE ANALYSIS AND DOCUMENT READING
Commit: "feat(intelligence): image analysis + document reading in Ask Aria"

### 6a. Image analysis in Ask Aria

In the Ask Aria API route, check if the request includes an image attachment.
If yes: use vision-capable model (Sonnet — it has vision, haiku may not).

```typescript
// In Ask Aria route handler:
const hasImage = attachments?.some(a => a.type?.startsWith('image/'))
const hasDocument = attachments?.some(a => a.type === 'application/pdf' || a.type?.includes('document'))

if (hasImage || hasDocument) {
  // Build multi-modal message
  const content: Anthropic.MessageParam['content'] = []
  
  for (const attachment of attachments ?? []) {
    if (attachment.type?.startsWith('image/')) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.type as 'image/jpeg'|'image/png'|'image/webp',
          data: attachment.base64Data,
        }
      })
    }
  }
  content.push({ type: 'text', text: userMessage })
  
  // Force Sonnet for vision — always (haiku 4.5 supports vision too, but Sonnet is better)
  model = 'claude-sonnet-4-5-20250929'
  messages = [{ role: 'user', content }]
} 
```

In the system prompt for image analysis, add:
```
When analysing an image the owner has sent:
- Supplier invoice → extract: supplier name, total, line items, dates, compare to known supplier prices
- Product photo → identify product, check if it matches known stock, note condition
- Receipt or document → extract all numbers and dates, relate to business context
- Handwritten note → transcribe accurately, then relate to business context
- Competitor price tag or menu → note prices, compare to owner's pricing
Always relate what you see to the specific business context you have.
```

### 6b. Uncertainty on images

Add to image analysis prompt:
```
HONESTY WITH IMAGES:
- If image is unclear or low quality: say so immediately
- If you can't read text in the image: say "I can't read this clearly — can you type the key numbers?"
- NEVER guess a number from an image — if unclear, ask
- If it's an invoice: always say "I'm reading ${amount} — please verify before acting on this"
```

---

## TASK 7 — DASHBOARD: Surface honesty, memory, and depth to owners
Commit: "feat(intelligence): intelligence quality dashboard — memory browser, data quality, escalations"

### Intelligence tab on /dashboard/agents page

Add a new tab: "Intelligence Quality"

Sections:

#### Data Quality card
Progress rings: POS data / Customers / Inventory / Staff / Suppliers — each 0-100
Overall score: big number
Missing critical: red warning list
Missing helpful: amber suggestions
"Connect X to improve" buttons for zero-score areas

#### Memory browser
Table: Kind | Topic | Content | Importance | Age
Filter by kind (fact/preference/goal/concern/decision/tried)
"Forget this" button → deletes the memory
"Confirm this is still true" button → boosts importance, resets age
"Add a memory" button → owner can manually add facts Aria should know

#### Council quality
Last 7 council runs:
- Date | Model used | Hedge level | Data quality score | Escalated?
- If escalated: shows escalation reason
- "Run council now" button

#### Conversation history
Last 7 conversation summaries
Each shows: date | summary | key decisions | promises Aria made
Expandable per entry

---

## COMPLETION CHECKLIST
- [ ] aria_data_quality table + assessDataQuality() function
- [ ] Data quality injected into ALL brain prompts (not just synthesis)
- [ ] Honesty language rules in synthesis prompt — "too few sales", confidence levels
- [ ] Data quality banner in AriaBriefingCard for heavy/moderate hedge levels
- [ ] aria_business_memory recall wired into council (memories appear in synthesis input)
- [ ] Memory extraction fires after every Ask Aria conversation (fire-and-forget)
- [ ] Memory consolidation cron (daily 4am AEST)
- [ ] Question complexity classifier routes to haiku/sonnet/opus
- [ ] Briefing mode always uses Sonnet for synthesis
- [ ] Contradiction detection checks memories vs brain recommendations
- [ ] "pushback" block type rendered in AriaBriefingCard
- [ ] aria_conversation_summaries table + summariser fires at session end
- [ ] Last 7 days of conversation summaries injected into council context
- [ ] Image analysis in Ask Aria with Sonnet for vision
- [ ] Honesty rules for image analysis (never guess numbers)
- [ ] Intelligence Quality tab on /dashboard/agents
- [ ] npx tsc --noEmit passes, npm run build passes
- [ ] All new tables have RLS policies
- [ ] aria_ai_calls logged for every new AI call with correct model_id
State "Build verified green, all commits pushed." when done.

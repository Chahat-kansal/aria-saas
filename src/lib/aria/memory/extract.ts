import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '../providers/anthropic'

export interface ExtractedMemory {
  kind: 'preference' | 'fact' | 'tried' | 'decision' | 'concern' | 'goal'
  content: string
  topic: string | null
  importance: number
  confidence: number
}

const EXTRACTOR_SYSTEM = `You extract durable business memories from Aria-business conversations. You produce ONLY a JSON array of memories. No prose.

Each memory must be:
- A self-contained sentence about THIS business (no pronouns referring back to the conversation)
- Worth recalling weeks or months later — NOT one-off questions or trivial facts
- Specific. "The owner runs a cafe" is bad. "Owner runs a cafe in Brunswick, opens 6am weekdays, closed Mondays" is good.

KIND options:
- preference: how the owner likes to be communicated to, or what they care most about
- fact: a stable truth about the business operation (location, format, hours, suppliers, products)
- tried: an experiment or change the owner has tested in the past
- decision: an explicit choice the owner has committed to
- concern: an ongoing worry the owner has raised more than once
- goal: an explicit numeric or qualitative objective

TOPIC options (use one of these or leave null): pricing, staff, inventory, marketing, customers, suppliers, hours, expansion, compliance, cashflow

IMPORTANCE 1-10:
- 9-10: core business identity (industry, location, primary offering)
- 7-8: stable preferences, named decisions, explicit goals
- 5-6: tried experiments, recurring concerns
- 3-4: minor preferences
- 1-2: trivia (almost never extract these — skip instead)

CONFIDENCE 0.0-1.0:
- 0.9+: explicit and unambiguous
- 0.7-0.8: clear inference but the owner did not say it directly
- 0.5-0.6: educated guess from limited evidence

VOLATILE METRICS — NEVER EXTRACT THESE:
Durable memory must remain TRUE indefinitely regardless of recent performance. These types are FORBIDDEN:
- Revenue totals, sales amounts, or earnings (e.g. "revenue was $2,177 this week", "made $15,940 last month")
- Percentage changes or trends (e.g. "revenue up 23%", "sales declined 45%", "down 12% this month")
- Customer counts, visitor counts, or transaction counts (e.g. "37 customers this week", "1,788 sales last month")
- Per-day, per-week, or per-month averages (e.g. "$544/day average", "daily revenue of $200")
- Any metric scoped to "this week", "last week", "this month", or "last month"
Live metrics belong in the real-time data packet — NOT in durable memory.

ALLOWED examples of durable memories:
- "Owner runs a single-outlet cafe in Brunswick, Melbourne, open 6am-3pm Mon-Sat" (identity/hours)
- "Owner prefers terse answers with one chart and one specific recommendation" (communication preference)
- "Flat white is the signature product, priced at $5.50" (structural product fact)
- "Owner goal: open a second location in Fitzroy within 2 years" (explicit goal)
- "Owner has decided to stop stocking oat milk from Brand X due to quality issues" (decision)

Return AT MOST 5 memories per call. If nothing is worth extracting, return [].

Output format — JSON array only, no preamble, no code fences:
[
  {"kind":"fact","content":"Owner runs a single-outlet cafe in Brunswick, Melbourne, open 6am-3pm Mon-Sat","topic":null,"importance":9,"confidence":0.95},
  {"kind":"preference","content":"Owner prefers terse answers with one chart and one specific recommendation","topic":null,"importance":7,"confidence":0.85}
]`

// Safety-net guard: rejects any memory that contains a point-in-time metric,
// regardless of what the LLM extracted. Live metrics must come from the facts packet, not durable memory.
function isVolatileMetric(content: string): boolean {
  const c = content.toLowerCase()
  // Dollar figure combined with a time window → revenue/metric scoped to a period
  if (/\$[\d,]+/.test(c) && /\b(?:this|last)\s+(?:week|month)|(?:7|14|30)\s*days?\b/.test(c)) return true
  // Any percentage → always a trend/metric, never a durable structural fact
  if (/\d+(?:\.\d+)?\s*%/.test(c)) return true
  // Count + entity type → point-in-time volume metric
  if (/\b\d[\d,]*\s+(?:customers?|sales?|transactions?|orders?|visits?)\b/.test(c)) return true
  // Revenue / earnings / turnover combined with a dollar figure → financial metric
  if (/\b(?:revenue|earnings?|turnover)\b/.test(c) && /\$[\d,]+/.test(c)) return true
  // Per-period average with a dollar figure → rate metric
  if (/\$[\d,]+/.test(c) && /\b(?:per\s+(?:day|week|month)|daily\s+average|weekly\s+average|monthly\s+average|avg)\b/.test(c)) return true
  return false
}

export async function extractMemoriesFromTranscript(
  businessId: string,
  transcript: string,
  businessName: string,
  industry: string,
): Promise<ExtractedMemory[]> {
  const userPrompt = `Business: ${businessName} (${industry})

Recent Aria conversation transcript:
${transcript}

Extract durable memories. Return JSON array only.`

  // Primary: Haiku via callAnthropic (proper timeout + logging)
  const primary = await callAnthropic({
    model: 'haiku',
    systemPrompt: EXTRACTOR_SYSTEM,
    userPrompt,
    maxTokens: 800,
    businessId,
    agentKey: 'memory_extractor',
    role: 'classify',
  }, [] as ExtractedMemory[])

  let rawText = primary.raw

  // Last-resort fallback: gpt-4o-mini (kept per RULE 0)
  if (!primary.success || !rawText) {
    const { callOpenAI } = await import('../providers/openai')
    const fallback = await callOpenAI({
      systemPrompt: EXTRACTOR_SYSTEM,
      userPrompt,
      maxTokens: 800,
      businessId,
      agentKey: 'memory_extractor',
      role: 'classify',
    })
    rawText = fallback.raw
  }

  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed.slice(0, 5) as ExtractedMemory[]
    return []
  } catch {
    return []
  }
}

export async function extractAndStoreMemories(
  businessId: string,
  userMessage: string,
  ariaResponse: string,
  conversationId?: string | null,
): Promise<void> {
  if ((userMessage + ariaResponse).split(' ').length < 50) return

  try {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, trading_name, industry')
      .eq('id', businessId)
      .maybeSingle()

    const bizName = (biz as Record<string, string | null> | null)?.trading_name ?? (biz as Record<string, string | null> | null)?.name ?? 'this business'
    const industry = (biz as Record<string, string | null> | null)?.industry ?? 'retail'

    const transcript = 'Owner: ' + userMessage + '\nAria: ' + ariaResponse
    const memories = await extractMemoriesFromTranscript(businessId, transcript, bizName, industry)
    if (memories.length > 0) {
      await persistMemories(businessId, memories, conversationId ?? null)
    }
  } catch { /* non-fatal fire-and-forget */ }
}

export async function maybeWriteOutcome(
  businessId: string,
  userMessage: string,
  ariaResponse: string,
  conversationId?: string | null,
): Promise<void> {
  const isStrategyQuestion = /should i|what.*best|recommend|advice|strategy|help me decide|how do i improve|what would you do/i.test(userMessage)
  if (!isStrategyQuestion) return

  const recommendationMatch = ariaResponse.match(/(?:I recommend|My recommendation|You should|Consider|I suggest|The best[^.!?]*is)[^.!?]*[.!?]/i)
  if (!recommendationMatch) return
  const recommendation = recommendationMatch[0].trim()
  if (recommendation.length < 30) return
  // Don't store recommendations that quote volatile metrics (dollar figures, percentages, counts)
  if (isVolatileMetric(recommendation)) return

  await persistMemories(businessId, [{
    kind: 'decision',
    content: recommendation,
    topic: 'advice',
    importance: 7,
    confidence: 0.80,
  }], conversationId ?? null).catch(() => {})
}

export async function persistMemories(
  businessId: string,
  memories: ExtractedMemory[],
  sourceConversationId: string | null,
): Promise<{ inserted: number; skipped: number }> {
  if (memories.length === 0) return { inserted: 0, skipped: 0 }

  const { data: existing } = await supabaseAdmin
    .from('aria_business_memory')
    .select('content')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .is('deleted_at', null)

  const existingNormalised = new Set(
    (existing ?? []).map((r: { content: string }) =>
      r.content.toLowerCase().replace(/[^\w\s]/g, '').slice(0, 80)
    )
  )

  const toInsert = memories
    .filter(m => {
      if (!m.content || m.content.length < 20) return false
      if (isVolatileMetric(m.content)) {
        console.log('[memory/persist] blocked volatile metric:', m.content.slice(0, 80))
        return false
      }
      const key = m.content.toLowerCase().replace(/[^\w\s]/g, '').slice(0, 80)
      return !existingNormalised.has(key)
    })
    .map(m => ({
      business_id: businessId,
      kind: m.kind,
      content: m.content,
      topic: m.topic,
      source_type: 'conversation' as const,
      source_id: sourceConversationId,
      confidence: Math.max(0, Math.min(1, m.confidence)),
      importance: Math.max(1, Math.min(10, Math.round(m.importance))),
    }))

  if (toInsert.length === 0) return { inserted: 0, skipped: memories.length }

  const { error } = await supabaseAdmin.from('aria_business_memory').insert(toInsert)
  if (error) {
    console.error('[memory/persist] insert failed:', error.message)
    return { inserted: 0, skipped: memories.length }
  }
  return { inserted: toInsert.length, skipped: memories.length - toInsert.length }
}

import { callAnthropic } from '../providers/anthropic'
import { parseLLMJsonOr } from '@/lib/ai-json'

export type AriaIntentType = 'analytical' | 'artifact_request' | 'action' | 'general' | 'smalltalk'

export type ComparisonPeriod =
  | 'same_week_last_month'
  | 'last_month'
  | 'last_week'
  | 'last_year'
  | 'today'
  | null

export interface AriaIntent {
  intent_type: AriaIntentType
  needs_business_data: boolean
  comparison_period: ComparisonPeriod
  wants_visual: boolean
  is_action: boolean
  routing_reason: string
}

const FALLBACK: AriaIntent = {
  intent_type: 'analytical',
  needs_business_data: true,
  comparison_period: null,
  wants_visual: false,
  is_action: false,
  routing_reason: 'fallback-default',
}

const VALID_INTENT_TYPES = new Set<AriaIntentType>([
  'analytical', 'artifact_request', 'action', 'general', 'smalltalk',
])

const VALID_COMPARISON_PERIODS = new Set<ComparisonPeriod>([
  'same_week_last_month', 'last_month', 'last_week', 'last_year', 'today', null,
])

const SYSTEM = `You are a semantic intent classifier for an AI business assistant called Aria.
Classify the owner message by MEANING, not by keywords. Handle imperfect English, typos, abbreviations.

Common typo mappings (treat these as equivalent):
- "munth" / "mont" / "mth" → month
- "revenew" / "revenu" → revenue
- "compar" / "compair" → compare
- "las week" → last week
- "sane weak" → same week

Intent types:
- analytical: questions about business data, performance, comparisons, trends, advice, "should I", "why", "how can", "compare X vs Y", "am I on track". IMPORTANT: "compare" and "vs" = analytical, NOT artifact_request.
- artifact_request: owner EXPLICITLY requests a file, chart, export, download, visual, report, poster, or spreadsheet as the PRIMARY OUTPUT. Only use when the artifact is the end goal, not when they want an analytical answer and also want it charted.
- action: wants Aria to DO something (update a price, send a message, create a promo, mark something). Not just asking about it — actually requesting the action.
- general: question has nothing to do with the business — general world knowledge, consumer tech help, personal advice, entertainment, lifestyle, cooking, travel, health. Example: "how do I lose weight", "what is the capital of France", "recommend a movie".
- smalltalk: greetings, thanks, chitchat. "hi", "thanks", "great job".

comparison_period — what time window is the owner comparing TO? Classify as one of:
- "same_week_last_month": "same week last month", "same period last month", "this time last month", "4 weeks ago"
- "last_month": "last month", "previous month", "past month", "compared to last month"
- "last_week": "last week", "previous week", "past week", "las week"
- "last_year": "last year", "same time last year", "year on year", "YoY", "12 months ago"
- "today": "today", "this morning", "right now", "since open"
- null: no comparison period mentioned, or unclear

CRITICAL RULES:
1. If the owner says "compare", "vs", "versus", "against", "am I on track" → intent_type = "analytical" (NOT artifact_request)
2. artifact_request ONLY when: "give me a chart", "export to excel", "download CSV", "generate a report", "make a poster", "create a visual", "show me a chart OF" — where the FILE or VISUAL is explicitly the deliverable
3. If unsure between analytical and artifact_request → choose analytical (safer, routes to council with narrative)
4. wants_visual = true only when they want a visual AS the answer, not just because their question might be shown with a chart
5. Default to analytical when in doubt — it always produces a thorough answer

Respond with JSON only (no extra text):
{
  "intent_type": "analytical|artifact_request|action|general|smalltalk",
  "needs_business_data": true|false,
  "comparison_period": "same_week_last_month|last_month|last_week|last_year|today|null",
  "wants_visual": true|false,
  "is_action": true|false,
  "routing_reason": "one sentence explaining the classification"
}`

export async function classifyAriaIntent(message: string): Promise<AriaIntent> {
  try {
    const result = await callAnthropic<AriaIntent>(
      {
        model: 'haiku',
        systemPrompt: SYSTEM,
        userPrompt: message,
        maxTokens: 200,
        agentKey: 'aria_intent_classifier',
        role: 'classify',
      },
      FALLBACK,
    )

    const parsed = parseLLMJsonOr<AriaIntent>(result.raw, FALLBACK, 'aria-intent/classify')

    // Validate intent_type is a known value — guard against LLM hallucination
    if (!VALID_INTENT_TYPES.has(parsed.intent_type)) {
      console.warn('[aria-intent] unknown intent_type:', parsed.intent_type, '— using fallback')
      return FALLBACK
    }

    // Validate comparison_period — coerce nulls properly
    const cp = parsed.comparison_period as string | null
    const validCp = VALID_COMPARISON_PERIODS.has(cp as ComparisonPeriod)
    const comparison_period: ComparisonPeriod = validCp ? (cp as ComparisonPeriod) : null

    return { ...parsed, comparison_period }
  } catch (err) {
    console.error('[aria-intent] classifyAriaIntent failed, using fallback:', (err as Error).message)
    return FALLBACK
  }
}

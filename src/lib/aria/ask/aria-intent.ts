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

Common typo/variant mappings (treat ALL of these as equivalent):
- "munth" / "mont" / "mth" / "mnth" → month
- "revenew" / "revenu" → revenue
- "compar" / "compair" → compare
- "las week" / "lst week" → last week
- "sane weak" → same week
- "hows" / "how's" / "how'd" / "how did" → how is (business performance question)
- "up or down" / "up/down" → comparison question

Intent types:
- analytical: ANY question about business data, performance, comparisons, trends, advice. This includes ALL of:
  • "how did we do / how'd we do / hows business / how are we doing / how is the business" + any time reference
  • "are we up or down / up or down from / better than / worse than" any period
  • "compare X vs Y / vs last month / vs same week" and all typo variants
  • "am I on track / hit my target / on target"
  • "should I / why / how can / what would / is it worth / should we"
  • ANY question that references a time period comparison even loosely (e.g., "vs same week last munth")
  NEVER classify business-performance questions as 'general'. If it mentions the business, revenue, sales, customers, staff, or trade — it is analytical.
- artifact_request: owner EXPLICITLY requests a FILE, chart, export, download, visual, report, poster, or spreadsheet as the PRIMARY OUTPUT. Only use when the artifact IS the end goal. "Give me a chart", "export to excel", "download CSV", "generate a report".
- action: wants Aria to DO something (update a price, send a message, create a promo). Not asking about it — requesting the action.
- general: has NOTHING to do with the business — pure general world knowledge, consumer tech help (browsers, phones), personal lifestyle (weight loss, cooking, travel). NEVER use for questions involving business performance, revenue, sales, customers, or operations.
- smalltalk: greetings, thanks, chitchat only. "hi", "thanks", "great job".

comparison_period — detect the time window being compared TO. IMPORTANT: recognize typos.
- "same_week_last_month": any of: "same week last month/munth", "same week last munth", "4 weeks ago", "this time last month", "same period last month", "vs same week last month/munth", "compared to same week last month"
- "last_month": "last month/munth", "previous month", "past month", "vs last month/munth", "compared to last month", "a month ago"
- "last_week": "last week", "previous week", "past week", "las week", "vs last week", "a week ago"
- "last_year": "last year", "same time last year", "year on year", "YoY", "12 months ago"
- "today": "today", "this morning", "right now", "since open", "so far today"
- null: no comparison period mentioned or truly unclear

CRITICAL RULES:
1. "how did we do vs same week last munth" → analytical + same_week_last_month (typo munth = month)
2. "hows business vs last month" → analytical + last_month
3. "are we up or down from a month ago" → analytical + last_month
4. "did we do better than last munth" → analytical + last_month
5. If ANYTHING in the message resembles a business comparison (vs, up/down, better/worse, compared to, same week) → analytical
6. artifact_request ONLY when a file/export/chart is the explicit deliverable, not when they want an answer
7. Default to analytical when in doubt — it always routes to the best answer path

FEW-SHOT EXAMPLES (follow these exactly):
"how did we do vs same week last munth?" → {"intent_type":"analytical","comparison_period":"same_week_last_month","needs_business_data":true,"wants_visual":false,"is_action":false,"routing_reason":"business performance comparison to same week last month (munth=month typo)"}
"hows business vs last month" → {"intent_type":"analytical","comparison_period":"last_month","needs_business_data":true,"wants_visual":false,"is_action":false,"routing_reason":"casual business performance check vs last month"}
"are we up or down from a month ago" → {"intent_type":"analytical","comparison_period":"last_month","needs_business_data":true,"wants_visual":false,"is_action":false,"routing_reason":"revenue comparison to one month ago"}
"did we do better than last munth" → {"intent_type":"analytical","comparison_period":"last_month","needs_business_data":true,"wants_visual":false,"is_action":false,"routing_reason":"performance comparison to last month (munth=month typo)"}
"show me a sales chart" → {"intent_type":"artifact_request","comparison_period":null,"needs_business_data":true,"wants_visual":true,"is_action":false,"routing_reason":"explicit chart/visual request"}
"what is the capital of France" → {"intent_type":"general","comparison_period":null,"needs_business_data":false,"wants_visual":false,"is_action":false,"routing_reason":"general knowledge question unrelated to business"}

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

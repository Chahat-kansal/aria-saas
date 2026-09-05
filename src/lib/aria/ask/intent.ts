import { callAnthropic } from '../providers/anthropic'
import { callGemini } from '../providers/gemini'
import { parseLLMJsonOr } from '@/lib/ai-json'

export type IntentType = 'question' | 'file_export' | 'troubleshoot' | 'escalate' | 'smalltalk' | 'technical' | 'general'

export type Complexity = 'simple' | 'complex'

export interface ClassifiedIntent {
  type: IntentType
  confidence: 'high' | 'medium' | 'low'
  complexity?: Complexity
  export_format?: 'csv' | 'excel' | 'pdf'
  export_subject?: string
  export_period?: string
  issue_summary?: string
  issue_category?: 'hardware' | 'billing' | 'bug' | 'data' | 'general'
}

const SYSTEM = `You are an intent classifier for a business AI assistant. Classify the user message into one of these intents:
- question: asking for information, analysis, or advice about their business
- file_export: wants to download or generate a CSV, Excel, or PDF file
- troubleshoot: reporting a technical problem (hardware, sync, data, POS issues)
- escalate: explicitly asking to speak to support or lodge a complaint
- smalltalk: greetings, thanks, general chitchat
- technical: pasting code/errors/stack traces, asking to debug, "fix this", "what does this do", "how do I", "write SQL", reading Vercel logs — code and developer help requests
- general: the question has NOTHING to do with this business — general world knowledge, consumer tech help (browsers, phones, apps — NOT Aria OS), personal advice, lifestyle, science, entertainment, sports, cooking, travel, health, general writing tasks (poems, generic emails not tied to business operations). Examples: "why does Chrome lag", "write a haiku", "what's the capital of France", "recommend a movie", "how do I lose weight". IMPORTANT: if the question could plausibly be about the business OR general (e.g. "how do I grow", "give me marketing tips"), classify it as question (business) — only use general when the question clearly has nothing to do with running a business.

ALSO classify complexity:
- simple: a direct factual lookup with at most one comparison. Examples: "revenue today", "low stock", "top customers", "how many sales last week", "is X selling".
- complex: requires multi-step reasoning, root-cause analysis, comparison across multiple dimensions, hypothetical/what-if thinking, optimisation, or weighing tradeoffs. Examples: "why is my profit down this quarter", "should I drop X product", "what would happen if I raised prices 5%", "compare strategies for clearing dead stock", "what is driving the change in average ticket size", "diagnose this trend", "should I", "what's the best way to", "help me decide".

FILE_EXPORT triggers — classify as file_export if the message contains ANY of:
  "export", "download", "give me a file", "as a csv", "as excel", "as pdf",
  "generate a report", "pull a report", "get me a list", "send me a report",
  "csv of", "excel of", "pdf of", "spreadsheet", "extract", "dump",
  "can you export", "i need a file", "get a report", "run a report"

TECHNICAL triggers — classify as technical if message contains ANY of:
  error stack traces, TypeError/SyntaxError/ReferenceError, "fix this", "what does this do",
  "how do I [implement/write/create/add]", "write SQL", "write a query", "debug", "Vercel log",
  code blocks (text with backticks or indented code), ".ts", ".tsx", ".js", "route.ts", "import ",
  "undefined is not", "cannot read properties", "null reference", "TypeError", "build failed"

For file_export, identify: export_format (csv/excel/pdf — default csv if unspecified), export_subject (sales/inventory/staff/customers/products — infer from context), export_period (today/week/month — default month if unspecified).
For troubleshoot/escalate, identify: issue_summary (brief), issue_category (hardware/billing/bug/data/general).

Respond with JSON only: {"type":"...","confidence":"high|medium|low","complexity":"simple|complex","export_format":"...","export_subject":"...","export_period":"...","issue_summary":"...","issue_category":"..."}`

export interface OutputFormat {
  wants_chart: boolean
  chart_type?: string
  chart_color?: string
  wants_table: boolean
  wants_download: boolean
  wants_comparison: boolean
}

function extractColor(m: string): string | undefined {
  const colors: Record<string, string> = {
    green: '#22c55e', red: '#ef4444', blue: '#3b82f6',
    purple: '#a855f7', orange: '#f97316', yellow: '#eab308',
    teal: '#14b8a6', sage: '#7FB897', forest: '#2D5240',
    lime: '#d9f54e', pink: '#ec4899', indigo: '#6366f1',
  }
  for (const [name, hex] of Object.entries(colors)) {
    if (m.includes(name)) return hex
  }
  const hexMatch = m.match(/#[0-9a-f]{6}/i)
  return hexMatch ? hexMatch[0] : undefined
}

export function detectOutputFormat(message: string): OutputFormat {
  const m = message.toLowerCase()
  return {
    wants_chart: /chart|graph|plot|visualis|bar|line|pie|area/.test(m),
    chart_type: m.includes('bar') ? 'bar' : m.includes('line') ? 'line' :
                m.includes('pie') ? 'pie' : m.includes('area') ? 'area' : undefined,
    chart_color: extractColor(m),
    wants_table: /table|tabular|rows|list of|show me all/.test(m),
    wants_download: /spreadsheet|export|download|csv|excel/.test(m),
    wants_comparison: /compare|vs |versus|against|this week vs|vs last/.test(m),
  }
}

/**
 * M12 PHASE 5 — businessId, so the call is LOGGED.
 *
 * `callAnthropic` gates its aria_ai_calls insert on `if (params.businessId)`. Neither classifier
 * passed one, so `agent_key='intent_classifier'` had ZERO rows in the ledger — ever — across 412
 * ask_aria turns, while running TWICE per turn. Not a bug in the logger: a bug in the call sites.
 *
 * This is why "why did that turn go to haiku?" had to be reconstructed by re-running the
 * classifiers by hand instead of read off the ledger, and it is the fourth unlogged call path after
 * AI-COST-AUDIT-1's three.
 *
 * ⚠️ MEASURED AI SPEND WILL RISE when this ships. Nothing new is being called — this records what
 * was already happening and was undercounted.
 */
export async function classifyIntent(
  message: string,
  conversationContext?: string,
  businessId?: string,
): Promise<ClassifiedIntent> {
  const SAFE_DEFAULT: ClassifiedIntent = { type: 'question', confidence: 'low', complexity: 'simple' }
  const userPrompt = conversationContext
    ? `Recent context:\n${conversationContext}\n\nNew message: ${message}`
    : message

  try {
    // NOTE: Gemini Flash-Lite previously used here was causing 30s+ timeouts
    // that ate the entire 60s Vercel function budget. Haiku is fast (~500ms) and reliable.
    const result = await callAnthropic<ClassifiedIntent>(
      {
        model: 'haiku',
        systemPrompt: SYSTEM,
        userPrompt,
        maxTokens: 200,
        agentKey: 'intent_classifier',
        role: 'classify',
        businessId,
      },
      SAFE_DEFAULT,
    )

    // Anthropic returned empty (provider down / billing) — try Gemini so classification is real,
    // not a hardcoded default that might mis-route the question to the general fast-path.
    if (!result.raw) {
      console.warn('[intent] Anthropic returned empty — trying Gemini fallback for classification')
      try {
        const gemResult = await callGemini({
          systemPrompt: SYSTEM,
          userPrompt,
          maxTokens: 200,
          agentKey: 'intent_classifier',
          role: 'classify',
          businessId,
        })
        if (gemResult.raw) {
          const parsed = parseLLMJsonOr<ClassifiedIntent>(gemResult.raw, SAFE_DEFAULT, 'intent/classify-gemini')
          if (parsed?.type) return parsed
        }
      } catch (gemErr) {
        console.warn('[intent] Gemini fallback failed:', (gemErr as Error).message)
      }
      return SAFE_DEFAULT
    }

    return parseLLMJsonOr<ClassifiedIntent>(result.raw, SAFE_DEFAULT, 'intent/classify')
  } catch (err) {
    console.error('[intent] classifyIntent failed:', (err as Error).message)
    return SAFE_DEFAULT
  }
}

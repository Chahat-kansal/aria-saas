import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AskBlock } from './ask-types'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ──────────────────────────────────────────────────────────
type BrainRole = 'growth' | 'risk' | 'strategy' | 'context'

interface BrainOutput {
  role: BrainRole
  observations: string[]
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
  raw: string
  succeeded: boolean
}

export interface CouncilResult {
  final_briefing: string
  ask_blocks?: AskBlock[]
  ask_followups?: string[]
  raw_brain_outputs: BrainOutput[]
  meta: {
    brains_succeeded: number
    brains_failed: number
    synthesis_succeeded: boolean
    fell_back: boolean
    duration_ms: number
  }
}

// ── Utilities ──────────────────────────────────────────────────────
function callWithTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)
    ),
  ])
}

async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await fn() } catch (e) {
      lastErr = e as Error
      const isTransient = /529|503|overload|rate.?limit/i.test(lastErr.message ?? '')
      if (!isTransient || attempt === maxAttempts - 1) throw lastErr
      await new Promise(r => setTimeout(r, Math.min(800 * Math.pow(2, attempt), 3000)))
    }
  }
  throw lastErr ?? new Error('All retries failed')
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const s = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const start = s.indexOf('{'), end = s.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1))
    return null
  } catch { return null }
}

async function logAICall(params: {
  agent_key: string; model_id: string; provider: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id: string; error_message?: string
}) {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id,
      agent_key: params.agent_key,
      provider: params.provider,
      model_id: params.model_id,
      role: 'council',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      success: params.success,
      error_message: params.error_message ?? null,
    })
  } catch { /* non-fatal */ }
}

// ── Brain Prompts ──────────────────────────────────────────────────
// Each brain has a single job. They are biased but rigorous.
// They return JSON only. No prose, no preamble.

const GROWTH_PROMPT = `You are Aria's Growth Brain. One job: find what is working and what could work better.

Scan the data for:
- Products/categories outperforming their weight
- Time patterns (days, hours) with above-average results
- Customer segments showing loyalty signals
- Revenue opportunities being missed or under-exploited

Rules:
- Every claim must cite a specific number from the data
- If data is thin, say so and lower your confidence
- Be optimistic but never fabricate

Return ONLY valid JSON:
{"observations":["specific finding with number"],"recommendations":["specific action with expected outcome"],"confidence":"high|medium|low"}`

const RISK_PROMPT = `You are Aria's Risk Brain. One job: find what is failing and what could fail.

Scan the data for:
- Revenue declining faster than seasonal norms
- Products/categories underperforming or creating drag
- Operational risks (stock, cash, staff coverage)
- Customer loss signals or retention failures

Rules:
- Every problem must be backed by a number
- Distinguish between structural problems vs one-off blips
- Be precise about severity — not everything is critical

Return ONLY valid JSON:
{"observations":["specific problem with evidence number"],"recommendations":["specific fix with expected impact"],"confidence":"high|medium|low"}`

const STRATEGY_PROMPT = `You are Aria's Strategy Brain. One job: reconcile what Growth and Risk found and decide what matters most.

You receive the raw business data and must:
- Identify where Growth and Risk agree (these are facts)
- Identify where they conflict (these are decisions for the owner)
- Determine the single most important lever for the next 7 days
- Consider the business's competitive position and trajectory

Rules:
- Think in 7-day and 30-day horizons, not abstractions
- Prioritise by impact, not urgency — they are different things
- One clear recommendation trumps five vague ones

Return ONLY valid JSON:
{"observations":["strategic read with timeframe"],"recommendations":["prioritised action with rationale"],"confidence":"high|medium|low","primary_lever":"the single most important thing","time_horizon":"7d|30d"}`

const CONTEXT_PROMPT = `You are Aria's Context Brain. One job: find external signals that change the interpretation of the internal data.

You receive the business data and must identify:
- Weather or seasonal effects visible in the data
- What day/week patterns suggest about foot traffic or demand
- Whether the product mix matches the business identity (category confusion)
- Any external signals mentioned in the data (competitor context, events, etc.)

Rules:
- Only cite signals that are actually visible in or inferable from the data
- Do not invent external context not supported by the data
- If no external signals are material, say so — do not pad

Return ONLY valid JSON:
{"observations":["external signal with evidence"],"recommendations":["how to respond to this signal"],"confidence":"high|medium|low"}`

// ── Brain Runner ───────────────────────────────────────────────────
async function callBrain(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  role: BrainRole,
  businessId: string,
  timeoutMs: number,
): Promise<BrainOutput> {
  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model,
        max_tokens: 1200,
        temperature: 0.25,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })),
      timeoutMs,
      'council brain ' + role
    )
    const text = res.content.filter((b: {type:string}) => b.type === 'text').map((b: {type:string,text?:string}) => (b as {text:string}).text).join('')
    const parsed = safeParseJSON(text)
    await logAICall({
      agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      success: !!parsed, business_id: businessId,
    })
    if (!parsed) return { role, observations: [], recommendations: [], confidence: 'low', raw: text, succeeded: false }
    return {
      role,
      observations: Array.isArray(parsed.observations) ? parsed.observations as string[] : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations as string[] : [],
      confidence: (parsed.confidence as 'high'|'medium'|'low') ?? 'medium',
      raw: text,
      succeeded: true,
    }
  } catch (e) {
    await logAICall({
      agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: 0, output_tokens: 0, success: false, business_id: businessId,
      error_message: (e as Error).message,
    })
    return { role, observations: [], recommendations: [], confidence: 'low', raw: '', succeeded: false }
  }
}

// ── Synthesis ──────────────────────────────────────────────────────
// This is where Aria speaks. She has read all 4 brains.
// Her response style is Claude — structured, visual, specific, never padded.

const SYNTHESIS_PROMPT = `You are Aria — the final voice after 4 specialist brains have analysed this business.

You have their findings. Your job is to synthesise them into a response that looks and feels exactly like Claude AI responds — structured, visual, data-dense, specific. Never a wall of text.

HOW CLAUDE RESPONDS (copy this exactly):
- Leads with the single most important insight as a punchy headline with the actual number
- Uses structured blocks: metric cards, bar charts, comparison tables, action lists
- Shows reasoning briefly — what the data says, why it matters, what to do
- Ends with 2-3 specific actions with one-line rationales
- Never pads. Never hedges. Never says "great question" or "I hope this helps"
- Australian English. Direct. Warm but not chatty.
- Under 50 words of prose — let the blocks carry the content

AGREEMENT RULE: Where all/most brains agree → state it as fact, confidently.
CONFLICT RULE: Where brains disagree → present it as a genuine decision, not a recommendation.

BLOCK TYPES you must use:
- "lead": ONE punchy headline sentence with the key number
- "metric_row": 2-4 metric cards. Always include. Format: {"label":"Revenue this week","value":"$209.97","sub":"vs $968 last month","trend":"down"}
- "chart": bar chart of time-series data. Always include when revenue/transaction data exists. {"chartType":"bar","title":"...","labels":[...],"values":[...],"unit":"$","metrics":[...]}
- "brain_readouts": what each brain found. Always include — this is Aria's unique differentiator. {"items":[{"role":"growth","icon":"📈","text":"..."},{"role":"risk","icon":"⚠️","text":"..."},{"role":"strategy","icon":"🎯","text":"..."},{"role":"context","icon":"🌍","text":"..."}]}
- "council_split": only when brains genuinely conflict. Shows the debate and asks owner to decide.
- "text": supporting paragraph. Max 2 sentences. Use sparingly.
- "action_list": 2-3 actions with "Do it" buttons. Always end with this. {"items":[{"icon":"👤","title":"Turn on customer capture","sub":"Every sale leaves as a stranger","colorVariant":"danger","prompt":"How do I enable customer capture?"}]}
- "html": for heatmaps, custom tables, anything that needs a grid layout. Use inline styles. Dark theme. Aria green #7FB897.

MANDATORY STRUCTURE for every response:
1. lead (1 block)
2. metric_row (1 block, always)
3. chart (1 block, if numeric data exists)
4. brain_readouts (1 block, always — all 4 brains)
5. council_split (only if genuine conflict)
6. text (0-1 blocks, max 2 sentences)
7. action_list (1 block, always)

CRITICAL: final_briefing = one sentence only. All content goes in ask_blocks.

Return ONLY valid JSON:
{"final_briefing":"One sentence.","ask_blocks":[...all blocks here...],"ask_followups":["specific question 1?","specific question 2?","specific question 3?"]}`

// ── Main Export ────────────────────────────────────────────────────
export async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'ask_aria' | 'briefing' | 'weekly_report' = 'ask_aria'
): Promise<CouncilResult | null> {
  const start = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const HAIKU = 'claude-haiku-4-5-20251001'
  const SONNET = 'claude-sonnet-4-5-20250929'

  const userPrompt = `Business data:\n${businessContext}`

  // Run all 4 brains in parallel — 18s timeout each
  const [growth, risk, strategy, context] = await Promise.all([
    callBrain(client, HAIKU, GROWTH_PROMPT,   userPrompt, 'growth',   businessId, 18000),
    callBrain(client, HAIKU, RISK_PROMPT,     userPrompt, 'risk',     businessId, 18000),
    callBrain(client, HAIKU, STRATEGY_PROMPT, userPrompt, 'strategy', businessId, 18000),
    callBrain(client, HAIKU, CONTEXT_PROMPT,  userPrompt, 'context',  businessId, 18000),
  ])

  const brains = [growth, risk, strategy, context]
  const succeeded = brains.filter(b => b.succeeded)

  if (succeeded.length === 0) return null

  // Build synthesis input
  const synthesisInput = `
BUSINESS DATA:
${businessContext}

GROWTH BRAIN (confidence: ${growth.confidence}):
Observations: ${growth.observations.join(' | ')}
Recommendations: ${growth.recommendations.join(' | ')}

RISK BRAIN (confidence: ${risk.confidence}):
Observations: ${risk.observations.join(' | ')}
Recommendations: ${risk.recommendations.join(' | ')}

STRATEGY BRAIN (confidence: ${strategy.confidence}):
Observations: ${strategy.observations.join(' | ')}
Recommendations: ${strategy.recommendations.join(' | ')}
Primary lever: ${(strategy.raw && safeParseJSON(strategy.raw)?.primary_lever) ?? 'not identified'}

CONTEXT BRAIN (confidence: ${context.confidence}):
Observations: ${context.observations.join(' | ')}
Recommendations: ${context.recommendations.join(' | ')}

MODE: ${mode}
`.trim()

  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model: SONNET,
        max_tokens: 4000,
        temperature: 0.2,
        system: SYNTHESIS_PROMPT,
        messages: [{ role: 'user', content: synthesisInput }],
      })),
      45000,
      'council synthesis'
    )
    const text = res.content.filter((b: {type:string}) => b.type === 'text').map((b: {type:string,text?:string}) => (b as {text:string}).text).join('')
    const parsed = safeParseJSON(text)

    await logAICall({
      agent_key: 'council_synthesis', model_id: SONNET, provider: 'anthropic',
      input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      success: !!parsed, business_id: businessId,
    })

    if (!parsed) {
      return {
        final_briefing: text.slice(0, 500),
        raw_brain_outputs: brains,
        meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: false, fell_back: true, duration_ms: Date.now() - start },
      }
    }

    return {
      final_briefing: typeof parsed.final_briefing === 'string' ? parsed.final_briefing : text.slice(0, 200),
      ask_blocks: mode === 'ask_aria' && Array.isArray(parsed.ask_blocks) ? parsed.ask_blocks as AskBlock[] : undefined,
      ask_followups: mode === 'ask_aria' && Array.isArray(parsed.ask_followups) ? parsed.ask_followups as string[] : undefined,
      raw_brain_outputs: brains,
      meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: true, fell_back: false, duration_ms: Date.now() - start },
    }
  } catch (e) {
    // Synthesis failed — build fallback from brain outputs directly
    const fallbackBriefing = [
      growth.observations[0],
      risk.observations[0],
      strategy.recommendations[0],
    ].filter(Boolean).join('. ')

    return {
      final_briefing: fallbackBriefing || 'Council completed with partial data.',
      raw_brain_outputs: brains,
      meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: false, fell_back: true, duration_ms: Date.now() - start },
    }
  }
}

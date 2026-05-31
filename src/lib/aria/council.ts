import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AskBlock } from './ask-types'
import { runContextBrain, type ContextBrainOutput } from './context-brain'

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
  context_brain_output?: ContextBrainOutput | null
  meta: {
    brains_succeeded: number
    brains_failed: number
    synthesis_succeeded: boolean
    fell_back: boolean
    duration_ms: number
  }
}

// CouncilOutput extends CouncilResult with consensus fields from prompts 19/20
export type CouncilOutput = CouncilResult & {
  consensus?: string[] | null
  contested?: string[] | null
  confidence_map?: Record<string, string> | null
  layout?: string | null
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
// Each brain has a single job and receives the owner's actual question.
// They return JSON only. No prose, no preamble.

function buildGrowthPrompt(question: string): string {
  return 'You are the Growth Advisor in Aria\'s council. Your ONLY job is revenue growth opportunities.\n' +
    'Owner question: "' + question + '"\n\n' +
    'Answer ONLY from a growth lens — what revenue opportunities does this question reveal?\n' +
    'Be specific to THIS business. Quote their actual numbers. Max 150 words.\n\n' +
    'Scan the data for:\n' +
    '- Products/categories outperforming their weight\n' +
    '- Time patterns (days, hours) with above-average results\n' +
    '- Customer segments showing loyalty signals\n' +
    '- Revenue opportunities being missed or under-exploited\n\n' +
    'Rules:\n' +
    '- Every claim must cite a specific number from the data\n' +
    '- If data is thin, say so and lower your confidence\n' +
    '- Be optimistic but never fabricate\n' +
    '- Plain English. No jargon. Say "your top seller" not "revenue concentration from 1 SKU".\n\n' +
    'Return ONLY valid JSON:\n' +
    '{"observations":["specific finding with number"],"recommendations":["specific action with expected outcome"],"confidence":"high|medium|low"}'
}

function buildRiskPrompt(question: string): string {
  return 'You are the Risk Advisor in Aria\'s council. Your ONLY job is spotting risks and problems.\n' +
    'Owner question: "' + question + '"\n\n' +
    'Answer ONLY from a risk lens — what dangers, risks, or problems does this question reveal?\n' +
    'Be specific to THIS business. Quote their actual numbers. Max 150 words.\n\n' +
    'Scan the data for:\n' +
    '- Revenue declining faster than seasonal norms\n' +
    '- Products/categories underperforming or creating drag\n' +
    '- Operational risks (stock, cash, staff coverage)\n' +
    '- Customer loss signals or retention failures\n\n' +
    'Rules:\n' +
    '- Every problem must be backed by a number\n' +
    '- Distinguish between structural problems vs one-off blips\n' +
    '- Be precise about severity — not everything is critical\n' +
    '- Write like a trusted advisor. Say "sales have been quiet" not "revenue collapsed".\n\n' +
    'Return ONLY valid JSON:\n' +
    '{"observations":["specific problem with evidence number"],"recommendations":["specific fix with expected impact"],"confidence":"high|medium|low"}'
}

function buildStrategyPrompt(question: string): string {
  return 'You are the Strategy Advisor in Aria\'s council. Your ONLY job is long-term positioning.\n' +
    'Owner question: "' + question + '"\n\n' +
    'Answer ONLY from a strategy lens — what does this mean for the business\'s long-term position?\n' +
    'Be specific to THIS business. Quote their actual numbers. Max 150 words.\n\n' +
    'You must:\n' +
    '- Identify the single most important lever for the next 7 days\n' +
    '- Consider the business\'s competitive position and trajectory\n' +
    '- Prioritise by impact, not urgency — they are different things\n' +
    '- One clear recommendation trumps five vague ones\n\n' +
    'Return ONLY valid JSON:\n' +
    '{"observations":["strategic read with timeframe"],"recommendations":["prioritised action with rationale"],"confidence":"high|medium|low","primary_lever":"the single most important thing","time_horizon":"7d|30d"}'
}

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

// buildSynthesisPrompt injects the owner's actual question so every block is question-specific
function buildSynthesisPrompt(question: string, businessName: string, industry: string): string {
  return 'You are Aria — the final voice synthesising 3 expert advisors for: "' + question + '"\n' +
    'Business: ' + businessName + ' (' + industry + ')\n\n' +
    'Write a direct, specific answer to "' + question + '" that weaves all three perspectives.\n' +
    'Start with the most important insight. Use their actual business numbers.\n' +
    'Every sentence must be specific to this business — no generic advice.\n\n' +
    SYNTHESIS_PROMPT_BODY
}

const SYNTHESIS_PROMPT_BODY = `HOW ARIA RESPONDS:
- Leads with the single most important insight as a punchy headline with the actual number
- Uses structured blocks: metric cards, bar charts, comparison tables, action lists
- Shows reasoning briefly — what the data says, why it matters, what to do
- Ends with 2-3 specific actions with one-line rationales
- Never pads. Never hedges. Never says "great question" or "I hope this helps"
- Australian English. Direct. Warm but not chatty.
- NEVER use consultant jargon: no 'structural', 'unsustainable', 'revenue concentration'. Replace with plain owner language.
- Imagine you're a trusted friend who knows the business inside out.
- Under 50 words of prose — let the blocks carry the content

AGREEMENT RULE: Where all/most advisors agree → state it as fact, confidently.
CONFLICT RULE: Where advisors disagree → present it as a genuine decision, not a recommendation.

BLOCK TYPES you must use:
- "lead": ONE punchy headline sentence with the key number
- "metric_row": 2-4 metric cards. Always include. Format: {"label":"Revenue this week","value":"$209.97","sub":"vs $968 last month","trend":"down"}
- "chart": bar chart of time-series data. Always include when revenue/transaction data exists. {"chartType":"bar","title":"...","labels":[...],"values":[...],"unit":"$","metrics":[...]}
- "brain_readouts": what each advisor found in plain owner language. Always include. {"items":[{"role":"growth","icon":"📈","text":"..."},{"role":"risk","icon":"⚠️","text":"..."},{"role":"strategy","icon":"🎯","text":"..."},{"role":"context","icon":"🌍","text":"..."}]}
- "council_split": only when advisors genuinely conflict. Shows the debate and asks owner to decide.
- "text": supporting paragraph. Max 2 sentences. Use sparingly.
- "action_list": 2-3 actions with "Do it" buttons. Always end with this. {"items":[{"icon":"👤","title":"Turn on customer capture","sub":"Every sale leaves as a stranger","colorVariant":"danger","prompt":"How do I enable customer capture?"}]}
- "html": for heatmaps, custom tables, anything that needs a grid layout. Use inline styles. Dark theme. Aria green #7FB897.

MANDATORY STRUCTURE for every response:
1. lead (1 block)
2. metric_row (1 block, always)
3. chart (1 block, if numeric data exists)
4. brain_readouts (1 block, always — all advisors)
5. council_split (only if genuine conflict)
6. text (0-1 blocks, max 2 sentences)
7. action_list (1 block, always)

final_briefing is what Aria SPEAKS — 2-3 short paragraphs (80-150 words). Written in Aria's voice.
Para 1: The headline finding with the actual number. Direct, no padding.
Para 2: Why it matters for the business right now. Specific.
Para 3: The single most important action and why. Not a menu — one thing.
Australian English. Never start with "I". Use real figures from the data. Warm but direct.
The ask_blocks are the VISUAL layer (charts, metric cards, action buttons). final_briefing is the NARRATIVE.

When external context is provided, use it to enrich the briefing but always label it as external context.

Return ONLY valid JSON:
{"final_briefing":"...2-3 paragraphs...","ask_blocks":[...all blocks here...],"ask_followups":["specific question 1?","specific question 2?","specific question 3?"]}`

const SYNTHESIS_PROMPT = `You are Aria — the final voice after 4 specialist brains have analysed this business.

You have their findings. Your job is to synthesise them into a response that looks and feels exactly like Claude AI responds — structured, visual, data-dense, specific. Never a wall of text.

HOW CLAUDE RESPONDS (copy this exactly):
- Leads with the single most important insight as a punchy headline with the actual number
- Uses structured blocks: metric cards, bar charts, comparison tables, action lists
- Shows reasoning briefly — what the data says, why it matters, what to do
- Ends with 2-3 specific actions with one-line rationales
- Never pads. Never hedges. Never says "great question" or "I hope this helps"
- Australian English. Direct. Warm but not chatty.
- NEVER use consultant jargon: no 'structural', 'unsustainable', 'revenue concentration', 'data integrity', 'configuration gap'. Replace with plain owner language: 'quiet week', 'one product doing most of the work', 'customers not being saved to sales'.
- Imagine you're a trusted friend who knows the business inside out, not a McKinsey report.
- Under 50 words of prose — let the blocks carry the content

AGREEMENT RULE: Where all/most brains agree → state it as fact, confidently.
CONFLICT RULE: Where brains disagree → present it as a genuine decision, not a recommendation.

BLOCK TYPES you must use:
- "lead": ONE punchy headline sentence with the key number
- "metric_row": 2-4 metric cards. Always include. Format: {"label":"Revenue this week","value":"$209.97","sub":"vs $968 last month","trend":"down"}
- "chart": bar chart of time-series data. Always include when revenue/transaction data exists. {"chartType":"bar","title":"...","labels":[...],"values":[...],"unit":"$","metrics":[...]}
- "brain_readouts": what each brain found in plain owner language — not consultant speak. Always include. Translate findings into how a business owner would say it. {"items":[{"role":"growth","icon":"📈","text":"..."},{"role":"risk","icon":"⚠️","text":"..."},{"role":"strategy","icon":"🎯","text":"..."},{"role":"context","icon":"🌍","text":"..."}]}
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

final_briefing is what Aria SPEAKS — 2-3 short paragraphs (80-150 words). Written in Aria's voice.
Para 1: The headline finding with the actual number. Direct, no padding.
Para 2: Why it matters for the business right now. Specific.
Para 3: The single most important action and why. Not a menu — one thing.
Australian English. Never start with "I". Use real figures from the data. Warm but direct.
The ask_blocks are the VISUAL layer (charts, metric cards, action buttons). final_briefing is the NARRATIVE that Aria reads alongside them.

When external context is provided, use it to enrich the briefing (e.g. mention a public holiday, local event, or weather impact) but always label it as external context and never treat it as more reliable than the internal business data.

Return ONLY valid JSON:
{"final_briefing":"Revenue collapsed 78% — $209 this week vs $968 last month. That's structural, not seasonal.\n\nZero customers are tracked. Every sale left as a stranger. Without names you have no retention strategy — just hope they walk past again.\n\nCapture customer names at the till today. Start with a notebook. That one change gives you something to build on.","ask_blocks":[...all blocks here...],"ask_followups":["specific question 1?","specific question 2?","specific question 3?"]}`

// ── Main Export ────────────────────────────────────────────────────
export async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'ask_aria' | 'briefing' | 'weekly_report' = 'ask_aria',
  question?: string,
): Promise<CouncilOutput | null> {
  const start = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const HAIKU = 'claude-haiku-4-5-20251001'
  const SONNET = 'claude-sonnet-4-5-20250929'

  const activeQuestion = question ?? 'Analyse this business and give me your most important insights.'
  const userPrompt = `Business data:\n${businessContext}`

  // Fetch business info for Gemini context brain — optional, non-blocking
  let bizInfo: { trading_name: string; industry: string; city: string; state: string } | null = null
  try {
    const { data: bd } = await supabaseAdmin.from('businesses')
      .select('trading_name, name, industry, city, suburb, state')
      .eq('id', businessId).single()
    if (bd) {
      const d = bd as Record<string, string | null>
      bizInfo = {
        trading_name: d.trading_name ?? d.name ?? 'this business',
        industry: d.industry ?? 'retail',
        city: d.city ?? d.suburb ?? 'Australia',
        state: d.state ?? 'AU',
      }
    }
  } catch { /* non-fatal — context brain is optional */ }

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
  weekStart.setHours(0, 0, 0, 0)

  const geminiPromise: Promise<ContextBrainOutput | null> = bizInfo
    ? runContextBrain(bizInfo, weekStart, businessId).catch(() => null)
    : Promise.resolve(null)

  // Run all 5 in parallel — 4 internal Claude brains + optional Gemini context brain
  const [growth, risk, strategy, context, ctxOutput] = await Promise.all([
    callBrain(client, HAIKU, buildGrowthPrompt(activeQuestion),   userPrompt, 'growth',   businessId, 18000),
    callBrain(client, HAIKU, buildRiskPrompt(activeQuestion),     userPrompt, 'risk',     businessId, 18000),
    callBrain(client, HAIKU, buildStrategyPrompt(activeQuestion), userPrompt, 'strategy', businessId, 18000),
    callBrain(client, HAIKU, CONTEXT_PROMPT,                      userPrompt, 'context',  businessId, 18000),
    geminiPromise,
  ])

  const brains = [growth, risk, strategy, context]
  const succeeded = brains.filter(b => b.succeeded)

  if (succeeded.length === 0) return null

  // Build synthesis input — use Haiku for synthesis too (cost reduction)
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
${ctxOutput && !ctxOutput.failed ? `
EXTERNAL CONTEXT (from web search — treat as lower confidence than internal data):
Factors: ${ctxOutput.external_factors.join(', ') || 'none found'}
Risks: ${ctxOutput.risk_flags.join(', ') || 'none'}
Opportunities: ${ctxOutput.opportunities.join(', ') || 'none'}
Note: this is real-time web data — verify if acting on it.` : ''}
MODE: ${mode}
`.trim()

  const synthesisSystemPrompt = buildSynthesisPrompt(
    activeQuestion,
    bizInfo?.trading_name ?? 'Your business',
    bizInfo?.industry ?? 'retail',
  )

  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model: HAIKU,
        max_tokens: 4000,
        temperature: 0.2,
        system: synthesisSystemPrompt,
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
        context_brain_output: ctxOutput ?? null,
        meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: false, fell_back: true, duration_ms: Date.now() - start },
      }
    }

    return {
      final_briefing: typeof parsed.final_briefing === 'string' ? parsed.final_briefing : text.slice(0, 200),
      ask_blocks: (mode === 'ask_aria' || mode === 'briefing') && Array.isArray(parsed.ask_blocks) ? parsed.ask_blocks as AskBlock[] : undefined,
      ask_followups: mode === 'ask_aria' && Array.isArray(parsed.ask_followups) ? parsed.ask_followups as string[] : undefined,
      raw_brain_outputs: brains,
      context_brain_output: ctxOutput ?? null,
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
      context_brain_output: ctxOutput ?? null,
      meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: false, fell_back: true, duration_ms: Date.now() - start },
    }
  }
}

// ── Council run logging ────────────────────────────────────────────
export async function insertCouncilRun(
  businessId: string,
  mode: string,
  council: CouncilOutput | null,
  fellBack: boolean,
): Promise<void> {
  try {
    await supabaseAdmin.from('council_runs').insert({
      business_id: businessId,
      mode,
      final_briefing: council?.final_briefing ?? null,
      consensus: council?.consensus ?? null,
      contested: council?.contested ?? null,
      confidence_map: council?.confidence_map ?? null,
      raw_brain_outputs: council?.raw_brain_outputs ?? null,
      context_brain_output: council?.context_brain_output ?? null,
      brains_succeeded: council?.meta?.brains_succeeded ?? 0,
      brains_failed: council?.meta?.brains_failed ?? 0,
      synthesis_succeeded: council?.meta?.synthesis_succeeded ?? false,
      fell_back_to_single_model: fellBack,
      duration_ms: council?.meta?.duration_ms ?? 0,
    })
  } catch { /* non-fatal — logging should never break the briefing */ }
}

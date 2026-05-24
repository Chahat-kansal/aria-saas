import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runContextBrain, type ContextBrainOutput } from './context-brain'

export type BrainRole = 'optimist' | 'critic' | 'strategist'
export type BrainOutput = {
  role: BrainRole
  observations: string[]
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  failed?: boolean
}
export type CouncilOutput = {
  consensus: string[]
  contested: Array<{ topic: string; optimist_view: string; critic_view: string; strategist_view: string }>
  final_briefing: string
  confidence_map: Record<string, 'high' | 'medium' | 'low'>
  raw_brain_outputs: BrainOutput[]
  context_brain_output?: ContextBrainOutput
  meta: {
    brains_succeeded: number
    brains_failed: number
    synthesis_succeeded: boolean
    fell_back: boolean
    duration_ms: number
  }
}

function callWithTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)
    ),
  ])
}

async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await fn() } catch (e) {
      lastErr = e as Error
      const isTransient = /529|503|overload|rate.?limit/i.test(lastErr.message ?? '')
      if (!isTransient || attempt === maxAttempts - 1) throw lastErr
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 4000)))
    }
  }
  throw lastErr ?? new Error('All retries failed')
}

function safeParseJSON(text: string): any | null {
  try {
    const stripped = text.trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1))
    return null
  } catch { return null }
}

async function logAICall(params: {
  agent_key: string
  model_id: string
  provider: string
  input_tokens: number
  output_tokens: number
  success: boolean
  business_id: string
  error_message?: string
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
  } catch { /* non-fatal — log failure must not break the caller */ }
}

const OPTIMIST_PROMPT = `You are Aria's Growth Brain — a senior AI analyst for an Australian small business. You handle businesses of any complexity — a 12-product corner shop or a 400-product liquor warehouse with hundreds of customers.

Your role: find genuine OPPORTUNITY in the business data. Look for what is working better than expected, which products/customers/time-slots are performing well, untapped potential, and positive momentum to amplify.

You are biased toward opportunity — but you are rigorous, not naive. Every observation MUST cite a specific number from the data. Never give generic advice. If the data genuinely shows little upside, say so honestly with low confidence — do not invent positives.

You can handle dense, contradictory data. If many patterns exist at once, identify the 3-5 that matter most.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["specific observation with a number"],"recommendations":["specific action with expected outcome"],"confidence":"high|medium|low","reasoning":"why you reached these conclusions"}`

const CRITIC_PROMPT = `You are Aria's Risk Brain — a senior AI analyst for an Australian small business. You handle businesses of any complexity.

Your role: find genuine PROBLEMS and RISKS in the business data. Look for what is underperforming or declining, customers at risk of leaving, money leaking or being wasted, patterns that suggest something is wrong, what the owner is probably ignoring, and suspicious patterns (unusual voids, discount abuse, cash variance).

You are biased toward identifying risk — but you are precise, not pessimistic. Do not manufacture problems that aren't there. Every observation MUST cite a specific number. If the data genuinely shows no problems, say so honestly with high confidence.

You can handle dense, contradictory data. Prioritise the most serious risks.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["specific problem with number evidence"],"recommendations":["specific action to fix it"],"confidence":"high|medium|low","reasoning":"why you identified these risks"}`

const STRATEGIST_PROMPT = `You are Aria's Strategy Brain — a senior AI advisor for an Australian small business. Two other analysts (an Optimist and a Critic) have reviewed the same data. Your role is the WHOLE PICTURE.

You handle businesses of any complexity and you excel at reconciling CONTRADICTORY signals — growth in one area while another declines — into one coherent strategic read.

Identify: the business's position and trajectory over the next 30-90 days, whether the growth and risk signals are connected, the health of the customer relationship (not just the finances), and — most importantly — the SINGLE most important thing the owner should focus on this week.

You are balanced. You do not lean optimistic or pessimistic. You think like a trusted advisor who has watched this business for months. Every observation cites a specific number.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"observations":["strategic observation with a number"],"recommendations":["strategic action with rationale"],"confidence":"high|medium|low","reasoning":"your strategic assessment right now"}`

const SYNTHESIS_PROMPT = `You are the final voice of Aria — an AI business co-operator for an Australian small business. Three specialised analysts (Growth, Risk, Strategy) have independently reviewed this business's data. You have their outputs. Synthesise them into ONE clear, useful output for the owner.

Rules:
1. Where all three agree — state it with confidence. These are facts.
2. Where two agree, one dissents — state the majority view, note the caveat honestly ("Aria is fairly confident, but worth watching...").
3. Where all three disagree — present it as a genuine decision the owner must make, not a recommendation ("Our analysts are split...").
4. Lead with the single most important thing the owner needs to know today.
5. Be specific — use actual numbers. Never vague.
6. Australian English. Conversational but professional — like a trusted business partner who has watched this business for months.
7. For briefing mode: 200-300 words — lead insight, 2-3 supporting observations, 1-2 specific actions, one thing to watch.
8. Never invent data not in the context. If data is thin, say so.
9. If only one or two brains succeeded, still produce the best possible briefing from what you have — note nothing about "brains" to the owner.

You also have external context from a web search. Use it to enrich the briefing when relevant (e.g. 'there is a public holiday next Monday — plan staffing') but always label it as external context and never treat it as more reliable than the internal business data.

Return ONLY valid JSON, no preamble, no markdown, no code fences:
{"consensus":["things all agreed on"],"contested":[{"topic":"...","optimist_view":"...","critic_view":"...","strategist_view":"..."}],"final_briefing":"the complete briefing text shown to the owner","confidence_map":{"insight key":"high|medium|low"}}`

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
        max_tokens: role === 'strategist' ? 3000 : 2200,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })),
      timeoutMs,
      'council brain ' + role
    )
    const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const parsed = safeParseJSON(text)
    await logAICall({
      agent_key: 'council_' + role,
      model_id: model,
      provider: 'anthropic',
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      success: true,
      business_id: businessId,
    })
    if (!parsed) {
      return { role, observations: [], recommendations: [], confidence: 'low',
        reasoning: 'output could not be parsed', failed: true }
    }
    return {
      role,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      confidence: parsed.confidence ?? 'low',
      reasoning: parsed.reasoning ?? '',
      failed: false,
    }
  } catch (e) {
    console.error('[council] brain ' + role + ' failed:', (e as Error).message)
    await logAICall({
      agent_key: 'council_' + role,
      model_id: model,
      provider: 'anthropic',
      input_tokens: 0,
      output_tokens: 0,
      success: false,
      error_message: (e as Error).message,
      business_id: businessId,
    })
    return { role, observations: [], recommendations: [], confidence: 'low',
      reasoning: 'brain failed: ' + (e as Error).message, failed: true }
  }
}

async function callSynthesis(
  client: Anthropic,
  businessContext: string,
  outputs: BrainOutput[],
  mode: string,
  businessId: string,
  contextBrain?: ContextBrainOutput,
): Promise<any> {
  const brainSummary = outputs.map(o =>
    '[' + o.role.toUpperCase() + '] confidence:' + o.confidence +
    '\nObservations: ' + o.observations.join('; ') +
    '\nRecommendations: ' + o.recommendations.join('; ') +
    '\nReasoning: ' + o.reasoning
  ).join('\n\n')
  const ctxSection = (contextBrain && !contextBrain.failed)
    ? '\n\nEXTERNAL CONTEXT (from web search — treat as lower confidence than internal data):\n' +
      'Factors: ' + (contextBrain.external_factors.join(', ') || 'none found') + '\n' +
      'Risks: ' + (contextBrain.risk_flags.join(', ') || 'none') + '\n' +
      'Opportunities: ' + (contextBrain.opportunities.join(', ') || 'none') + '\n' +
      'Note: this is real-time web data — verify if acting on it.'
    : ''
  const userPrompt = 'Business data:\n\n' + businessContext + '\n\nMode: ' + mode + '\n\nBrain outputs:\n' + brainSummary + ctxSection

  const res = await callWithTimeout(
    () => withBackoff(() => client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 3000,
      temperature: 0.3,
      system: SYNTHESIS_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })),
    60000,
    'council synthesis'
  )
  const text = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  await logAICall({
    agent_key: 'council_synthesis',
    model_id: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    input_tokens: res.usage?.input_tokens ?? 0,
    output_tokens: res.usage?.output_tokens ?? 0,
    success: true,
    business_id: businessId,
  })
  const parsed = safeParseJSON(text)
  if (!parsed) throw new Error('synthesis output could not be parsed')
  return parsed
}

export async function runAriaCouncil(
  businessContext: string,
  businessId: string,
  mode: 'briefing' | 'weekly_report' | 'ask_aria',
): Promise<CouncilOutput> {
  const start = Date.now()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
  const userPrompt = 'Business data for analysis:\n\n' + businessContext + '\n\nMode: ' + mode

  let bizInfo: { trading_name: string; industry: string; city: string; state: string; business_id?: string }
  try {
    const parsed = JSON.parse(businessContext)
    bizInfo = {
      trading_name: parsed?.business?.name ?? 'this business',
      industry: parsed?.business?.industry ?? 'retail',
      city: parsed?.business?.city ?? 'Melbourne',
      state: 'AU',
      business_id: businessId,
    }
  } catch {
    bizInfo = { trading_name: 'this business', industry: 'retail', city: 'Melbourne', state: 'AU', business_id: businessId }
  }

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
  weekStart.setHours(0, 0, 0, 0)

  const [a, b, c, ctxResult] = await Promise.allSettled([
    callBrain(client, 'claude-haiku-4-5-20251001', OPTIMIST_PROMPT, userPrompt, 'optimist', businessId, 45000),
    callBrain(client, 'claude-haiku-4-5-20251001', CRITIC_PROMPT, userPrompt, 'critic', businessId, 45000),
    callBrain(client, 'claude-sonnet-4-5-20250929', STRATEGIST_PROMPT, userPrompt, 'strategist', businessId, 60000),
    runContextBrain(bizInfo, weekStart),
  ])

  const outputs: BrainOutput[] = []
  for (const r of [a, b, c]) {
    if (r.status === 'fulfilled') outputs.push(r.value)
  }
  const succeeded = outputs.filter(o => !o.failed).length
  const failed = 3 - succeeded

  if (succeeded === 0) {
    throw new Error('All council brains failed — falling back to single-model briefing')
  }

  const contextBrain: ContextBrainOutput | undefined =
    ctxResult.status === 'fulfilled' && !ctxResult.value.failed ? ctxResult.value : undefined

  if (ctxResult.status === 'rejected') {
    console.error('[council] context-brain rejected:', ctxResult.reason)
  }

  let synthesis: any = null
  let synthesisOk = false
  try {
    synthesis = await callSynthesis(client, businessContext, outputs, mode, businessId, contextBrain)
    synthesisOk = true
  } catch (e) {
    console.error('[council] synthesis failed:', (e as Error).message)
    const lead = outputs.find(o => o.role === 'strategist' && !o.failed) ?? outputs.find(o => !o.failed)!
    synthesis = {
      consensus: lead.observations,
      contested: [],
      final_briefing: lead.observations.join(' ') + '\n\n' + lead.recommendations.join(' '),
      confidence_map: {},
    }
  }

  return {
    consensus: synthesis.consensus ?? [],
    contested: synthesis.contested ?? [],
    final_briefing: synthesis.final_briefing ?? '',
    confidence_map: synthesis.confidence_map ?? {},
    raw_brain_outputs: outputs,
    context_brain_output: contextBrain,
    meta: {
      brains_succeeded: succeeded,
      brains_failed: failed,
      synthesis_succeeded: synthesisOk,
      fell_back: false,
      duration_ms: Date.now() - start,
    },
  }
}

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
      brains_succeeded: council?.meta.brains_succeeded ?? 0,
      brains_failed: council?.meta.brains_failed ?? 0,
      synthesis_succeeded: council?.meta.synthesis_succeeded ?? false,
      fell_back_to_single_model: fellBack,
      total_input_tokens: 0,
      total_output_tokens: 0,
      duration_ms: council?.meta.duration_ms ?? 0,
    })
  } catch { /* non-fatal — log failure must not break the briefing response */ }
}

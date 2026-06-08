import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { AskBlock } from './ask-types'
import { runContextBrain, type ContextBrainOutput } from './context-brain'
import { assessDataQuality, type DataQualityReport, FALLBACK_QUALITY } from './data-quality'
import { recallMemories, formatMemoriesForPrompt, fetchRecentSummaries, formatSummariesForPrompt } from './memory/recall'

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
  honesty_flags?: string[]
  data_quality_score?: number
  synthesis_model?: string
  escalation_reason?: string
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
  } catch (e) { console.error('[non-fatal]', e) }
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
    '- Plain English. No jargon. Say "your top seller" not "revenue concentration from 1 SKU".\n' +
    '- PROMOTIONS: if promotions.scheduled contains a promotion, recommend activating it as a future opportunity — do NOT say it is already working or driving revenue.\n' +
    '- CUSTOMERS: use customers.pos_customer_count as the customer count — never guess or default to zero.\n\n' +
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
    '- One clear recommendation trumps five vague ones\n' +
    '- PROMOTIONS: check promotions.scheduled — a promotion that is not yet active is a future opportunity, not current performance. Never state it is producing results.\n' +
    '- CUSTOMERS: use customers.pos_customer_count as the authoritative count — do not guess.\n\n' +
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
function buildSynthesisPrompt(question: string, businessName: string, industry: string, quality?: DataQualityReport): string {
  const honestyRules = quality && quality.hedge_level !== 'none'
    ? '\nDATA QUALITY: ' + quality.overall_score + '/100 — hedge level: ' + quality.hedge_level + '\n' +
      (quality.reliability_statement ? quality.reliability_statement + '\n' : '') +
      'HONESTY RULES FOR SYNTHESIS:\n' +
      (quality.hedge_level === 'heavy' ? '- Open with the data warning. Do not bury it.\n- Lead with what you do not know before what you do.\n' : '') +
      (quality.hedge_level === 'moderate' ? '- Be honest about what the data shows vs what you are inferring.\n' : '') +
      '- NEVER state a percentage change when data is thin — say "too few sales to calculate trends reliably"\n' +
      '- NEVER recommend a price change without stating what margin data it is based on\n' +
      '- NEVER claim a product is "your top seller" without citing the actual sales count\n' +
      '- If advisors disagree AND data is thin: present the disagreement honestly as "advisors are split and data is too thin to resolve this"\n' +
      '- Use "looks like", "suggests", "early signal" for low-confidence findings\n' +
      '- Use "clearly", "the data shows" ONLY for findings with 20+ supporting data points\n'
    : ''

  return 'You are Aria — the final voice synthesising 3 expert advisors for: "' + question + '"\n' +
    'Business: ' + businessName + ' (' + industry + ')\n' +
    honestyRules + '\n' +
    'Write a direct, specific answer to "' + question + '" that weaves all three perspectives.\n' +
    'Start with the most important insight. Use their actual business numbers.\n' +
    'Every sentence must be specific to this business — no generic advice.\n\n' +
    SYNTHESIS_PROMPT_BODY
}

const SYNTHESIS_PROMPT_BODY = `GROUNDING RULES — ABSOLUTE — NEVER BREAK:
1. CUSTOMER COUNT: Use customers.pos_customer_count from the business data as the authoritative POS customer count. If it shows 37, state 37. NEVER default to zero or invent a number. If the field is absent, say "I don't have the POS customer count."
2. PROMOTIONS: ONLY describe a promotion as "working", "driving results", or "boosting sales" if it appears in promotions.active (status="ACTIVE — live and running now"). If it appears in promotions.scheduled, it is NOT live — describe it ONLY as "scheduled for [date]" or "set up but not yet active." NEVER say a scheduled or inactive promotion is working or producing results, even if a RECENT_ACTION just created it.
3. FACTUAL CLAIMS: Every count, dollar figure, percentage, or causal statement must come directly from values passed to you in the data. Never infer, estimate, or guess. If a value is missing, say "I don't have that data" — never substitute zero or an assumption.
4. ANSWER THE QUESTION ACTUALLY ASKED — NEVER SILENTLY SUBSTITUTE A DIFFERENT METRIC:
   - "same week last month": use VERIFIED FIGURES same_week_last_month_revenue exactly. NEVER use revenue_30d, revenue_7d/30d ratio, or any rolling average as a substitute for this comparison. If null, say "I don't have data for the equivalent week last month."
   - "on track?" / "hit my weekly target": use VERIFIED FIGURES weekly_revenue_target. If null, say "You haven't set a weekly revenue target — I can't tell you if you're on track. Head to Weekly Reports to set one." NEVER use 30-day average, daily average, or any other metric as a proxy for a target the owner didn't set.
   - final_briefing MUST begin by directly answering yes/no when the question is yes/no. "You're on track — at $X of your $Y target, Z% there." not "Revenue is down 35% on the monthly average."
   - If the owner's question contains TWO parts (e.g., "on track?" AND "same week last month?"), final_briefing must answer BOTH in its 2-3 sentences.

HOW ARIA RESPONDS:
- Leads with the single most important insight as a punchy headline with the actual number
- Uses visual blocks to carry the content — pick the ones that actually fit the question
- Shows reasoning briefly — what the data says, why it matters, what to do
- Never pads. Never hedges. Never says "great question" or "I hope this helps"
- Australian English. Direct. Warm but not chatty.
- NEVER use consultant jargon. Say "your top seller" not "revenue concentration". Say "quiet week" not "structural decline".
- Imagine you're a trusted friend who knows the business inside out.
- Under 50 words of prose — let the blocks carry the content

AGREEMENT RULE: Where all/most advisors agree → state it as fact, confidently.
CONFLICT RULE: Where advisors disagree → present it as a genuine decision, not a recommendation.

AVAILABLE BLOCK TYPES — choose only what fits the question and data:

- "lead": ONE punchy headline sentence with the key number. Use when there's a clear standout finding.
  {"type":"lead","content":"Tuesday revenue hit $2,847 — up 18% on last week."}

- "metric_row": 2-4 metric cards with big numbers. Use when there are multiple key figures to show at once.
  {"type":"metric_row","items":[{"label":"Revenue today","value":"$2,847","sub":"↑18% vs last Mon","trend":"up"}]}

- "chart": bar chart for time-series or comparison data. Only use when you have actual labels AND values arrays with real numbers.
  {"type":"chart","chartType":"bar","title":"Revenue this week","labels":["Mon","Tue","Wed"],"values":[1200,2847,980],"unit":"$","metrics":[]}

- "brain_readouts": what each advisor found in plain owner language. Use for strategic/advisory questions.
  {"type":"brain_readouts","items":[{"role":"growth","icon":"📈","text":"Acai Bowl is doing 31% of revenue — worth protecting."},{"role":"risk","icon":"⚠️","text":"Oat milk runs out Thursday at current pace."},{"role":"strategy","icon":"🎯","text":"Friday is your peak — staff accordingly."},{"role":"context","icon":"🌍","text":"Rain today explains the slow morning — pickup orders up 40%."}]}

- "council_split": only when advisors genuinely disagree and the owner needs to make a call.
  {"type":"council_split","question":"Should you raise the Acai Bowl price to $19?","growth":"Yes — 74% margin, competitors charge more","risk":"Might lose price-sensitive regulars","strategy":"Test $18.50 first for 2 weeks","choices":[{"icon":"💰","title":"Raise to $19 now","sub":"Match Prahran Market pricing","prompt":"Raise Acai Bowl price to $19"},{"icon":"🧪","title":"Test $18.50 first","sub":"2-week trial, watch volume","prompt":"Change Acai Bowl price to $18.50"}]}

- "action_list": specific actions with "Do it" buttons. Use when there are clear next steps.
  {"type":"action_list","items":[{"icon":"📦","title":"Reorder oat milk today","sub":"2 units left — out by Thursday","colorVariant":"danger","prompt":"Create a purchase order for oat milk"}]}

- "text": short supporting paragraph. Max 2 sentences. Use sparingly — only when prose genuinely adds something blocks can't.

- "html": custom grid layout, heatmap, or anything structural. Use inline styles, dark theme (#0E1411 bg, #7FB897 accent).

- "pushback": ONLY when the advice directly contradicts a past decision flagged in PAST DECISION CONFLICTS below. Amber/red warning block.
  {"type":"pushback","decision":"The past decision that this conflicts with","tension":"What specifically contradicts — one clear sentence","question":"Do you want to revisit this decision?","severity":"low|medium|high"}

BLOCK SELECTION RULES:
- A simple factual question ("what was my revenue today?") → just lead + metric_row, maybe chart. No brain_readouts needed.
- A strategic/advisory question → brain_readouts shows the council's thinking. council_split only if they genuinely disagree.
- A writing task (draft an email, write an SMS) → just text blocks with the written content. No charts.
- An action request → action_list with the specific steps.
- Never include a block just to fill space. Every block must earn its place.
- Only include "chart" if you have real labels[] and values[] arrays with actual numbers from the data.

final_briefing is what Aria SPEAKS — 2-3 short sentences (40-80 words). Written in Aria's voice.
The single most important finding with the number. Why it matters. The one thing to do.
Australian English. Never start with "I". Warm but direct. No padding.

Return ONLY valid JSON:
{"final_briefing":"...2-3 sentences...","ask_blocks":[...only the blocks that fit...],"ask_followups":["specific follow-up 1?","specific follow-up 2?","specific follow-up 3?"]}`

const SYNTHESIS_PROMPT = `You are Aria — the final voice after 4 specialist brains have analysed this business.

You have their findings. Your job is to synthesise them into a direct, specific answer using only the blocks that genuinely fit the question and the data available.

GROUNDING RULES — ABSOLUTE — NEVER BREAK:
1. CUSTOMER COUNT: Use customers.pos_customer_count from the business data as the authoritative POS customer count. If it shows 37, state 37. NEVER default to zero or invent a number. If the field is absent, say "I don't have the POS customer count."
2. PROMOTIONS: ONLY describe a promotion as "working", "driving results", or "boosting sales" if it appears in promotions.active (status="ACTIVE — live and running now"). If it appears in promotions.scheduled, it is NOT live — describe it ONLY as "scheduled for [date]" or "set up but not yet active." NEVER say a scheduled or inactive promotion is working or producing results, even if a RECENT_ACTION just created it.
3. FACTUAL CLAIMS: Every count, dollar figure, percentage, or causal statement must come directly from values passed to you in the data. Never infer, estimate, or guess. If a value is missing, say "I don't have that data" — never substitute zero or an assumption.

HOW ARIA RESPONDS:
- Leads with the single most important insight as a punchy headline with the actual number
- Picks blocks that fit — not every block type for every response
- Never pads. Never hedges. Never says "great question" or "I hope this helps"
- Australian English. Direct. Warm but not chatty.
- NEVER use consultant jargon. Say "quiet week" not "structural decline". Say "your top seller" not "revenue concentration".
- Imagine you're a trusted friend who knows the business inside out.
- Under 50 words of prose — let the blocks carry the content

AGREEMENT RULE: Where all/most brains agree → state it as fact, confidently.
CONFLICT RULE: Where brains disagree → present council_split so the owner decides.

AVAILABLE BLOCK TYPES — choose only what fits:

- "lead": ONE punchy headline with the key number. Use when there's a standout finding.
  {"type":"lead","content":"Tuesday revenue hit $2,847 — up 18% on last week."}

- "metric_row": 2-4 metric cards. Use when multiple key figures need showing at once.
  {"type":"metric_row","items":[{"label":"Revenue today","value":"$2,847","sub":"↑18% vs last Mon","trend":"up"}]}

- "chart": ONLY use when you have real labels[] AND values[] with actual numbers from the data. Do not include if you'd have to invent the numbers.
  {"type":"chart","chartType":"bar","title":"Revenue this week","labels":["Mon","Tue","Wed","Thu","Fri"],"values":[1820,2847,1980,2650,3100],"unit":"$","metrics":[]}

- "brain_readouts": what each brain found, in plain owner language. Use for strategic/advisory questions.
  {"type":"brain_readouts","items":[{"role":"growth","icon":"📈","text":"..."},{"role":"risk","icon":"⚠️","text":"..."},{"role":"strategy","icon":"🎯","text":"..."},{"role":"context","icon":"🌍","text":"..."}]}

- "council_split": ONLY when brains genuinely disagree and the owner needs to choose.
  {"type":"council_split","question":"Should you raise the Acai Bowl price?","growth":"Yes — 74% margin","risk":"Might lose regulars","strategy":"Test $18.50 first","choices":[{"icon":"💰","title":"Raise to $19","sub":"Match competitor pricing","prompt":"Raise Acai Bowl to $19"},{"icon":"🧪","title":"Test $18.50","sub":"2-week trial","prompt":"Change Acai Bowl to $18.50"}]}

- "action_list": specific actions with Do it buttons. Use when there are clear next steps.
  {"type":"action_list","items":[{"icon":"📦","title":"Reorder oat milk","sub":"2 units left — out by Thursday","colorVariant":"danger","prompt":"Create a purchase order for oat milk"}]}

- "text": short supporting paragraph, max 2 sentences. Use sparingly.

- "html": custom layout, heatmap, grid. Inline styles, dark theme (#0E1411 bg, #7FB897 accent).

BLOCK SELECTION RULES — match blocks to the question:
- Simple factual question → lead + metric_row, maybe chart if numbers exist
- Strategic/advisory → brain_readouts shows the council's view; council_split only if genuinely divided
- Writing task (email, SMS, reply) → text blocks with the written content, no charts
- Action request → action_list with the specific steps
- Never include a block just to fill space
- NEVER include chart unless labels[] and values[] are filled with real numbers

final_briefing is what Aria SPEAKS — 2-3 short sentences (40-80 words). The key finding + why it matters + the one thing to do. Australian English. Never start with "I". Warm but direct.

Return ONLY valid JSON:
{"final_briefing":"...2-3 sentences...","ask_blocks":[...only blocks that fit the question...],"ask_followups":["follow-up 1?","follow-up 2?","follow-up 3?"]}`

// ── Council Cache ──────────────────────────────────────────────────
const STOP_WORDS = new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','my','your','our','their','its','this','that','these','those','i','we','you','he','she','they','it','me','us','him','her','them','and','or','but','for','so','yet','nor','at','by','in','of','on','to','up','with','from','into','about'])

function intentHash(question: string): string {
  const tokens = question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP_WORDS.has(t)).sort()
  const joined = tokens.join(' ')
  // djb2 hash → 8-char hex
  let h = 5381
  for (let i = 0; i < joined.length; i++) h = ((h << 5) + h) ^ joined.charCodeAt(i)
  return (h >>> 0).toString(16).padStart(8, '0')
}

async function readCouncilCache(businessId: string, hash: string): Promise<CouncilOutput | null> {
  try {
    const { data } = await supabaseAdmin
      .from('council_cache')
      .select('result')
      .eq('business_id', businessId)
      .eq('intent_hash', hash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    return data ? (data.result as CouncilOutput) : null
  } catch { return null }
}

async function writeCouncilCache(businessId: string, hash: string, result: CouncilOutput): Promise<void> {
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  try {
    await supabaseAdmin.from('council_cache').upsert({
      business_id: businessId,
      intent_hash: hash,
      result: result as unknown as Record<string, unknown>,
      expires_at: expires,
    }, { onConflict: 'business_id,intent_hash' })
  } catch (e) { console.error('[non-fatal]', e) }
}

// ── Contradiction / Pushback Detector ─────────────────────────────
interface ContradictionWarning {
  past_decision: string
  current_direction: string
  severity: 'low' | 'medium' | 'high'
}

function detectContradictions(question: string, memories: import('./memory/recall').RecalledMemory[]): ContradictionWarning[] {
  const decisionMemories = memories.filter(m => m.kind === 'decision' || m.kind === 'tried')
  if (decisionMemories.length === 0) return []

  // Reversal triggers: owner is asking about something they already decided on
  const reversalSignals = /should i|thinking of|considering|what if i|what about|should we|could we|would it make sense/i.test(question)
  if (!reversalSignals) return []

  const qWords = new Set(question.toLowerCase().split(/\W+/).filter(w => w.length > 3))

  const warnings: ContradictionWarning[] = []
  for (const mem of decisionMemories) {
    const mWords = mem.content.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    const overlap = mWords.filter(w => qWords.has(w)).length
    const overlapRatio = mWords.length > 0 ? overlap / mWords.length : 0

    if (overlapRatio >= 0.25) {
      warnings.push({
        past_decision: mem.content,
        current_direction: question.slice(0, 120),
        severity: mem.importance >= 8 ? 'high' : mem.importance >= 6 ? 'medium' : 'low',
      })
    }
  }

  return warnings.slice(0, 3) // max 3 pushbacks per response
}

// ── Reasoning Depth Classifier ─────────────────────────────────────
// Decides which model to use for synthesis based on question complexity.
// Brains always use Haiku (speed/cost). Only synthesis escalates.
function classifyQuestionComplexity(question: string, mode: string): {
  synthesisModel: string
  escalationReason: string | null
} {
  const HAIKU = 'claude-haiku-4-5-20251001'
  const SONNET = 'claude-sonnet-4-5-20250929'

  // Briefing and weekly report — always Sonnet for richer synthesis
  if (mode === 'briefing' || mode === 'weekly_report') {
    return { synthesisModel: SONNET, escalationReason: 'briefing_mode_always_sonnet' }
  }

  // Critical/high-stakes → Sonnet
  const critical = /close.*locat|shut.*down|sell.*business|cash.*crisis|running.*out.*cash|legal.*issue|compliance.*fine|about.*to.*fail|bankrupt/i
  if (critical.test(question)) {
    return { synthesisModel: SONNET, escalationReason: 'critical_business_situation' }
  }

  // Complex strategic analysis → Sonnet
  const complex = /should.*hire|raise.*price|open.*second|expand|growth.*strat|if.*raise.*by|what.*happen.*if|should.*close|forecast|full.*analy|deep.*dive|6.month|12.month|next.*year|compare.*scenario|cash.*flow.*forecast|profit.*if|labour.*cost.*ratio|should.*i.*invest|restructur/i
  if (complex.test(question)) {
    return { synthesisModel: SONNET, escalationReason: 'complex_strategic_question' }
  }

  // Default to Haiku — fast and sufficient for factual/moderate questions
  return { synthesisModel: HAIKU, escalationReason: null }
}

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

  const activeQuestion = question ?? 'Analyse this business and give me your most important insights.'

  // Classify synthesis model based on question complexity
  const { synthesisModel, escalationReason } = classifyQuestionComplexity(activeQuestion, mode)

  // Cache check — skip for briefing/weekly_report modes (always fresh data)
  const hash = intentHash(activeQuestion)
  if (mode === 'ask_aria') {
    const cached = await readCouncilCache(businessId, hash)
    if (cached) return cached
  }

  // Assess quality + recall memories + fetch summaries in parallel before brains
  const [quality, memories, recentSummaries] = await Promise.all([
    assessDataQuality(businessId).catch(() => ({ ...FALLBACK_QUALITY })),
    recallMemories(businessId, activeQuestion).catch(() => []),
    fetchRecentSummaries(businessId).catch(() => []),
  ])

  const memoryBlock = formatMemoriesForPrompt(memories)
  const summaryBlock = formatSummariesForPrompt(recentSummaries)
  const contradictions = detectContradictions(activeQuestion, memories)

  const qualityCtx = quality.hedge_level !== 'none'
    ? 'DATA QUALITY: ' + quality.overall_score + '/100 (' + quality.hedge_level + ' hedging required)\n' +
      (quality.missing_critical.length > 0 ? 'CRITICAL GAPS: ' + quality.missing_critical.join('; ') + '\n' : '') +
      'DATA RELIABILITY: ' + quality.hedge_level + ' hedging required.\n' +
      (quality.hedge_level === 'heavy' ? "WARNING: Data is very thin. Lead with what you don't know before what you do. Never sound confident with thin data.\n" : '') +
      (quality.hedge_level === 'moderate' ? 'Be honest about what the data shows vs what you are inferring.\n' : '') +
      'If data is insufficient for a recommendation, say: "Not enough data to advise on this."\n\n'
    : ''

  // Build VERIFIED_FIGURES block — pre-computed exact values brains must cite verbatim
  let verifiedFiguresBlock = ''
  try {
    const ctx = (safeParseJSON(businessContext) ?? {}) as Record<string, unknown>
    const revenue = ctx?.revenue as Record<string, number | null> | undefined
    const customers = ctx?.customers as Record<string, number | null> | undefined
    const promotions = ctx?.promotions as {
      active?: Array<{ name: string; starts_at: string | null }>
      scheduled?: Array<{ name: string; starts_at: string | null; status: string }>
    } | undefined
    const lines: string[] = [
      'VERIFIED FIGURES — pre-computed values. Use EXACT values. DO NOT round, approximate, or invent any figure.',
    ]
    const rev7 = revenue?.last_7_days
    const rev30 = revenue?.last_30_days
    if (rev7 != null) lines.push(`  revenue_7d = ${Number(rev7).toFixed(2)}  ← exact figure for "last week" / "7-day" revenue — use verbatim`)
    if (rev30 != null) lines.push(`  revenue_30d = ${Number(rev30).toFixed(2)}  ← exact figure for "30-day" / "monthly" revenue — use verbatim`)
    const posCount = customers?.pos_customer_count
    if (posCount != null) lines.push(`  pos_customer_count = ${posCount}  ← authoritative count; NEVER say "zero customers" unless this is 0`)
    const emailCount = customers?.with_email_count
    if (emailCount != null) lines.push(`  customers_with_email = ${emailCount}`)
    if (promotions) {
      const active = promotions.active ?? []
      const scheduled = promotions.scheduled ?? []
      if (active.length > 0) {
        lines.push(`  active_promotions = ${active.map(p => p.name).join(', ')}  ← LIVE NOW — may be described as running`)
      } else {
        lines.push('  active_promotions = none  ← no promotions currently live')
      }
      if (scheduled.length > 0) {
        lines.push(`  scheduled_promotions = ${scheduled.map(p => `${p.name} (${(p as { status: string }).status})`).join(', ')}  ← NOT YET ACTIVE — describe as "scheduled for [date]", NEVER as "working"`)
      }
    }
    // Week-tracking block — critical for "on track?" and "same week last month" questions
    const weekTracking = ctx?.week_tracking as {
      same_week_last_month_revenue?: number | null
      weekly_revenue_target?: number | null
      on_track?: string | null
      pct_of_target?: number | null
      vs_same_week_pct?: string | null
      same_week_window?: string
      note?: string
    } | undefined
    if (weekTracking) {
      if (weekTracking.same_week_last_month_revenue != null) {
        lines.push(`  same_week_last_month_revenue = ${Number(weekTracking.same_week_last_month_revenue).toFixed(2)}  ← USE THIS (not revenue_30d) when owner asks "same week last month"`)
      } else {
        lines.push(`  same_week_last_month_revenue = null  ← no data for that window; say so explicitly`)
      }
      if (weekTracking.weekly_revenue_target != null) {
        lines.push(`  weekly_revenue_target = ${Number(weekTracking.weekly_revenue_target).toFixed(2)}  ← USE THIS for "on track?" questions`)
        if (weekTracking.on_track != null) lines.push(`  on_track_status = ${weekTracking.on_track}  ← direct answer to "am I on track?"`)
        if (weekTracking.pct_of_target != null) lines.push(`  pct_of_weekly_target = ${weekTracking.pct_of_target}%`)
        if (weekTracking.vs_same_week_pct != null) lines.push(`  vs_same_week_last_month = ${weekTracking.vs_same_week_pct}`)
      } else {
        lines.push('  weekly_revenue_target = null  ← NO target set; if asked "on track?", say "no weekly target set" and offer to set one — NEVER use 30d average or daily average as a proxy')
      }
    }
    verifiedFiguresBlock = lines.join('\n') + '\n'
  } catch { /* non-fatal */ }

  const userPrompt = [verifiedFiguresBlock, summaryBlock, memoryBlock, qualityCtx, 'Business data:\n' + businessContext]
    .filter(Boolean)
    .join('\n\n')

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)) // Monday
  weekStart.setHours(0, 0, 0, 0)

  type BizInfo = { trading_name: string; industry: string; city: string; state: string }

  // Start bizInfo fetch immediately alongside the 4 brains — don't serialize
  const bizInfoPromise: Promise<BizInfo | null> = Promise.resolve(
    supabaseAdmin.from('businesses')
      .select('trading_name, name, industry, city, suburb, state')
      .eq('id', businessId).single()
  ).then(({ data: bd }): BizInfo | null => {
    if (!bd) return null
    const d = bd as Record<string, string | null>
    return {
      trading_name: d.trading_name ?? d.name ?? 'this business',
      industry: d.industry ?? 'retail',
      city: d.city ?? d.suburb ?? 'Australia',
      state: d.state ?? 'AU',
    }
  }).catch((): null => null)

  // Gemini chains from bizInfo — starts as soon as the DB call resolves (~50ms), not after brains
  const geminiPromise: Promise<ContextBrainOutput | null> = bizInfoPromise.then(
    (bi: BizInfo | null): Promise<ContextBrainOutput | null> =>
      bi ? runContextBrain(bi, weekStart, businessId).catch((): null => null) : Promise.resolve(null)
  )

  // Run all 6 in parallel — 4 brains + bizInfo fetch + gemini chain
  const [growth, risk, strategy, context, ctxOutput, bizInfo] = await Promise.all([
    callBrain(client, HAIKU, buildGrowthPrompt(activeQuestion),   userPrompt, 'growth',   businessId, 18000),
    callBrain(client, HAIKU, buildRiskPrompt(activeQuestion),     userPrompt, 'risk',     businessId, 18000),
    callBrain(client, HAIKU, buildStrategyPrompt(activeQuestion), userPrompt, 'strategy', businessId, 18000),
    callBrain(client, HAIKU, CONTEXT_PROMPT,                      userPrompt, 'context',  businessId, 18000),
    geminiPromise,
    bizInfoPromise,
  ])

  const brains = [growth, risk, strategy, context]
  const succeeded = brains.filter(b => b.succeeded)

  if (succeeded.length === 0) return null

  // Build synthesis input
  const qualitySynthesisBlock = quality.hedge_level !== 'none'
    ? `\nDATA QUALITY: ${quality.overall_score}/100 — hedge level: ${quality.hedge_level}
${quality.reliability_statement}
HONESTY: Never state percentage changes with thin data. Use "looks like"/"suggests" for low-confidence findings.\n`
    : ''

  const memorySynthesisBlock = memoryBlock ? memoryBlock + '\n' : ''
  const summarySynthesisBlock = summaryBlock ? summaryBlock + '\n' : ''
  const contradictionBlock = contradictions.length > 0
    ? 'PAST DECISION CONFLICTS (generate pushback blocks if relevant):\n' +
      contradictions.map(c => '- Past decision: "' + c.past_decision + '" | Severity: ' + c.severity).join('\n') + '\n'
    : ''

  const synthesisInput = `
${verifiedFiguresBlock ? verifiedFiguresBlock + '\n' : ''}${summarySynthesisBlock}${memorySynthesisBlock}${contradictionBlock}BUSINESS DATA:
${businessContext}
${qualitySynthesisBlock}
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
    quality,
  )

  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model: synthesisModel,
        max_tokens: 6000,
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
      agent_key: 'council_synthesis', model_id: synthesisModel, provider: 'anthropic',
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

    const councilResult: CouncilOutput = {
      final_briefing: typeof parsed.final_briefing === 'string' ? parsed.final_briefing : text.slice(0, 200),
      honesty_flags: quality.missing_critical.map(m => 'LOW_DATA: ' + m),
      data_quality_score: quality.overall_score,
      synthesis_model: synthesisModel,
      escalation_reason: escalationReason ?? undefined,
      ask_blocks: (mode === 'ask_aria' || mode === 'briefing') && Array.isArray(parsed.ask_blocks) ? (parsed.ask_blocks as AskBlock[]).filter(b => {
        if (!b || !b.type) return false
        if (b.type === 'chart') return Array.isArray((b as {values?:unknown[]}).values) && (b as {values?:unknown[]}).values!.length > 0
        if (b.type === 'brain_readouts') return Array.isArray((b as {items?:unknown[]}).items) && (b as {items?:unknown[]}).items!.length > 0
        if (b.type === 'metric_row') return Array.isArray((b as {items?:unknown[]}).items) && (b as {items?:unknown[]}).items!.length > 0
        if (b.type === 'action_list') return Array.isArray((b as {items?:unknown[]}).items) && (b as {items?:unknown[]}).items!.length > 0
        if (b.type === 'council_split') return !!(b as {question?:string}).question && !!(b as {growth?:string}).growth
        if (b.type === 'lead' || b.type === 'text') return !!(b as {content?:string}).content
        return true
      }) : undefined,
      ask_followups: mode === 'ask_aria' && Array.isArray(parsed.ask_followups) ? parsed.ask_followups as string[] : undefined,
      raw_brain_outputs: brains,
      context_brain_output: ctxOutput ?? null,
      meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: true, fell_back: false, duration_ms: Date.now() - start },
    }

    // Write to cache for ask_aria mode (fire-and-forget)
    if (mode === 'ask_aria') void writeCouncilCache(businessId, hash, councilResult)
    return councilResult
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
  opts?: {
    data_quality_score?: number
    honesty_flags?: string[]
    synthesis_model?: string
    escalation_reason?: string
  }
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
      data_quality_score: opts?.data_quality_score ?? council?.data_quality_score ?? null,
      honesty_flags: opts?.honesty_flags ?? council?.honesty_flags ?? null,
      synthesis_model: opts?.synthesis_model ?? council?.synthesis_model ?? null,
      escalation_reason: opts?.escalation_reason ?? council?.escalation_reason ?? null,
    })
  } catch { /* non-fatal — logging should never break the briefing */ }
}

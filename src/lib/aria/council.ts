import Anthropic from '@anthropic-ai/sdk'
import { makeLazyServiceRoleClient } from '@/lib/supabase-lazy'
import { toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import { computeCostCentsWithCache } from './cost'
import type { AskBlock } from './ask-types'
import { inspectTruncation, classifyOutcome, truncationSignal, type ModelOutcome } from './truncation'
import { renderAdvisorSection, lostAdvisors, lostAdvisorRule } from './council-advisors'
import { safeParseJSON } from './safe-json'
import { runContextBrain, type ContextBrainOutput } from './context-brain'
import { assessDataQuality, type DataQualityReport, FALLBACK_QUALITY } from './data-quality'
import { recallMemories, formatMemoriesForPrompt, fetchRecentSummaries, formatSummariesForPrompt } from './memory/recall'
import { stripUngroundedNumbers, extractNumbers } from './response-validator'
import { logAICallSafe } from './log-ai-call'
import { buildSkillInjection, type EnabledSkill } from './industry-skills'
import { detectCouncilConflicts, formatConflictsForSynthesis } from './council-conflicts'
import { computeHealthSignals } from './health-signals'

// Lazy (see supabase-lazy.ts) — module-scope createClient() crashes Next's
// build-time page-data collection if env vars aren't readable there.
const supabaseAdmin = makeLazyServiceRoleClient()

// ── Types ──────────────────────────────────────────────────────────
type BrainRole = 'growth' | 'risk' | 'strategy' | 'context'

interface BrainOutput {
  role: BrainRole
  observations: string[]
  recommendations: string[]
  confidence: 'high' | 'medium' | 'low'
  plan?: string            // I9: advisor's PLAN step (what the question needs)
  verify_findings?: string // I9: advisor's VERIFY step (what the data says)
  raw: string
  succeeded: boolean
  /**
   * S8 PHASE 1 — `succeeded: false` never said why, so a truncated advisor and a model that
   * returned prose were the same event. They need different fixes, so they are now different
   * words. 'ok_at_ceiling' is NOT a failure: it parsed, and it is recorded only because the
   * budget is provably tight.
   */
  outcome?: ModelOutcome
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
  // LOGGING-FIX-1 Part 3: set true when this output was served from council_cache
  served_from_cache?: boolean
  /**
   * S8 PHASE 2 — WHICH advisors were lost, not just how many. `meta.brains_failed` has always
   * carried the count, but a count goes to the council_runs table and the agents dashboard; it
   * never reached the synthesis prompt and it never reached the owner. This does both.
   * Empty array = a complete council. Never null, so a consumer cannot mistake "unknown" for "none".
   */
  advisors_lost: Array<{ role: string; reason: ModelOutcome | 'unknown' }>
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

// S9 PHASE 4 (#4) — safeParseJSON moved to ./safe-json. THIS implementation is the one that
// survived: the decision table says keep the one the canonical engine uses, and the council is that
// engine. context-brain.ts's near-copy was proven equivalent over a corpus first (safe-json.test.ts)
// rather than assumed, then deleted. Nothing about the behaviour here changed.

async function logAICall(params: {
  agent_key: string; model_id: string; provider: string
  input_tokens: number; output_tokens: number; success: boolean
  business_id: string; error_message?: string; request_summary?: string
}) {
  try {
    // COUNCIL-LOG-FIX-1: role was 'council' — NOT a valid AgentRole. supabaseAdmin bypasses RLS, so the
    // only thing that can reject a service-role insert is a CHECK constraint; 'council' (and the cache-hit
    // 'cache') are the only roles in the codebase outside the AgentRole set every WORKING logger uses
    // ('guard','validator','chat',…). Supabase .insert() returns {error} WITHOUT throwing, so the old
    // try/catch never fired and the rejection was invisible (also why LOGGING-FIX-1's fallback never ran).
    // Fix: valid role ('analysis' — council synthesis IS analysis) + CHECK the returned error.
    // AI-COST-2 — this insert previously never computed cost_usd_cents at all, so every
    // council row landed at $0 regardless of real token volume (AI-COST-AUDIT-1 §3.1: ~$1.94
    // of real Sip spend was invisible to the cost ledger this way). Same pricing fn every
    // other logger uses — no cache read/write tracked in this file, so those default to 0.
    const cost = computeCostCentsWithCache(params.model_id, params.input_tokens, params.output_tokens)
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id,
      agent_key: params.agent_key,
      provider: params.provider,
      model_id: params.model_id,
      role: 'analysis',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      cost_usd_cents: cost,
      success: params.success,
      error_message: params.error_message ?? null,
      request_summary: params.request_summary ?? null,
    })
    if (error) {
      console.error('[council-log] aria_ai_calls insert REJECTED for agent_key=' + params.agent_key + ':', error.message)
      // Functional fallback (the LOGGING-FIX-1 version was dead — .insert() returns {error}, never throws,
      // so its catch never ran). role='other' + provider='other' are both in the verified pg_constraint
      // CHECK lists (1083 production rows on role='other' prove it lands; 'guard'/'internal' are NOT in the
      // lists — which is why sql_guard/summarizer_guard never wrote either). Carries the exact rejection
      // reason into the DB so it's queryable without Vercel log access.
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.business_id,
        agent_key: 'council_log_failure',
        provider: 'other',
        role: 'other',
        input_tokens: 0, output_tokens: 0, success: false,
        request_summary: params.agent_key,
        learning_signal: ('council_log_rejected:' + error.message).slice(0, 120),
      })
    }
  } catch (e) {
    // genuine network/throw path (kept — Supabase normally returns {error} rather than throwing)
    console.error('[council-log] aria_ai_calls insert threw for agent_key=' + params.agent_key + ':', (e as Error).message)
  }
}

// ── Learning Context (LRN-1) ───────────────────────────────────────
// Fetches last 5 resolved learning signals for this business and formats a
// short prefix so the council brains are aware of recent outcome history.
async function getRecentLearningContext(businessId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('aria_ai_calls')
      .select('learning_signal, agent_key, created_at')
      .eq('business_id', businessId)
      .not('learning_signal', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)
    if (!data || data.length === 0) return ''
    type Row = { learning_signal: string; agent_key: string }
    const rows = data as Row[]
    const pos = rows.filter(r => r.learning_signal === 'positive').length
    const neg = rows.filter(r => r.learning_signal === 'negative').length
    const unk = rows.filter(r => r.learning_signal === 'unknown' || r.learning_signal === 'clicked').length
    return `RECENT OUTCOME SIGNALS (last ${rows.length} resolved): ${pos} positive, ${neg} negative, ${unk} uncertain. ` +
      (pos > neg ? 'Recent advice has been well-received.' : neg > pos ? 'Some recent advice did not land — be more conservative.' : '')
  } catch { return '' }
}

// ── Brain Prompts ──────────────────────────────────────────────────
// Each brain has a single job and receives the owner's actual question.
// They return JSON only. No prose, no preamble.

// I9 DEEP-REASONING — each advisor reasons plan→verify→conclude inside its turn (better inference
// at bounded output cost). Appended to each advisor prompt; adds plan + verify_findings to the JSON.
const THREE_STEP_REASONING =
  'Reason in 3 steps BEFORE concluding:\n' +
  '1) PLAN — what is the question really asking, and which specific facts do you need?\n' +
  '2) VERIFY — look at the relevant numbers in the business data; what do they actually say? Cite them.\n' +
  '3) CONCLUDE — only then write your observations + recommendations.\n' +
  'Put a one-sentence "plan" and a short "verify_findings" (what the data showed) in your JSON.\n'

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
    THREE_STEP_REASONING +
    'Return ONLY valid JSON:\n' +
    '{"plan":"one sentence","verify_findings":"what the numbers showed","observations":["specific finding with number"],"recommendations":["specific action with expected outcome"],"confidence":"high|medium|low"}'
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
    '- Write like a trusted advisor. Say "sales have been quiet" not "revenue collapsed".\n' +
    '- SEVERITY CHECK — business_health.pos_health.status (in available_ground_truth) tells you whether low/no activity is a genuine problem or just a quiet period: status="INSUFFICIENT_SAMPLE" means too few sales to draw any conclusion — describe it as quiet/dormant trading, NEVER as "collapse", "failure", or "gone dark". Only status="DEGRADED" supports language about an actual system/data problem.\n\n' +
    THREE_STEP_REASONING +
    'Return ONLY valid JSON:\n' +
    '{"plan":"one sentence","verify_findings":"what the numbers showed","observations":["specific problem with evidence number"],"recommendations":["specific fix with expected impact"],"confidence":"high|medium|low"}'
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
    THREE_STEP_REASONING +
    'Return ONLY valid JSON:\n' +
    '{"plan":"one sentence","verify_findings":"what the numbers showed","observations":["strategic read with timeframe"],"recommendations":["prioritised action with rationale"],"confidence":"high|medium|low","primary_lever":"the single most important thing","time_horizon":"7d|30d"}'
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

Reason in 3 steps BEFORE concluding: 1) PLAN — which external signals could change the read? 2) VERIFY — are they actually visible in the data? 3) CONCLUDE — only signals you can evidence. Put a one-sentence "plan" and short "verify_findings" in the JSON.
Return ONLY valid JSON:
{"plan":"one sentence","verify_findings":"what the data showed","observations":["external signal with evidence"],"recommendations":["how to respond to this signal"],"confidence":"high|medium|low"}`

// ── Brain Runner ───────────────────────────────────────────────────
async function callBrain(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  role: BrainRole,
  businessId: string,
  timeoutMs: number,
  requestSummary?: string,
): Promise<BrainOutput> {
  try {
    const res = await callWithTimeout(
      () => withBackoff(() => client.messages.create({
        model,
        // S8 PHASE 1 — WAS 1200, AND THE DISTRIBUTION WAS VISIBLY CLIPPED AGAINST IT.
        // Measured over 1,016 real advisor calls (billing-outage rows excluded): avg 896,
        // p50 878, p90 1160, p99 1200, max 1200, and 8% pinned exactly at the cap. A p90 at
        // 97% of the ceiling is not a distribution, it is a wall. On the reported turn three
        // of four advisors hit it and two were lost mid-JSON.
        //
        // This is the same class S4 fixed at 300 in suggestions, and the fix is the same one:
        // the budget, never the parser. Nothing here accepts truncated output.
        //
        // 4000 is ~4.5x the median, so it costs nothing for the 92% that never approach it —
        // max_tokens is a cap, not a reservation, and output is billed on what is produced.
        max_tokens: 4000,
        temperature: 0.25,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })),
      timeoutMs,
      'council brain ' + role
    )
    const text = res.content.filter((b: {type:string}) => b.type === 'text').map((b: {type:string,text?:string}) => (b as {text:string}).text).join('')
    const parsed = safeParseJSON(text)
    // S8 PHASE 1 — the two facts together, never either alone. `res.stop_reason` is the model's
    // own account of why it stopped; `!!parsed` is whether OUR parser survived it. Only the pair
    // distinguishes "ran out of room and lost the structure" from "ran out of room having already
    // finished it" — and 69 of the 81 historical ceiling-hits are the second kind.
    const trunc = inspectTruncation(res)
    const outcome = classifyOutcome(trunc, !!parsed)
    await logAICall({
      agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      success: !!parsed, business_id: businessId, request_summary: requestSummary,
    })
    if (trunc.hitCeiling) {
      // Queryable without Vercel log access — the same reason council's log-failure fallback
      // writes its rejection reason into a row rather than console.error alone.
      await logAICallSafe({
        business_id: businessId, agent_key: 'council_ceiling', provider: 'other', role: 'other',
        success: outcome !== 'truncated_mid_structure',
        request_summary: 'council_' + role,
        response_summary: 'stop_reason=' + (trunc.stopReason ?? 'null') + ' out=' + (trunc.outputTokens ?? '?'),
        learning_signal: truncationSignal('council_' + role, trunc, outcome),
      })
      console.error('[council] ' + role + ' hit its token ceiling — outcome=' + outcome
        + ' output_tokens=' + (trunc.outputTokens ?? '?'))
    }
    if (!parsed) return { role, observations: [], recommendations: [], confidence: 'low', raw: text, succeeded: false, outcome }
    return {
      role,
      observations: Array.isArray(parsed.observations) ? parsed.observations as string[] : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations as string[] : [],
      confidence: (parsed.confidence as 'high'|'medium'|'low') ?? 'medium',
      plan: typeof parsed.plan === 'string' ? parsed.plan : undefined,
      verify_findings: typeof parsed.verify_findings === 'string' ? parsed.verify_findings : undefined,
      raw: text,
      succeeded: true,
      outcome,
    }
  } catch (e) {
    await logAICall({
      agent_key: 'council_' + role, model_id: model, provider: 'anthropic',
      input_tokens: 0, output_tokens: 0, success: false, business_id: businessId,
      error_message: (e as Error).message, request_summary: requestSummary,
    })
    // An exception is not a truncation. 1,904 of the ~1,920 historical exceptions on these four
    // agent keys were "credit balance is too low" — a billing condition, not a budget one — and
    // conflating the two would send the next reader looking at max_tokens for a payment problem.
    return { role, observations: [], recommendations: [], confidence: 'low', raw: '', succeeded: false, outcome: 'unparseable' }
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
3B. SEVERITY: low or zero activity is NOT automatically a crisis. Check business_health.pos_health.status (in available_ground_truth) before using words like "collapse", "failure", "gone dark", or "demands immediate investigation". status="INSUFFICIENT_SAMPLE" means there isn't enough trading data to draw ANY conclusion — describe it as quiet or dormant, not catastrophic. Only status="DEGRADED" supports language about a real system/data problem.
4. ANSWER THE QUESTION ACTUALLY ASKED — NEVER SILENTLY SUBSTITUTE A DIFFERENT METRIC:
   - If INTENT-GROUNDED FACTS are present above, use comparison_revenue from there first. It is pre-computed for the EXACT comparison period the owner asked about. NEVER substitute revenue_30d or week_tracking figures when intent-grounded facts are available.
   - "same week last month": use INTENT-GROUNDED FACTS comparison_revenue if available (detected_comparison_period=same_week_last_month), else fall back to VERIFIED FIGURES same_week_last_month_revenue. NEVER use revenue_30d or a rolling average.
   - "on track?" / "hit my weekly target": use INTENT-GROUNDED FACTS weekly_revenue_target or VERIFIED FIGURES weekly_revenue_target. If NOT SET, say "You haven't set a weekly revenue target — want to set one?" NEVER use 30-day average, daily average, or any other metric as a proxy.
   - final_briefing MUST begin with a direct answer to the question in 1 sentence. For yes/no: "You're on track — at $X of your $Y target, Z% there." For comparisons: "This week's $X is [down/up] Y% on the same week last month ($Z)." NEVER start with a tangential observation.
   - If the owner's question contains TWO parts (e.g., "on track?" AND "same week last month?"), final_briefing must answer BOTH in the opening 2 sentences.
   - NARRATIVE FIRST — ABSOLUTE: final_briefing must contain at least 2 sentences of narrative BEFORE any block references or lists. A response that jumps straight to figures without explaining what they mean fails this rule.
   - NO DUPLICATION: Each dollar amount, percentage, or named period must appear at most ONCE in final_briefing. Never restate the same fact twice, even in different words.
   - NO DUPLICATION ACROSS BLOCKS: final_briefing's opening sentence IS the headline — do not also emit a "lead" block that restates it. Only use "lead" for a genuinely SECOND standout fact, different from final_briefing's opening sentence.

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

BREVITY INTENT — STRICT OVERRIDE

THIS BLOCK OVERRIDES THE "2 PARAGRAPHS NARRATIVE" RULES ABOVE. When a BREVITY signal fires, treat those rules as if they don't exist for this response.

When the user's message matches BREVITY signals, the 2-paragraph narrative rule is SUSPENDED. Output exactly one block plus at most one short sentence. NO advisory recommendations, NO multi-step plans, NO mentions of campaigns / outreach / bundles / strategy unless the user explicitly asked for advice.

BREVITY signals (case-insensitive):
- Starts with: "just tell me", "just ", "quickly", "tldr", "tl;dr", "in one number", "single number"
- Contains AND is short (<60 chars): "how much", "what's my", "what is my", "today's", "this week's", "this month's"

When BREVITY fires:
- "just tell me how much did I make this week" → ONE bold_metric block. Max 0–1 sentence before. NO advisory.
- "what's my revenue today" → ONE animated_kpi block. Max 0–1 sentence. NO advisory unless revenue=$0 AND user asked "why" — otherwise just the number.
- "today's orders" → ONE bold_metric or animated_kpi. Number only.

When BREVITY fires: NEVER emit council_split, comparison_table, alert_card, ai_reasoning, or pushback. These are advisory-mode blocks only.

ADVISORY MODE — DEFAULT (unchanged)
When BREVITY does NOT fire, your normal synthesis style applies. The user has time and wants full reasoning. Advisory mode is the default for: "why", "what should I do", "help me", "what's wrong", "analyze", "deep dive", "tell me about", "explain".

GROUNDING RULE — STRICT

For any question that requests, references, or implies a NUMERIC FACT about the business (revenue, sales, orders, customers, products, inventory, hours, dates, comparisons, trends, totals, averages), every dollar figure, count, percentage, or date range in your response must come from the data passed to you in THIS turn. Do not infer numbers from general knowledge or fill gaps with estimates.

FORBIDDEN without a source in this turn's data:
- Any specific dollar amount (e.g. "$741", "$4,442.90")
- Any percentage with a number (e.g. "down 83.7%")
- Any count (e.g. "11 customers", "143 orders")
- Phrases like "you made", "you've sold", "your top X", "compared to last X"
- Framings like "structural crisis", "tracking okay", "down 83%" that imply you computed something

ESCAPE — if the data doesn't contain a number the question needs, say so plainly: "I couldn't pull that data right now — try again in a moment." NEVER fill the gap with a guess.

COUNCIL-SPECIFIC GROUNDING: every $ amount, percentage, count, or comparison in your synthesis MUST trace to data the advisors passed you in this turn. Do not invent "POS capturing X% of transactions" or "actual revenue is X× higher" — these are fabrications. If you don't have the number, say "I couldn't pull that data right now".

RICH OUTPUT (use when the question would benefit from a chart/metric block, not for every response):

RICH RENDERER SELECTION (intent-driven — use these in addition to static keyword matching)

Before emitting any block, read the user's phrasing and infer their desired output format.

STEP 1 — INFER OUTPUT INTENT FROM PHRASING:

| User phrasing signals | Inferred intent |
|---|---|
| "show me", "visualise", "chart", "graph", "plot" | visual renderer (chart/clay_chart/styled_chart) |
| "just tell me", "what is", "how much", "quick number" | single number (bold_metric or animated_kpi) |
| "break it down", "overview", "summary of multiple" | multi-metric (bento_grid or metric_row) |
| "trend", "over time", "by hour/day/week" | time-series (styled_chart line/area or clay_chart) |
| "compare", "vs", "versus", "difference between" | comparison_table or two charts side by side |
| "list", "what happened", "activity", "events", "today's" | activity_stream or data_table |
| "why", "explain", "reason", "how did you decide" | ai_reasoning block |
| "should I", "what do you recommend", "what's the best" | council_split or action_list |
| "alert", "anomaly", "warning", "problem", "issue" | alert_card |
| "summarise the week/month", "weekly", "monthly total" | aurora_summary |
| "target", "goal", "progress", "how close am I" | progress_bars |
| anything ambiguous | pick the richest renderer that fits the data shape |

STEP 2 — MATCH DATA SHAPE TO RENDERER (when intent is ambiguous):

| Data shape | Default renderer | Alternate |
|---|---|---|
| Single number, no delta | bold_metric dark:true | animated_kpi variant:"a" |
| Single number + % change | animated_kpi (rotate variant a/b/c) | kpi_card |
| 2–4 metrics together | bento_grid | metric_row |
| Ranked list of items | data_table sortable:true | activity_stream |
| Time-series bar data | clay_chart | chart |
| Goals vs actuals | progress_bars | comparison_table |
| Week/month summary | aurora_summary | bold_metric |
| Warning or anomaly | alert_card severity:"critical"/"warning" | pushback |
| Reasoning/explanation | ai_reasoning + confidence | text block |

CRITICAL RENDERER RULES:
- NEVER use keyword matching alone — read the full sentence for intent
- VARIATION: rotate animated_kpi variants a→b→c across answers. Alternate bold_metric dark:true/false. Same question answered twice can render differently — correct behaviour, not a bug.
- NEVER emit alert_card for non-anomaly content — it always signals danger to the user
- Can return MULTIPLE blocks together — e.g. aurora_summary + progress_bars + activity_stream for a weekly debrief

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

- "kpi_card": ONE big metric for single-number answers — revenue today, weekly target, yes/no on-track.
  {"type":"kpi_card","label":"Revenue this week","value":"$2,553.00","format":"currency","trend":-44.0,"trend_label":"vs same week last month","color":"#E24B4A"}
  SEMANTIC COLORS — mandatory: on-track/positive → "#7FB897" (sage) · behind/negative → "#E24B4A" (red) · within 20% of target or caution → "#BA7517" (amber) · not-set/unknown → "#BA7517"
  value field: pre-format the string (e.g. "$2,553.00") OR pass a number and set format. trend = numeric % change (e.g. -44.0 = down 44%). If target not set, value="Not set", color="#BA7517", omit trend.

- "comparison_table": Side-by-side comparison for ANY vs/compared-to question. Numbers come from INTENT-GROUNDED FACTS ONLY — never fabricate.
  {"type":"comparison_table","title":"This week vs same week last month","left_label":"This week (Jun 1–8)","right_label":"Same week last month","rows":[{"metric":"Revenue","left":2553.00,"right":4498.00,"format":"currency"}],"show_delta":true}
  Set show_delta:true — delta % is computed and colour-coded automatically. Do NOT add a delta row yourself. left = current_period_revenue, right = comparison_revenue from INTENT-GROUNDED FACTS.

- "data_table": Multi-row ranked or breakdown list. Use for top-N customers, products, categories, staff.
  {"type":"data_table","title":"Top customers (all-time)","columns":[{"key":"rank","label":"#","format":"number"},{"key":"name","label":"Customer","format":"text"},{"key":"spend","label":"Lifetime spend","format":"currency"}],"rows":[{"rank":1,"name":"Charlotte Nguyen","spend":557.50},{"rank":2,"name":"Hassan Ahmad","spend":527.20}]}
  CUSTOMER RULE: "best/top customer" with NO time qualifier → use TOP CUSTOMERS from VERIFIED FIGURES (all-time total_spent), title="Top customers (all-time)", column label="Lifetime spend". Only use a period label ("this week", "this month") if the question EXPLICITLY names a window.
  Only include rows with real numbers from the data. If no data exists, skip this block entirely — do NOT invent rows or placeholder values.

BLOCK SELECTION RULES — FORMAT BY ANSWER SHAPE (mandatory, not optional):
- RANKING ("top X", "best/worst", "who/what leads", "highest/lowest") → data_table with rank + name + value columns. NOT metric_row. Narrative leads with the #1 result named.
  CUSTOMER RANKING: "best/top customer" with NO time qualifier → pull from VERIFIED FIGURES TOP CUSTOMERS (all-time total_spent). column key="spend", label="Lifetime spend", title="Top customers (all-time)". Do NOT source from sales aggregations.
- COMPARISON ("vs", "compared to", "same week/month last year", "how did we do vs") → comparison_table; show_delta:true; delta auto-colors negative=red, positive=sage. Narrative MUST open with both numbers in one sentence ("$X vs $Y, N% down/up").
- SINGLE METRIC / YES-NO ("on track?", "hit target?", "how much today?") → kpi_card with semantic color. Narrative leads with a direct yes/no sentence.
- TREND OVER TIME ("over the last N", "how has X changed") → chart (bar or line). Narrative leads.
- BREAKDOWN / MULTI-ROW DATA → data_table. Narrative leads.
- ADVISORY / STRATEGIC ("what should I", "help me decide", "recommend") → brain_readouts ONLY. No kpi_card or comparison_table forced.
- WRITING TASK (draft email/SMS/post) → text blocks only. No visuals.
- ACTION REQUEST → action_list with specific steps.
- NEVER include a block just to fill space. Every block must earn its place.
- ONLY include "chart" if you have real labels[] and values[] arrays with actual numbers from the data.
- MISSING DATA: if a number for a visual is unavailable, use kpi_card with value="Not tracked" — NEVER invent a number to fill a visual.

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

- "kpi_card": ONE big metric. Use for single-number or yes/no answers.
  {"type":"kpi_card","label":"Revenue this week","value":"$2,553.00","format":"currency","trend":-44.0,"trend_label":"vs same week last month","color":"#E24B4A"}
  COLORS: on-track/positive="#7FB897" · behind/negative="#E24B4A" · caution/not-set="#BA7517"

- "comparison_table": Side-by-side two-period comparison. Numbers from INTENT-GROUNDED FACTS only.
  {"type":"comparison_table","title":"This week vs same week last month","left_label":"This week","right_label":"Same week last month","rows":[{"metric":"Revenue","left":2553.00,"right":4498.00,"format":"currency"}],"show_delta":true}

- "data_table": Ranked or multi-row breakdown list. Only real numbers — skip entirely if no data.
  {"type":"data_table","title":"Top customers (all-time)","columns":[{"key":"rank","label":"#","format":"number"},{"key":"name","label":"Customer","format":"text"},{"key":"spend","label":"Lifetime spend","format":"currency"}],"rows":[{"rank":1,"name":"Charlotte Nguyen","spend":557.50},{"rank":2,"name":"Hassan Ahmad","spend":527.20}]}
  CUSTOMER RULE: "best/top customer" unqualified → all-time total_spent from VERIFIED FIGURES. Column key="spend", label="Lifetime spend". Period label only if question explicitly names one.

BLOCK SELECTION RULES — FORMAT BY ANSWER SHAPE (mandatory):
- RANKING ("top X", "best/worst", "who/what leads") → data_table with rank + name + value. Narrative leads.
  CUSTOMER RANKING: "best/top customer" unqualified → VERIFIED FIGURES TOP CUSTOMERS (all-time total_spent). column key="spend", label="Lifetime spend", title="Top customers (all-time)". Never source from sales aggregations.
- COMPARISON ("vs", "compared to", "same week/month last year") → comparison_table with show_delta:true. Narrative leads with both numbers in the opening sentence.
- SINGLE METRIC / YES-NO ("on track?", "hit target?") → kpi_card with semantic color. Narrative leads.
- TREND OVER TIME → chart (bar or line). Narrative leads.
- BREAKDOWN / MULTI-ROW → data_table. Narrative leads.
- ADVISORY / STRATEGIC → brain_readouts ONLY. No forced kpi_card or comparison_table.
- WRITING TASK → text blocks only. No visuals.
- ACTION REQUEST → action_list.
- Never include a block just to fill space
- NEVER include chart unless labels[] and values[] are filled with real numbers
- MISSING DATA → kpi_card with value="Not tracked"; never invent a number

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

// Fetch a cheap data-epoch signal: minute-truncated timestamp of the most recent non-voided sale.
// Changes whenever a new sale is recorded, making the compound cache key self-invalidating.
// A new sale → new epoch → different hash → cache miss → fresh data fetched. Structurally impossible
// to serve stale numbers after new POS data arrives.
async function getDataEpoch(businessId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('pos_sales')
      .select('created_at')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    // Minute-level truncation: avoids per-second thrash while still changing on every new sale
    return data?.created_at ? (data.created_at as string).slice(0, 16) : 'no-sales'
  } catch {
    return 'epoch-err'
  }
}

async function readCouncilCache(businessId: string, hash: string): Promise<{ result: CouncilOutput; expiresAt: string } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('council_cache')
      .select('result, expires_at')
      .eq('business_id', businessId)
      .eq('intent_hash', hash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    // LOGGING-FIX-1 Part 1: expires_at returned so the cache-hit log can record TTL remaining
    return data ? { result: data.result as CouncilOutput, expiresAt: data.expires_at as string } : null
  } catch { return null }
}

async function writeCouncilCache(businessId: string, hash: string, result: CouncilOutput): Promise<void> {
  // 5-min TTL as a backstop (primary staleness guard is the data-epoch in the key)
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
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

  // Cache check — skip for briefing/weekly_report modes (always fresh data).
  // Compound key = questionHash + '_' + dataEpoch so the key changes automatically whenever
  // a new sale is recorded — no write-path invalidation needed, staleness is structurally impossible.
  const questionHash = intentHash(activeQuestion)
  const dataEpoch = mode === 'ask_aria' ? await getDataEpoch(businessId) : 'no-cache'
  const hash = questionHash + '_' + dataEpoch
  if (mode === 'ask_aria') {
    const cached = await readCouncilCache(businessId, hash)
    if (cached) {
      console.log('[council] cache HIT — epoch:', dataEpoch, 'hash:', hash, 'business:', businessId)
      // LOGGING-FIX-1 Part 1 (LOGGING-AUDIT-1 recommended fix): cache HITs were the only
      // completed-council path with ZERO aria_ai_calls rows — log them before returning
      const ttlRemaining = Math.max(0, Math.round((new Date(cached.expiresAt).getTime() - Date.now()) / 1000))
      try {
        // COUNCIL-LOG-FIX-1 (amended): role 'cache' + provider 'cache' were invalid (same CHECK rejection
        // as the brain/synthesis logger). Use role='other' + provider='other' — both verified present in
        // the pg_constraint CHECK lists. ('internal' is NOT in the provider list — the earlier amend's
        // assumption that sql_guard/summarizer_guard 'internal' rows landed was wrong; they never wrote.)
        const { error: cacheLogErr } = await supabaseAdmin.from('aria_ai_calls').insert({
          business_id: businessId,
          agent_key: 'council_cache',
          provider: 'other',
          model_id: 'council_cache',
          role: 'other',
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: Date.now() - start,
          success: true,
          request_summary: activeQuestion.slice(0, 100),
          response_summary: 'cache_hit/ttl_remaining_seconds:' + ttlRemaining,
          learning_signal: 'council_cache_hit',
        })
        if (cacheLogErr) console.error('[council] cache-hit log REJECTED:', cacheLogErr.message)
      } catch (e) { console.error('[council] cache-hit log threw (non-fatal):', (e as Error).message) }
      return { ...cached.result, served_from_cache: true }
    }
    console.log('[council] cache MISS — epoch:', dataEpoch, 'hash:', hash, 'business:', businessId)
  }

  // Assess quality + recall memories + fetch summaries + learning context in parallel
  // BRIEF-FIX-1 (BUG 4) — computeHealthSignals() was already wired into the ask_aria pipeline
  // (src/app/api/aria/ask/route.ts) but never into this one, despite diagnosticPointer below telling
  // every brain "the system state is in business_health" — for briefing/weekly_report that field
  // never actually existed, so brains had no signal to distinguish a dormant/quiet business from a
  // broken one and defaulted to alarmist language. Fetched here so it can be injected into
  // cleanContextStr below, making that pointer's claim true for this pipeline too.
  const [quality, memories, recentSummaries, learningContext, healthSignals] = await Promise.all([
    assessDataQuality(businessId).catch(() => ({ ...FALLBACK_QUALITY })),
    recallMemories(businessId, activeQuestion).catch(() => []),
    fetchRecentSummaries(businessId).catch(() => []),
    getRecentLearningContext(businessId).catch(() => ''),
    computeHealthSignals(businessId).catch(() => null),
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
    if (rev7 != null) lines.push(`  revenue_7d = ${Number(rev7).toFixed(2)}  ← ROLLING last-7-days trend figure. NOT "this week" — for "this week" use current_week_revenue below`)
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
      current_week_revenue?: number | null
      same_week_last_month_revenue?: number | null
      weekly_revenue_target?: number | null
      on_track?: string | null
      pct_of_target?: number | null
      vs_same_week_pct?: string | null
      same_week_window?: string
      note?: string
    } | undefined
    if (weekTracking) {
      // WEEK-1-EXTEND: surface the calendar-week figure — without this line the only weekly
      // dollar figure the synthesis sees is rolling revenue_7d, which it mislabels "this week"
      if (weekTracking.current_week_revenue != null) {
        lines.push(`  current_week_revenue = ${Number(weekTracking.current_week_revenue).toFixed(2)}  ← "THIS WEEK" (calendar week, Mon 00:00 AEST → now). USE THIS for "this week" / "how am I doing this week" — NEVER revenue_7d`)
      }
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
    // Intent-grounded facts packet — overrides week_tracking when it provides comparison-period specifics
    const factsPacket = ctx?.aria_facts_packet as {
      detected_comparison_period?: string | null
      current_period_revenue?: number | null
      current_window?: string | null
      comparison_revenue?: number | null
      comparison_window?: string | null
      periods_are_same_length?: boolean
      pct_change?: string | null
      weekly_revenue_target?: number | null
      on_track?: string | null
      pct_of_target?: number | null
      caveats?: string[]
    } | undefined
    if (factsPacket) {
      lines.push('INTENT-GROUNDED FACTS (highest priority — override week_tracking where they conflict):')
      if (factsPacket.detected_comparison_period) {
        lines.push(`  comparison_period_detected = ${factsPacket.detected_comparison_period}`)
      }
      if (factsPacket.current_period_revenue != null) {
        lines.push(`  current_period_revenue = ${Number(factsPacket.current_period_revenue).toFixed(2)}  ← revenue for THIS period (${factsPacket.current_window ?? 'current window'}). USE THIS as the "current" figure.`)
      }
      if (factsPacket.comparison_revenue != null) {
        lines.push(`  comparison_revenue = ${Number(factsPacket.comparison_revenue).toFixed(2)}  ← USE THIS for the comparison asked (${factsPacket.comparison_window}). NEVER substitute revenue_30d.`)
        if (factsPacket.pct_change) {
          lines.push(`  pct_change_vs_comparison = ${factsPacket.pct_change}  ← LIKE-FOR-LIKE: both periods are ${factsPacket.current_window} vs ${factsPacket.comparison_window}`)
        }
      }
      if (factsPacket.weekly_revenue_target != null) {
        lines.push(`  weekly_revenue_target = ${Number(factsPacket.weekly_revenue_target).toFixed(2)}`)
        if (factsPacket.on_track) lines.push(`  on_track_status = ${factsPacket.on_track}`)
        if (factsPacket.pct_of_target != null) lines.push(`  pct_of_weekly_target = ${factsPacket.pct_of_target}%`)
      } else {
        lines.push("  weekly_revenue_target = NOT SET  ← say \"You haven't set a weekly revenue target yet — want to set one?\" NEVER use any average as proxy.")
      }
      for (const caveat of (factsPacket.caveats ?? [])) lines.push(`  CAVEAT: ${caveat}`)
    }
    // Top customers — all-time canonical (pos_customers.total_spent). Always inject for customer questions.
    // getBusinessContext stores these under ctx.customers.top_5_by_spend (NOT top_customers_alltime).
    const topCustomers = (ctx?.customers as { top_5_by_spend?: Array<{ name: string; total_spent: number }> } | undefined)?.top_5_by_spend
    if (topCustomers && topCustomers.length > 0) {
      lines.push('TOP CUSTOMERS (all-time pos_customers.total_spent — canonical source of truth):')
      topCustomers.slice(0, 5).forEach((c, i) => {
        lines.push(`  #${i + 1} ${c.name} = $${Number(c.total_spent).toFixed(2)}`)
      })
      lines.push('  → "best/top customer" with NO time qualifier = these all-time totals. Use verbatim. Only label as "this week/month" if the question explicitly specifies a time window.')
    }
    verifiedFiguresBlock = lines.join('\n') + '\n'
    console.log('[council] verifiedFiguresBlock chars:', verifiedFiguresBlock.length, 'business:', businessId)
  } catch (e) {
    // S9 PHASE 6 (#7) — this block IS the corpus the grounding checks measure against. Losing it
    // does not fail the turn, it quietly removes the thing that keeps the numbers honest, and the
    // success log above simply never printed. Now the absence is stated rather than inferred.
    console.error('[council] verifiedFiguresBlock FAILED — synthesis loses its anchor corpus:', (e as Error).message)
  }

  // Strip aria_facts_packet from context passed to brains — it's already formatted in verifiedFiguresBlock
  let cleanContextStr = businessContext
  try {
    const cleanCtxObj = { ...(safeParseJSON(businessContext) ?? {}) } as Record<string, unknown>
    delete cleanCtxObj.aria_facts_packet
    // BRIEF-FIX-1 (BUG 4) — the diagnostic fact diagnosticPointer below promises every brain: system
    // state so a severity claim ("POS broken", "trading has collapsed") stays consistent with reality
    // instead of being inferred from raw low/zero numbers alone.
    if (healthSignals) {
      const existingAgt = (cleanCtxObj.available_ground_truth ?? {}) as Record<string, unknown>
      cleanCtxObj.available_ground_truth = {
        ...existingAgt,
        business_health: healthSignals,
        diagnostic_facts_note: 'business_health describes verifiable system state (POS health, day-of-week baseline, data freshness). known_unknowns lists what CANNOT be verified — ask the owner about those rather than asserting them. Any asserted cause (e.g. "POS broken", "trading has collapsed") must be consistent with pos_health.status — INSUFFICIENT_SAMPLE means too little data to call it a failure, not evidence of one.',
      }
    }
    cleanContextStr = JSON.stringify(cleanCtxObj)
  } catch { /* non-fatal — fall back to raw businessContext */ }

  // HEALTH-SIGNALS-1 Part 3: ONE neutral fact-pointer (not a phrasing rule) — points advisors at the
  // diagnostic facts already present in the data so a cause assertion stays consistent with system state.
  const diagnosticPointer = 'DIAGNOSTIC_FACTS: The system state is in business_health (within available_ground_truth). Reason from these facts. If you assert a cause (e.g. "POS broken"), it must be consistent with pos_health.status. known_unknowns lists what cannot be verified — ask the owner rather than asserting.'
  const userPrompt = [verifiedFiguresBlock, learningContext, summaryBlock, memoryBlock, qualityCtx, diagnosticPointer, 'Business data:\n' + cleanContextStr]
    .filter(Boolean)
    .join('\n\n')

  // WEEK-1: AEST Monday (was server-TZ Monday — off by 10h on Vercel/UTC)
  const weekStart = new Date(toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)))

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

  // I6 INDUSTRY-KNOWLEDGE Part 3/5 — each advisor adopts the owner-enabled expert lenses mapped to
  // its role (≤2 per advisor). Fetch once; inject system_prompt_addition into the brain prompts.
  let enabledSkills: EnabledSkill[] = []
  try {
    const { data: sk } = await supabaseAdmin.from('aria_skills')
      .select('name, system_prompt_addition').eq('business_id', businessId).eq('enabled', true)
    enabledSkills = ((sk ?? []) as Array<{ name: string; system_prompt_addition: string | null }>)
      .filter(s => s.system_prompt_addition).map(s => ({ name: s.name, system_prompt_addition: s.system_prompt_addition as string }))
  } catch (e) { console.error('[council] skill fetch failed (non-blocking):', (e as Error).message) }
  const growthSkills   = buildSkillInjection('growth', enabledSkills)
  const riskSkills     = buildSkillInjection('risk', enabledSkills)
  const strategySkills = buildSkillInjection('strategy', enabledSkills)
  const contextSkills  = buildSkillInjection('context', enabledSkills)
  const injectedNames = [...new Set([...growthSkills.names, ...riskSkills.names, ...strategySkills.names, ...contextSkills.names])]
  if (injectedNames.length > 0) {
    void logAICallSafe({
      business_id: businessId, agent_key: 'skill_inject', role: 'classify', provider: 'other', success: true,
      response_summary: JSON.stringify({ advisors: { growth: growthSkills.names, risk: riskSkills.names, strategy: strategySkills.names, context: contextSkills.names }, skills_injected: injectedNames }).slice(0, 200),
    })
  }

  // Run all 6 in parallel — 4 brains + bizInfo fetch + gemini chain
  const [growth, risk, strategy, context, ctxOutput, bizInfo] = await Promise.all([
    callBrain(client, HAIKU, buildGrowthPrompt(activeQuestion)   + growthSkills.text,   userPrompt, 'growth',   businessId, 18000, activeQuestion.slice(0, 100)),
    callBrain(client, HAIKU, buildRiskPrompt(activeQuestion)     + riskSkills.text,     userPrompt, 'risk',     businessId, 18000, activeQuestion.slice(0, 100)),
    callBrain(client, HAIKU, buildStrategyPrompt(activeQuestion) + strategySkills.text, userPrompt, 'strategy', businessId, 18000, activeQuestion.slice(0, 100)),
    callBrain(client, HAIKU, CONTEXT_PROMPT                      + contextSkills.text,  userPrompt, 'context',  businessId, 18000, activeQuestion.slice(0, 100)),
    geminiPromise,
    bizInfoPromise,
  ])

  const brains = [growth, risk, strategy, context]
  const succeeded = brains.filter(b => b.succeeded)

  if (succeeded.length === 0) return null

  // GROUNDING-TEETH-V2 Part 2: clean each advisor's observations/recommendations of numbers that
  // don't trace to the CLEAN anchors BEFORE they enter the synthesis input. Fixes the V1 root cause —
  // an advisor inventing "$480/month" no longer feeds that number into the corpus the synthesis cites.
  // INTEL-COMPUTE-3 — v2Anchors hoisted to function scope: it was only ever applied to the 4
  // individual brain outputs, never to the FINAL synthesis (final_briefing) that's actually what the
  // owner reads — the one step downstream of the brains that could still recombine/round/invent a
  // number was the one step with zero guard. Reused (not recomputed) at the synthesis result below.
  let v2Anchors: number[] = []
  try {
    try {
      const agt = (safeParseJSON(businessContext) ?? {}) as { available_ground_truth?: { _anchor_values?: number[] } }
      v2Anchors = Array.isArray(agt.available_ground_truth?._anchor_values)
        ? agt.available_ground_truth!._anchor_values!
        : extractNumbers(verifiedFiguresBlock) // fallback: numbers from VERIFIED FIGURES if anchors absent
    } catch (e) {
      // S9 PHASE 6 (#7) — falling to zero anchors is not neutral. stripUngroundedNumbers treats
      // zero anchors as "nothing can be grounded" (BRIEF-FIX-1 BUG 1, deliberately), so every
      // figure an advisor writes gets stripped. That is the correct safe behaviour AND a large
      // silent change in the answer, which is exactly the pair worth logging.
      v2Anchors = []
      console.error('[council] anchor extraction FAILED — every advisor figure will be stripped:', (e as Error).message)
    }
    // BRIEF-FIX-1 (BUG 4/1) — health signals' own numbers (hours since last sale, completed_sales_7d,
    // etc.) are real and verified; merging them in gives a dormant business a few legitimate anchors
    // to ground short factual statements against, instead of zero.
    if (healthSignals?._anchor_numbers?.length) v2Anchors = [...new Set([...v2Anchors, ...healthSignals._anchor_numbers])]
    {
      // BRIEF-FIX-1 (BUG 1) — used to only run this cleaning pass when v2Anchors.length > 0. A
      // dormant/thin-data business has zero anchors, which is exactly when an advisor is most likely
      // to invent a number — that was the one case this guard skipped. stripUngroundedNumbers now
      // treats zero anchors as "nothing can be grounded" rather than "nothing to check", so it's safe
      // to always run.
      for (const b of brains) {
        const obs = stripUngroundedNumbers((b.observations ?? []).join('\n'), v2Anchors)
        const rec = stripUngroundedNumbers((b.recommendations ?? []).join('\n'), v2Anchors)
        const strippedAll = [...obs.stripped, ...rec.stripped]
        if (strippedAll.length > 0) {
          if (obs.stripped.length > 0) b.observations = obs.healedText.split('\n').filter(Boolean)
          if (rec.stripped.length > 0) b.recommendations = rec.healedText.split('\n').filter(Boolean)
          await logAICallSafe({
            business_id: businessId,
            agent_key: 'advisor_guard',
            provider: 'other',
            role: 'other',
            success: true,
            request_summary: strippedAll.join(' | ').slice(0, 100),
            response_summary: `advisor:${b.role}/stripped:${strippedAll.length}`,
            learning_signal: `guard_fired:advisor_fabrication_stripped:${b.role}`,
          })
        }
      }
    }
  } catch (e) {
    // S9 PHASE 6 (#7) — LEFT NON-BLOCKING ON PURPOSE. The register says this catch is deliberate
    // and it is right: advisor cleaning must never stop the council from answering. But a catch
    // that must not block can still speak. If this throws, ungrounded advisor numbers reach the
    // synthesis uncleaned — the exact failure GROUNDING-TEETH-V2 exists to prevent — and nothing
    // recorded it. The behaviour is unchanged; only the silence is.
    console.error('[council] advisor cleaning FAILED — ungrounded figures may reach synthesis:', (e as Error).message)
  }

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

  // GOAL-AWARE-1 (I2): synthesis-only fact-pointer (not added to advisors) — frame against the goal.
  const goalPointer = 'GOAL_CONTEXT: The owner\'s weekly target trajectory is in goal_context. Frame your recommendation against the gap or pace required if relevant. If goal_context.status="no_target", do NOT invent a target — ask the owner what their target is.'
  // PLAN-PERSISTENCE-1 (I5): synthesis-only fact-pointer — surface follow-ups the owner is owed.
  const openLoopsPointer = 'OPEN_LOOPS: actions the owner executed but you have not followed up on are in open_loops. If any has outcome_status="ready_to_review", ASK naturally how it went somewhere in your response — this makes the owner feel seen and captures outcome data for better future advice. Do NOT interrupt the main question; weave it in. Never assert it worked/failed from observed_delta alone — that is an early read, not a verdict.'
  // I9 DEEP-REASONING Part 2/4 — detect advisor conflicts before synthesis and surface them so Aria
  // addresses disagreements honestly. Detection is on the (V2-cleaned) brains. Also log a learning
  // signal carrying the per-advisor plan→verify→conclude confidence (no table writes; audit log only).
  const councilConflicts = detectCouncilConflicts(brains)
  const conflictBlock = formatConflictsForSynthesis(councilConflicts)
  const confScore = (() => {
    const map: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 }
    const vals = brains.filter(b => b.succeeded).map(b => map[b.confidence] ?? 0.6)
    return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0
  })()
  void logAICallSafe({
    business_id: businessId, agent_key: 'council_reasoning', role: 'analysis', provider: 'other', success: true,
    request_summary: 'plan_verify_conclude',
    response_summary: JSON.stringify({ conflicts: councilConflicts.length, advisors: succeeded.length }).slice(0, 200),
    learning_signal: `plan_verify_conclude:${confScore}` + (councilConflicts.length ? `|conflicts:${councilConflicts.length}` : ''),
  })

  // ── S8 PHASE 2 — THE COUNCIL MUST KNOW WHAT IT LOST ──────────────────────────────────────────
  //
  // WHAT WAS WRONG. The synthesis input rendered all four advisors unconditionally, so a failed
  // one arrived as:
  //     RISK BRAIN (confidence: low):
  //     Observations:
  //     Recommendations:
  // Two blank fields under a confident heading. That does not read as "the risk advisor was lost",
  // it reads as "the risk advisor looked and found nothing" — and the model has no way to tell the
  // difference. It is exactly the empty-chrome class S6 and S7 fixed in the renderers, one layer
  // up: a header promising content that was never there. On the reported turn TWO of the four
  // arrived like this, and synthesis answered an 11,485-token prompt with 556 tokens.
  //
  // WHY DEGRADE HONESTLY RATHER THAN RETRY OR FAIL — decided from the code, as the sprint asks:
  //   · RETRY is the wrong tool. The advisors already run in parallel behind an 18s timeout, so a
  //     retry doubles the worst case on the owner's most latency-sensitive surface. And a retry of
  //     a TRUNCATION just truncates again at the same ceiling — phase 1 fixed that cause directly.
  //   · FAIL throws away a usable answer. `succeeded.length === 0` already returns null; failing on
  //     one lost advisor would discard three good ones, which is a downgrade.
  //   · DEGRADE HONESTLY costs nothing, keeps the answer, and removes the only thing that was
  //     actually wrong: silence being mistaken for a finding.
  // S8 PHASE 2 — the renderer, the roster and the rule live in ./council-advisors so they can be
  // tested rather than grepped. See that file for what was wrong and why this degrades honestly
  // rather than retrying or failing:
  //   · RETRY is the wrong tool. The advisors run in parallel behind an 18s timeout, so a retry
  //     doubles the worst case on the owner's most latency-sensitive surface — and retrying a
  //     TRUNCATION just truncates again at the same ceiling, which is what phase 1 fixed directly.
  //   · FAIL throws away a usable answer. `succeeded.length === 0` already returns null; failing on
  //     one lost advisor would discard three good ones, which is a downgrade.
  //   · DEGRADE HONESTLY keeps the answer and removes the only thing that was actually wrong —
  //     silence being mistaken for a finding.
  const advisorsLost = lostAdvisors(brains)
  const lostRule = lostAdvisorRule(advisorsLost)

  const synthesisInput = `
${verifiedFiguresBlock ? verifiedFiguresBlock + '\n' : ''}${summarySynthesisBlock}${memorySynthesisBlock}${contradictionBlock}${diagnosticPointer}
${goalPointer}
${openLoopsPointer}
BUSINESS DATA:
${cleanContextStr}
${qualitySynthesisBlock}
${renderAdvisorSection('GROWTH', growth)}
${renderAdvisorSection('RISK', risk)}
${renderAdvisorSection('STRATEGY', strategy, 'Primary lever: ' + String((strategy.succeeded && strategy.raw && safeParseJSON(strategy.raw)?.primary_lever) ?? 'not identified'))}
${renderAdvisorSection('CONTEXT', context)}${lostRule}
${ctxOutput && !ctxOutput.failed ? `
EXTERNAL CONTEXT (from web search — treat as lower confidence than internal data):
Factors: ${ctxOutput.external_factors.join(', ') || 'none found'}
Risks: ${ctxOutput.risk_flags.join(', ') || 'none'}
Opportunities: ${ctxOutput.opportunities.join(', ') || 'none'}
Note: this is real-time web data — verify if acting on it.` : ''}
${conflictBlock ? conflictBlock + '\n' : ''}MODE: ${mode}
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

    // S8 PHASE 1 — DETECTION ONLY. THE SYNTHESIS BUDGET IS NOT CHANGED, AND THAT IS A MEASURED
    // DECISION, NOT AN OVERSIGHT: 258 real calls, max output 1,613 against max_tokens 6000, 3
    // failures. Nothing in the data says 6000 is tight, so nothing here moves it — the sprint's
    // own rule is that observed output beats static analysis. But detection costs nothing and the
    // day this DOES clip, it will say so instead of silently returning half an answer.
    const synthTrunc = inspectTruncation(res)
    const synthOutcome = classifyOutcome(synthTrunc, !!parsed)
    if (synthTrunc.hitCeiling) {
      await logAICallSafe({
        business_id: businessId, agent_key: 'council_ceiling', provider: 'other', role: 'other',
        success: synthOutcome !== 'truncated_mid_structure',
        request_summary: 'council_synthesis',
        response_summary: 'stop_reason=' + (synthTrunc.stopReason ?? 'null') + ' out=' + (synthTrunc.outputTokens ?? '?'),
        learning_signal: truncationSignal('council_synthesis', synthTrunc, synthOutcome),
      })
      console.error('[council] synthesis hit its token ceiling — outcome=' + synthOutcome
        + ' output_tokens=' + (synthTrunc.outputTokens ?? '?'))
    }

    await logAICall({
      agent_key: 'council_synthesis', model_id: synthesisModel, provider: 'anthropic',
      input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      success: !!parsed, business_id: businessId, request_summary: activeQuestion.slice(0, 100),
    })

    if (!parsed) {
      return {
        final_briefing: text.slice(0, 500),
        advisors_lost: advisorsLost,
      raw_brain_outputs: brains,
        context_brain_output: ctxOutput ?? null,
        meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: false, fell_back: true, duration_ms: Date.now() - start },
      }
    }

    // INTEL-COMPUTE-3 — same guard already applied to each brain's observations/recommendations
    // above, now also applied to the synthesis's final_briefing — the step the owner actually reads.
    let finalBriefing = typeof parsed.final_briefing === 'string' ? parsed.final_briefing : text.slice(0, 200)
    // BRIEF-FIX-1 (BUG 1) — used to require v2Anchors.length > 0 to run this guard at all, which
    // skipped the exact case (a dormant/thin-data business with zero real anchors) that produced the
    // "99.9% below your weekly target of $999,999" fabrication. stripUngroundedNumbers now handles
    // zero anchors correctly (strips every risky number rather than passing them through), so the gate
    // is removed — only the fact that there's text to check matters.
    if (finalBriefing) {
      const guarded = stripUngroundedNumbers(finalBriefing, v2Anchors)
      if (guarded.stripped.length > 0) {
        finalBriefing = guarded.healedText
        await logAICallSafe({
          business_id: businessId, agent_key: 'synthesis_guard', provider: 'other', role: 'other',
          success: true, request_summary: guarded.stripped.join(' | ').slice(0, 100),
          response_summary: `synthesis:stripped:${guarded.stripped.length}`,
          learning_signal: 'guard_fired:synthesis_fabrication_stripped',
        })
      }
    }

    const councilResult: CouncilOutput = {
      final_briefing: finalBriefing,
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
        if (b.type === 'lead') {
          // BRIEF-FIX-1 (BUG 3) — "lead" is a standalone headline sentence, and final_briefing's
          // opening sentence is separately instructed to also be a headline (SYNTHESIS_PROMPT_BODY's
          // "Leads with the single most important insight as a punchy headline"). Nothing stopped the
          // model writing the same sentence into both, so the owner saw it twice: once rendered as
          // the card's lead block, once as the first line of the briefing body right below it. Drop
          // the lead block when it's essentially the same sentence as final_briefing's opening line —
          // final_briefing already carries it.
          const content = (b as { content?: string }).content
          if (!content) return false
          const norm = (s: string) => s.toLowerCase().replace(/^#{1,6}\s+/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
          const firstSentence = norm((finalBriefing.split(/(?<=[.!?])\s+/)[0] ?? ''))
          const leadNorm = norm(content)
          if (firstSentence && leadNorm && (leadNorm.includes(firstSentence) || firstSentence.includes(leadNorm))) return false
          return true
        }
        if (b.type === 'text') return !!(b as {content?:string}).content
        // Guardrails for new block types — prevent fabricated-zero visuals
        if (b.type === 'kpi_card') {
          const k = b as { label?: unknown; value?: unknown }
          return !!(k.label) && k.value != null
        }
        if (b.type === 'comparison_table') {
          const ct = b as { rows?: unknown[] }
          return Array.isArray(ct.rows) && ct.rows.length > 0
        }
        if (b.type === 'data_table') {
          const dt = b as { columns?: unknown[]; rows?: unknown[] }
          return Array.isArray(dt.columns) && dt.columns.length > 0 && Array.isArray(dt.rows) && dt.rows.length > 0
        }
        return true
      }) : undefined,
      ask_followups: mode === 'ask_aria' && Array.isArray(parsed.ask_followups) ? parsed.ask_followups as string[] : undefined,
      advisors_lost: advisorsLost,
      raw_brain_outputs: brains,
      context_brain_output: ctxOutput ?? null,
      meta: { brains_succeeded: succeeded.length, brains_failed: 4 - succeeded.length, synthesis_succeeded: true, fell_back: false, duration_ms: Date.now() - start },
    }

    // Write to cache for ask_aria mode (fire-and-forget)
    if (mode === 'ask_aria') void writeCouncilCache(businessId, hash, councilResult)
    return councilResult
  } catch (e) {
    // LOGGING-FIX-1 Part 2 (LOGGING-AUDIT-1): this fallback previously returned a CouncilOutput
    // with ZERO synthesis logging — a council answer could reach the user with no synthesis row
    await logAICall({
      agent_key: 'council_synthesis', model_id: synthesisModel, provider: 'anthropic',
      input_tokens: 0, output_tokens: 0, success: false, business_id: businessId,
      error_message: (e as Error).message.slice(0, 200), request_summary: activeQuestion.slice(0, 100),
    })
    // Synthesis failed — build fallback from brain outputs directly
    const fallbackBriefing = [
      growth.observations[0],
      risk.observations[0],
      strategy.recommendations[0],
    ].filter(Boolean).join('. ')

    return {
      final_briefing: fallbackBriefing || 'Council completed with partial data.',
      advisors_lost: advisorsLost,
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

import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { callAnthropic, callAnthropicWithTools, type ToolLoopResult } from './providers/anthropic'
import { safeAIOutput } from './ai-output-guard'
import { guardOutput, numbersIn } from './ground-guard'
import type { AgentKey, AgentRole } from './types'
import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// AI-GROUNDING-1 — five canonical, purpose-scoped entry points for every new or migrated LLM call
// site in this app. Each is a thin wrapper over the existing callAnthropic/callAnthropicWithTools
// (which already provide cost logging to aria_ai_calls, the shared circuit breaker, and
// Anthropic→Gemini failover — see providers/anthropic.ts) plus a purpose-specific system-prompt
// suffix and output-safety pass. Nothing here replaces callAnthropic; every function below still
// goes through it, so cost/audit logging is inherited for free, not reimplemented.
//
// Callers keep their own AgentKey/AgentRole (per-feature cost attribution stays intact in
// aria_ai_calls — RULE 11) — these wrappers add grounding/validation/safety on top, they don't
// collapse every caller onto one shared tag.

const ANTI_HALLUCINATION = `
ANTI-HALLUCINATION (non-negotiable):
- Every number, date, name, and factual claim you state MUST come from the data given to you below. Never invent, round, guess, or estimate a figure that wasn't provided.
- If you don't know today's date, don't state one — the caller will tell you the real date explicitly if it matters; never guess a date from training-data assumptions.
- Absence of data is not zero and is not "none" — if something wasn't provided, don't claim a value for it either way.
- If the data given doesn't support answering part of the request, say so plainly rather than filling the gap with a plausible-sounding guess.`

function withGrounding(systemPrompt: string, groundTruth?: Record<string, unknown> | string): string {
  const truthBlock = groundTruth
    ? `\n\nREAL DATA (the only source of truth for this task — do not use anything outside it):\n${typeof groundTruth === 'string' ? groundTruth : JSON.stringify(groundTruth).slice(0, 6000)}`
    : ''
  return systemPrompt + ANTI_HALLUCINATION + truthBlock
}

// INTEL-COMPUTE-1 — structural numeric guard, wired into all 5 entry points below so every caller
// (existing and future) is checked by construction, not opt-in per route the way ground-guard.ts's
// guardOutput() was before this. JSON-shaped entry points run it in 'flag' mode (audit-only, via
// guardOutput's own aria_ai_calls log — never mutates, so a JSON response can never be corrupted by a
// guard pass) since the model may legitimately restate a real ground-truth figure inside a JSON field
// and flag mode still logs when a figure DOESN'T match. runCustomerFacingCopy is plain prose, so it
// actively redacts (never lets an ungrounded $/%/count figure reach a real customer).
function groundTruthValues(groundTruth?: Record<string, unknown> | string): number[] {
  if (!groundTruth) return []
  return numbersIn(typeof groundTruth === 'string' ? groundTruth : JSON.stringify(groundTruth))
}

async function auditUngroundedNumbers(text: string, groundTruth: Record<string, unknown> | string | undefined, businessId: string | undefined, surface: string): Promise<void> {
  if (!groundTruth || !text) return
  try {
    await guardOutput(text, groundTruthValues(groundTruth), { mode: 'flag', businessId, surface })
  } catch { /* non-fatal — audit only, never blocks the response */ }
}

interface BaseParams {
  model?: 'haiku' | 'sonnet' | 'opus'
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  businessId?: string
  agentKey: AgentKey
  role: AgentRole
  /** Real business data to inject as an explicit "only source of truth" block — RULE9 grounding. */
  groundTruth?: Record<string, unknown> | string
  timeoutMs?: number
}

export interface GroundedResult<T> {
  data: T
  raw: string
  success: boolean
  cost_cents: number
  latency_ms: number
  provider: 'anthropic' | 'google' | 'none'
}

/**
 * 1. runGroundedAnalysis — background insight/recommendation shown to the BUSINESS OWNER to read or
 * act on manually (dashboard cards, reports, forecasts). JSON output, parsed with the caller's
 * fallback shape.
 */
export async function runGroundedAnalysis<T = Record<string, unknown>>(
  params: BaseParams & { fallback: T; shape?: 'object' | 'array' },
): Promise<GroundedResult<T>> {
  const resp = await callAnthropic<T>({
    model: params.model ?? 'haiku',
    agentKey: params.agentKey,
    role: params.role,
    businessId: params.businessId,
    maxTokens: params.maxTokens ?? 1500,
    timeoutMs: params.timeoutMs,
    systemPrompt: withGrounding(params.systemPrompt, params.groundTruth),
    userPrompt: params.userPrompt,
  }, params.fallback)
  // AI-OUTPUT-INTEGRITY-1 — route the model's raw text through the shared scaffold/empty guard
  // before it's ever parsed into structured data, so a leaked internal-prompt artifact can't
  // survive into `data` the way BRIEF-INTEGRITY-1's raw prose glue-on did for briefings.
  const guarded = safeAIOutput(resp.raw, '', { label: `grounded/analysis/${params.agentKey}` })
  await auditUngroundedNumbers(guarded, params.groundTruth, params.businessId, `grounded/analysis/${params.agentKey}`)
  const cleaned = guarded.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const data = cleaned ? parseLLMJsonOr<T>(cleaned, resp.data, `grounded/${params.agentKey}`, params.shape ?? 'object') : resp.data
  return { data, raw: resp.raw, success: resp.success, cost_cents: resp.cost_cents, latency_ms: resp.latency_ms, provider: resp.provider }
}

/**
 * 2. runCustomerFacingCopy — prose that an end CUSTOMER will read directly (receipts, SMS/email
 * replies, marketing copy, public text). Plain-text output (not JSON) plus a content-safety pass
 * (AI-OUTPUT-INTEGRITY-1: the shared safeAIOutput() guard, which now also carries this function's
 * original leak-pattern regexes — see GENERIC_SCAFFOLD_MARKERS in ai-output-guard.ts) that refuses
 * to ship an obvious leak/placeholder/scaffold artifact (better an empty result than a broken send).
 */
export async function runCustomerFacingCopy(
  params: BaseParams & { fallback: string },
): Promise<GroundedResult<string> & { safe: boolean }> {
  const resp = await callAnthropic<string>({
    model: params.model ?? 'haiku',
    agentKey: params.agentKey,
    role: params.role,
    businessId: params.businessId,
    maxTokens: params.maxTokens ?? 600,
    timeoutMs: params.timeoutMs,
    systemPrompt: withGrounding(params.systemPrompt, params.groundTruth) + '\n\nThis text goes DIRECTLY to a customer — no markdown, no placeholders, no internal jargon, no mention of AI/prompts/systems. Plain, warm, Australian English prose only.',
    userPrompt: params.userPrompt,
  }, params.fallback)
  let guarded = safeAIOutput(resp.raw, '', { label: `grounded/customer-facing/${params.agentKey}` })
  if (params.groundTruth && guarded) {
    guarded = (await guardOutput(guarded, groundTruthValues(params.groundTruth), {
      mode: 'redact', businessId: params.businessId, surface: `grounded/customer-facing/${params.agentKey}`,
    }).catch(() => ({ text: guarded }))).text
  }
  const safe = resp.success && guarded.length > 0
  return { data: safe ? guarded : params.fallback, raw: resp.raw, success: resp.success, cost_cents: resp.cost_cents, latency_ms: resp.latency_ms, provider: resp.provider, safe }
}

interface AuditEntry {
  action_type: string
  entity_type: string
  entity_ids: string[]
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
  triggered_by: string
  message_excerpt?: string
}

/**
 * 3. runActionPlanner — the LLM's output drives a write/mutation or an automated decision WITHOUT a
 * human reviewing it first (cron-driven classification, auto-sent actions). Beyond the usual
 * aria_ai_calls cost log, callers may optionally supply `auditLog` to also record the decision in
 * aria_action_log (before/after state) — the same append-only trail the daily-briefing route already
 * uses for its overdue-invoice flag. Optional (not every autonomous decision has a clean entity
 * before/after shape) but available so every migrated site CAN get one, not just cost-logged.
 */
export async function runActionPlanner<T = Record<string, unknown>>(
  params: BaseParams & { fallback: T; shape?: 'object' | 'array'; tools?: Tool[]; executeTool?: (name: string, input: unknown) => Promise<unknown>; auditLog?: AuditEntry },
): Promise<GroundedResult<T> | (ToolLoopResult & { data: T })> {
  const groundedSystem = withGrounding(params.systemPrompt, params.groundTruth) + '\n\nThis output will be acted on AUTOMATICALLY, with no human review before it takes effect — be conservative, and prefer no action over a guessed one.'

  if (params.tools?.length && params.executeTool) {
    const loop = await callAnthropicWithTools({
      model: params.model ?? 'haiku',
      agentKey: params.agentKey,
      role: params.role,
      businessId: params.businessId,
      maxTokens: params.maxTokens ?? 1500,
      timeoutMs: params.timeoutMs,
      systemPrompt: groundedSystem,
      userPrompt: params.userPrompt,
      tools: params.tools,
      executeTool: params.executeTool,
    })
    const guardedLoop = safeAIOutput(loop.raw, '', { label: `grounded/action-planner/${params.agentKey}` })
    await auditUngroundedNumbers(guardedLoop, params.groundTruth, params.businessId, `grounded/action-planner/${params.agentKey}`)
    const cleaned = guardedLoop.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const data = cleaned ? parseLLMJsonOr<T>(cleaned, params.fallback, `grounded/action-planner/${params.agentKey}`, params.shape ?? 'object') : params.fallback
    if (params.auditLog && loop.success) await writeActionAudit(params.businessId, params.auditLog)
    return { ...loop, data }
  }

  const resp = await callAnthropic<T>({
    model: params.model ?? 'haiku',
    agentKey: params.agentKey,
    role: params.role,
    businessId: params.businessId,
    maxTokens: params.maxTokens ?? 1500,
    timeoutMs: params.timeoutMs,
    systemPrompt: groundedSystem,
    userPrompt: params.userPrompt,
  }, params.fallback)
  const guarded = safeAIOutput(resp.raw, '', { label: `grounded/action-planner/${params.agentKey}` })
  await auditUngroundedNumbers(guarded, params.groundTruth, params.businessId, `grounded/action-planner/${params.agentKey}`)
  const cleaned = guarded.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const data = cleaned ? parseLLMJsonOr<T>(cleaned, resp.data, `grounded/action-planner/${params.agentKey}`, params.shape ?? 'object') : resp.data
  if (params.auditLog && resp.success) await writeActionAudit(params.businessId, params.auditLog)
  return { data, raw: resp.raw, success: resp.success, cost_cents: resp.cost_cents, latency_ms: resp.latency_ms, provider: resp.provider }
}

async function writeActionAudit(businessId: string | undefined, entry: AuditEntry): Promise<void> {
  if (!businessId) return
  try {
    const { error } = await supabaseAdmin.from('aria_action_log').insert({
      business_id: businessId,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_ids: entry.entity_ids,
      before_state: entry.before_state,
      after_state: entry.after_state,
      triggered_by: entry.triggered_by,
      message_excerpt: entry.message_excerpt ?? null,
      executed_at: new Date().toISOString(),
    })
    if (error) console.error('[grounded/action-planner] aria_action_log insert failed:', error.message)
  } catch (e) { console.error('[non-fatal]', e) }
}

/**
 * 4. runBackgroundAgent — internal/background cron work that isn't owner-facing analysis and isn't
 * an autonomous mutation either (memory extraction/summarisation, internal classification feeding
 * another pipeline stage, batch pre-processing). The least constrained of the five — still grounded
 * and logged, without the customer-facing safety pass or the action-planner audit trail.
 */
export async function runBackgroundAgent<T = Record<string, unknown>>(
  params: BaseParams & { fallback: T; shape?: 'object' | 'array' },
): Promise<GroundedResult<T>> {
  const resp = await callAnthropic<T>({
    model: params.model ?? 'haiku',
    agentKey: params.agentKey,
    role: params.role,
    businessId: params.businessId,
    maxTokens: params.maxTokens ?? 1200,
    timeoutMs: params.timeoutMs,
    systemPrompt: withGrounding(params.systemPrompt, params.groundTruth),
    userPrompt: params.userPrompt,
  }, params.fallback)
  const guarded = safeAIOutput(resp.raw, '', { label: `grounded/background/${params.agentKey}` })
  await auditUngroundedNumbers(guarded, params.groundTruth, params.businessId, `grounded/background/${params.agentKey}`)
  const cleaned = guarded.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const data = cleaned ? parseLLMJsonOr<T>(cleaned, resp.data, `grounded/background/${params.agentKey}`, params.shape ?? 'object') : resp.data
  return { data, raw: resp.raw, success: resp.success, cost_cents: resp.cost_cents, latency_ms: resp.latency_ms, provider: resp.provider }
}

/**
 * 5. runVisionOrMedia — image input analysis (receipt/document OCR, photo understanding). Routes
 * through callAnthropic's image content-block support (AI-GROUNDING-1 addition to providers/
 * anthropic.ts — additive, every existing text-only caller is unaffected). Does NOT cover image/video
 * GENERATION (Higgsfield/Remotion studio routes) — that's a different system with its own provider
 * and is out of scope here; see AI-GROUNDING-1-REPORT.md's filed list.
 */
export async function runVisionOrMedia<T = Record<string, unknown>>(
  params: BaseParams & { fallback: T; shape?: 'object' | 'array'; imageBase64: string; imageMimeType: string },
): Promise<GroundedResult<T>> {
  const resp = await callAnthropic<T>({
    model: params.model ?? 'sonnet',
    agentKey: params.agentKey,
    role: params.role,
    businessId: params.businessId,
    maxTokens: params.maxTokens ?? 1500,
    timeoutMs: params.timeoutMs,
    systemPrompt: withGrounding(params.systemPrompt, params.groundTruth),
    userPrompt: params.userPrompt,
    imageBase64: params.imageBase64,
    imageMimeType: params.imageMimeType,
  }, params.fallback)
  const guarded = safeAIOutput(resp.raw, '', { label: `grounded/vision/${params.agentKey}` })
  await auditUngroundedNumbers(guarded, params.groundTruth, params.businessId, `grounded/vision/${params.agentKey}`)
  const cleaned = guarded.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
  const data = cleaned ? parseLLMJsonOr<T>(cleaned, resp.data, `grounded/vision/${params.agentKey}`, params.shape ?? 'object') : resp.data
  return { data, raw: resp.raw, success: resp.success, cost_cents: resp.cost_cents, latency_ms: resp.latency_ms, provider: resp.provider }
}

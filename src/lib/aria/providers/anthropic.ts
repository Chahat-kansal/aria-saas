import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeCostCentsWithCache } from '../cost'
import type { AgentKey, AgentRole } from '../types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 35_000,
  maxRetries: 0,
})

const MODEL_IDS = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus:   'claude-opus-4-5-20251101',
} as const

interface CallParams {
  model: keyof typeof MODEL_IDS
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  businessId?: string
  agentKey: AgentKey
  role: AgentRole
  timeoutMs?: number
  toolChoice?: { type: 'tool'; name: string } | { type: 'auto' }
}

async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e as Error
      const msg = lastErr.message ?? ''
      const isTransient = /529|503|overload|rate.?limit/i.test(msg)
      if (!isTransient || attempt === maxAttempts - 1) throw lastErr
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 4000)))
    }
  }
  throw lastErr ?? new Error('All retries failed')
}

// ONBOARD-FIX-1 (addendum) — account-wide circuit breaker for Anthropic
// billing exhaustion. "credit balance too low" is an account-level condition,
// not per-business, so a cached flag here short-circuits EVERY caller of this
// shared module (ask/route.ts, ai-router.ts, model-router.ts, base-agent.ts —
// the ~14+ call sites that funnel through callAnthropic/callAnthropicWithTools)
// instead of each one independently discovering the same failure. Reuses
// aria_signal_cache (no new table) so the flag survives across serverless
// instances, not just the current warm container.
const CREDIT_EXHAUSTED_KEY = 'anthropic:credits_exhausted'
const CREDIT_EXHAUSTED_TTL_MIN = 10

function isCreditExhaustedError(msg: string): boolean {
  return /credit balance is too low|insufficient.*credit|billing.*hard.?limit/i.test(msg)
}

async function isCircuitOpen(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('aria_signal_cache')
      .select('expires_at').eq('cache_key', CREDIT_EXHAUSTED_KEY).maybeSingle()
    return !!data && new Date(data.expires_at as string).getTime() > Date.now()
  } catch { return false }
}

async function tripCircuit() {
  try {
    await supabaseAdmin.from('aria_signal_cache').upsert({
      cache_key: CREDIT_EXHAUSTED_KEY, signal_type: 'circuit_breaker',
      payload: { reason: 'credit_balance_too_low' },
      expires_at: new Date(Date.now() + CREDIT_EXHAUSTED_TTL_MIN * 60_000).toISOString(),
    }, { onConflict: 'cache_key' })
  } catch (e) { console.error('[non-fatal]', e) }
}

export async function callAnthropic<T = Record<string, unknown>>(
  params: CallParams,
  fallback: T,
): Promise<{ data: T; raw: string; cost_cents: number; latency_ms: number; success: boolean }> {
  const modelId = MODEL_IDS[params.model]
  const t0 = Date.now()
  let inputTokens = 0, outputTokens = 0, cachedReadTokens = 0, cachedWriteTokens = 0
  let raw = '', success = true, errorMessage: string | null = null
  let data: T = fallback

  if (await isCircuitOpen()) {
    return {
      data: fallback, raw: '', cost_cents: 0, latency_ms: Date.now() - t0, success: false,
    }
  }

  try {
    const timeoutMs = params.timeoutMs ?? 30_000
    const ac = new AbortController()
    let hardTimerId: ReturnType<typeof setTimeout> | undefined
    const hardTimeout = new Promise<never>((_, rej) => {
      hardTimerId = setTimeout(() => {
        ac.abort()
        rej(new Error(`Anthropic call timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    const response = await Promise.race([
      withBackoff(() => client.messages.create({
        model: modelId,
        max_tokens: params.maxTokens ?? 800,
        system: [{
          type: 'text',
          text: params.systemPrompt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: 'ephemeral' } as any,
        }],
        messages: [{ role: 'user', content: params.userPrompt }],
      }, { signal: ac.signal })),
      hardTimeout,
    ])
    clearTimeout(hardTimerId)
    raw = (response.content[0] as { type: string; text?: string }).text ?? ''
    inputTokens = response.usage.input_tokens
    outputTokens = response.usage.output_tokens
    const usageAny = response.usage as unknown as Record<string, number>
    cachedReadTokens = Number(usageAny.cache_read_input_tokens) || 0
    cachedWriteTokens = Number(usageAny.cache_creation_input_tokens) || 0
    data = parseLLMJsonOr<T>(raw, fallback, `aria/anthropic/${params.agentKey}`)
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    if (isCreditExhaustedError(errorMessage)) void tripCircuit()
  }

  const latency = Date.now() - t0
  const cost = computeCostCentsWithCache(modelId, inputTokens, outputTokens, cachedReadTokens, cachedWriteTokens)

  if (params.businessId) {
    try {
      // LOGGING-AUDIT-3 Part 3: check the returned error — .insert() resolves with {error}, never throws,
      // so an off-list role/provider (CHECK violation) was silently dropped before this.
      const { error: aiCallErr } = await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId,
        agent_key: params.agentKey,
        provider: 'anthropic',
        model_id: modelId,
        role: params.role,
        input_tokens: inputTokens + cachedReadTokens + cachedWriteTokens,
        output_tokens: outputTokens,
        latency_ms: latency,
        cost_usd_cents: cost,
        success,
        error_message: errorMessage,
        response_summary: cachedReadTokens > 0 ? `cached:${cachedReadTokens}r/${cachedWriteTokens}w` : null,
        cache_write_tokens: cachedWriteTokens,
        cache_read_tokens: cachedReadTokens,
      })
      if (aiCallErr) console.error('[aria_ai_calls insert failed]', { agentKey: params.agentKey, role: params.role, reason: aiCallErr.message })
    } catch { /* non-fatal — table may not exist yet */ }
  }

  return { data, raw, cost_cents: cost, latency_ms: latency, success }
}

import type { Tool } from '@anthropic-ai/sdk/resources/messages'

interface ToolLoopParams {
  model: keyof typeof MODEL_IDS
  systemPrompt: string
  userPrompt: string | unknown[]
  priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  tools: Tool[]
  executeTool: (name: string, input: unknown) => Promise<unknown>
  maxTokens?: number
  maxIterations?: number
  thinking?: { enabled: boolean; budget_tokens?: number }
  businessId?: string
  agentKey: AgentKey
  role: AgentRole
  timeoutMs?: number
  toolChoice?: { type: 'tool'; name: string } | { type: 'auto' }
  requestSummary?: string
}

export interface ToolLoopResult {
  raw: string
  tool_calls: Array<{ name: string; input: unknown; result: unknown; ms: number }>
  iterations: number
  thinking_tokens: number
  cost_cents: number
  latency_ms: number
  success: boolean
  /** Populated when success=false — lets callers classify transient (529/timeout) vs hard (auth) failures. */
  error_message?: string | null
}

export async function callAnthropicWithTools(params: ToolLoopParams): Promise<ToolLoopResult> {
  const modelId = MODEL_IDS[params.model]
  const t0 = Date.now()
  let totalInputTokens = 0, totalOutputTokens = 0, totalCachedRead = 0, totalCachedWrite = 0
  let raw = '', success = true, errorMessage: string | null = null
  const toolCalls: Array<{ name: string; input: unknown; result: unknown; ms: number }> = []
  let thinkingTokensTotal = 0

  if (await isCircuitOpen()) {
    return {
      raw: '', tool_calls: [], iterations: 0, thinking_tokens: 0, cost_cents: 0,
      latency_ms: Date.now() - t0, success: false, error_message: 'anthropic_credits_exhausted',
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...(params.priorMessages ?? []),
    { role: 'user', content: params.userPrompt },
  ]
  const maxIter = params.maxIterations ?? 5

  try {
    for (let iter = 0; iter < maxIter; iter++) {
      // ASK-ARIA-COST-AND-FALLBACK (FIX 2) — stabilise the cache prefix: cache the tool definitions (large,
      // rarely change within a conversation) by putting a cache_control breakpoint on the LAST tool. This makes
      // the whole tools block a cache-READ prefix segment across turns instead of re-paying for it every turn
      // (the data showed cache_write rotating ~21k). The system block keeps its own breakpoint.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cachedTools: any[] = params.tools.length > 0
        ? params.tools.map((t, i) => i === params.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)
        : params.tools
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: any = {
        model: modelId,
        max_tokens: params.maxTokens ?? 2048,
        system: [{
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        }],
        tools: cachedTools,
        messages,
        ...(params.toolChoice ? { tool_choice: params.toolChoice } : {}),
      }
      if (params.thinking?.enabled) {
        const budget = Math.max(1024, params.thinking.budget_tokens ?? 2000)
        requestBody.thinking = { type: 'enabled', budget_tokens: budget }
        if (requestBody.max_tokens < budget + 1024) requestBody.max_tokens = budget + 1024
      }

      const iterTimeoutMs = params.timeoutMs ?? 45_000
      const iterAc = new AbortController()
      let iterTimerId: ReturnType<typeof setTimeout> | undefined
      const iterHardTimeout = new Promise<never>((_, rej) => {
        iterTimerId = setTimeout(() => {
          iterAc.abort()
          rej(new Error(`Anthropic call timed out after ${iterTimeoutMs}ms`))
        }, iterTimeoutMs)
      })
      const response = await Promise.race([
        withBackoff(() => client.messages.create(requestBody, { signal: iterAc.signal })),
        iterHardTimeout,
      ])
      clearTimeout(iterTimerId)

      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens
      const usageAny = response.usage as unknown as Record<string, number>
      totalCachedRead += Number(usageAny.cache_read_input_tokens) || 0
      totalCachedWrite += Number(usageAny.cache_creation_input_tokens) || 0

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = response.content as any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thinkingBlocks = content.filter((b: any) => b.type === 'thinking' || b.type === 'redacted_thinking')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinkingTokensTotal += thinkingBlocks.reduce((sum: number, b: any) => {
        const t = b.thinking
        return sum + (typeof t === 'string' ? Math.ceil(t.length / 4) : 0)
      }, 0)
      raw = content.filter(b => b.type === 'text').map(b => b.text as string).join('\n')
      const toolUseBlocks = content.filter(b => b.type === 'tool_use')

      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break

      messages.push({ role: 'assistant', content })

      const toolResults = []
      for (const block of toolUseBlocks) {
        const ts = Date.now()
        let result: unknown
        try { result = await params.executeTool(block.name, block.input) }
        catch (e) { result = { error: (e as Error).message } }
        toolCalls.push({ name: block.name, input: block.input, result, ms: Date.now() - ts })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result).slice(0, 50_000) })
      }
      messages.push({ role: 'user', content: toolResults })
    }
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    if (isCreditExhaustedError(errorMessage)) void tripCircuit()
  }

  const latency = Date.now() - t0
  const cost = computeCostCentsWithCache(modelId, totalInputTokens, totalOutputTokens, totalCachedRead, totalCachedWrite)

  if (params.businessId) {
    try {
      // LOGGING-AUDIT-3 Part 3: check the returned error (insert resolves with {error}, never throws)
      const { error: aiCallErr } = await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId, agent_key: params.agentKey,
        provider: 'anthropic', model_id: modelId, role: params.role,
        input_tokens: totalInputTokens + totalCachedRead + totalCachedWrite,
        output_tokens: totalOutputTokens, latency_ms: latency, cost_usd_cents: cost,
        success, error_message: errorMessage,
        request_summary: params.requestSummary ?? null,
        response_summary: `tools:${toolCalls.length}/iter:${Math.max(1, toolCalls.length)}/think:${thinkingTokensTotal}`,
        cache_write_tokens: totalCachedWrite, cache_read_tokens: totalCachedRead,
      })
      if (aiCallErr) console.error('[aria_ai_calls insert failed]', { agentKey: params.agentKey, role: params.role, reason: aiCallErr.message })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return { raw, tool_calls: toolCalls, iterations: toolCalls.length, thinking_tokens: thinkingTokensTotal, cost_cents: cost, latency_ms: latency, success, error_message: errorMessage }
}

import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeCostCentsWithCache } from '../cost'
import type { AgentKey, AgentRole } from '../types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 25_000,
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
}

async function withBackoff<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
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

export async function callAnthropic<T = Record<string, unknown>>(
  params: CallParams,
  fallback: T,
): Promise<{ data: T; raw: string; cost_cents: number; latency_ms: number; success: boolean }> {
  const modelId = MODEL_IDS[params.model]
  const t0 = Date.now()
  let inputTokens = 0, outputTokens = 0, cachedReadTokens = 0, cachedWriteTokens = 0
  let raw = '', success = true, errorMessage: string | null = null
  let data: T = fallback

  try {
    const response = await withBackoff(() =>
      client.messages.create({
        model: modelId,
        max_tokens: params.maxTokens ?? 800,
        system: [{
          type: 'text',
          text: params.systemPrompt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: 'ephemeral' } as any,
        }],
        messages: [{ role: 'user', content: params.userPrompt }],
      }, {
        signal: AbortSignal.timeout(params.timeoutMs ?? 25_000),
      })
    )
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
  }

  const latency = Date.now() - t0
  const cost = computeCostCentsWithCache(modelId, inputTokens, outputTokens, cachedReadTokens, cachedWriteTokens)

  if (params.businessId) {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
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
    } catch { /* non-fatal — table may not exist yet */ }
  }

  return { data, raw, cost_cents: cost, latency_ms: latency, success }
}

import type { Tool } from '@anthropic-ai/sdk/resources/messages'

interface ToolLoopParams {
  model: keyof typeof MODEL_IDS
  systemPrompt: string
  userPrompt: string
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
}

export interface ToolLoopResult {
  raw: string
  tool_calls: Array<{ name: string; input: unknown; result: unknown; ms: number }>
  iterations: number
  thinking_tokens: number
  cost_cents: number
  latency_ms: number
  success: boolean
}

export async function callAnthropicWithTools(params: ToolLoopParams): Promise<ToolLoopResult> {
  const modelId = MODEL_IDS[params.model]
  const t0 = Date.now()
  let totalInputTokens = 0, totalOutputTokens = 0, totalCachedRead = 0, totalCachedWrite = 0
  let raw = '', success = true, errorMessage: string | null = null
  const toolCalls: Array<{ name: string; input: unknown; result: unknown; ms: number }> = []
  let thinkingTokensTotal = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    ...(params.priorMessages ?? []),
    { role: 'user', content: params.userPrompt },
  ]
  const maxIter = params.maxIterations ?? 5

  try {
    for (let iter = 0; iter < maxIter; iter++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: any = {
        model: modelId,
        max_tokens: params.maxTokens ?? 2048,
        system: [{
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        }],
        tools: params.tools,
        messages,
      }
      if (params.thinking?.enabled) {
        const budget = Math.max(1024, params.thinking.budget_tokens ?? 2000)
        requestBody.thinking = { type: 'enabled', budget_tokens: budget }
        if (requestBody.max_tokens < budget + 1024) requestBody.max_tokens = budget + 1024
      }

      const response = await withBackoff(() =>
        client.messages.create(requestBody, {
          signal: AbortSignal.timeout(params.timeoutMs ?? 45_000),
        })
      )

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
  }

  const latency = Date.now() - t0
  const cost = computeCostCentsWithCache(modelId, totalInputTokens, totalOutputTokens, totalCachedRead, totalCachedWrite)

  if (params.businessId) {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId, agent_key: params.agentKey,
        provider: 'anthropic', model_id: modelId, role: params.role,
        input_tokens: totalInputTokens + totalCachedRead + totalCachedWrite,
        output_tokens: totalOutputTokens, latency_ms: latency, cost_usd_cents: cost,
        success, error_message: errorMessage,
        response_summary: `tools:${toolCalls.length}/iter:${Math.max(1, toolCalls.length)}/think:${thinkingTokensTotal}`,
        cache_write_tokens: totalCachedWrite, cache_read_tokens: totalCachedRead,
      })
    } catch { /* non-fatal */ }
  }

  return { raw, tool_calls: toolCalls, iterations: toolCalls.length, thinking_tokens: thinkingTokensTotal, cost_cents: cost, latency_ms: latency, success }
}

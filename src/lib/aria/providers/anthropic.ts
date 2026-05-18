import Anthropic from '@anthropic-ai/sdk'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
      const supabase = createServerSupabaseClient()
      await supabase.from('aria_ai_calls').insert({
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
      })
    } catch { /* non-fatal — table may not exist yet */ }
  }

  return { data, raw, cost_cents: cost, latency_ms: latency, success }
}

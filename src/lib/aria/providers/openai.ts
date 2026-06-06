import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeCostCentsWithCache } from '../cost'
import type { AgentKey, AgentRole } from '../types'

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
const JUDGE_ENABLED = !!OPENAI_KEY && process.env.ARIA_USE_OPENAI_JUDGE !== 'false'

export const isOpenAIAvailable = () => !!OPENAI_KEY
export const isOpenAIJudgeEnabled = () => JUDGE_ENABLED

interface ChatParams {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  businessId?: string
  agentKey: AgentKey
  role: AgentRole
  timeoutMs?: number
}

export async function callOpenAIChat<T = Record<string, unknown>>(
  params: ChatParams,
  fallback: T,
): Promise<{ data: T; raw: string; cost_cents: number; latency_ms: number; available: boolean }> {
  if (!JUDGE_ENABLED) return { data: fallback, raw: '', cost_cents: 0, latency_ms: 0, available: false }

  const modelId = 'gpt-5.4'
  const t0 = Date.now()
  let inputTokens = 0, outputTokens = 0, raw = '', success = true, errorMessage: string | null = null
  let data: T = fallback

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 25_000)
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: modelId,
        max_tokens: params.maxTokens ?? 800,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const json = await r.json()
    raw = json.choices?.[0]?.message?.content ?? ''
    inputTokens = json.usage?.prompt_tokens ?? 0
    outputTokens = json.usage?.completion_tokens ?? 0
    data = parseLLMJsonOr<T>(raw, fallback, `aria/openai/${params.agentKey}`)
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
  }

  const latency = Date.now() - t0
  const cost = computeCostCentsWithCache(modelId, inputTokens, outputTokens)

  if (params.businessId) {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId, agent_key: params.agentKey, provider: 'openai',
        model_id: modelId, role: params.role, input_tokens: inputTokens, output_tokens: outputTokens,
        latency_ms: latency, cost_usd_cents: cost, success, error_message: errorMessage,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return { data, raw, cost_cents: cost, latency_ms: latency, available: true }
}

export interface OpenAICallResult {
  raw: string
  cost_cents: number
  latency_ms: number
  success: boolean
  input_tokens: number
  output_tokens: number
}

// Pricing per 1M tokens in USD cents (May 2026)
const GPT4O_MINI_INPUT_CENTS_PER_M  = 15
const GPT4O_MINI_OUTPUT_CENTS_PER_M = 60

function computeMiniCost(inp: number, out: number): number {
  return Math.round((inp / 1_000_000) * GPT4O_MINI_INPUT_CENTS_PER_M + (out / 1_000_000) * GPT4O_MINI_OUTPUT_CENTS_PER_M)
}

export async function callOpenAI(params: ChatParams & { model?: string }): Promise<OpenAICallResult> {
  const apiKey = OPENAI_KEY
  if (!apiKey) {
    console.error('[openai] OPENAI_API_KEY not set')
    return { raw: '', cost_cents: 0, latency_ms: 0, success: false, input_tokens: 0, output_tokens: 0 }
  }

  const model = params.model ?? 'gpt-4o-mini'
  const t0 = Date.now()
  let raw = '', success = true, errorMessage: string | null = null
  let inputTokens = 0, outputTokens = 0

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: params.maxTokens ?? 1024,
        temperature: 0.2,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user',   content: params.userPrompt   },
        ],
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 30_000),
    })
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const json = await r.json() as Record<string, unknown>
    const choices = json.choices as Array<Record<string, unknown>> | undefined
    raw = ((choices?.[0]?.message as Record<string, unknown> | undefined)?.content as string) ?? ''
    const usage = (json.usage ?? {}) as Record<string, number>
    inputTokens  = usage.prompt_tokens     ?? 0
    outputTokens = usage.completion_tokens ?? 0
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    console.error('[openai] call failed:', errorMessage)
  }

  const latency = Date.now() - t0
  const cost = computeMiniCost(inputTokens, outputTokens)

  if (params.businessId) {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId, agent_key: params.agentKey, provider: 'openai',
        model_id: model, role: params.role,
        input_tokens: inputTokens, output_tokens: outputTokens,
        latency_ms: latency, cost_usd_cents: cost, success, error_message: errorMessage,
      })
    } catch (e) { console.error('[non-fatal]', e) }
  }

  return { raw, cost_cents: cost, latency_ms: latency, success, input_tokens: inputTokens, output_tokens: outputTokens }
}

export async function embedText(text: string, businessId?: string): Promise<number[] | null> {
  if (!OPENAI_KEY) return null
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(8_000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const vec = j.data?.[0]?.embedding
    if (!Array.isArray(vec)) return null
    if (businessId) {
      try {
        const inputTokens = j.usage?.prompt_tokens ?? 0
        await supabaseAdmin.from('aria_ai_calls').insert({
          business_id: businessId, agent_key: 'product_lookup', provider: 'openai',
          model_id: 'text-embedding-3-small', role: 'data',
          input_tokens: inputTokens, output_tokens: 0, latency_ms: 0,
          cost_usd_cents: computeCostCentsWithCache('text-embedding-3-small', inputTokens, 0),
          success: true,
        })
      } catch (e) { console.error('[non-fatal]', e) }
    }
    return vec as number[]
  } catch { return null }
}

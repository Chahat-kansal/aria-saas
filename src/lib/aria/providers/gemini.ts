import { supabaseAdmin } from '@/lib/supabase-admin'
import type { AgentKey, AgentRole } from '../types'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Pricing per 1M tokens in USD cents (May 2026)
const GEMINI_INPUT_CENTS_PER_M  = 10   // $0.10
const GEMINI_OUTPUT_CENTS_PER_M = 40   // $0.40

function computeGeminiCost(inputTokens: number, outputTokens: number): number {
  return Math.round(
    (inputTokens  / 1_000_000) * GEMINI_INPUT_CENTS_PER_M +
    (outputTokens / 1_000_000) * GEMINI_OUTPUT_CENTS_PER_M,
  )
}

interface GeminiCallParams {
  model?: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  businessId?: string
  agentKey: AgentKey
  role: AgentRole
  imageBase64?: string
  imageMimeType?: string
}

export interface GeminiCallResult {
  raw: string
  cost_cents: number
  latency_ms: number
  success: boolean
  input_tokens: number
  output_tokens: number
}

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[gemini] GEMINI_API_KEY not set, falling back')
    return { raw: '', cost_cents: 0, latency_ms: 0, success: false, input_tokens: 0, output_tokens: 0 }
  }

  // gemini-2.0-flash was deprecated for new users as of March 2026 (404 errors).
  // Current stable default: gemini-2.5-flash (best price-performance per Google docs).
  const model = params.model ?? 'gemini-2.5-flash'
  const t0 = Date.now()
  let raw = '', success = true, errorMessage: string | null = null
  let inputTokens = 0, outputTokens = 0

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [{ text: params.userPrompt }]

    if (params.imageBase64 && params.imageMimeType) {
      parts.unshift({
        inline_data: {
          mime_type: params.imageMimeType,
          data: params.imageBase64,
        },
      })
    }

    const body = {
      system_instruction: { parts: [{ text: params.systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: params.maxTokens ?? 1024,
        temperature: 0.2,
      },
    }

    const res = await fetch(
      `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`)
    }

    const data = await res.json() as Record<string, unknown>
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined
    const partsOut = content?.parts as Array<Record<string, unknown>> | undefined
    raw = (partsOut?.[0]?.text as string) ?? ''

    const usage = (data.usageMetadata ?? {}) as Record<string, number>
    inputTokens  = usage.promptTokenCount     ?? 0
    outputTokens = usage.candidatesTokenCount ?? 0
  } catch (e) {
    success = false
    errorMessage = (e as Error).message
    console.error('[gemini] call failed:', errorMessage)
  }

  const latency = Date.now() - t0
  const cost = computeGeminiCost(inputTokens, outputTokens)

  if (params.businessId) {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: params.businessId,
        agent_key: params.agentKey,
        provider: 'google',
        model_id: model,
        role: params.role,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latency,
        cost_usd_cents: cost,
        success,
        error_message: errorMessage,
      })
    } catch { /* non-fatal */ }
  }

  return { raw, cost_cents: cost, latency_ms: latency, success, input_tokens: inputTokens, output_tokens: outputTokens }
}

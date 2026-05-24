import { supabaseAdmin } from '@/lib/supabase-admin'

export type ContextBrainOutput = {
  external_factors: string[]
  risk_flags: string[]
  opportunities: string[]
  confidence: 'high' | 'medium' | 'low'
  sources_used: string[]
  failed?: boolean
}

const FAILED: ContextBrainOutput = {
  external_factors: [], risk_flags: [], opportunities: [],
  confidence: 'low', sources_used: [], failed: true,
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const stripped = text.trim()
      .replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1))
    return null
  } catch { return null }
}

async function logCall(params: {
  business_id: string; success: boolean; input_tokens: number;
  output_tokens: number; error_message?: string
}) {
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: params.business_id,
      agent_key: 'council_context',
      provider: 'gemini',
      model_id: 'gemini-2.5-flash-preview-05-20',
      role: 'council',
      input_tokens: params.input_tokens,
      output_tokens: params.output_tokens,
      success: params.success,
      error_message: params.error_message ?? null,
    })
  } catch { /* non-fatal */ }
}

export async function runContextBrain(
  business: { trading_name: string; industry: string; city: string; state: string; business_id?: string },
  weekStart: Date,
): Promise<ContextBrainOutput> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[context-brain] GEMINI_API_KEY not set — Gemini Context Brain disabled')
    return { ...FAILED }
  }

  const query = `You are a business intelligence agent for an Australian small business.
Business: ${business.trading_name} — a ${business.industry} business in ${business.city}, ${business.state}, Australia.
Week starting: ${weekStart.toDateString()}

Search for and report ONLY information directly relevant to this business for this specific week:
1. Public holidays in ${business.state} this week or next (if any)
2. Major local events near ${business.city} (festivals, sport, concerts, markets) that would increase or decrease foot traffic
3. Current weather forecast for ${business.city} this week
4. Any news about ${business.industry} businesses in Australia this week (price changes, supply issues, regulatory changes, competitor news)
5. Any competitor businesses opening, closing, or running promotions near ${business.city} in the ${business.industry} industry

Return ONLY valid JSON, no preamble:
{
  "external_factors": ["specific, current fact relevant to this business"],
  "risk_flags": ["specific external risk this week"],
  "opportunities": ["specific external opportunity this week"],
  "confidence": "high|medium|low",
  "sources_used": ["what you searched for"]
}

If you find nothing relevant, return external_factors: [], risk_flags: [], opportunities: [], confidence: "low". Never invent facts.`

  const body = {
    contents: [{ parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.1 },
  }

  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    )
    clearTimeout(timer)
    void t0

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = await res.json() as Record<string, unknown>
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined
    const parts = content?.parts as Array<Record<string, unknown>> | undefined
    const raw = (parts?.[0]?.text as string) ?? ''

    const usage = (data.usageMetadata ?? {}) as Record<string, number>
    const inputTokens = usage.promptTokenCount ?? Math.round(query.length / 4)
    const outputTokens = usage.candidatesTokenCount ?? Math.round(raw.length / 4)

    if (business.business_id) {
      await logCall({ business_id: business.business_id, success: true, input_tokens: inputTokens, output_tokens: outputTokens })
    }

    const parsed = safeParseJSON(raw)
    if (!parsed) return { ...FAILED }

    const conf = parsed.confidence as string
    return {
      external_factors: Array.isArray(parsed.external_factors) ? (parsed.external_factors as string[]) : [],
      risk_flags: Array.isArray(parsed.risk_flags) ? (parsed.risk_flags as string[]) : [],
      opportunities: Array.isArray(parsed.opportunities) ? (parsed.opportunities as string[]) : [],
      confidence: (['high', 'medium', 'low'].includes(conf) ? conf as 'high' | 'medium' | 'low' : 'low'),
      sources_used: Array.isArray(parsed.sources_used) ? (parsed.sources_used as string[]) : [],
      failed: false,
    }
  } catch (e) {
    clearTimeout(timer)
    const msg = (e as Error).message
    console.error('[context-brain] failed:', msg)
    if (business.business_id) {
      await logCall({
        business_id: business.business_id,
        success: false,
        input_tokens: Math.round(query.length / 4),
        output_tokens: 0,
        error_message: msg,
      })
    }
    return { ...FAILED }
  }
}

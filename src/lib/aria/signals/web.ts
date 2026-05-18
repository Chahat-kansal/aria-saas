import { createServerSupabaseClient } from '@/lib/supabase-server'

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY ?? ''

export interface WebSignal {
  answer: string
  sources: string[]
}

export async function searchWeb(query: string, businessId?: string): Promise<WebSignal | null> {
  if (!PERPLEXITY_KEY || !query) return null
  const cacheKey = `web:${query.toLowerCase().slice(0, 150)}`
  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase.from('aria_signal_cache')
      .select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
    if (data && new Date(String(data.expires_at)).getTime() > Date.now()) {
      return data.payload as WebSignal
    }
  } catch { /* cache miss */ }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const r = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PERPLEXITY_KEY}` },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: query }],
        max_tokens: 300,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) return null
    const j = await r.json()
    const answer = j.choices?.[0]?.message?.content ?? ''
    const sources = (j.citations ?? []).slice(0, 3)
    const result: WebSignal = { answer, sources }

    try {
      const supabase = createServerSupabaseClient()
      await supabase.from('aria_signal_cache').upsert({
        cache_key: cacheKey, signal_type: 'web',
        payload: result,
        expires_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
        business_id: businessId ?? null,
      }, { onConflict: 'cache_key' })
    } catch { /* non-fatal */ }
    return result
  } catch { return null }
}

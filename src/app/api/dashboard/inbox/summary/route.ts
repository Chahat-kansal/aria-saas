export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { callAnthropic } from '@/lib/aria/providers/anthropic'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

interface Summary { headline: string; asks: string[]; loved: string | null; disliked: string | null; faq: string[]; sentiment: string }

async function _GET(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const refresh = new URL(req.url).searchParams.get('refresh') === '1'
  const cacheKey = `inbox_summary_${bid}`
  if (!refresh) {
    const { data: cached } = await supabaseAdmin.from('aria_signal_cache').select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
    if (cached && new Date(cached.expires_at as string) > new Date()) {
      return NextResponse.json({ summary: (cached.payload as { summary: Summary }).summary, cached: true })
    }
  }

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const [{ data: demand }, { count: kioskCount }, { count: unread }] = await Promise.all([
    supabaseAdmin.from('instore_demand_signals').select('product_asked, query_text, in_stock').eq('business_id', bid).gte('created_at', since).limit(500),
    supabaseAdmin.from('instore_conversations').select('id', { count: 'exact', head: true }).eq('business_id', bid).gte('started_at', since),
    supabaseAdmin.from('customer_interactions_v').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('has_unread', true),
  ])

  // Top things asked for that aren't stocked.
  const notStocked = new Map<string, number>()
  for (const d of demand ?? []) {
    if (d.in_stock === false) {
      const key = (d.product_asked || d.query_text || '').toString().trim().toLowerCase()
      if (key) notStocked.set(key, (notStocked.get(key) ?? 0) + 1)
    }
  }
  const topAsks = [...notStocked.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n}×)`)

  const hasData = (demand?.length ?? 0) > 0 || (kioskCount ?? 0) > 0 || (unread ?? 0) > 0
  let summary: Summary = {
    headline: hasData ? 'Customers are interacting — here\'s what stands out.' : 'No customer interactions yet this period.',
    asks: topAsks, loved: null, disliked: null, faq: [], sentiment: 'stable',
  }

  if (hasData && process.env.ANTHROPIC_API_KEY) {
    const ctx = `Customer interactions (last 30 days):
- Kiosk chats: ${kioskCount ?? 0}
- Unread messages waiting: ${unread ?? 0}
- Top products customers asked for but you DON'T stock: ${topAsks.join(', ') || 'none recorded'}
- Total demand signals: ${demand?.length ?? 0}
Note: thumbs up/down feedback is not yet collected, so leave loved/disliked null unless the data above implies it.`
    try {
      const res = await callAnthropic<Summary>({
        model: 'haiku',
        systemPrompt: 'You are Aria, reading every customer interaction for an Australian small business. Return ONLY valid JSON (no markdown) with keys: headline (one punchy sentence, <16 words), asks (array of up to 3 short strings — things customers want that the owner does not sell), loved (string or null), disliked (string or null), faq (array of up to 3 repeated questions worth adding to an FAQ), sentiment (one of "improving","stable","declining"). Use only the data given. Do not invent products.',
        userPrompt: ctx,
        maxTokens: 400,
        businessId: bid,
        agentKey: 'generic',
        role: 'data',
      }, summary)
      if (res.data && typeof res.data === 'object' && 'headline' in res.data) summary = { ...summary, ...res.data }
    } catch { /* keep heuristic summary */ }
  }

  await supabaseAdmin.from('aria_signal_cache').upsert({
    cache_key: cacheKey, payload: { summary }, expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  }, { onConflict: 'cache_key' })

  return NextResponse.json({ summary, cached: false })
}

export const GET = withBusinessContext('dashboard/inbox/summary', _GET)

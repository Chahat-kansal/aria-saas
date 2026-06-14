import { callAnthropic } from '../providers/anthropic'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildAskAriaContext } from './business-context'
import { getOpenLoops } from '../open-loops'

const FALLBACK_SUGGESTIONS = [
  "Where am I losing the most money right now?",
  "Which products should I reorder this week?",
  "How does my revenue compare to last week?",
  "Which customers haven't been back recently?",
]

// PLAN-PERSISTENCE-1 (I5) Part 4: an executed action awaiting follow-up becomes a clickable
// "how did it go?" suggestion. Prepended (highest intent) and capped at 4 so the count is unchanged.
async function openLoopSuggestion(businessId: string): Promise<string | null> {
  try {
    const loops = await getOpenLoops(businessId)
    const ready = loops.filter(l => l.outcome_status === 'ready_to_review')
    if (ready.length === 0) return null
    const title = ready[0].title.replace(/["“”]/g, '').slice(0, 80)
    return `How did "${title}" work out?`
  } catch { return null }
}

function mergeOpenLoop(list: string[], q: string | null): string[] {
  if (!q) return list.slice(0, 4)
  const deduped = list.filter(s => s.toLowerCase() !== q.toLowerCase())
  return [q, ...deduped].slice(0, 4)
}

export async function generateSuggestions(businessId: string): Promise<string[]> {
  const openLoopQ = await openLoopSuggestion(businessId)

  // Check cache first (valid for 4 hours)
  const { data: cached } = await supabaseAdmin
    .from('aria_suggestions')
    .select('suggestions, expires_at')
    .eq('business_id', businessId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached && new Date(String(cached.expires_at)).getTime() > Date.now()) {
    return mergeOpenLoop((cached.suggestions as string[]).slice(0, 4), openLoopQ)
  }

  try {
    const ctx = await buildAskAriaContext(businessId)

    const userPrompt = `Business: ${ctx.business_name} (${ctx.industry})
Revenue today: $${((ctx.revenue_today_cents) / 100).toFixed(2)}
Revenue this week: $${((ctx.revenue_week_cents) / 100).toFixed(2)}
Low stock items: ${ctx.low_stock_items.length}
Open tickets: ${ctx.open_support_tickets}
Pending recommendations: ${ctx.pending_aria_actions}

Generate 4 highly specific, actionable questions this business owner should ask their AI advisor RIGHT NOW. Focus on their actual situation — use the numbers above. Return JSON: {"suggestions":["...","...","...","..."]}`

    const result = await callAnthropic<{ suggestions?: string[] }>(
      {
        model: 'haiku',
        systemPrompt: 'You generate specific, data-driven questions for a business owner to ask their AI advisor. Make them concrete and actionable based on the live business data provided. JSON only.',
        userPrompt,
        maxTokens: 300,
        businessId,
        agentKey: 'ask_suggestions',
        role: 'chat',
      },
      { suggestions: FALLBACK_SUGGESTIONS },
    )

    const parsed = parseLLMJsonOr<{ suggestions?: string[] }>(result.raw, {}, 'suggestions/generate')
    const suggestions = (parsed.suggestions ?? FALLBACK_SUGGESTIONS).slice(0, 4)

    // Cache the LLM-generated set (without the open loop — that is merged fresh each call so a
    // just-executed action surfaces without waiting for the 4h cache to expire)
    void (async () => { try { await supabaseAdmin.from('aria_suggestions').insert({ business_id: businessId, suggestions, expires_at: new Date(Date.now() + 4 * 3600_000).toISOString() }) } catch (e) { console.error('[suggestions] cache write failed:', e) } })()

    return mergeOpenLoop(suggestions, openLoopQ)
  } catch (e) {
    console.error('[suggestions] generation failed, using fallback:', e)
    return mergeOpenLoop(FALLBACK_SUGGESTIONS, openLoopQ)
  }
}

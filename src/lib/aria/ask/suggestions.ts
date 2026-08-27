import { callAnthropic } from '../providers/anthropic'
import { parseLLMJsonOr } from '@/lib/ai-json'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildAskAriaContext } from './business-context'
import { getOpenLoops } from '../open-loops'

/**
 * S4 PHASE 4 — how long the owner may be kept waiting for four suggested questions.
 *
 * Measured before choosing: the route was taking 16.5s. This is a page-load nicety, not the
 * product — it must never be the reason a page feels broken.
 */
export const SUGGESTION_BUDGET_MS = 6_000

/** Distinct from `undefined`/`null`, either of which a provider could legitimately return. */
export const TIMED_OUT = Symbol('suggestion-budget-exceeded')

/** Resolves to TIMED_OUT rather than throwing, so a slow model is a decision, not an exception. */
export function withBudget<T>(ms: number, work: Promise<T>): Promise<T | typeof TIMED_OUT> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms)
    work.then(
      v => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(TIMED_OUT) },
    )
  })
}

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
    // ── S4 PHASE 4 — A TIME BUDGET. ───────────────────────────────────────────────────────────
    // This route was taking 16.5 SECONDS on every uncached page load: buildAskAriaContext runs
    // 19 DB queries, then an Anthropic call that has been failing for 24h, then a Gemini fallback
    // that truncated and failed to parse. Nobody waits 16 seconds for four suggested questions,
    // and nothing on screen said anything had gone wrong.
    //
    // Generation now races a budget. Past it, the generic set is returned IMMEDIATELY. Four
    // generic-but-useful questions in under a second beat four generic questions after sixteen.
    const budgetMs = SUGGESTION_BUDGET_MS
    const ctx = await buildAskAriaContext(businessId)

    const userPrompt = `Business: ${ctx.business_name} (${ctx.industry})
Revenue today: $${((ctx.revenue_today_cents) / 100).toFixed(2)}
Revenue this week: $${((ctx.revenue_week_cents) / 100).toFixed(2)}
Low stock items: ${ctx.low_stock_items.length}
Open tickets: ${ctx.open_support_tickets}
Pending recommendations: ${ctx.pending_aria_actions}

Generate 4 highly specific, actionable questions this business owner should ask their AI advisor RIGHT NOW. Focus on their actual situation — use the numbers above. Return JSON: {"suggestions":["...","...","...","..."]}`

    const result = await withBudget(budgetMs, callAnthropic<{ suggestions?: string[] }>(
      {
        model: 'haiku',
        systemPrompt: 'You generate specific, data-driven questions for a business owner to ask their AI advisor. Make them concrete and actionable based on the live business data provided. JSON only.',
        userPrompt,
        // S4 PHASE 4 — WAS 300, AND THAT IS THE BUG ITSELF.
        // Live log: "[gemini] response truncated at maxOutputTokens=300 for agent ask_suggestions
        // — raw output was likely cut off mid-structure", then parse_failed_all_strategies.
        // Four specific, data-referencing questions plus the JSON envelope do not fit in 300
        // tokens; the model was being asked for something it could not physically emit. The
        // parser was never wrong, so the parser is NOT what changed — widening it to accept
        // truncated JSON would have turned a loud failure into a silent half-answer.
        maxTokens: 700,
        businessId,
        agentKey: 'ask_suggestions',
        role: 'chat',
      },
      { suggestions: FALLBACK_SUGGESTIONS },
    ))

    // A blown budget is not a result. Return the generic set now rather than keep the owner
    // waiting, and — critically — do NOT treat it as generated (see the cache guard below).
    if (result === TIMED_OUT) {
      console.error('[suggestions] generation exceeded ' + budgetMs + 'ms — serving the generic set')
      return mergeOpenLoop(FALLBACK_SUGGESTIONS, openLoopQ)
    }

    const parsed = parseLLMJsonOr<{ suggestions?: string[] }>(result.raw, {}, 'suggestions/generate')

    // S4 PHASE 4 — DID THIS ACTUALLY WORK? The old code could not tell: a parse failure fell
    // through to FALLBACK_SUGGESTIONS and was then CACHED FOR FOUR HOURS as though it were a real
    // generation, so one truncated response poisoned every page load until the cache expired.
    const generated = Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
    if (!generated) {
      console.error('[suggestions] model returned no parseable suggestions — serving the generic set, NOT caching it')
      return mergeOpenLoop(FALLBACK_SUGGESTIONS, openLoopQ)
    }
    const suggestions = parsed.suggestions!.slice(0, 4)

    // Cache the LLM-generated set (without the open loop — that is merged fresh each call so a
    // just-executed action surfaces without waiting for the 4h cache to expire)
    void (async () => { try { await supabaseAdmin.from('aria_suggestions').insert({ business_id: businessId, suggestions, expires_at: new Date(Date.now() + 4 * 3600_000).toISOString() }) } catch (e) { console.error('[suggestions] cache write failed:', e) } })()

    return mergeOpenLoop(suggestions, openLoopQ)
  } catch (e) {
    console.error('[suggestions] generation failed, using fallback:', e)
    return mergeOpenLoop(FALLBACK_SUGGESTIONS, openLoopQ)
  }
}

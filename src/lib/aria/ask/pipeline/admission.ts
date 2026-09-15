/**
 * M17 · BRAIN-1 PHASE 3 — STAGE 0. ADMISSION.
 *
 * Moved from `src/app/api/aria/ask/route.ts:316–440`. Five gates, five exits:
 *
 *   · `rate_limited_user`    317 — the per-user AI rate limit, 429
 *   · `bad_request`          366 — no message and no attachment, 400
 *   · `cost_guard_blocked`   406 — the daily spend guard
 *   · `rate_limited_minute`  424 — at most N questions a minute, 429
 *   · `cost_ceiling`         434 — the daily AI budget ceiling, 402
 *
 * ⚠️ WHY THESE ARE A STAGE AND NOT LANES. Every other lane is chosen by what the MESSAGE says.
 * These five are decided by LIVE STATE — a counter, a budget, a missing body — and in `_POST` they
 * all run BEFORE the two classifiers at line 441. That order is load-bearing: a rate-limited request
 * must not pay for two model calls to be told it is rate-limited. So they run as stage 0, ahead of
 * `understand()`.
 *
 * ⚠️ AND THEY STILL LEAVE THROUGH `render()`. They return a `TurnResult` like everything else, it
 * passes `verify()`, and stage 6 turns it into HTTP. "One exit" means one exit, including for the
 * turns that never reach a model.
 *
 * The four non-200 status codes in the whole route live here: 429, 400, 429, 402.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkCostCeiling } from '@/lib/aria-cost-guard'
import { makeTurnResult, type TurnResult } from './types'

export interface AdmissionInput {
  readonly bid: string
  readonly userId: string
  readonly message: string
  readonly attachmentCount: number
}

/**
 * Returns a `TurnResult` when the turn is REFUSED, or null to admit it.
 *
 * ⚠️ The order is route.ts's order and must stay that way: the per-user limit is checked before the
 * body is even parsed, so a flood costs one Redis read rather than a multipart parse.
 */
export async function admit(input: AdmissionInput): Promise<TurnResult | null> {
  const { bid, userId, message, attachmentCount } = input

  // route.ts:316-317
  const rl = await checkRateLimit('ai', userId)
  if (!rl.ok) {
    return makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429)
  }

  // route.ts:366 — the only 400 in the route. `message` has already been trimmed by the caller.
  if (!message && attachmentCount === 0) {
    return makeTurnResult('bad_request', { error: 'message or file required' }, 400)
  }

  // route.ts:402-412 — Cost guard — check daily spend before allowing chat
  const { checkSpendAllowed } = await import('@/lib/aria/cost-guard')
  const spendCheck = await checkSpendAllowed(bid, 'chat', 2) // ~$0.02 estimated
  if (!spendCheck.allowed) {
    return makeTurnResult('cost_guard_blocked', {
      response: `⚠️ ${spendCheck.reason}\n\nUpgrade your plan or wait for daily reset.`,
      blocked_by_cost_guard: true,
      current_spend: spendCheck.current_spend_cents,
      daily_limit: spendCheck.daily_limit_cents,
    })
  }

  // route.ts:414-428 — Rate limit: max requests per minute
  const rateLimit = parseInt(process.env.ARIA_RATE_LIMIT_PER_MIN ?? '20')
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  const { count: recentCount, error: recentErr } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', bid)
    .eq('agent_key', 'ask_aria')
    .gte('created_at', oneMinuteAgo)
  // WALL 6 — a failed COUNT returns null, which reads as "no calls this minute" and lets the
  // per-minute limit through. Non-fatal (the turn proceeds, as before) but no longer silent.
  if (recentErr) console.error('[aria/ask] per-minute rate-limit count failed:', recentErr.message)
  if ((recentCount ?? 0) >= rateLimit) {
    return makeTurnResult('rate_limited_minute', {
      error: 'rate_limited',
      message: `Aria can answer up to ${rateLimit} questions per minute. Please wait a moment.`,
      retry_after: 60,
    }, 429)
  }

  // route.ts:430-440 — Daily cost ceiling
  const costCheck = await checkCostCeiling(bid)
  if (!costCheck.ok) {
    return makeTurnResult('cost_ceiling', {
      error: 'budget_exceeded',
      message: `Aria has used $${costCheck.spent.toFixed(2)} of the daily AI budget. Contact support if you need more.`,
      spent: costCheck.spent,
      ceiling: costCheck.ceiling,
    }, 402)
  }

  return null
}

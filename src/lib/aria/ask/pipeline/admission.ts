/**
 * M17 · BRAIN-1 PHASE 3 / M17B PHASE 2 — STAGE 0. ADMISSION, AS ORDERED GATES.
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
 * all run BEFORE the two classifiers at line 447. That order is load-bearing: a rate-limited request
 * must not pay for two model calls to be told it is rate-limited.
 *
 * ⚠️ AND THEY STILL LEAVE THROUGH `render()`. They return a `TurnResult` like everything else, it
 * passes `verify()`, and stage 6 turns it into HTTP. "One exit" means one exit, including for the
 * turns that never reach a model.
 *
 * ⚠️ M17B PHASE 2 — SPLIT INTO THREE, BECAUSE THE ROUTE'S REAL ORDER INTERLEAVES THEM WITH OTHER
 * WORK AND A SINGLE `admit()` WOULD SILENTLY CHANGE TWO BEHAVIOURS:
 *
 *     316  admitBeforeParse   the per-user limit — BEFORE the body is read
 *     330  (parse)
 *     366  admitBadRequest    needs the parsed message
 *     372  (the save-plan lane)          ← sits HERE, before the spend gates
 *     403  admitSpend         cost guard · per-minute · daily ceiling
 *     447  (the classifiers)
 *
 * **1 · The per-user limit precedes the parse**, so a flood costs one Redis read rather than a
 * multipart parse of up to five attachments. Collapsing the gates into one call after parsing keeps
 * the same 429 body and quietly does that work anyway.
 *
 * **2 · `save_plan` precedes the spend gates**, so an owner who has exhausted the daily AI budget can
 * still save a plan — it makes no model call and costs nothing. Running the spend gates first would
 * block a free action, which is a real change to a real user path, invisible in the response body of
 * any turn that is not over budget.
 *
 * Neither would have shown up in a replay that only compares rendered JSON.
 *
 * The four non-200 status codes in the whole route live here: 429, 400, 429, 402.
 */
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkCostCeiling } from '@/lib/aria-cost-guard'
import { makeTurnResult, type TurnResult } from './types'

/** route.ts:316-317 — runs BEFORE the request body is read. */
export async function admitBeforeParse(userId: string): Promise<TurnResult | null> {
  const rl = await checkRateLimit('ai', userId)
  if (!rl.ok) {
    return makeTurnResult('rate_limited_user', { error: 'Rate limit exceeded. Try again later.' }, 429)
  }
  return null
}

/** route.ts:366 — the only 400 in the route. `message` has already been trimmed by the parser. */
export function admitBadRequest(message: string, attachmentCount: number): TurnResult | null {
  if (!message && attachmentCount === 0) {
    return makeTurnResult('bad_request', { error: 'message or file required' }, 400)
  }
  return null
}

/**
 * route.ts:402-440 — the three spend gates, in order.
 *
 * ⚠️ These run AFTER the save-plan lane. See the header.
 */
export async function admitSpend(bid: string): Promise<TurnResult | null> {
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

/**
 * The pre-M17B single entry point, kept because `silent-failures.test.ts` drives it and because a
 * caller that does not need the interleaving should not have to know about it.
 *
 * ⚠️ NOT USED BY THE ROUTE. The route runs the three gates in their real positions — see the header.
 */
export interface AdmissionInput {
  readonly bid: string
  readonly userId: string
  readonly message: string
  readonly attachmentCount: number
}

export async function admit(input: AdmissionInput): Promise<TurnResult | null> {
  return (await admitBeforeParse(input.userId))
    ?? admitBadRequest(input.message, input.attachmentCount)
    ?? (await admitSpend(input.bid))
}

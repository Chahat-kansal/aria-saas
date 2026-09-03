import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordEvent } from '@/lib/moat/recordEvent'
import { PLAN_COLUMNS, type PlanRow, type PlanStatus } from './persist'

/**
 * M11B PHASE 2 — APPROVE.
 *
 * ── THE APPROVAL IS THE ONLY THING THAT TURNS A PLAN INTO WORK ─────────────────────────────────
 * Everything before this is a proposal. `canRun` below is the single predicate the runner asks, and
 * it is exported from here rather than inlined in phase 3 so there is exactly one definition of
 * "may this execute" — not one in the runner, one in the route and one in a component.
 *
 * ── APPROVAL IS PER PLAN. A STEP'S OWN GATE SURVIVES IT. ───────────────────────────────────────
 * Approving the plan says "yes, do the safe parts". It does NOT approve the money step, the sending
 * step or the authorisation step: those carry `requires_stepup` and stay `pending` for the existing
 * approve path. A plan-level yes that silently cleared a step-level gate would be the worst bug
 * this sprint could ship, and `approve.test.ts` asserts the gate survives.
 *
 * ── THE CLAIM IS ATOMIC ────────────────────────────────────────────────────────────────────────
 * `.update({…}).eq('id', …).eq('status', 'proposed').select()` — the status re-check rides the
 * UPDATE. Two clicks, two tabs or a retry cannot approve twice, and the second one gets no row back
 * and is told so. This is the same pattern the expiry sweep, the poll close and supersede all use;
 * a select-then-update here would have a window between the two.
 */

export type ApproveResult =
  | { ok: true; plan: PlanRow }
  /** Already approved, already running, already reported, or abandoned. Not an error. */
  | { ok: false; reason: 'not_proposed' }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'error'; message: string }

/**
 * Approve a plan.
 *
 * `businessId` is in the WHERE clause, not left to RLS: this uses `supabaseAdmin`, which bypasses
 * RLS entirely, so the filter in the statement is the only thing standing between two businesses.
 * `userId` is recorded in `approved_by` — who said yes is part of the record, not a detail.
 */
export async function approvePlan(planId: string, businessId: string, userId: string): Promise<ApproveResult> {
  const now = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('aria_plans')
    .update({ status: 'approved', approved_at: now, approved_by: userId })
    .eq('id', planId)
    .eq('business_id', businessId)
    .eq('status', 'proposed')      // the atomic claim: only a proposed plan can be approved
    .select(PLAN_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[works/approve] update failed:', error.message)
    return { ok: false, reason: 'error', message: error.message }
  }

  if (!data) {
    // No row came back. Either the plan is not this business's / does not exist, or it was not
    // `proposed` any more. Told apart with a second read so the owner gets the true sentence
    // rather than "not found" for a plan sitting in front of them, already approved in another tab.
    const { data: existing, error: readErr } = await supabaseAdmin
      .from('aria_plans').select('id')
      .eq('id', planId).eq('business_id', businessId).maybeSingle()
    if (readErr) {
      console.error('[works/approve] existence check failed:', readErr.message)
      return { ok: false, reason: 'error', message: readErr.message }
    }
    return { ok: false, reason: existing ? 'not_proposed' : 'not_found' }
  }

  const plan = data as unknown as PlanRow

  // The spine already allows this: business_events_event_type_check includes 'approved', and
  // entity_type 'job' is the lane a plan lives in. No CHECK is extended.
  await recordEvent({
    business_id: businessId,
    entity_type: 'job',
    entity_id: planId,
    event_type: 'approved',
    actor: 'owner',
    payload_summary: { kind: 'work_plan' },
  })

  return { ok: true, plan }
}

/**
 * THE ONE PREDICATE THE RUNNER ASKS.
 *
 * A plan may only execute from `approved` — never from `proposed` (nobody said yes), never from
 * `running` (something is already doing it, and re-entering is how a step runs twice), never from
 * `reported` or `abandoned` (it is over).
 *
 * `approved_at` must also be set. A row claiming `approved` with no timestamp is a row somebody
 * wrote by hand or a half-applied update, and running work off it would mean executing on a state
 * nothing can account for.
 */
export function canRun(plan: Pick<PlanRow, 'status' | 'approved_at'>): boolean {
  return plan.status === 'approved' && Boolean(plan.approved_at)
}

/** Why a plan cannot run, in the owner's words. Null when it can. */
export function whyNotRunnable(plan: Pick<PlanRow, 'status' | 'approved_at'>): string | null {
  if (canRun(plan)) return null
  switch (plan.status as PlanStatus) {
    case 'proposed': return 'This plan has not been approved yet, so nothing has run.'
    case 'running': return 'This plan is already running.'
    case 'reported': return 'This plan has already finished and been reported.'
    case 'abandoned': return 'This plan was abandoned and will not run.'
    default: return 'This plan is marked approved but has no approval time recorded, so it will not run.'
  }
}

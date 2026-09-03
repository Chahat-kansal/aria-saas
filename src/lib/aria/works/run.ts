import { supabaseAdmin } from '@/lib/supabase-admin'
import { executeAction } from '@/lib/aria/ask/action-executor'
import type { PlannedAction, ActionType } from '@/lib/aria/ask/action-planner'
import { getRevenueSnapshot, getRevenueForRange, getRevenueComparison } from '@/lib/aria/revenue-snapshot'
import { detectLosses } from '@/lib/aria/radar/loss-detector'
import { businessToday } from '@/lib/date-au'
import { CAPABILITIES, findCapability, missingArgs } from './capabilities'
import { canRun, whyNotRunnable } from './approve'
import { loadPlan, PLAN_COLUMNS, type PlanRow, type StepRow } from './persist'

/**
 * M11B PHASE 3 — EXECUTE, ONE STEP AT A TIME.
 *
 * ── A PLAN IS NOT A TRANSACTION ────────────────────────────────────────────────────────────────
 * Step 3 failing leaves steps 1 and 2 done. There is no rollback of the run, because unwinding a
 * price change because a later stock count failed would be a second unrequested action. What the
 * run guarantees instead is that **the record says exactly what state things are in** — every step
 * carries its own outcome, and the report is generated from those rows rather than from a summary
 * kept alongside them.
 *
 * ── IDEMPOTENCY IS THE PLAN-LEVEL CLAIM ────────────────────────────────────────────────────────
 * `.update({status:'running'}).eq('id',…).eq('status','approved').select()` — only one caller can
 * move a plan from approved to running, so a double-click, a retry or two tabs cannot both start
 * it. The second gets no row and is told the plan is already running. There is **no preceding
 * SELECT**: the status re-check rides the UPDATE.
 *
 * ── WHAT ACTUALLY RUNS ─────────────────────────────────────────────────────────────────────────
 * Only steps whose capability is gated `auto` in the registry. Money, sending and authorisation
 * steps are **skipped and left pending**, with a note saying they are waiting for the owner — the
 * decision table's rule, and the reason `requires_stepup` is on those rows.
 */

export interface StepOutcome {
  step_index: number
  title: string
  capability: string | null
  /** ran = it happened · skipped = gated, still waiting for the owner · failed = it was tried and did not work */
  result: 'ran' | 'skipped' | 'failed'
  note: string
  data: Record<string, unknown>
}

export type RunResult =
  | { ok: true; plan: PlanRow; outcomes: StepOutcome[] }
  | { ok: false; reason: string }

/** A read step's answer, recorded so the report can cite what it read rather than assert it. */
async function runRead(capability: string, businessId: string, payload: Record<string, unknown>): Promise<{ note: string; data: Record<string, unknown> }> {
  switch (capability) {
    case 'read_revenue_day': {
      const date = typeof payload.date === 'string' ? payload.date : businessToday()
      const snap = await getRevenueSnapshot(businessId, date)
      return {
        note: 'Read takings for ' + date + ': A$' + (Number(snap.revenue) || 0).toFixed(2) + ' across ' + snap.transaction_count + ' sales.',
        data: { source: 'pos_sales', date, revenue: snap.revenue, transaction_count: snap.transaction_count, provenance: snap.provenance },
      }
    }
    case 'read_revenue_range': {
      const start = String(payload.start ?? payload.start_date ?? '')
      const end = String(payload.end ?? payload.end_date ?? '')
      if (!start || !end) return { note: 'Could not read a range — no start and end date were given.', data: { missing: ['start', 'end'] } }
      const snap = await getRevenueForRange(businessId, start, end)
      return {
        note: 'Read takings for ' + start + ' to ' + end + ': A$' + (Number(snap.revenue) || 0).toFixed(2) + '.',
        data: { source: 'pos_sales', start, end, revenue: snap.revenue, transaction_count: snap.transaction_count },
      }
    }
    case 'read_revenue_comparison': {
      const cur = payload.current as { start?: string; end?: string } | undefined
      const prior = payload.prior as { start?: string; end?: string } | undefined
      if (!cur?.start || !cur?.end || !prior?.start || !prior?.end) {
        return { note: 'Could not compare — the two periods were not both given.', data: { missing: ['current', 'prior'] } }
      }
      const out = await getRevenueComparison(businessId, { start: cur.start, end: cur.end }, { start: prior.start, end: prior.end })
      return { note: 'Compared ' + cur.start + '–' + cur.end + ' against ' + prior.start + '–' + prior.end + '.', data: { source: 'pos_sales', result: out as unknown as Record<string, unknown> } }
    }
    case 'read_loss_signals': {
      const signals = await detectLosses(businessId)
      return {
        note: 'Looked for where money is leaking: ' + signals.length + ' signal' + (signals.length === 1 ? '' : 's') + ' found.',
        // The titles only — never the estimated dollar figures, which are the detector's own
        // estimates and would read as measured if they landed in a report unlabelled.
        data: { source: 'loss-detector', count: signals.length, titles: signals.map(s => s.title) },
      }
    }
    default:
      return { note: 'No reader for ' + capability + '.', data: {} }
  }
}

/** Turn a stored step row back into the shape `executeAction` expects. */
function toPlannedAction(step: StepRow, capability: ActionType): PlannedAction {
  const payload = { ...(step.action_data ?? {}) } as Record<string, unknown>
  // Not arguments — the registry's own bookkeeping, and executors reject unknown keys' effects.
  delete payload.capability
  delete payload.gate
  return {
    type: capability,
    title: step.title ?? '',
    description: step.description ?? '',
    preview: [],
    affected_count: 0,
    payload,
    estimated_impact: '',
    reversible: CAPABILITIES[capability].reversible,
    risk: 'low',
    requires_confirmation: true,
  }
}

/**
 * Run an approved plan's safe steps, in order.
 *
 * Returns the outcomes; **writing the report is phase 4's job**, so this never sets `reported` and
 * never claims the plan finished well. A plan whose every step failed still ends here with an
 * accurate list, and that list is what the report is generated from.
 */
export async function runPlan(planId: string, businessId: string, userId: string): Promise<RunResult> {
  const loaded = await loadPlan(planId, businessId)
  if (!loaded) return { ok: false, reason: 'Plan not found.' }

  if (!canRun(loaded.plan)) {
    return { ok: false, reason: whyNotRunnable(loaded.plan) ?? 'This plan cannot run.' }
  }

  // THE CLAIM. Only one caller moves approved → running.
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('aria_plans')
    .update({ status: 'running' })
    .eq('id', planId).eq('business_id', businessId).eq('status', 'approved')
    .select(PLAN_COLUMNS)
    .maybeSingle()

  if (claimErr) {
    console.error('[works/run] claim failed:', claimErr.message)
    return { ok: false, reason: 'Could not start the plan: ' + claimErr.message }
  }
  // Somebody else got there first. NOT an error, and emphatically not a second run.
  if (!claimed) return { ok: false, reason: 'This plan is already running.' }

  const outcomes: StepOutcome[] = []

  for (const step of loaded.steps) {
    const cap = findCapability(step.action_type)
    const base = { step_index: step.step_index, title: step.title ?? '', capability: step.action_type }

    if (!cap) {
      outcomes.push({ ...base, result: 'skipped', note: 'Aria has no way to do this one — it needs a person.', data: {} })
      continue
    }
    if (cap.gate !== 'auto') {
      // The decision table, enforced at execution as well as at planning: money, sending and
      // authorisation are proposed and never carried out here. The row stays pending with its
      // requires_stepup, waiting for the existing approve path.
      outcomes.push({
        ...base, result: 'skipped',
        note: 'Left for you — ' + (cap.gate_reason ?? 'it needs a person') + '. Nothing was done to it.',
        data: { gate: cap.gate, gate_reason: cap.gate_reason ?? null },
      })
      continue
    }

    // ⚠️ ARGUMENTS ARE CHECKED BEFORE THE EXECUTOR IS CALLED, AND THIS IS A MEASURED DEFENCE.
    // This phase's own live proof ran `adjust_stock` with an EMPTY payload expecting it to refuse.
    // It did not: with no product named it took the first ten products of the business and reported
    // "Done — 10 changes". The executor's mass backstop did not fire because ten is under its
    // threshold of twenty. A step that was not told what to act on now FAILS here, before anything
    // is touched.
    const missing = missingArgs(cap, (step.action_data ?? {}) as Record<string, unknown>)
    if (missing.length > 0) {
      const note = 'Could not run this step — it was not told ' + missing.join(', ') + '. Nothing was changed.'
      await recordStepOutcome(step.id, businessId, 'failed', note, { missing })
      outcomes.push({ ...base, result: 'failed', note, data: { missing } })
      continue
    }

    try {
      if (cap.kind === 'read') {
        const { note, data } = await runRead(cap.id, businessId, (step.action_data ?? {}) as Record<string, unknown>)
        await recordStepOutcome(step.id, businessId, 'ran', note, data)
        outcomes.push({ ...base, result: 'ran', note, data })
      } else {
        const res = await executeAction(toPlannedAction(step, cap.id as ActionType), businessId, userId, undefined, step.title ?? undefined, 'owner')
        const data: Record<string, unknown> = {
          ok: res.ok, affected_count: res.affected_count, failed_count: res.failed_count ?? null,
          action_log_id: res.action_log_id ?? null, rollback_available: res.rollback_available,
        }
        if (res.ok) {
          const note = 'Done — ' + res.affected_count + ' change' + (res.affected_count === 1 ? '' : 's') + '.'
          await recordStepOutcome(step.id, businessId, 'ran', note, data)
          outcomes.push({ ...base, result: 'ran', note, data })
        } else {
          // The executor's own sentence, never a generic one — it says which backstop refused, or
          // which argument was missing, and that is what the owner needs.
          const note = res.error ?? 'It did not go through.'
          await recordStepOutcome(step.id, businessId, 'failed', note, data)
          outcomes.push({ ...base, result: 'failed', note, data })
        }
      }
    } catch (e) {
      const note = 'It did not go through: ' + (e as Error).message
      await recordStepOutcome(step.id, businessId, 'failed', note, { threw: true })
      outcomes.push({ ...base, result: 'failed', note, data: { threw: true } })
    }
  }

  const after = await loadPlan(planId, businessId)
  return { ok: true, plan: after?.plan ?? (claimed as unknown as PlanRow), outcomes }
}

/**
 * Record what happened to one step.
 *
 * ⚠️ A FAILED STEP KEEPS `status = 'pending'`, DELIBERATELY, AND THIS IS A PARK.
 * `aria_autopilot_actions_status_check` allows exactly
 * `pending | approved | rejected | executed | dismissed | expired | superseded`. **There is no
 * `failed`.** Writing one would be TS-DEFECT-1 all over again — three writers already use a status
 * the CHECK rejects and have been failing silently. Of the values that exist:
 *   · `executed` would claim it ran, which is the lie this sprint exists to avoid;
 *   · `rejected` and `dismissed` both say the OWNER decided against it, which is not what happened.
 * So a failed step stays `pending` — which is true: it has not happened and still needs someone —
 * and the failure itself is recorded in `outcome_note` and `outcome_data`, where the report reads
 * it. Adding a `failed` value to the CHECK is DDL and is named in RUN-M11B.md as the founder's.
 */
async function recordStepOutcome(
  stepId: string, businessId: string, result: 'ran' | 'failed', note: string, data: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = {
    outcome_note: note,
    outcome_data: data,
    resolved_at: new Date().toISOString(),
  }
  // Only a step that actually ran becomes 'executed'. See the note above.
  if (result === 'ran') patch.status = 'executed'

  const { error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .update(patch)
    .eq('id', stepId)
    .eq('business_id', businessId)

  // READ THE ERROR. An unread one here is how a run reports success over steps whose outcome was
  // never written — the shape that gave council-executor.ts zero audit rows against 819.
  if (error) console.error('[works/run] could not record step outcome:', stepId, error.message)
}

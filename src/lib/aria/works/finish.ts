import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordEvent } from '@/lib/moat/recordEvent'
import { renderPlanReport, stepState, type ReportableStep } from './report'
import { loadPlan, PLAN_COLUMNS, type PlanRow } from './persist'

/**
 * M11B PHASE 4 — WRITE THE REPORT AND CLOSE THE PLAN.
 *
 * ── `reported` IS NOT `succeeded` ──────────────────────────────────────────────────────────────
 * A plan whose every step failed is still `reported`, and that report is the deliverable. This
 * function has no success path and no failure path — it has one path, which writes what happened.
 * The council's bug is a job that marks itself `complete` having done nothing; the guard against it
 * here is that the report is **generated from the step rows** rather than from anything the runner
 * remembered, so a plan that did nothing produces a report that says nothing was done.
 *
 * ── THE SPINE GETS THE TRUTH TOO ───────────────────────────────────────────────────────────────
 * `job_completed` when nothing failed, `job_failed` when something did. Both are already in
 * `business_events_event_type_check` — no CHECK is extended. A plan reported as completed while
 * carrying a failed step would make the moat's own history a lie, which is worse than the failure.
 */

export type FinishResult =
  | { ok: true; plan: PlanRow; report: string; had_failures: boolean }
  | { ok: false; reason: string }

/**
 * Close a plan: write its report, set `status='reported'` and `completed_at`.
 *
 * The claim is atomic on `status='running'` — only the run that started the plan closes it, so two
 * callers cannot both write a report, and a plan that was never run cannot be reported as though it
 * had been.
 */
export async function finishPlan(planId: string, businessId: string): Promise<FinishResult> {
  const loaded = await loadPlan(planId, businessId)
  if (!loaded) return { ok: false, reason: 'Plan not found.' }

  // GENERATED FROM THE ROWS, every time. Nothing is carried over from the run.
  const steps: ReportableStep[] = loaded.steps.map(s => ({
    step_index: s.step_index,
    title: s.title,
    status: s.status,
    requires_stepup: s.requires_stepup,
    outcome_note: s.outcome_note,
    outcome_data: s.outcome_data,
    resolved_at: s.resolved_at,
  }))

  const report = renderPlanReport(loaded.plan.request, steps)
  const hadFailures = steps.some(s => stepState(s) === 'failed')

  const { data, error } = await supabaseAdmin
    .from('aria_plans')
    .update({ status: 'reported', report, completed_at: new Date().toISOString() })
    .eq('id', planId)
    .eq('business_id', businessId)
    .eq('status', 'running')     // atomic: only the run that started it closes it
    .select(PLAN_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[works/finish] update failed:', error.message)
    return { ok: false, reason: 'Could not write the report: ' + error.message }
  }
  // Not running any more — already reported, or never started. Not an error, and NOT a second report.
  if (!data) return { ok: false, reason: 'This plan was not running, so there was nothing to report.' }

  await recordEvent({
    business_id: businessId,
    entity_type: 'job',
    entity_id: planId,
    // The truth, not the happy value. A plan with a failed step is a job that failed, whatever
    // else it managed.
    event_type: hadFailures ? 'job_failed' : 'job_completed',
    actor: 'aria',
    payload_summary: { kind: 'work_plan' },
  })

  return { ok: true, plan: data as unknown as PlanRow, report, had_failures: hadFailures }
}

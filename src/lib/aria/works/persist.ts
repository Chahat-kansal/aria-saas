import { supabaseAdmin } from '@/lib/supabase-admin'
import { createDecision } from '@/lib/decisions/createDecision'
import { recordEvent } from '@/lib/moat/recordEvent'
import { CAPABILITIES } from './capabilities'
import type { PlanResult, PlanStep, WorkPlan } from './plan'

/**
 * M11B PHASE 1 — A PLAN BECOMES ROWS.
 *
 * ── EVERY ERROR IS READ. THIS IS THE POINT OF THE FILE. ────────────────────────────────────────
 * `council-executor.ts` inserts into `aria_autopilot_actions` on every executed proposal and its
 * `proposal_id` / `outcome_data` / `executed_at` are non-null on **0 of 819 rows** — the insert has
 * never once landed, because its error sits in a `try` that only catches throws and Supabase
 * RESOLVES with `{ error }`. Not one line in this module discards an error, and `savePlan` reports
 * a partial write as a failure rather than returning a plan id for a plan with missing steps.
 *
 * ── THE STEPS ARE THE EXISTING REGISTRY ────────────────────────────────────────────────────────
 * Steps are `aria_autopilot_actions` rows written through `createDecision`, the canonical propose
 * path — not a second insert site with its own column choices. It gained `plan_id` / `step_index`
 * for this and nothing else changed.
 *
 * ── ONE EVENT PER PLAN, NOT ONE PER STEP ───────────────────────────────────────────────────────
 * Steps are created with `emit: false, notify: false`. A five-step plan is one thing the owner
 * asked for, so it emits ONE `job_created` on the spine and notifies once. Five `proposed` events
 * and five pushes would be noise, and would make the moat's proposed→resolved delta count a plan's
 * steps as five separate pieces of advice.
 *
 * `entity_type: 'job'` and `job_created` / `job_completed` / `job_failed` are already in
 * `business_events`' CHECK constraints. **No CHECK is extended and no DDL is needed** — the spine
 * had a job lifecycle waiting for something to use it.
 */

/** Named columns. `select('*')` is never used here. */
export const PLAN_COLUMNS =
  'id, business_id, conversation_id, request, title, status, unplannable_reason, report, created_at, approved_at, approved_by, completed_at'

export const STEP_COLUMNS =
  'id, plan_id, step_index, title, description, status, kind, action_type, action_data, domain, requires_stepup, outcome_note, outcome_data, resolved_at, created_at'

export type PlanStatus = 'proposed' | 'approved' | 'running' | 'reported' | 'abandoned'

export interface PlanRow {
  id: string
  business_id: string
  conversation_id: string | null
  request: string
  title: string
  status: PlanStatus
  unplannable_reason: string | null
  report: string | null
  created_at: string
  approved_at: string | null
  approved_by: string | null
  completed_at: string | null
}

export interface StepRow {
  id: string
  plan_id: string
  step_index: number
  title: string | null
  description: string | null
  status: string
  kind: string | null
  action_type: string | null
  action_data: Record<string, unknown> | null
  domain: string | null
  requires_stepup: boolean
  outcome_note: string | null
  outcome_data: Record<string, unknown> | null
  resolved_at: string | null
  created_at: string | null
}

export interface SavedPlan { plan: PlanRow; steps: StepRow[] }

export type SaveResult =
  | { ok: true; plan_id: string; step_count: number }
  | { ok: false; reason: string }

/** `aria_autopilot_actions_domain_check`: money | people | growth | supply | compliance. */
function domainForStep(step: PlanStep): string {
  if (!step.capability_id) return 'people'
  const cap = CAPABILITIES[step.capability_id]
  if (cap.gate_reason === 'money') return 'money'
  if (cap.gate_reason === 'authorisation') return 'people'
  if (cap.kind === 'read') return 'growth'
  return 'supply'
}

/**
 * Write a plan and its steps.
 *
 * ── AN UNPLANNABLE REQUEST IS STILL A ROW ──────────────────────────────────────────────────────
 * It lands as `status='abandoned'` with `unplannable_reason` set and no steps. It will never run,
 * so `abandoned` is the true status — and the row exists so the owner sees the sentence in their
 * history rather than the request vanishing, and so "how often can Aria not plan this" is a
 * question the data can answer later.
 *
 * ── A PARTIAL WRITE IS A FAILURE, NOT A PLAN ───────────────────────────────────────────────────
 * If any step fails to insert, the plan row is marked `abandoned` with the reason, and this returns
 * `ok: false`. A plan id handed back for a plan missing step 3 is exactly the "reported complete
 * having done nothing" shape the council has.
 */
export async function savePlan(
  result: PlanResult,
  ctx: { business_id: string; conversation_id?: string | null },
): Promise<SaveResult> {
  const unplannable = result.ok === false

  const { data: planRow, error: planErr } = await supabaseAdmin
    .from('aria_plans')
    .insert({
      business_id: ctx.business_id,
      conversation_id: ctx.conversation_id ?? null,
      request: result.request,
      title: unplannable ? result.request.slice(0, 80) : (result as WorkPlan).title,
      status: unplannable ? 'abandoned' : 'proposed',
      unplannable_reason: unplannable ? result.reason : null,
    })
    .select('id')
    .maybeSingle()

  if (planErr || !planRow) {
    console.error('[works/persist] plan insert failed:', planErr?.message)
    return { ok: false, reason: 'Could not save the plan: ' + (planErr?.message ?? 'no row returned') }
  }
  const planId = planRow.id as string

  if (unplannable) {
    // No steps, and no job_created: nothing was created to do. The row is the record of the refusal.
    return { ok: true, plan_id: planId, step_count: 0 }
  }

  const plan = result as WorkPlan
  const failed: string[] = []

  // Sequential, in order. Not for correctness — `step_index` carries the order and the unique index
  // enforces it — but so a failure names WHICH step could not be written.
  for (const step of plan.steps) {
    const id = await createDecision({
      business_id: ctx.business_id,
      domain: domainForStep(step) as 'money' | 'people' | 'growth' | 'supply' | 'compliance',
      kind: 'plan_step',
      title: step.title,
      subtitle: step.detail || null,
      payload: { ...step.payload, capability: step.capability_id, gate: step.gate },
      action_type: step.capability_id,
      requires_stepup: step.needs_approval,
      priority: 'routine',
      triggered_by: 'aria_works',
      plan_id: planId,
      step_index: step.index,
      // ONE event and ONE notification for the whole plan — see the header.
      emit: false,
      notify: false,
    })
    if (!id) failed.push('step ' + step.index)
  }

  if (failed.length > 0) {
    // Say so in the row, then say so to the caller. Never hand back a plan id for a broken plan.
    const reason = 'Could not save ' + failed.join(', ') + ' — the plan was not created.'
    const { error: abandonErr } = await supabaseAdmin
      .from('aria_plans')
      .update({ status: 'abandoned', unplannable_reason: reason, completed_at: new Date().toISOString() })
      .eq('id', planId)
    if (abandonErr) console.error('[works/persist] could not mark the plan abandoned:', abandonErr.message)
    return { ok: false, reason }
  }

  await recordEvent({
    business_id: ctx.business_id,
    entity_type: 'job',
    entity_id: planId,
    event_type: 'job_created',
    actor: 'aria',
    payload_summary: { kind: 'work_plan' },
  })

  return { ok: true, plan_id: planId, step_count: plan.steps.length }
}

/**
 * Read one plan and its steps, scoped to the business.
 *
 * `business_id` is in the query, not relied on from RLS: this uses `supabaseAdmin`, the service
 * role, which bypasses RLS entirely. The policy on `aria_plans` is for client reads; in this
 * codebase the filter in the query is the only thing standing between two businesses.
 */
export async function loadPlan(planId: string, businessId: string): Promise<SavedPlan | null> {
  const { data: plan, error: planErr } = await supabaseAdmin
    .from('aria_plans').select(PLAN_COLUMNS)
    .eq('id', planId).eq('business_id', businessId).maybeSingle()

  if (planErr) {
    console.error('[works/persist] loadPlan failed:', planErr.message)
    throw new Error('plan_unreadable: ' + planErr.message)
  }
  if (!plan) return null

  const { data: steps, error: stepErr } = await supabaseAdmin
    .from('aria_autopilot_actions').select(STEP_COLUMNS)
    .eq('plan_id', planId).eq('business_id', businessId)
    .order('step_index', { ascending: true })

  // RULE 7 — an error is not an empty step list. Returning [] would render a plan with no steps,
  // which reads as "Aria planned nothing" when the truth is "we could not read the steps".
  if (stepErr) {
    console.error('[works/persist] loadPlan steps failed:', stepErr.message)
    throw new Error('plan_steps_unreadable: ' + stepErr.message)
  }

  return { plan: plan as unknown as PlanRow, steps: (steps ?? []) as unknown as StepRow[] }
}

/** The most recent plans for a business, newest first. Optionally just one conversation's. */
export async function listPlans(
  businessId: string,
  opts: { conversation_id?: string | null; limit?: number } = {},
): Promise<PlanRow[]> {
  let q = supabaseAdmin
    .from('aria_plans').select(PLAN_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, opts.limit ?? 20)))

  if (opts.conversation_id) q = q.eq('conversation_id', opts.conversation_id)

  const { data, error } = await q
  if (error) {
    console.error('[works/persist] listPlans failed:', error.message)
    throw new Error('plans_unreadable: ' + error.message)
  }
  return (data ?? []) as unknown as PlanRow[]
}

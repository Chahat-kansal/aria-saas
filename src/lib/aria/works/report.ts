/**
 * M11 PHASE 5 — THE REPORT: WHAT ARIA ACTUALLY CHANGED.
 *
 * ── THE DEFECT THIS FIXES, AND IT IS ALREADY SHIPPED ───────────────────────────────────────────
 * `AuditLogCard` renders every recorded action as its type and a count:
 *
 *     Bulk price update            14:32
 *     2 items                                       [Undo]
 *
 * That is "done" without saying what changed — the exact thing this sprint was told not to build,
 * already live on two surfaces. And the truth was in the row the whole time: the route fetches
 * `after_state` and never renders it, and does not fetch `before_state` at all. The same action
 * above actually recorded `[V3] A A$10.00 → A$0.00, [V3] B A$10.00 → A$0.00`.
 *
 * ── EVERY WORD HERE COMES OUT OF THE RECORD ────────────────────────────────────────────────────
 * The shapes below were read off production (`aria_action_log`, 64 rows, five action types), not
 * imagined. Nothing is inferred, interpolated or estimated: a value that is not in `before_state`
 * or `after_state` is not stated, and a row whose shape is not recognised says so plainly rather
 * than being described in generalities. GROUNDING-TEETH — an honest "not recorded" beats a
 * plausible sentence.
 *
 * ── AND A FAILURE IS NEVER A FOOTNOTE ──────────────────────────────────────────────────────────
 * `after_state.failed` is a real recorded number (`bulk_price_update` writes it). A step that
 * partly failed says so in its headline, and `renderRunReport` puts failures on the FIRST line.
 */

export interface RecordedStep {
  id: string
  action_type: string
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  executed_at?: string | null
  rolled_back_at?: string | null
  message_excerpt?: string | null
}

export type StepStatus =
  /** It changed things and the record says what. */
  | 'changed'
  /** Some of it landed and some did not — `after_state.failed > 0`. */
  | 'partly_failed'
  /** Nothing landed. */
  | 'failed'
  /** It landed and was then undone. */
  | 'rolled_back'
  /** The row exists but does not record what changed. Said out loud, never smoothed over. */
  | 'unrecorded'

export interface StepReport {
  id: string
  action_type: string
  status: StepStatus
  /** One line: what this step did. */
  headline: string
  /** The individual changes, each traceable to a value in the record. May be empty. */
  changes: string[]
  /** From `after_state.failed` when present; null when the record does not say. Never 0-by-default. */
  failed_count: number | null
  /** From `after_state.affected` when present; null when the record does not say. */
  affected_count: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Dollars, the codebase's way. Never a bare number where money is meant. */
const money = (v: unknown): string => 'A$' + (Number(v) || 0).toFixed(2)

const title = (actionType: string): string =>
  actionType.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/**
 * Turn one recorded action into a sentence about what it changed.
 *
 * The five branches below are the five `action_type` values that exist in production. Anything
 * else — including a type this codebase can execute but has never actually run — falls through to
 * `unrecorded`, which says so. A sixth branch written speculatively would be a guess about a shape
 * nobody has seen, and would render confidently wrong the first time it fired.
 */
export function describeStep(step: RecordedStep): StepReport {
  const before = obj(step.before_state)
  const after = obj(step.after_state)
  const failed = num(after.failed)
  const affected = num(after.affected)
  const changes: string[] = []

  switch (step.action_type) {
    case 'adjust_stock': {
      // after.moves = [{ name, from, to, delta, product_id }] — the change, already recorded.
      for (const m of arr(after.moves)) {
        const mv = obj(m)
        const name = text(mv.name)
        const from = num(mv.from)
        const to = num(mv.to)
        if (!name || from === null || to === null) continue
        changes.push(name + ': ' + from + ' → ' + to + ' (' + (to - from > 0 ? '+' : '') + (to - from) + ')')
      }
      break
    }

    case 'bulk_price_update': {
      // The prices are in before.products; after records only the rule and the counts. Both halves
      // are needed to say anything true, which is why the route now selects before_state.
      const rule = text(after.price_change_type)
      const value = num(after.price_change_value)
      for (const p of arr(before.products)) {
        const pr = obj(p)
        const name = text(pr.name)
        const price = num(pr.price)
        if (!name || price === null) continue
        // The NEW price is not in the record for this action type. Saying "→ A$x" would be
        // arithmetic presented as a reading, so the old price is stated and the rule beside it.
        changes.push(name + ': was ' + money(price))
      }
      if (rule && value !== null) {
        changes.push('Rule applied: ' + rule.replace(/_/g, ' ') + ' ' + value)
      }
      break
    }

    case 'update_promotion': {
      const name = text(after.name) ?? text(after.promotion_id)
      const wasPct = num(before.discount_percent)
      const nowPct = num(after.discount_percent) ?? num(after.value)
      if (name && wasPct !== null && nowPct !== null) {
        changes.push(name + ': ' + wasPct + '% → ' + nowPct + '%')
      } else if (name && nowPct !== null) {
        changes.push(name + ': now ' + nowPct + '%')
      }
      const wasAmt = num(before.discount_amount)
      const nowAmt = num(after.discount_amount)
      if (name && wasAmt !== null && nowAmt !== null && wasAmt !== nowAmt) {
        changes.push(name + ': ' + money(wasAmt) + ' → ' + money(nowAmt))
      }
      break
    }

    case 'create_promotion':
    case 'apply_category_discount': {
      const name = text(after.name)
      if (name) changes.push('Created "' + name + '"')
      const cat = text(after.category_name)
      if (cat) changes.push('Applies to the ' + cat + ' category')
      const pct = num(after.discount_percent)
      if (pct !== null) changes.push(pct + '% off')
      const amt = num(after.discount_amount)
      if (amt !== null) changes.push(money(amt) + ' off')
      const bundle = num(after.bundle_price)
      if (bundle !== null) changes.push('Bundle price ' + money(bundle))
      const products = arr(after.product_ids).length
      if (products > 0) changes.push(products + ' product' + (products === 1 ? '' : 's'))
      // A deduped create did NOT create anything — the idempotency key matched an existing promo.
      if (after.deduped === true) changes.push('Already existed — the same promotion was not created twice')
      break
    }

    default:
      break
  }

  const status = statusOf(step, changes, failed, affected)
  return {
    id: step.id,
    action_type: step.action_type,
    status,
    headline: headlineFor(step, status, changes, failed, affected),
    changes,
    failed_count: failed,
    affected_count: affected,
  }
}

function statusOf(step: RecordedStep, changes: string[], failed: number | null, affected: number | null): StepStatus {
  if (step.rolled_back_at) return 'rolled_back'
  // Nothing landed at all: the record itself says every attempt failed.
  if (failed !== null && failed > 0 && affected !== null && affected === 0) return 'failed'
  if (failed !== null && failed > 0) return 'partly_failed'
  if (changes.length === 0) return 'unrecorded'
  return 'changed'
}

function headlineFor(
  step: RecordedStep, status: StepStatus, changes: string[], failed: number | null, affected: number | null,
): string {
  const what = title(step.action_type)
  switch (status) {
    case 'rolled_back':
      return what + ' — undone. The change was made and then reversed.'
    case 'failed':
      return what + ' — FAILED. ' + failed + ' change' + (failed === 1 ? '' : 's') + ' did not go through and nothing was applied.'
    case 'partly_failed':
      return what + ' — PARTLY FAILED. ' + (affected ?? 0) + ' went through, ' + failed + ' did not.'
    case 'unrecorded':
      // The honest sentence. Not "completed successfully", which the row does not support.
      return what + ' — Aria recorded this action but not what it changed.'
    case 'changed':
    default:
      return what + ' — ' + changes.length + ' change' + (changes.length === 1 ? '' : 's') + '.'
  }
}

const FAILING: StepStatus[] = ['failed', 'partly_failed']

/**
 * The report for a run of steps.
 *
 * ⚠️ FAILURES ARE THE FIRST LINE. Not a footnote, not a colour, not a count at the bottom. A run
 * where step 3 failed is a run the owner has to know about before they read anything else, and
 * `report.test.ts` mutates the failed step out of the report and requires the suite to go red.
 *
 * A step that was never recorded properly is counted separately from one that succeeded — "we do
 * not know what this did" and "this did nothing" are different sentences and neither is "done".
 */
export function renderRunReport(steps: RecordedStep[]): string {
  const reports = steps.map(describeStep)
  const failures = reports.filter(r => FAILING.includes(r.status))
  const rolledBack = reports.filter(r => r.status === 'rolled_back')
  const unrecorded = reports.filter(r => r.status === 'unrecorded')
  const changed = reports.filter(r => r.status === 'changed')

  const lines: string[] = []

  if (failures.length > 0) {
    lines.push('⚠️ ' + failures.length + ' of ' + reports.length + ' step'
      + (reports.length === 1 ? '' : 's') + ' did not complete.', '')
  } else if (reports.length === 0) {
    return 'Nothing has been done yet.'
  }

  // Failures first inside the body too, so the order on screen matches the order of importance.
  for (const r of [...failures, ...changed, ...rolledBack, ...unrecorded]) {
    lines.push(r.headline)
    for (const c of r.changes) lines.push('   · ' + c)
  }

  lines.push('')
  lines.push(summaryLine(changed.length, failures.length, rolledBack.length, unrecorded.length))
  return lines.join('\n')
}

function summaryLine(changed: number, failed: number, rolledBack: number, unrecorded: number): string {
  const parts: string[] = []
  parts.push(changed + ' changed')
  if (failed > 0) parts.push(failed + ' did not complete')
  if (rolledBack > 0) parts.push(rolledBack + ' undone')
  // Never folded into "changed": not knowing what a step did is its own state.
  if (unrecorded > 0) parts.push(unrecorded + ' with no record of what changed')
  return parts.join(' · ')
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M11B PHASE 4 — THE PLAN'S REPORT.
//
// Added to THIS module rather than a second one, because there must be one vocabulary for "what
// happened". The audit describer above reads `aria_action_log`; this reads the plan's own step rows
// (`aria_autopilot_actions.outcome_note` / `outcome_data`). Both put failures first and neither
// says "done" without saying what changed.
//
// ── THE REPORT IS GENERATED FROM THE ROWS, EVERY TIME ─────────────────────────────────────────
// Nothing is carried over from the run that produced it. If the rows and the report ever disagree,
// the report is wrong by construction — which is the property the sprint asked for, and the reason
// `renderPlanReport` takes rows and returns a string rather than being handed a summary.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The step columns this report needs. A subset of `StepRow`, so a caller can pass those straight in. */
export interface ReportableStep {
  step_index: number
  title: string | null
  status: string
  requires_stepup: boolean
  outcome_note: string | null
  outcome_data: Record<string, unknown> | null
  resolved_at: string | null
}

export type StepState =
  /** It ran and the record says what it did. */
  | 'done'
  /** It was tried and did not work. `status` is still `pending` — see run.ts on why. */
  | 'failed'
  /** Money, sending or authorisation: proposed, never run here. Waiting for the owner. */
  | 'waiting_for_you'
  /** Nothing tried it — no capability, or the run stopped before reaching it. */
  | 'not_run'

/**
 * What state one step is in, read from the row alone.
 *
 * The order of these tests matters: a step that was ATTEMPTED (it has a `resolved_at` and a note)
 * but is not `executed` is a failure, and that has to be decided before "still pending" is read as
 * "waiting for you" — otherwise a step that broke would be reported as merely awaiting the owner,
 * which is the quietest possible way to lose a failure.
 */
export function stepState(step: ReportableStep): StepState {
  if (step.status === 'executed') return 'done'
  if (step.resolved_at && step.outcome_note) return 'failed'
  if (step.requires_stepup) return 'waiting_for_you'
  return 'not_run'
}

const STATE_LABEL: Record<StepState, string> = {
  done: 'DONE',
  failed: 'DID NOT GO THROUGH',
  waiting_for_you: 'WAITING FOR YOU',
  not_run: 'NOT RUN',
}

/**
 * The plan's report.
 *
 * ⚠️ FAILURES ARE THE FIRST LINE. A run where step 3 broke is a run the owner must know about
 * before they read anything else, and `report-plan.test.ts` drops the failed step and requires the
 * suite to go red.
 *
 * ⚠️ AND `reported` IS NOT `succeeded`. A plan whose every step failed still gets a report, and
 * that report is the deliverable. The closing line never says "done" on its own — it counts each
 * state separately, because "we did not try this" and "this broke" and "this needs you" are three
 * different sentences and none of them is success.
 */
export function renderPlanReport(request: string, steps: ReportableStep[]): string {
  const states = steps.map(s => ({ step: s, state: stepState(s) }))
  const failed = states.filter(s => s.state === 'failed')
  const done = states.filter(s => s.state === 'done')
  const waiting = states.filter(s => s.state === 'waiting_for_you')
  const notRun = states.filter(s => s.state === 'not_run')

  const lines: string[] = []

  if (steps.length === 0) {
    // Never "done". A plan with no steps did nothing, and says so.
    return 'You asked: ' + request + '\n\nThis plan had no steps, so nothing was done.'
  }

  if (failed.length > 0) {
    lines.push('⚠️ ' + failed.length + ' of ' + steps.length + ' step'
      + (steps.length === 1 ? '' : 's') + ' did not go through.', '')
  }

  lines.push('You asked: ' + request, '')

  // Failures first in the body too, so the order on screen matches the order of importance.
  for (const { step, state } of [...failed, ...done, ...waiting, ...notRun]) {
    lines.push(step.step_index + '. ' + (step.title ?? '(untitled step)') + ' — ' + STATE_LABEL[state])
    if (step.outcome_note) lines.push('   ' + step.outcome_note)
    else if (state === 'waiting_for_you') lines.push('   Aria proposed this and did not do it. It needs you.')
    else if (state === 'not_run') lines.push('   Nothing was attempted.')
  }

  lines.push('', summarise(done.length, failed.length, waiting.length, notRun.length))
  return lines.join('\n')
}

function summarise(done: number, failed: number, waiting: number, notRun: number): string {
  const parts: string[] = [done + ' done']
  if (failed > 0) parts.push(failed + ' did not go through')
  if (waiting > 0) parts.push(waiting + ' waiting for you')
  if (notRun > 0) parts.push(notRun + ' not attempted')
  return parts.join(' · ')
}

/**
 * The figures in a plan's outcomes that were READ from real data, with what they were read from.
 *
 * Fed to `segmentFigures` so a number in the report carries its tier — the same rail the answers
 * use. Only values a read step actually recorded are anchored; a number that appears in a note
 * without a recorded source stays plain, which is the honest outcome rather than a degraded one.
 */
export function planReportAnchors(steps: ReportableStep[]): Array<{ value: number | null | undefined; label: string }> {
  const out: Array<{ value: number | null | undefined; label: string }> = []
  for (const s of steps) {
    const d = s.outcome_data
    if (!d || typeof d !== 'object') continue
    const source = typeof d.source === 'string' ? d.source : null
    if (!source) continue
    if (typeof d.revenue === 'number') out.push({ value: d.revenue, label: source })
    if (typeof d.transaction_count === 'number') out.push({ value: d.transaction_count, label: source })
  }
  return out
}

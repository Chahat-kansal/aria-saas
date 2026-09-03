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

import { segmentFigures, type FigureSegment, type ProvenanceInput } from '@/lib/aria/figure-provenance'
import {
  CAPABILITIES, findCapability,
  type Capability, type CapabilityId, type GateReason, type StepGate,
} from './capabilities'

/**
 * M11B PHASE 1 — THE PLAN'S SHAPE, SPLIT OUT SO A BROWSER CAN IMPORT IT.
 *
 * ── WHY THIS FILE EXISTS, AND IT IS NOT TIDYING ────────────────────────────────────────────────
 * `PlanCard` is a client component and it must render each step's mark with the SAME `markFor` the
 * server uses — two copies of that logic is exactly how the screen and the report drift apart. But
 * importing it from `plan.ts` dragged `buildWorkPlan` in with it, and through it `model-router` and
 * the Anthropic SDK, whose credentials module imports `node:path`. THE BUILD FAILED:
 *
 *   Module build failed: UnhandledSchemeError: Reading from "node:path" is not handled by plugins
 *   Import trace: node:path → @anthropic-ai/sdk → model-router.ts → works/plan.ts
 *                 → PlanCard.tsx → AskAriaTransition.tsx → dashboard/ask-aria/page.tsx
 *
 * So the split is along the line that actually exists: everything here is pure — types, the
 * registry lookup, assembly, rendering — and everything that needs a model stays in `plan.ts`.
 *
 * ⚠️ NOTHING MOVED OUT OF REACH. `plan.ts` re-exports every symbol below, so all existing imports
 * (and M11's 29 tests, which import from `./plan`) keep working byte-for-byte. This is a file
 * boundary, not an API change.
 */

/** A single step, after the registry has had its say. */
export interface PlanStep {
  /** 1-based. The order is the plan; see M11-PHASE-2-PLAN-STORAGE.md on why it must be explicit. */
  index: number
  /** Null when the model named nothing Aria can actually do. */
  capability_id: CapabilityId | null
  /** What this step will do, in the owner's language. */
  title: string
  /** The detail beneath it. Rendered through the figure segmenter, so numbers carry their tier. */
  detail: string
  /** From the registry. Null only when there is no capability at all. */
  gate: StepGate | null
  gate_reason?: GateReason
  /** From the registry. False when unknown — never optimistic. */
  reversible: boolean
  /** No capability behind it: a person has to do this one. */
  needs_person: boolean
  /** The owner must say yes to this specifically, or it is propose-only. */
  needs_approval: boolean
  /** Aria may carry this out itself once the plan is approved. The ONLY green light in the file. */
  runnable_by_aria: boolean
  /**
   * M11B — the arguments the step needs to actually run: a product id, a quantity, a date.
   *
   * This is the model's, and it is the ONLY thing the model contributes besides the capability id
   * and the wording. It never influences the gate. A payload on a `propose_only` step is carried so
   * the owner can see what was proposed, and is never handed to an executor by the plan runner.
   *
   * Executors validate their own payloads and have their own backstops (`executeAction` refuses a
   * mass mutation without an explicit confirm, and has a kill switch and a role gate in front of
   * it), which is why a model-authored payload is the established pattern here — `planAction` has
   * worked this way since Ask Aria's single-action path shipped — rather than a new risk.
   */
  payload: Record<string, unknown>
}

export interface WorkPlan {
  ok: true
  /** The owner's own words. Never a normalisation — it is what a report has to be judged against. */
  request: string
  title: string
  steps: PlanStep[]
  counts: {
    total: number
    runnable_by_aria: number
    needs_approval: number
    needs_person: number
  }
  /**
   * Set when Aria cannot carry the plan out on her own. A sentence naming what stops it, or null.
   * The renderer puts it FIRST, never in a footnote.
   */
  blocked_reason: string | null
}

/** A request that no plan can be formed from. Saying this is a feature, not a failure. */
export interface Unplannable {
  ok: false
  request: string
  reason: string
}

export type PlanResult = WorkPlan | Unplannable

/** What the model is asked to return. Everything else it sends is discarded. */
export interface RawStep {
  capability?: unknown
  title?: unknown
  detail?: unknown
  payload?: unknown
}
export interface RawPlan {
  title?: unknown
  steps?: unknown
  cannot_plan?: unknown
  cannot_plan_reason?: unknown
}

const MAX_STEPS = 8

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.trim() : fallback)

/**
 * Turn what a model returned into a plan, applying the registry to every step.
 *
 * PURE, and separated from the model call on purpose: this is the function that decides what an
 * owner is told is safe, so it must be testable without a network, a key, or a sample of output
 * that happened to be well behaved on the day.
 */
export function assemblePlan(request: string, raw: unknown): PlanResult {
  const req = str(request)
  if (!req) return { ok: false, request: req, reason: 'There was no request to plan.' }

  const r = (raw ?? {}) as RawPlan

  // The model is allowed — required — to say a request cannot be planned. Taken at face value.
  if (r.cannot_plan === true) {
    return {
      ok: false,
      request: req,
      reason: str(r.cannot_plan_reason) || 'Aria could not turn that into a plan.',
    }
  }

  const rawSteps = Array.isArray(r.steps) ? (r.steps as RawStep[]).slice(0, MAX_STEPS) : []
  const steps: PlanStep[] = []

  for (const rs of rawSteps) {
    const title = str(rs?.title)
    if (!title) continue          // a step with nothing to say is not a step
    const cap: Capability | null = findCapability(rs?.capability)
    steps.push(toStep(steps.length + 1, title, str(rs?.detail), cap, payloadOf(rs?.payload)))
  }

  // No usable step at all. This is the honest answer, not an empty plan rendered as a plan.
  if (steps.length === 0) {
    return {
      ok: false,
      request: req,
      reason: 'Aria could not turn that into steps she knows how to carry out. '
        + 'Ask for something narrower, or tell her which part to start with.',
    }
  }

  const counts = {
    total: steps.length,
    runnable_by_aria: steps.filter(s => s.runnable_by_aria).length,
    needs_approval: steps.filter(s => s.needs_approval).length,
    needs_person: steps.filter(s => s.needs_person).length,
  }

  return {
    ok: true,
    request: req,
    title: str(r.title) || req.slice(0, 80),
    steps,
    counts,
    blocked_reason: blockedReason(counts),
  }
}

/**
 * A step's arguments, or an empty object.
 *
 * Anything that is not a plain object is discarded rather than coerced: an array or a string here
 * would reach an executor as a payload it cannot read, and "no arguments" is a state every executor
 * already handles (it refuses and says what was missing).
 */
function payloadOf(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

/** The registry decides everything on this line. Nothing here reads the model's opinion. */
function toStep(index: number, title: string, detail: string, cap: Capability | null, payload: Record<string, unknown> = {}): PlanStep {
  if (!cap) {
    return {
      index, capability_id: null, title, detail, payload,
      gate: null,
      // Unknown means NOT reversible. An optimistic default here would tell an owner a step could
      // be undone when nothing knows how.
      reversible: false,
      needs_person: true,
      needs_approval: true,
      runnable_by_aria: false,
    }
  }
  return {
    index,
    capability_id: cap.id,
    title,
    detail,
    payload,
    gate: cap.gate,
    ...(cap.gate_reason ? { gate_reason: cap.gate_reason } : {}),
    reversible: cap.reversible,
    needs_person: false,
    needs_approval: cap.gate !== 'auto',
    runnable_by_aria: cap.gate === 'auto',
  }
}

function blockedReason(c: WorkPlan['counts']): string | null {
  if (c.needs_person > 0 && c.needs_approval - c.needs_person > 0) {
    return c.needs_person + ' of these ' + c.total + ' steps need a person — Aria has no way to do '
      + 'them — and ' + (c.needs_approval - c.needs_person) + ' more need your go-ahead first.'
  }
  if (c.needs_person > 0) {
    return c.needs_person + ' of these ' + c.total + ' steps need a person. Aria has no way to do '
      + (c.needs_person === 1 ? 'it' : 'them') + '.'
  }
  if (c.runnable_by_aria === 0) {
    return 'Aria cannot carry out any of these steps on her own — every one needs your go-ahead.'
  }
  if (c.needs_approval > 0) {
    return c.needs_approval + ' of these ' + c.total + ' steps need your go-ahead before anything happens.'
  }
  return null
}

/**
 * Render a plan as the text an owner reads.
 *
 * ⚠️ EVERY STEP THAT IS NOT `runnable_by_aria` CARRIES A MARK. That is the property this function
 * exists to hold, and `plan.test.ts` mutates it away and requires the suite to go red. A plan that
 * renders an unexecutable step as though Aria will do it is worse than no plan at all: the owner
 * approves something believing it will happen, and it never does.
 */
export function renderPlan(plan: PlanResult): string {
  if (!plan.ok) return 'I can\'t turn that into a plan.\n\n' + plan.reason

  const lines: string[] = []
  // Blocked first, never as a footnote.
  if (plan.blocked_reason) lines.push('⚠️ ' + plan.blocked_reason, '')
  lines.push(plan.title, '')

  for (const s of plan.steps) {
    lines.push(s.index + '. ' + s.title + ' — ' + markFor(s))
    if (s.detail) lines.push('   ' + s.detail)
  }

  lines.push('', 'Nothing has run. This is the plan.')
  return lines.join('\n')
}

/** The mark beside a step. There is no unmarked state for a step Aria may not carry out. */
export function markFor(step: PlanStep): string {
  if (step.needs_person) return 'NEEDS A PERSON — Aria cannot do this one'
  if (step.gate === 'propose_only') return 'NEEDS YOU — ' + reasonText(step.gate_reason) + ', so Aria proposes it and never does it'
  if (step.gate === 'approve') return 'NEEDS YOUR OK on this step specifically'
  return 'Aria can do this' + (step.reversible ? ', and undo it' : '')
}

function reasonText(r: GateReason | undefined): string {
  switch (r) {
    case 'money': return 'it moves money'
    case 'sending': return 'it sends something to someone'
    case 'authorisation': return 'it changes who may do what'
    case 'destructive': return 'it changes what customers can buy'
    // No default invention: an unnamed reason says so rather than guessing at one.
    default: return 'it needs a person'
  }
}

/**
 * A step's detail, split into figures and text with their provenance tiers.
 *
 * The SAME segmenter the answers use, fed the SAME `ProvenanceInput` the turn produced — so a step
 * resting on a number carries that number's tier, and a step resting on a number the turn never
 * grounded renders it plain. Nothing bespoke, and no second notion of "verified".
 */
export function planStepSegments(step: PlanStep, provenance: ProvenanceInput = {}): FigureSegment[] {
  return segmentFigures(step.detail || step.title, provenance)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// M11B PHASE 5 — REOPENING A PAST JOB.
//
// A stored plan is rows, and the card renders a `PlanResult`. This turns one into the other, PURELY
// — no fetch, no model, no second store — so a job reopened from history renders through exactly
// the same `PlanCard` and the same `markFor` as the one that was just created. Two renderers for
// "a plan" is how the history view and the live view start disagreeing about what a step is.
//
// Everything comes from the rows. The gate is re-derived from the REGISTRY by capability id rather
// than read from the stored payload — a row whose `action_data.gate` was somehow wrong must not be
// able to render a money step as safe a month later.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The plan columns this needs. A subset of persist.ts's PlanRow, so a caller passes that straight in. */
export interface StoredPlanRow {
  id: string
  request: string
  title: string
  status: string
  unplannable_reason: string | null
  report: string | null
  created_at: string
}

/** The step columns this needs. A subset of persist.ts's StepRow. */
export interface StoredStepRow {
  step_index: number
  title: string | null
  description: string | null
  status: string
  action_type: string | null
  action_data: Record<string, unknown> | null
  requires_stepup: boolean
  outcome_note: string | null
  resolved_at: string | null
}

export interface RehydratedPlan {
  planId: string
  result: PlanResult
  status: string
  report: string | null
  outcomes: Array<{ step_index: number; title: string; result: 'ran' | 'skipped' | 'failed'; note: string }>
  created_at: string
}

/**
 * Rebuild a renderable plan from its stored rows.
 *
 * An unplannable plan comes back as the refusal it was — `unplannable_reason` is the column that
 * exists for it, and the owner sees the same sentence they saw at the time rather than an empty
 * plan where a refusal used to be.
 */
export function rehydratePlan(plan: StoredPlanRow, steps: StoredStepRow[]): RehydratedPlan {
  const outcomes: RehydratedPlan['outcomes'] = []

  if (plan.unplannable_reason) {
    return {
      planId: plan.id,
      result: { ok: false, request: plan.request, reason: plan.unplannable_reason },
      status: plan.status, report: plan.report, outcomes, created_at: plan.created_at,
    }
  }

  const ordered = [...steps].sort((a, b) => a.step_index - b.step_index)
  const planSteps: PlanStep[] = ordered.map(s => {
    // From the registry, by id — never from the stored payload's own `gate`.
    const cap = findCapability(s.action_type)
    const payload = { ...(s.action_data ?? {}) }
    delete payload.capability
    delete payload.gate
    const step = toStep(s.step_index, s.title ?? '(untitled step)', s.description ?? '', cap, payload)

    // The same three states the report uses, from the same row facts, so the card and the report
    // cannot say different things about the same step.
    if (s.status === 'executed') outcomes.push({ step_index: s.step_index, title: step.title, result: 'ran', note: s.outcome_note ?? 'Done.' })
    else if (s.resolved_at && s.outcome_note) outcomes.push({ step_index: s.step_index, title: step.title, result: 'failed', note: s.outcome_note })
    else if (s.requires_stepup) outcomes.push({ step_index: s.step_index, title: step.title, result: 'skipped', note: 'Waiting for you.' })

    return step
  })

  const counts = {
    total: planSteps.length,
    runnable_by_aria: planSteps.filter(s => s.runnable_by_aria).length,
    needs_approval: planSteps.filter(s => s.needs_approval).length,
    needs_person: planSteps.filter(s => s.needs_person).length,
  }

  return {
    planId: plan.id,
    result: { ok: true, request: plan.request, title: plan.title, steps: planSteps, counts, blocked_reason: blockedReason(counts) },
    status: plan.status,
    report: plan.report,
    outcomes,
    created_at: plan.created_at,
  }
}

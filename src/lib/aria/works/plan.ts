import { runAriaModel } from '@/lib/aria/model-router'
import { segmentFigures, type FigureSegment, type ProvenanceInput } from '@/lib/aria/figure-provenance'
import {
  CAPABILITIES, capabilityMenu, findCapability,
  type Capability, type CapabilityId, type GateReason, type StepGate,
} from './capabilities'

/**
 * M11 PHASE 3 — THE PLAN.
 *
 * The owner describes an outcome. Aria returns ordered steps in plain English, each saying what it
 * will do and whether it needs the owner, INSTEAD of an answer. Nothing runs. Nothing in this file
 * writes to anything.
 *
 * ── THE ONE RULE THAT MAKES THIS SAFE ──────────────────────────────────────────────────────────
 * The model chooses WHICH capability a step uses. It never decides whether that capability is safe.
 * Every gate, every "needs approval", every "Aria may not do this" comes from `CAPABILITIES` by
 * lookup. A model that returns `{"gate":"auto"}` on a price change is ignored — the field is not
 * read. A model that invents `send_sms_campaign` produces a step that needs a person, because the
 * lookup returns null. This is why prompt injection in a review, a supplier note or a customer name
 * cannot talk a plan into executing something.
 *
 * ── AND THE ONE RULE THAT MAKES IT HONEST ──────────────────────────────────────────────────────
 * A plan that Aria cannot finish says so, on its face, in `blocked_reason` and in the rendering.
 * "Half a plan presented as whole" is the failure this codebase keeps finding; a plan that names
 * its own gaps is not half a plan.
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
interface RawStep {
  capability?: unknown
  title?: unknown
  detail?: unknown
}
interface RawPlan {
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
    steps.push(toStep(steps.length + 1, title, str(rs?.detail), cap))
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

/** The registry decides everything on this line. Nothing here reads the model's opinion. */
function toStep(index: number, title: string, detail: string, cap: Capability | null): PlanStep {
  if (!cap) {
    return {
      index, capability_id: null, title, detail,
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

const PLANNER_SYSTEM = `You are Aria, an AI business co-owner for an Australian small business.

The owner has described an OUTCOME they want. Return a PLAN — ordered steps — not an answer.

Each step must name ONE capability from this list, using its exact id:
` + capabilityMenu() + `

RULES
1. If the outcome cannot be reached with these capabilities, set "cannot_plan": true and say why in
   "cannot_plan_reason". Saying so is correct and expected. NEVER invent a capability id, and never
   pad a plan with steps that do nothing.
2. If PART of the outcome needs something not on the list, still include that step and set its
   capability to null. Say plainly what a person has to do.
3. Order matters. Step 1 runs first. Read before you write.
4. "title" is one short sentence in the owner's language, present tense, saying what the step does.
   "detail" is at most two sentences of specifics.
5. Do NOT say whether a step is safe, reversible, or needs approval. That is decided elsewhere and
   anything you say about it is discarded.
6. Never state a dollar figure or a percentage you were not given.

Return JSON only:
{"title":"...","steps":[{"capability":"<id or null>","title":"...","detail":"..."}],
 "cannot_plan":false,"cannot_plan_reason":null}`

export interface PlanRequestContext {
  businessId: string
  /** Anything the caller already knows about the business — the same context an answer would use. */
  contextBlock?: string
}

/**
 * Ask for a plan.
 *
 * Goes through `runAriaModel`, which is the routed path with `aria_ai_calls` logging already wired
 * (AI-COST-2) — so a planning call is costed like every other call rather than being invisible, the
 * thing AI-COST-AUDIT-1 found had happened three separate times.
 */
export async function buildWorkPlan(request: string, ctx: PlanRequestContext): Promise<PlanResult> {
  const req = String(request ?? '').trim()
  if (!req) return { ok: false, request: '', reason: 'There was no request to plan.' }

  const result = await runAriaModel<RawPlan>({
    task: 'work_plan',
    systemPrompt: PLANNER_SYSTEM,
    userPrompt: (ctx.contextBlock ? ctx.contextBlock + '\n\n' : '') + 'The owner wants: ' + req,
    maxTokens: 1600,
    businessId: ctx.businessId,
    schema: { title: 'string', steps: [{ capability: 'string', title: 'string', detail: 'string' }], cannot_plan: 'boolean', cannot_plan_reason: 'string' },
  })

  // A provider that could not answer is NOT an unplannable request, and must not be reported as
  // one — "Aria could not plan that" would blame the owner for an outage.
  if (!result.ok || !result.data) {
    return {
      ok: false,
      request: req,
      reason: 'Aria could not reach the model to plan that just now. Nothing was attempted. Try again in a moment.',
    }
  }

  return assemblePlan(req, result.data)
}

/** Exported for the test: the prompt must never leak the gates to the model. */
export const PLANNER_SYSTEM_PROMPT = PLANNER_SYSTEM
export { CAPABILITIES }

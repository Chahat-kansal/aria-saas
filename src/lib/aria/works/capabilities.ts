import type { ActionType } from '@/lib/aria/ask/action-planner'

/**
 * M11 PHASE 3 — THE REGISTRY OF THINGS ARIA CAN ACTUALLY DO.
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────────────────────────
 * A plan is only worth showing an owner if its steps are real. The failure this forecloses is the
 * one this codebase keeps finding: a step that reads convincingly, renders perfectly, and does
 * nothing — because nothing behind it was ever built. Every capability below names the module and
 * function that would carry it out, and `capabilities.test.ts` reads those files and fails if the
 * function is not there. A capability cannot be added by describing it.
 *
 * ── THE GATE IS THE REGISTRY'S, NEVER THE MODEL'S ──────────────────────────────────────────────
 * This is the single most important property in the file. The planner asks a model which
 * capabilities a request needs; it does NOT ask the model whether they are safe. The model picks an
 * id, and the id is looked up here. A model that hallucinates `"gate": "auto"` on a price change,
 * or that is talked into it by text inside a customer review, changes nothing: the gate is not read
 * from its output. An id that is not in this table produces a step marked as needing a person, and
 * a plan that cannot be executed.
 *
 * ── THE WRITE CAPABILITIES ARE NOT INVENTED HERE ───────────────────────────────────────────────
 * All eleven come from `PlannedAction['type']` and every one of them already has a working branch
 * in `executeAction` (`src/lib/aria/ask/action-executor.ts`), which has its own kill switch, role
 * gate, mass-mutation backstop and append-only audit log. This registry adds no new power. It
 * describes what already exists, and marks what a plan may and may not do with it.
 */

/** Read capabilities. Each names a real exported function; the test asserts each one exists. */
export type ReadCapabilityId =
  | 'read_revenue_day'
  | 'read_revenue_range'
  | 'read_revenue_comparison'
  | 'read_loss_signals'

export type CapabilityId = ActionType | ReadCapabilityId

/**
 * What a plan is allowed to do with a step.
 *
 *   auto         — safe and reversible. A plan runner may carry it out once the owner approves the
 *                  plan as a whole.
 *   approve      — a write the owner must say yes to specifically, not just as part of the plan.
 *   propose_only — money, sending, or authorisation. THE PLAN MAY PROPOSE IT AND NOTHING MORE.
 *                  It is carried out, if at all, through the existing confirm path
 *                  (`executeAction`, with `requires_confirmation`) and never by a plan runner.
 *                  This is the decision table's rule, spelled as data.
 *
 * `propose_only` reuses the word `RadarPlan.propose_only` already uses (`radar/plan-builder.ts`)
 * rather than inventing a second vocabulary for the same idea.
 */
export type StepGate = 'auto' | 'approve' | 'propose_only'

/** Why a step is gated. One of the four named classes — never free text, never invented. */
export type GateReason = 'money' | 'sending' | 'authorisation' | 'destructive'

export interface Capability {
  id: CapabilityId
  /** Plain English, present tense, what the step WILL do. This is what the owner reads. */
  label: string
  kind: 'read' | 'write'
  gate: StepGate
  /** Set for every gate that is not 'auto', and never set for one that is. */
  gate_reason?: GateReason
  /**
   * Whether carrying it out can be undone. For writes this means `aria_action_log` captures a
   * `before_state` that `rollbackAction` can restore — not a guess about how hard it would be.
   */
  reversible: boolean
  /** The module and function that would actually carry this out. Asserted to exist by the test. */
  executor: string
}

const W = (
  id: ActionType, label: string, gate: StepGate, reversible: boolean, gate_reason?: GateReason,
): Capability => ({ id, label, kind: 'write', gate, reversible, executor: 'src/lib/aria/ask/action-executor.ts#executeAction', ...(gate_reason ? { gate_reason } : {}) })

const R = (id: ReadCapabilityId, label: string, executor: string): Capability =>
  ({ id, label, kind: 'read', gate: 'auto', reversible: true, executor })

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  // ── READS. Safe by construction: they change nothing, so there is nothing to undo. ────────────
  read_revenue_day: R('read_revenue_day', 'Read what the business took on a given day',
    'src/lib/aria/revenue-snapshot.ts#getRevenueSnapshot'),
  read_revenue_range: R('read_revenue_range', 'Read takings across a date range',
    'src/lib/aria/revenue-snapshot.ts#getRevenueForRange'),
  read_revenue_comparison: R('read_revenue_comparison', 'Compare takings between two periods',
    'src/lib/aria/revenue-snapshot.ts#getRevenueComparison'),
  read_loss_signals: R('read_loss_signals', 'Look for where the business is losing money right now',
    'src/lib/aria/radar/loss-detector.ts#detectLosses'),

  // ── WRITES THAT ARE SAFE AND REVERSIBLE ───────────────────────────────────────────────────────
  // Both record a before_state, so `rollbackAction` can put them back.
  adjust_stock: W('adjust_stock', 'Correct the stock count on one product', 'auto', true),
  set_low_stock_threshold: W('set_low_stock_threshold', 'Set the level at which a product counts as low', 'auto', true),

  // ── A WRITE THE OWNER MUST SAY YES TO SPECIFICALLY ────────────────────────────────────────────
  // `mark_products` is in the executor's own DESTRUCTIVE_ACTION_TYPES set and is gated there by a
  // privileged role. It touches what customers can buy, so approving "the plan" is not enough.
  mark_products: W('mark_products', 'Turn products on or off in the menu', 'approve', true, 'destructive'),

  // ── MONEY, SENDING, AUTHORISATION — PROPOSE ONLY ──────────────────────────────────────────────
  // Every one of these changes what somebody is charged, what is committed to a supplier, who works
  // when, or what may act on the owner's behalf. A plan may put them in front of the owner. It may
  // not carry them out.
  bulk_price_update: W('bulk_price_update', 'Change prices across products', 'propose_only', true, 'money'),
  apply_category_discount: W('apply_category_discount', 'Discount a whole category', 'propose_only', true, 'money'),
  create_promotion: W('create_promotion', 'Create a promotion customers can use', 'propose_only', true, 'money'),
  update_promotion: W('update_promotion', 'Change a promotion that is already running', 'propose_only', true, 'money'),
  create_invoice: W('create_invoice', 'Raise an invoice', 'propose_only', false, 'money'),
  approve_po_draft: W('approve_po_draft', 'Commit a purchase order to a supplier', 'propose_only', false, 'money'),
  // Who works when is the roster, and publishing one tells people to turn up. TS-1 phase 4 reached
  // the same conclusion from the other direction: a roster change is proposed, never executed.
  create_roster: W('create_roster', 'Draft a roster for a week', 'propose_only', true, 'authorisation'),
  // An agent acts on the owner's behalf afterwards. Creating one is granting authority.
  create_agent: W('create_agent', 'Create an agent that acts on your behalf', 'propose_only', false, 'authorisation'),
}

/** Every capability id, for prompts and for exhaustiveness tests. */
export const CAPABILITY_IDS = Object.keys(CAPABILITIES) as CapabilityId[]

/**
 * Look up a capability the model named.
 *
 * Returns null for anything not registered — including a plausible-sounding invention like
 * `send_sms_campaign`. A null is the whole safety property: the caller turns it into a step that
 * needs a person, never into a step that looks executable.
 */
export function findCapability(id: unknown): Capability | null {
  if (typeof id !== 'string') return null
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, id)
    ? CAPABILITIES[id as CapabilityId]
    : null
}

/** True only for a registered capability a plan runner is allowed to carry out itself. */
export function isAutoRunnable(cap: Capability | null): boolean {
  return cap !== null && cap.gate === 'auto'
}

/** The catalogue the planner shows the model. Ids and labels only — never the gates. */
export function capabilityMenu(): string {
  return CAPABILITY_IDS.map(id => '  ' + id + ' — ' + CAPABILITIES[id].label).join('\n')
}

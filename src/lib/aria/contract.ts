import type { Provenance, Grounding } from './compute/provenance'

// INTEL-CONTRACT-1 — the Aria Intelligence Contract: one consistent structured shape retained
// behind every substantive Aria response, so the system never loses the facts/calculations/
// assumptions/confidence/provenance underneath an answer, even when the UI renders only prose.
// Assembled from two things that already exist — INTEL-COMPUTE-1's deterministic compute engine and
// INTEL-TRUTH-1's verified/derived/estimated typing — this module computes nothing new itself.

/** A single figure backing an answer — a direct reference to a real compute-engine result, never
 * invented here. `provenance.grounding` (verified/derived/estimated) decides whether it lands in
 * the contract's `facts` or `calculations` array. */
export interface ContractFigure {
  label: string // human-readable, e.g. "Revenue today", "Margin on Apple Juice"
  value: number | string | boolean | null
  provenance: Provenance
}

export interface RecommendedAction {
  label: string
  action_type: string
  payload?: Record<string, unknown>
}

export interface AriaIntelligenceContract {
  answer: string
  facts: ContractFigure[] // grounding === 'verified'
  calculations: ContractFigure[] // grounding === 'derived' | 'estimated'
  assumptions: string[] // named assumptions behind estimated calculations (from their own Provenance.rule)
  confidence: number // 0-1, deterministic from the grounding mix backing the answer — never LLM-invented
  uncertainties: string[] // claims in the answer with no backing fact/calculation — a grounding gap made visible
  recommendedActions: RecommendedAction[]
  approvalRequired: boolean // ties to the EXISTING propose-approve gate (AgentDecision.status / aria_action_log), not a new concept
  provenance: Provenance[] // flat list of every fact's/calculation's Provenance, for audit/logging without traversing both arrays
}

// Deterministic confidence weighting by grounding tier — not an LLM guess. Matches INTEL-TRUTH-1's
// own ordering (verified is most trustworthy, estimated least) so confidence tracks truth-typing
// rather than diverging from it.
const GROUNDING_CONFIDENCE_WEIGHT: Record<Grounding, number> = { verified: 1.0, derived: 0.8, estimated: 0.5 }

export interface BuildContractParams {
  answer: string
  /** Caller-supplied figures from the compute engine, already truth-typed by INTEL-TRUTH-1. Never
   * computed or invented inside this function — buildContract only assembles and classifies. */
  figures?: ContractFigure[]
  recommendedActions?: RecommendedAction[]
  /** Numeric values ground-guard.ts's guardOutput() flagged as present in the answer but not backed
   * by any allowed ground-truth value — i.e. a claim with no backing fact/calculation. */
  ungroundedValues?: number[]
  /** True when this specific response already executed autonomously (an aria_action_log row was
   * written and the call succeeded) — the existing propose-approve gate's own record that this
   * action ran under the business's auto-approve settings, not something still pending review. */
  actionAlreadyExecuted?: boolean
}

/** Assemble an AriaIntelligenceContract from an answer plus the real compute-engine figures backing
 * it. No computation happens here — only classification (facts vs calculations by grounding),
 * deterministic confidence scoring, and honest gap surfacing (uncertainties/assumptions). */
export function buildContract(params: BuildContractParams): AriaIntelligenceContract {
  const figures = params.figures ?? []
  const facts = figures.filter(f => f.provenance.grounding === 'verified')
  const calculations = figures.filter(f => f.provenance.grounding !== 'verified')
  const recommendedActions = params.recommendedActions ?? []

  // Assumptions are never invented here — they're the caller's own named rationale for why an
  // estimated figure had to be used, already written into that figure's own Provenance.rule
  // (see provenance.ts's documented convention for 'estimated' grounding).
  const assumptions = calculations
    .filter(c => c.provenance.grounding === 'estimated')
    .map(c => c.provenance.rule)

  const uncertainties = (params.ungroundedValues ?? []).map(
    v => `Answer mentions a figure (${v}) with no backing fact or calculation in this contract`,
  )

  const confidence = figures.length === 0
    ? 0.3 // no backing data at all — low confidence by default, never silently high
    : Math.round(
        (figures.reduce((s, f) => s + GROUNDING_CONFIDENCE_WEIGHT[f.provenance.grounding], 0) / figures.length) * 100,
      ) / 100

  // Ties to the existing propose-approve gate: if there's nothing to act on, there's nothing to
  // approve; if an action already executed (an aria_action_log row exists for it), it ran under
  // the business's own auto-approve settings and isn't pending anything further.
  const approvalRequired = recommendedActions.length > 0 && !params.actionAlreadyExecuted

  return {
    answer: params.answer,
    facts,
    calculations,
    assumptions,
    confidence,
    uncertainties,
    recommendedActions,
    approvalRequired,
    provenance: figures.map(f => f.provenance),
  }
}

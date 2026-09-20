/**
 * M17 · BRAIN-1 PHASE 1 — THE TYPES OF THE SPINE.
 *
 * `_POST` in src/app/api/aria/ask/route.ts is one function of 2,486 lines with **28 exits**. It is
 * a waterfall of guards: whichever condition matches first wins, in source order, and a lane can —
 * and every sprint since June has — skip grounding, the council, or the verifier by returning
 * early. M12's bathroom answer and M3's 0-of-288 missing provenance tiers are the same fault seen
 * from two ends.
 *
 *     runTurn(input) =
 *       understand(input)             → Understanding    (stage 1)
 *       ground(input, understanding)  → TurnGrounding    (stage 2)
 *       decide(understanding, ground) → Strategy         (stage 3)
 *       act(strategy, …)              → TurnResult       (stage 4)
 *       verify(result)                → VerifiedResult   (stage 5)
 *       render(verified)              → NextResponse     (stage 6 — THE ONLY EXIT)
 *
 * ⚠️ THIS FILE CHANGES NO CODE PATH. It is types only. Behaviour on day one is identical; the
 * structure is what changes, and from then on no lane can leave without passing every stage.
 *
 * ⚠️ NAME COLLISION, RECORDED RATHER THAN RESOLVED SILENTLY. The sprint document calls stage 2's
 * output `Grounding`. **`Grounding` already exists** — src/lib/aria/compute/provenance.ts exports
 * `type Grounding = 'verified' | 'derived' | 'estimated'`, the provenance tier of a computed
 * figure, with live consumers. A second `Grounding` meaning something else entirely is failure
 * pattern #4 ("N copies drift") committed deliberately, so stage 2's type is **`TurnGrounding`**.
 * Neither type is renamed.
 *
 * M18 owns grounding-always and the verifier. M19 owns the single classifier. M20 owns the
 * executor. Nothing here anticipates them beyond leaving the shape they need.
 */
import type { AskBlock } from '@/lib/aria/ask-types'
import type { ClassifiedIntent, OutputFormat } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'
import type { AskAriaContext } from '@/lib/aria/ask/business-context'

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * LANES
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The twenty lanes `_POST` actually has, in source order, measured from the 28 exits.
 *
 * ⚠️ THE SPRINT DOCUMENT NAMES TWO LANES THAT DO NOT EXIST. It lists `troubleshoot` and `escalate`
 * among the strategies to create. Against the code:
 *
 *   · `intent.type === 'troubleshoot' || 'escalate'` (route.ts:2161) appends a SYSTEM-PROMPT
 *     ADDENDUM via buildTroubleshootAddendum() and falls straight through to the main tool loop.
 *   · `action?.action === 'escalate'` (route.ts:2619) is an ACTION RESULT — createSupportTicket —
 *     handled AFTER the model has already answered, inside the main path.
 *
 * Neither returns anything. `docs/aria/ARIA-LOGIC-READ.md` lists them as lanes at 2132/2296 and is
 * wrong on both counts. The code wins, so this list is derived from the exits, not from the paste.
 */
export const LANE_NAMES = [
  'rate_limited_user',      // 317   — per-user AI rate limit, 429
  'bad_request',            // 366   — no message and no attachment, 400
  'save_plan',              // 399   — [ARIA_SAVE_PLAN] fast-path
  'cost_guard_blocked',     // 406   — daily spend guard
  'rate_limited_minute',    // 424   — per-minute question cap, 429
  'cost_ceiling',           // 434   — daily AI budget ceiling, 402
  'pending_action',         // 468/505/517/599 — the confirm-and-execute lane (4 exits)
  'agent_composer',         // 633/636 — MS13 describe-an-agent card (2 exits)
  'action_planner',         // 705/714/730 — plan / stage / clarify (3 exits)
  'inventory_agent',        // 760/773 — INV-AGENT-1 fast-path (2 exits)
  'nav_fastpath',           // 804   — env-gated OFF (NAV_FASTPATH=1)
  'general',                // 910   — the M12 lane, runs BEFORE business context exists
  'multi_domain',           // 942   — parallel agents, full business overview
  'deliverable',            // 985   — the sprint's "artifact"
  'background_task',        // 1042  — queue and return
  'council',                // 1106/1475 — no-data + the council itself (2 exits)
  'image',                  // 2390  — image fast-path
  'stopped',                // 2470  — the owner pressed Stop (S1 phase 1)
  'total_outage',           // 2536  — every provider down
  'main',                   // 2746  — the main tool loop
] as const

export type LaneName = (typeof LANE_NAMES)[number]

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 1 — UNDERSTANDING
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every boolean `_POST` derives from the raw message, in one place.
 *
 * ⚠️ MEASURED, NOT ESTIMATED: the read says "~15 regex heuristics". `_POST` assigns **22 named
 * regex constants** and writes 3 more inline — 25 regexes — feeding these 18 booleans. They are
 * MOVED here in phase 2 and not one of them is deleted, reordered or reworded: replacing them with
 * one classifier is M19's sprint, and a structural sprint that also changed behaviour could not
 * prove it changed nothing.
 */
export interface TurnFeatures {
  readonly isStrategicQuestion: boolean
  readonly isEditIntent: boolean
  readonly isActionRequest: boolean
  readonly isStrongAction: boolean
  readonly planTrigger: boolean
  readonly isAgentCompose: boolean
  readonly isCoreferentialFollowup: boolean
  readonly isNavQuestion: boolean
  readonly isMultiDomain: boolean
  readonly isSpreadsheetRequest: boolean
  readonly isBackgroundTask: boolean
  readonly isBrevityQuestion: boolean
  readonly isDataLookup: boolean
  readonly isImageRequest: boolean
  readonly isSavePlan: boolean
  readonly needsSonnet: boolean
  readonly needsTools: boolean
  readonly wantsResearch: boolean
}

/** The names of the features that were TRUE this turn — phase 5's record of why a lane was picked. */
export type FeatureName = keyof TurnFeatures

/**
 * Stage 1's output. In M17 it is the same values `_POST` computes today, moved rather than changed:
 * BOTH classifiers still run and are carried side by side, unreconciled, exactly as the lane
 * conditions OR them. M19 replaces the pair with one structured call and a confidence.
 */
export interface Understanding {
  readonly message: string
  readonly intent: ClassifiedIntent
  readonly ariaIntent: AriaIntent
  readonly outputFmt: OutputFormat
  readonly features: TurnFeatures
  /** Only the features that fired — what phase 5 writes to the turn record. */
  readonly firedFeatures: readonly FeatureName[]
  readonly hasAttachments: boolean
  readonly hasImages: boolean
  readonly hasConversation: boolean
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 2 — GROUNDING
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * What a lane loads before it answers.
 *
 * ⚠️ IN M17 THIS IS BEHAVIOUR-PRESERVING AND THAT IS THE WHOLE POINT. Today grounding is
 * conditional, and the condition is decided BEFORE any grounding exists — the general lane runs at
 * 824 while `ctx` is not built until 1493. So `kind: 'none'` is not an aspiration here, it is an
 * accurate description of what the general lane has: nothing. M18 makes a lean envelope
 * unconditional and `'none'` disappears.
 */
export type TurnGrounding =
  /** The general / fast-path lanes: no business context is loaded at all. */
  | { readonly kind: 'none' }
  /** The council lane: getBusinessContext() + facts packet + the live ground-truth anchors. */
  | {
      readonly kind: 'council'
      readonly bizCtx: string
      readonly augCtx: string
      readonly anchors: readonly number[]
      readonly provenance: TurnProvenance | null
    }
  /** The main tool loop: the full buildAskAriaContext() at the scope the intent asked for. */
  | { readonly kind: 'full'; readonly ctx: AskAriaContext }

/**
 * S3 phase 1's carrier, unchanged. Stored with the message so a reloaded thread can still tier its
 * figures. Null on every lane that computed no anchors — absent and empty stay distinguishable.
 */
export interface TurnProvenance {
  readonly anchors: number[]
  readonly anchorLabels: Record<string, string>
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 3 — STRATEGY
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The decision, and — for the first time in this route's life — the REASON, in a value rather than
 * in the shape of the control flow. `decide()` reproduces the existing lane selection exactly, in
 * the same order; what is new is that the answer is returned instead of being expressed by which
 * `return` statement happened to run.
 */
export interface Strategy {
  readonly name: LaneName
  /** Why this lane won, in the terms the code uses (`'planTrigger'`, `'ariaIntent=analytical'`). */
  readonly reason: string
  /** The features that were true when it won — phase 5's record. */
  readonly firedFeatures: readonly FeatureName[]
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 4 — TURN RESULT
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface Download {
  filename: string
  download_url: string
  rows: number
  format: string
}

export interface ToolCallSummary {
  name: string
  ms: number
}

/**
 * WHAT A LANE PRODUCES, INSTEAD OF AN HTTP RESPONSE.
 *
 * ⚠️ `body` IS THE LANE'S OWN OBJECT, VERBATIM, IN THE LANE'S OWN KEY ORDER — and that is a
 * measured requirement, not a convenience. Across the 28 exits there are **36 distinct top-level
 * response keys**, and the order is not consistent between them: exit 1106 emits
 * `response, blocks, conversation_id, …` while exit 1475 emits
 * `blocks, followups, used_council, advisors_lost, provenance, response, …`. Phase 3 must prove the
 * rendered JSON is identical BYTE-FOR-BYTE, and `JSON.stringify` preserves insertion order — so a
 * canonical field order in this type would change every byte of every answer while changing no
 * behaviour, and would drown phase 6's replay in diffs that mean nothing.
 *
 * The typed fields below are therefore **projections of `body`, derived once by `makeTurnResult()`
 * and never set by hand.** That is what stops them drifting from the thing actually sent. They are
 * what the spine, the turn record, and M18's verifier read; `body` is what the client receives.
 */
export interface TurnResult {
  readonly lane: LaneName
  readonly status: number
  /** The response payload exactly as the lane built it. `render()` serialises this and nothing else. */
  readonly body: Readonly<Record<string, unknown>>

  // ── projections, derived from `body` — see makeTurnResult() ──────────────────────────────────
  readonly text: string | null
  readonly blocks: AskBlock[] | null
  readonly followups: string[] | null
  readonly action: unknown
  readonly conversationId: string | null
  readonly intent: string | null
  readonly provenance: TurnProvenance | null
  readonly model: string | null
  readonly costCents: number | null
  readonly toolCalls: readonly ToolCallSummary[]
  readonly downloads: readonly Download[] | null
  readonly usedCouncil: boolean
  readonly servedBy: string | null
  readonly degradedVia: string | null
  readonly stopped: boolean
  readonly incomplete: boolean
  readonly error: string | null
}

/** Stage 4's input for a lane that failed outright and must still leave through render(). */
export interface TurnError {
  readonly lane: LaneName
  readonly message: string
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 5 — VERIFICATION
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ MANDATORY, AND IN M17 DELIBERATELY EMPTY.
 *
 * The verifier's whole history is that it was written, shipped, and positioned after the exit that
 * carries every request it was written for — reached roughly once in three months (M9). Nobody
 * broke it; it was never reachable. So the field exists from today and can never be absent, and
 * what M18 changes is `ran: false` → `ran: true` **without touching this shape**.
 *
 * A `ran: false` that carries no reason would be the same silence in a new place, so `reason` is
 * required on the not-run branch.
 */
export type Verification =
  | { readonly ran: false; readonly reason: string }
  | {
      readonly ran: true
      readonly checkedFigures: number
      readonly unsourcedFigures: number
      readonly verdict: 'ok' | 'corrected' | 'insufficient_data'
      readonly note?: string
    }

/** What stage 5 hands stage 6. The only thing `render()` accepts. */
export interface VerifiedResult {
  readonly result: TurnResult
  readonly verified: Verification
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE TURN RECORD (phase 5)
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * One structured row per turn saying WHY a message went where it went. Nobody can predict a
 * message's lane today — S4 through M12 each found a turn in an unexpected lane — because the
 * decision is spread across 25 regexes and lives only in the shape of the control flow.
 */
export interface TurnRecord {
  readonly lane: LaneName
  readonly reason: string
  readonly firedFeatures: readonly FeatureName[]
  /** ⚠️ The lanes that were OFFERED the turn and declined, in order — the waterfall, as a value. */
  readonly declined: readonly LaneName[]
  readonly intentType: string
  readonly ariaIntentType: string
  readonly complexity: string
  readonly groundingKind: TurnGrounding['kind']
  readonly verified: Verification
  readonly status: number
  readonly stageMs: Readonly<Record<string, number>>
  readonly totalMs: number
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * CONSTRUCTION
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * THE ONE PLACE A `TurnResult` IS BUILT.
 *
 * Every projection is read out of `body`, so a lane cannot claim one thing in its typed fields and
 * send another to the client. A lane that omits a key gets `null` / `[]` / `false` — which is the
 * truth about that lane, not a default standing in for one.
 */
export function makeTurnResult(
  lane: LaneName,
  body: Record<string, unknown>,
  status = 200,
): TurnResult {
  const prov = body.provenance
  const provenance =
    prov && typeof prov === 'object' && Array.isArray((prov as TurnProvenance).anchors)
      ? (prov as TurnProvenance)
      : null

  return {
    lane,
    status,
    body,
    text: str(body.response),
    blocks: Array.isArray(body.blocks) ? (body.blocks as AskBlock[]) : null,
    followups: Array.isArray(body.followups) ? (body.followups as string[]) : null,
    action: body.action ?? null,
    conversationId: str(body.conversation_id),
    intent: str(body.intent),
    provenance,
    // `model_used` is what the client reads; `ai_mode` is its twin on every lane that sets either.
    model: str(body.model_used) ?? str(body.ai_mode),
    costCents: num(body.cost_usd_cents),
    toolCalls: Array.isArray(body.tool_calls) ? (body.tool_calls as ToolCallSummary[]) : [],
    downloads: Array.isArray(body.downloads) ? (body.downloads as Download[]) : null,
    usedCouncil: body.used_council === true,
    servedBy: str(body.served_by),
    degradedVia: str(body.degraded_via),
    stopped: body.stopped === true,
    incomplete: body.incomplete === true,
    error: str(body.error),
  }
}

/** Stage 5's pass-through for M17. M18 replaces the argument, not the shape. */
export function withVerification(result: TurnResult, verified: Verification): VerifiedResult {
  return { result, verified }
}

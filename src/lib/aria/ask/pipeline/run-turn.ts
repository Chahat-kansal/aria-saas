/**
 * M17 · BRAIN-1 PHASE 2 — THE SPINE. Six stages, every turn, no way round any of them.
 *
 *     understand → decide → ground → act → verify → render
 *
 * ⚠️ TWO CORRECTIONS TO THE SPRINT DOCUMENT, BOTH FORCED BY THE CODE.
 *
 * **1 · `ground` and `decide` are the other way round.** The sprint's diagram reads
 * `understand → ground → decide`, but its own phase-2 text says `ground()` "builds whatever context
 * each lane builds today, **keyed by strategy**". Grounding keyed by strategy cannot run before the
 * strategy is known; the two sentences cannot both be obeyed. Measured, every lane condition in
 * `_POST` is a boolean over `intent`, `ariaIntent`, the features and the conversation id — so
 * `decide()` is a pure function and can run first, which is the reading that makes the rest true.
 *
 * **This is the one place M17's structure is honest-but-not-yet-the-goal, and it is worth being
 * plain about**: grounding still depends on the lane, which is flaw 2 of the logic read — "the
 * decision is made before grounding exists". **M18 is the sprint that inverts it**: once a lean
 * envelope is loaded unconditionally, `ground()` stops needing the strategy and moves back in
 * front. Doing it here would be a behaviour change, and a structural sprint that also changes
 * behaviour cannot prove it changed nothing.
 *
 * **2 · `decide()` returns an ORDERED LIST of candidates, not one name.** Five lanes *fall through
 * on failure* today — `inventory_agent` (catch → "fall through to main tool loop"), `multi_domain`
 * (catch → "fall back"), `deliverable` (catch → "fall back to text"), `background_task` (catch →
 * "falling through"), and `council` (catch → "falling back to single-model"). Two more decline
 * without failing: `pending_action` only applies when a pending row exists AND `isConfirmation()`,
 * and `inventory_agent` only when `handleInventoryQuestion()` reports `handled`. A single chosen
 * name cannot express that, and flattening it would change behaviour on every one of those paths.
 * So `act()` walks the candidates in source order until one produces a result — which is exactly
 * what the waterfall does today, with the fall-through made explicit instead of implied by where a
 * `try` block happens to end.
 *
 * ⚠️ WHAT IS NOT HERE, ON PURPOSE: `verify()` is a pass-through stamping `{ ran: false }` (M18),
 * the constitution is not moved onto the council lane, no anchors are added to any turn, and not
 * one of the 25 regexes is deleted or reworded (M19).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyIntent, detectOutputFormat } from '@/lib/aria/ask/intent'
import { classifyAriaIntent } from '@/lib/aria/ask/aria-intent'
import { isConfirmation } from '@/lib/aria/ask/action-planner'
import { classifyInventoryIntent } from '@/lib/inventory/owner-agent'
import { classifyDeliverableKind } from '@/lib/aria/deliverables'
import type { NoticeRef } from '@/lib/aria/notice-context'
import { extractFeatures, firedFeatures } from './features'
import { render } from './render'
import {
  makeTurnResult,
  withVerification,
  type FeatureName,
  type LaneName,
  type Strategy,
  type TurnGrounding,
  type TurnRecord,
  type TurnResult,
  type Understanding,
  type VerifiedResult,
} from './types'

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE TURN
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Everything `_POST` has after parsing the request, and nothing it derives afterwards. */
export interface TurnInput {
  readonly req: Request
  readonly bid: string
  readonly userId: string
  readonly supabase: SupabaseClient
  readonly message: string
  readonly conversationId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly attachments: any[]
  readonly clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  readonly noticeRef: NoticeRef | null
  readonly branchIntent: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number }
  readonly onToken?: (t: string) => void
  readonly signal?: AbortSignal
}

/** What a strategy is handed. Phase 3 moves each lane's body behind this. */
export interface StrategyContext {
  readonly input: TurnInput
  readonly understanding: Understanding
  readonly grounding: TurnGrounding
  readonly strategy: Strategy
}

/**
 * A lane. Returns a `TurnResult`, or **null to decline** — which is how the seven fall-through lanes
 * keep behaving as they do today. Never an HTTP response: `scripts/ask-one-exit-guard.ts` fails the
 * push on one.
 */
export type StrategyFn = (c: StrategyContext) => Promise<TurnResult | null>

export type StrategyRegistry = Readonly<Partial<Record<LaneName, StrategyFn>>>

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 1 — UNDERSTAND
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The same two classifiers `_POST` runs at line 441, in the same `Promise.all`, with the same
 * arguments — and the 25 regex features, moved out of the middle of the function.
 *
 * ⚠️ BOTH CLASSIFIERS STILL RUN AND NOTHING RECONCILES THEM. That is the point of M17 being
 * structural: `intent.type` and `ariaIntent.intent_type` have different vocabularies and the lane
 * conditions OR them together, so a turn takes the general lane if *either* says so. Two classifiers
 * with an OR is strictly less accurate than one, because every false positive from either fires.
 * **M19 replaces the pair.** Here they are carried side by side, unchanged, so the replacement can
 * be measured against 30 days of real messages rather than argued about.
 */
export async function understand(input: TurnInput): Promise<Understanding> {
  const { message, bid } = input
  const [intent, ariaIntent] = await Promise.all([
    classifyIntent(message, undefined, bid),
    classifyAriaIntent(message, bid),
  ])
  const hasImages = input.attachments.some(a => a?.kind === 'image')
  const features = extractFeatures({
    message,
    intent,
    ariaIntent,
    conversationId: input.conversationId,
    clientMessageCount: input.clientMessages.length,
    attachmentCount: input.attachments.length,
    hasImages,
  })
  return {
    message,
    intent,
    ariaIntent,
    outputFmt: detectOutputFormat(message),
    features,
    firedFeatures: firedFeatures(features),
    hasAttachments: input.attachments.length > 0,
    hasImages,
    hasConversation: !!input.conversationId || input.clientMessages.length > 0,
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 3 — DECIDE  (runs before ground; see the header)
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function candidate(name: LaneName, reason: string, fired: readonly FeatureName[]): Strategy {
  return { name, reason, firedFeatures: fired }
}

/**
 * REPRODUCES `_POST`'s LANE SELECTION EXACTLY, IN THE SAME ORDER.
 *
 * Read this against route.ts top to bottom: every entry is the same condition at the same point in
 * the waterfall. The admission gates (rate limits, cost guard, ceiling) are not here because they
 * are decided by live state rather than by the message — `runTurn` runs them as stage 0 and their
 * results still pass through `verify()` and `render()`, so they are lanes, not exceptions.
 *
 * ⚠️ THE ORDER IS THE BEHAVIOUR. Moving an entry up or down this list changes which lane answers a
 * message, which is the single most dangerous edit anyone can make in this file.
 */
export function decide(u: Understanding, input: TurnInput): Strategy[] {
  const f = u.features
  const fired = u.firedFeatures
  const out: Strategy[] = []

  // ⚠️ `save_plan` IS NOT OFFERED HERE. route.ts:372 puts it BEFORE the classifiers and before the
  // spend gates, so it runs as `RunTurnOptions.savePlanGate` — see the note there. Deciding it needs
  // a string compare, not an `Understanding`, and offering it here would mean a UI sentinel paid for
  // two classifier calls and could be refused by a budget it never spends.
  // `features.isSavePlan` still exists and still fires; nothing reads it at this point.

  // route.ts:457 — `convPending?.pending_action && isConfirmation(message)`. The message half is a
  // pure function and is tested here; the DB half needs a read, so the lane DECLINES when no
  // pending row exists. Splitting it this way is what keeps the lane off every turn that merely
  // has a conversation id.
  if (input.conversationId && isConfirmation(u.message)) {
    out.push(candidate('pending_action', 'conversationId && isConfirmation()', fired))
  }

  // route.ts:618
  if (f.isAgentCompose) out.push(candidate('agent_composer', 'AGENT_COMPOSE_RE', fired))

  // route.ts:679
  if (f.planTrigger) out.push(candidate('action_planner', 'planTrigger', fired))

  // route.ts:743 — `classifyInventoryIntent(message) !== 'none'`. Pure and synchronous, so it is
  // called HERE rather than the lane being offered every turn. The lane still DECLINES when
  // handleInventoryQuestion() reports handled:false, and falls through on a thrown error.
  const invIntent = classifyInventoryIntent(u.message)
  if (invIntent !== 'none') {
    out.push(candidate('inventory_agent', 'classifyInventoryIntent=' + invIntent, fired))
  }

  // route.ts:798 — NAV_FASTPATH is env-gated OFF in production. The gate is a ROUTING decision, so
  // it lives here rather than in feature extraction; with the flag unset this never runs, exactly
  // as today.
  if (process.env.NAV_FASTPATH === '1' && f.isNavQuestion) {
    out.push(candidate('nav_fastpath', 'NAV_FASTPATH=1 && NAV_PATTERN', fired))
  }

  // route.ts:824 — THE GENERAL LANE. Runs before any business context exists (M12).
  if (!f.isCoreferentialFollowup
      && (u.intent.type === 'general' || u.ariaIntent.intent_type === 'general' || u.ariaIntent.intent_type === 'smalltalk')) {
    out.push(candidate(
      'general',
      u.intent.type === 'general' ? 'classifyIntent=general'
        : u.ariaIntent.intent_type === 'general' ? 'classifyAriaIntent=general'
        : 'classifyAriaIntent=smalltalk',
      fired,
    ))
  }

  // route.ts:930 — falls through on error.
  if (f.isMultiDomain) out.push(candidate('multi_domain', 'MULTI_DOMAIN_TRIGGERS', fired))

  // route.ts:964 — `deliverableKind && !isMultiDomain && ariaIntent==='artifact_request' &&
  // !SPREADSHEET_RE`. classifyDeliverableKind() is pure, so the full condition is evaluated here.
  // The lane falls through to text on a generation error.
  const deliverableKind = classifyDeliverableKind(u.message)
  if (deliverableKind && !f.isMultiDomain && u.ariaIntent.intent_type === 'artifact_request' && !f.isSpreadsheetRequest) {
    out.push(candidate('deliverable', 'classifyDeliverableKind=' + deliverableKind + ' && ariaIntent=artifact_request', fired))
  }

  // route.ts:1009 — falls through on error.
  if (f.isBackgroundTask) out.push(candidate('background_task', 'complex && BACKGROUND_TRIGGERS', fired))

  // route.ts:1091 — THE COUNCIL GATE. Falls through to the main loop when the council fails or
  // returns no briefing.
  if (!f.isBrevityQuestion && !f.isDataLookup && (f.isStrategicQuestion || u.ariaIntent.intent_type === 'analytical')) {
    out.push(candidate(
      'council',
      f.isStrategicQuestion ? 'isStrategicQuestion' : 'ariaIntent=analytical',
      fired,
    ))
  }

  // ⚠️ `image`, `stopped` and `total_outage` ARE NOT CANDIDATES. They are SUB-EXITS OF `main`, and
  // getting this wrong would have been a silent behaviour change of exactly the kind this sprint
  // exists to avoid making.
  //
  // The image fast-path is at route.ts:2362 — AFTER `buildAskAriaContext()` at 1517, which is 19 DB
  // queries. It never reads `ctx` (checked: zero references between 2358 and 2392), so offering it
  // as a candidate ahead of `main` would render a byte-identical body while skipping those 19
  // queries. Phase 6 compares rendered JSON and would have called that "no diff". It is still a
  // change, and "behaviour identical" is this sprint's whole standard.
  //
  // `stopped` (2470, the owner pressed Stop) and `total_outage` (2536, every provider down) are
  // unambiguously inside the main lane's flow for the same reason. All three are reachable only
  // once `main` is running, so `main` returns a TurnResult whose `lane` names whichever exit it
  // actually took.

  // route.ts:2746 — the main tool loop. ALWAYS LAST, AND ALWAYS PRESENT: it is the only lane that
  // never declines, which is what makes the waterfall total.
  out.push(candidate('main', 'no earlier lane claimed the turn', fired))
  return out
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 2 — GROUND
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * WHAT THIS LANE LOADS BEFORE IT ANSWERS.
 *
 * In M17 it reports the KIND and the strategies build the context themselves, because the council's
 * context build lives inside a `try` whose `catch` falls back to the single-model path — hoisting it
 * out would change what happens when `getBusinessContext()` throws, which is a behaviour change.
 * "Move, don't rewrite" is the instruction and this is where it bites.
 *
 * ⚠️ SO THIS STAGE IS CHEAP TODAY, AND IT IS NEVER ABSENT. That distinction is the sprint's own:
 * "a stage may be cheap but never absent". M18 is where it starts loading the lean envelope and
 * `'none'` disappears from this function.
 */
export function ground(_input: TurnInput, _u: Understanding, strategy: Strategy): TurnGrounding {
  switch (strategy.name) {
    case 'council':
      // getBusinessContext + buildFactsPacket + the live ground-truth anchors, built in the lane.
      return { kind: 'council', bizCtx: '', augCtx: '', anchors: [], provenance: null }
    case 'main':
    case 'image':
      // buildAskAriaContext at the scope the intent asked for, built in the lane.
      return { kind: 'full', ctx: undefined as never }
    default:
      // ⚠️ NOT AN ASPIRATION — AN ACCURATE DESCRIPTION. The general lane and the fast paths load no
      // business context at all. That is flaw 2 of the logic read, stated in a value for the first
      // time instead of being implied by where a `return` happens to sit.
      return { kind: 'none' }
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 4 — ACT
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

export interface ActOutcome {
  readonly result: TurnResult
  readonly chosen: Strategy
  /** Lanes that were offered the turn and declined, in order. The waterfall, as a value. */
  readonly declined: readonly LaneName[]
}

/**
 * Walks the candidates until one produces a result. A lane that returns `null` has DECLINED — the
 * `try/catch → fall through` shape `_POST` uses seven times over, made explicit.
 *
 * A lane that THROWS is not the same as one that declines: today five lanes catch their own errors
 * and fall through, and they keep doing that inside their own bodies. An exception that escapes a
 * strategy escapes `runTurn` too, so `withBusinessContext` still handles it exactly as it does now.
 */
export async function act(
  candidates: readonly Strategy[],
  registry: StrategyRegistry,
  input: TurnInput,
  u: Understanding,
): Promise<ActOutcome> {
  const declined: LaneName[] = []
  for (const strategy of candidates) {
    const fn = registry[strategy.name]
    if (!fn) {
      throw new Error(
        `[ask/pipeline] no strategy registered for lane "${strategy.name}". `
        + 'Every lane in LANE_NAMES must be registered before runTurn() is wired to the route — '
        + 'see assertRegistryComplete().',
      )
    }
    const grounding = ground(input, u, strategy)
    const result = await fn({ input, understanding: u, grounding, strategy })
    if (result) return { result, chosen: strategy, declined }
    declined.push(strategy.name)
  }
  // Unreachable while 'main' is always last and never declines — but a silent undefined here would
  // be a blank answer to a paying owner, so it is loud.
  throw new Error(
    '[ask/pipeline] every lane declined, including main. Candidates: '
    + candidates.map(c => c.name).join(' → '),
  )
}

/**
 * ⚠️ ANTI-VACUITY FOR THE REGISTRY. Phase 4 calls this at the wiring point so a missing lane is a
 * startup error rather than a 500 on the one message that happens to route to it.
 */
export function assertRegistryComplete(registry: StrategyRegistry, lanes: readonly LaneName[]): string[] {
  return lanes.filter(l => typeof registry[l] !== 'function')
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * STAGE 5 — VERIFY
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ A PASS-THROUGH, DELIBERATELY, AND THE REASON IS RECORDED IN THE VALUE.
 *
 * The verifier exists (route.ts:2567) behind five booleans, positioned after the council exit that
 * carries every request it was written for. M9 measured it running about once in three months.
 * M17's job is to put a stage here that nothing can get past; M18's job is to make it do something.
 * Returning `{ ran: false }` WITHOUT a reason would be the same silence in a new place, so the type
 * forbids it.
 */
export function verify(result: TurnResult): VerifiedResult {
  return withVerification(result, {
    ran: false,
    reason: 'M18 — the verifier is not on this stage yet; M17 built the stage it will run on',
  })
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * runTurn
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** What the route's parser hands back. Everything `_POST` used to read off the request inline. */
export interface ParsedTurn {
  readonly message: string
  readonly conversationId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly attachments: any[]
  readonly clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  readonly noticeRef: NoticeRef | null
  readonly branchIntent: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number }
}

/** What the route knows before it has read the body. */
export interface TurnEnvelope {
  readonly req: Request
  readonly bid: string
  readonly userId: string
  readonly supabase: SupabaseClient
  readonly onToken?: (t: string) => void
  readonly signal?: AbortSignal
}

export interface RunTurnOptions {
  readonly registry: StrategyRegistry

  /**
   * ⚠️ THE ORDERING LIVES HERE, AND THAT IS THE WHOLE POINT OF A SPINE.
   *
   * `_POST` interleaved its gates with its parse and with one lane. Reproducing that order inside
   * one function is what lets the route become a single call without changing what happens:
   *
   *     route.ts:316   beforeParse   the per-user limit — BEFORE the body is read
   *     route.ts:330   parse
   *     route.ts:366   afterParse    needs the parsed message
   *     route.ts:372   savePlanGate  a LANE, run here because it precedes the spend gates AND the
   *                                  classifiers — see its own note below
   *     route.ts:403   spendGates    cost guard · per-minute · daily ceiling
   *     route.ts:447   understand …  the six stages
   *
   * Every one of these returns a `TurnResult` or null, and a `TurnResult` from any of them still
   * passes `verify()` and leaves through `render()`.
   */
  readonly beforeParse?: (userId: string) => Promise<TurnResult | null>
  readonly parse: (req: Request) => Promise<ParsedTurn>
  readonly afterParse?: (p: ParsedTurn) => TurnResult | null
  /**
   * ⚠️ A LANE RUN AS A GATE, ON PURPOSE.
   *
   * `[ARIA_SAVE_PLAN]` is a UI sentinel at route.ts:372 that makes NO model call and costs nothing.
   * It sits before the spend gates and before the classifiers, and both matter:
   *   · an owner who has exhausted the daily AI budget can still save a plan;
   *   · a sentinel never pays for two classifier calls.
   * Deciding it needs a string compare, not an `Understanding`, so it runs here rather than in
   * `decide()` — which is also why `decide()` no longer offers it.
   */
  readonly savePlanGate?: (input: TurnInput) => Promise<TurnResult | null>
  readonly spendGates?: (bid: string) => Promise<TurnResult | null>
  readonly onRecord?: (record: TurnRecord) => void
}

/** The spine. The only function the route calls, and the only path to `render()`. */
export async function runTurn(envelope: TurnEnvelope, opts: RunTurnOptions) {
  const t0 = Date.now()
  const stageMs: Record<string, number> = {}
  const mark = (name: string, from: number) => { stageMs[name] = Date.now() - from }

  const leave = (r: TurnResult, lane: string) => {
    const verified = verify(r)
    opts.onRecord?.(recordOf(r, null, { kind: 'none' }, verified, stageMs, t0, undefined, undefined, lane))
    return render(verified)
  }

  // ── stage 0a · before the body is read (route.ts:316) ────────────────────────────────────────
  let t = Date.now()
  const early = opts.beforeParse ? await opts.beforeParse(envelope.userId) : null
  mark('admit_pre', t)
  if (early) return leave(early, 'admission (pre-parse)')

  // ── parse (route.ts:320-367) ─────────────────────────────────────────────────────────────────
  t = Date.now()
  const parsed = await opts.parse(envelope.req)
  mark('parse', t)
  const input: TurnInput = { ...envelope, ...parsed }

  // ── stage 0b · needs the parsed body (route.ts:366) ──────────────────────────────────────────
  const bad = opts.afterParse ? opts.afterParse(parsed) : null
  if (bad) return leave(bad, 'admission (bad request)')

  // ── the save-plan sentinel (route.ts:372) — before the spend gates AND the classifiers ───────
  t = Date.now()
  const saved = opts.savePlanGate ? await opts.savePlanGate(input) : null
  mark('save_plan_gate', t)
  if (saved) return leave(saved, 'save_plan sentinel')

  // ── stage 0c · the spend gates (route.ts:403-440) ────────────────────────────────────────────
  t = Date.now()
  const spend = opts.spendGates ? await opts.spendGates(envelope.bid) : null
  mark('admit_spend', t)
  if (spend) return leave(spend, 'admission (spend)')

  // ── stage 1 · understand ─────────────────────────────────────────────────────────────────────
  t = Date.now()
  const understanding = await understand(input)
  mark('understand', t)

  // ── stage 3 · decide (see the header — it precedes ground in M17) ────────────────────────────
  const tDecide = Date.now()
  const candidates = decide(understanding, input)
  mark('decide', tDecide)

  // ── stages 2 + 4 · ground, then act ──────────────────────────────────────────────────────────
  const tAct = Date.now()
  const outcome = await act(candidates, opts.registry, input, understanding)
  mark('act', tAct)

  // ── stage 5 · verify ─────────────────────────────────────────────────────────────────────────
  const tVerify = Date.now()
  const verified = verify(outcome.result)
  mark('verify', tVerify)

  opts.onRecord?.(
    recordOf(outcome.result, outcome.chosen, ground(input, understanding, outcome.chosen), verified, stageMs, t0, understanding, outcome.declined),
  )

  // ── stage 6 · render — THE ONLY EXIT ─────────────────────────────────────────────────────────
  return render(verified)
}

function recordOf(
  result: TurnResult,
  chosen: Strategy | null,
  grounding: TurnGrounding,
  verified: VerifiedResult,
  stageMs: Record<string, number>,
  t0: number,
  u?: Understanding,
  declined?: readonly LaneName[],
  gate?: string,
): TurnRecord {
  return {
    lane: result.lane,
    reason: chosen?.reason ?? (gate ? gate + ' — decided before the classifiers ran' : 'admission gate — decided before the classifiers ran'),
    firedFeatures: u?.firedFeatures ?? [],
    declined: declined ?? [],
    intentType: u?.intent.type ?? 'n/a',
    ariaIntentType: u?.ariaIntent.intent_type ?? 'n/a',
    complexity: u?.intent.complexity ?? 'n/a',
    groundingKind: grounding.kind,
    verified: verified.verified,
    status: result.status,
    stageMs: { ...stageMs },
    totalMs: Date.now() - t0,
  }
}

/** Re-exported so the route imports one module. */
export { makeTurnResult }

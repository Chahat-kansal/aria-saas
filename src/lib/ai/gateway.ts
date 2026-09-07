import {
  callAnthropic,
  callAnthropicWithTools,
  type ToolLoopResult,
} from '@/lib/aria/providers/anthropic'
import { inspectTruncation, classifyOutcome, type ModelOutcome } from '@/lib/aria/truncation'

/**
 * WALL 1 (M13 phase 3) — THE MODEL GATEWAY. THE ONLY DOOR.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────────────────────────
 * Measured 6 September: **171 files construct their own Anthropic client** and **162 call
 * `.messages.create` directly**. Each of those is its own decision about failover (none), its own
 * cost logging (91 files do it differently, and the ledger undercounts by roughly half), and its
 * own view of what Aria is. M12 found the consequence at the sharp end: a lane that answered a café
 * owner's question about his business with advice about his bedroom, because nothing forced it
 * through anything.
 *
 * A helper the 171 *may* call would reach ~14% adoption — that is measured in this repo, not
 * assumed (`ARIA-ARCHAEOLOGY-1-REPORT.md`; `withErrorCapture` 886 routes versus
 * `withBusinessContext` 165). So this is a door with a guard on it, not a helper: phase 4 fails the
 * build for any NEW file that constructs a client or calls a model outside `src/lib/ai/` and
 * `src/lib/aria/providers/`.
 *
 * ── BUILT OVER THE PROVIDER, NOT BESIDE IT ─────────────────────────────────────────────────────
 * `providers/anthropic.ts` is 405 lines of working circuit-breaker, Gemini failover, prompt-cache
 * breakpoints, streaming, cancellation and cost accounting. **A third abstraction was the wrong
 * answer.** This wraps it. Everything that file already does correctly keeps happening; what this
 * adds is a single entry point, one call shape, and the guarantees below.
 *
 * ── WHAT THE GATEWAY GUARANTEES, THAT A DIRECT CALL DOES NOT ───────────────────────────────────
 *
 * 1. **THE LEDGER ROW.** `businessId` is REQUIRED here, not optional. `providers/anthropic.ts`
 *    gates its `aria_ai_calls` insert on `if (params.businessId)`, so an omitted id means the call
 *    silently costs money and appears nowhere — exactly how `intent_classifier` ran twice per turn
 *    across 412 turns with **zero** rows, ever (M12 phase 5). Making it required at the boundary is
 *    what turns "we log most calls" into "every call through this door is logged".
 *
 *    ⚠️ **The insert itself stays in the provider, deliberately.** It is already correct there and
 *    already covers the thirteen files importing the provider directly; moving it up here would
 *    silence every one of them until they migrated. The gateway guarantees the row by guaranteeing
 *    its precondition — the brief asked for logging "once, here", and one row per call is what that
 *    is for.
 *
 * 2. **TRUNCATION IS CLASSIFIED, NOT GUESSED.** Every result carries a `ModelOutcome` from the
 *    shared rail (M8/M9's `truncation.ts`) rather than each caller inventing its own idea of
 *    "did that get cut off".
 *
 * 3. **ONE SHAPE.** Tools or no tools, JSON or prose, the caller sends `AriaModelRequest` and gets
 *    `AriaModelResult`. The two provider entry points stop being a choice callers have to make.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────────────────────────
 * **It does not choose the model.** The caller's `model` is passed through unchanged. Routing
 * intelligence is M14's, and a wall that quietly changed which model answered would be impossible
 * to distinguish from a wall that broke something. One change at a time.
 */

export type AriaModel = 'haiku' | 'sonnet' | 'opus'

/** Mirrors the provider's own union so a caller cannot invent a role the CHECK constraint rejects. */
type AgentKey = Parameters<typeof callAnthropic>[0]['agentKey']
type AgentRole = Parameters<typeof callAnthropic>[0]['role']

export interface AriaModelRequest {
  /**
   * REQUIRED. Not optional, and this is the point — see guarantee 1 above. A call that cannot name
   * the business it is for is a call nobody can attribute, bill, or find later.
   */
  businessId: string
  agentKey: AgentKey
  role: AgentRole
  /** Passed through UNCHANGED. The gateway never re-routes; that is M14. */
  model: AriaModel
  systemPrompt: string
  /**
   * Matches the PROVIDER's own width rather than narrowing it. Ask Aria sends multimodal content
   * blocks (an array) when the owner attaches an image; a `string`-only gateway would have forced
   * that lane to keep bypassing the door, which is the opposite of the point.
   */
  userPrompt: string | unknown[]
  maxTokens?: number
  /**
   * M13B phase 1 — NOW FORWARDED. M13 accepted this and dropped it, because the provider had no
   * such field; that was recorded rather than hidden, and this is the commit that closes it. The
   * answer council runs advisors at 0.25 and synthesis at 0.2, so migrating it behind the wall
   * would otherwise have changed the model's behaviour in the same commit as its plumbing.
   */
  temperature?: number
  requestSummary?: string

  /** Tool-loop only. Supplying `tools` selects the tool path; omitting it selects the plain path. */
  tools?: unknown[]
  executeTool?: (name: string, input: unknown) => Promise<unknown> | unknown
  priorMessages?: Array<{ role: 'user' | 'assistant'; content: unknown }>
  maxIterations?: number
  thinking?: { enabled: boolean; budget_tokens?: number }
  toolChoice?: { type: 'tool'; name: string } | { type: 'auto' }
  onToken?: (text: string) => void
  signal?: AbortSignal
  timeoutMs?: number
}

export interface AriaModelResult<T = Record<string, unknown>> {
  ok: boolean
  /** Parsed JSON when the caller supplied a fallback shape; otherwise null. */
  data: T | null
  raw: string
  cost_cents: number
  latency_ms: number
  provider: 'anthropic' | 'google' | 'none'
  tool_calls: Array<{ name: string; input: unknown; result: unknown; ms: number }>
  iterations: number
  /**
   * From the shared truncation rail. `ok_at_ceiling` and `truncated_mid_structure` are the two the
   * caller must not treat as ordinary success — M8 shipped four advisors that did.
   */
  outcome: ModelOutcome
  error_message?: string | null
  /**
   * Carried through from the provider rather than dropped. A gateway that returns LESS than the
   * thing it wraps forces callers to keep the old path for the one field they need — the surest way
   * to end up with a door people walk around.
   */
  success: boolean
  thinking_tokens: number
}

/**
 * THE ONE CALL.
 *
 * Every Aria model call goes through here. Pass `tools` for the tool loop, omit it for a plain
 * completion; pass `fallback` to have the reply parsed as JSON.
 */
export async function callModel<T = Record<string, unknown>>(
  req: AriaModelRequest,
  fallback?: T,
): Promise<AriaModelResult<T>> {
  // The precondition that makes the ledger row a guarantee rather than a habit. Thrown rather than
  // defaulted: a silently-unattributed call is the failure this wall exists to end, and a default
  // business id would be a fabricated attribution, which is worse.
  if (!req.businessId) {
    throw new Error('[ai/gateway] businessId is required — an unattributed model call cannot be logged, billed, or found later')
  }

  if (req.tools && req.executeTool) {
    const res: ToolLoopResult = await callAnthropicWithTools({
      model: req.model,
      systemPrompt: req.systemPrompt,
      userPrompt: req.userPrompt as never,
      priorMessages: req.priorMessages as never,
      tools: req.tools as never,
      executeTool: req.executeTool as never,
      maxTokens: req.maxTokens,
      maxIterations: req.maxIterations,
      thinking: req.thinking,
      toolChoice: req.toolChoice,
      onToken: req.onToken,
      signal: req.signal,
      timeoutMs: req.timeoutMs,
      businessId: req.businessId,
      agentKey: req.agentKey,
      role: req.role,
      requestSummary: req.requestSummary,
    })
    return {
      ok: res.success,
      data: null,
      raw: res.raw,
      cost_cents: res.cost_cents,
      latency_ms: res.latency_ms,
      provider: res.success ? 'anthropic' : 'none',
      tool_calls: res.tool_calls,
      iterations: res.iterations,
      // The tool loop stops on its own terms rather than at a token ceiling, so a completed loop is
      // 'ok'. Claiming a truncation check it did not perform would be worse than not claiming one.
      outcome: res.success ? 'ok' : 'unparseable',
      error_message: res.error_message ?? null,
      success: res.success,
      thinking_tokens: res.thinking_tokens,
    }
  }

  const res = await callAnthropic<T>(
    {
      model: req.model,
      systemPrompt: req.systemPrompt,
      userPrompt: req.userPrompt as string,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      businessId: req.businessId,
      agentKey: req.agentKey,
      role: req.role,
    },
    (fallback ?? null) as T,
  )

  // The shared rail, not a per-caller guess. `inspectTruncation` reads Anthropic's stop_reason and
  // classifyOutcome pairs it with whether the reply actually parsed.
  //
  // ⚠️ "PARSED" MEANS SOMETHING DIFFERENT FOR PROSE THAN FOR JSON, and conflating them was a real
  // defect in the first version of this file: a plain-prose call that replied "OK" was classified
  // `unparseable`, because no JSON came back — from a call that never asked for any. Caught by
  // running it rather than reading it. A caller that supplied a `fallback` wanted JSON and is judged
  // on whether it got some; a caller that did not is judged on whether it got any text at all.
  const check = inspectTruncation(res)
  const wantedJson = fallback !== undefined
  const parsed = wantedJson
    ? (res.data !== null && res.data !== undefined && res.data !== fallback)
    : Boolean(res.raw)
  const outcome = classifyOutcome(check, parsed)

  return {
    ok: res.success,
    data: (res.data ?? null) as T | null,
    raw: res.raw,
    cost_cents: res.cost_cents,
    latency_ms: res.latency_ms,
    provider: res.provider,
    tool_calls: [],
    iterations: 1,
    outcome,
    error_message: res.success ? null : 'provider call failed',
    success: res.success,
    // The plain path does not run a tool loop, so no extended thinking is requested or spent.
    thinking_tokens: 0,
  }
}

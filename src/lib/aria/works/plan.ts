import { runAriaModel } from '@/lib/aria/model-router'
import { capabilityMenu, CAPABILITIES } from './capabilities'
import { assemblePlan, type PlanResult, type RawPlan } from './plan-shape'

/**
 * M11 PHASE 3 / M11B PHASE 1 — ASKING A MODEL FOR A PLAN.
 *
 * ⚠️ SERVER ONLY. This module reaches `model-router`, and through it the Anthropic SDK, which
 * imports `node:path`. A client component that imports from here fails the webpack build with
 * `UnhandledSchemeError` — which is exactly what happened, and why the plan's SHAPE now lives in
 * `plan-shape.ts`. If you need types, `markFor`, `assemblePlan` or `renderPlan` in a component,
 * import them from `./plan-shape`.
 *
 * Every symbol in `plan-shape.ts` is re-exported below, so nothing that already imported from this
 * file has to change.
 */

export * from './plan-shape'

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

7. "payload" carries the arguments the step needs — a product name or id, a quantity, a date. Put
   in only what you were actually told or can read from the context. Leave it {} if you do not know:
   an executor that is missing an argument says so, and a guessed product id changes the wrong
   product.

Return JSON only:
{"title":"...","steps":[{"capability":"<id or null>","title":"...","detail":"...","payload":{}}],
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
    schema: { title: 'string', steps: [{ capability: 'string', title: 'string', detail: 'string', payload: {} }], cannot_plan: 'boolean', cannot_plan_reason: 'string' },
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

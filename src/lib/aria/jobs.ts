import type { AriaTask } from '@/lib/aria/model-router'

/**
 * MS15 PHASE 2 — CALL SITES DECLARE A JOB, NOT A MODEL.
 *
 * Aria cannot win on model choice; every competitor has the same models. It wins on the harness —
 * and the first property of a good harness is that swapping a model is one line in one file
 * instead of an archaeology expedition across 174 call sites.
 *
 * FOUR JOBS, because there are four genuinely different things being asked for:
 *   J1 judgement  — a recommendation an owner will act on. Depth matters more than cost.
 *   J2 precompute — scheduled, high-volume, nobody is waiting. Cost and throughput matter most.
 *   J3 extraction — schema-bound: pull structured data out of text. The cheapest model that
 *                   reliably holds the schema is the right one; "smarter" buys nothing.
 *   J4 build_coding — build-time work. NOT a runtime job, and deliberately has no runtime model:
 *                   naming it keeps the taxonomy honest instead of implying three jobs exist.
 *
 * THIS PHASE CHANGES HOW THE CHOICE IS EXPRESSED, NOT WHAT IT IS. Every task below maps to the
 * exact model it already used — asserted byte-for-byte in jobs.test.ts against the previous
 * SMART_TASKS ternary. A model swap is a separate, measurable decision, and MS15 phase 4 builds
 * the ruler for it first.
 */

export type AriaJob = 'judgement' | 'precompute' | 'extraction' | 'build_coding'

/**
 * Job → model. THE one place a model is chosen at runtime.
 *
 * `build_coding` is null on purpose: it is not a runtime job, and a null here means a call site
 * that claims it gets a loud failure rather than a silent default to something expensive.
 */
export const JOB_MODEL: Record<AriaJob, string | null> = {
  // Today's SMART_TASKS model, unchanged. See MODEL_CANDIDATES for what this could become.
  judgement: 'claude-sonnet-4-6',
  precompute: 'claude-haiku-4-5-20251001',
  extraction: 'claude-haiku-4-5-20251001',
  build_coding: null,
}

/**
 * Candidates recorded, NOT applied. The decision table for this sprint is explicit: do not swap
 * any model here — the point is to make swapping measurable first (phase 4's eval set). Each of
 * these is a one-line change to JOB_MODEL once there is a score to move.
 */
export const MODEL_CANDIDATES: ReadonlyArray<{ job: AriaJob; candidate: string; rationale: string }> = [
  { job: 'judgement', candidate: 'claude-opus-4-5-20251101', rationale: 'The sprint brief describes J1 as Opus-class. Judgement output is what an owner acts on, and it is the lowest-volume job — the tier upgrade costs least here and is worth most. Blocked on: an eval score to prove it moves quality.' },
  { job: 'extraction', candidate: 'a cheaper schema-holding model', rationale: 'J3 only needs to hold a schema, not reason. It currently shares precompute’s model because that is what it used before this phase — not because it was chosen. Blocked on: schema-adherence measurement per model.' },
]

/**
 * Task → job. Every AriaTask appears exactly once; jobs.test.ts asserts exhaustiveness, so a new
 * task cannot be added without deciding what KIND of work it is.
 */
export const TASK_JOB: Record<AriaTask, AriaJob> = {
  // J1 — an owner acts on these. (Exactly the previous SMART_TASKS set.)
  reorder_plan: 'judgement',
  profit_leak: 'judgement',
  supplier_risk: 'judgement',
  explain: 'judgement',
  // M11 phase 3. Added AFTER MS15, so it has no "previous model" — see jobs.test.ts.
  work_plan: 'judgement',

  // J2 — scheduled/high-volume; nobody is waiting on them.
  daily_briefing: 'precompute',
  business_health: 'precompute',
  sales_analysis: 'precompute',
  inventory_analysis: 'precompute',
  customer_winback: 'precompute',
  staff_analysis: 'precompute',

  // J3 — schema-bound: text in, structure out.
  csv_mapping: 'extraction',
  sms_draft: 'extraction',
  chat: 'extraction',
  fallback: 'extraction',
}

/**
 * The same four jobs, per provider. The gateway falls over to OpenAI and OpenRouter when
 * Anthropic is unavailable — which, with a 60% Anthropic failure rate, is the path a great many
 * live calls actually take. Those fallbacks were choosing models by the same smart-vs-routine
 * ternary, so they get the same treatment: the choice lives here, once, per provider.
 *
 * Every string below is EXACTLY what that provider path used before this phase.
 */
export const JOB_MODEL_BY_PROVIDER: Record<'anthropic' | 'openai' | 'openrouter', Record<AriaJob, string | null>> = {
  anthropic: JOB_MODEL,
  openai: {
    judgement: 'gpt-4o',
    precompute: 'gpt-4o-mini',
    extraction: 'gpt-4o-mini',
    build_coding: null,
  },
  openrouter: {
    judgement: 'anthropic/claude-sonnet-4-6',
    precompute: 'openai/gpt-4o-mini',
    extraction: 'openai/gpt-4o-mini',
    build_coding: null,
  },
}

/**
 * True for work an owner acts on. The OpenRouter FREE floor picks between two env-supplied model
 * slugs rather than literals, so it needs the job *distinction* without a model string.
 */
export function isJudgementTask(task: AriaTask): boolean {
  return jobForTask(task) === 'judgement'
}

/** The model for a task on a specific provider. Same resolution, same one file. */
export function modelForTaskOnProvider(task: AriaTask, provider: 'anthropic' | 'openai' | 'openrouter'): string {
  const job = jobForTask(task)
  const model = JOB_MODEL_BY_PROVIDER[provider][job]
  if (!model) throw new Error(`[jobs] task "${task}" maps to job "${job}", which has no runtime model on ${provider}`)
  return model
}

export function jobForTask(task: AriaTask): AriaJob {
  return TASK_JOB[task] ?? 'extraction'
}

/** The model for a job, or null when the job has no runtime model (build_coding). */
export function modelForJob(job: AriaJob): string | null {
  return JOB_MODEL[job]
}

/**
 * The model a task runs on — resolved through its JOB, never chosen at the call site.
 *
 * Throws for a job with no runtime model. A build-time job reaching a runtime router is a bug in
 * the caller, and a silent fallback would hide it behind whatever model the default happened to
 * be — the exact class of quiet mis-routing this phase exists to make impossible.
 */
export function modelForTask(task: AriaTask): string {
  const job = jobForTask(task)
  const model = modelForJob(job)
  if (!model) throw new Error(`[jobs] task "${task}" maps to job "${job}", which has no runtime model`)
  return model
}

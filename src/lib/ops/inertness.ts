/**
 * MS15 PHASE 5 — HAS THIS EVER LANDED A ROW?
 *
 * `tsc 0 + build 0` cannot tell working code from inert code, and this repo has TEN recorded
 * instances of "exists, looks correct, does nothing" — the newest being trackUsage, where a
 * PostgREST builder was constructed and binned without ever dispatching, so five live call sites
 * wrote precisely zero rows for the life of the file.
 *
 * COLD IS NOT BROKEN, and that distinction is the entire point. A feature nobody has used yet is
 * cold: expected, uninteresting, and NOT an error. A feature that used to write and stopped is
 * stale, which is alarming. A feature that has never written despite the thing it measures
 * happening is the dangerous one. Conflating them produces an alert list nobody reads — which is
 * how the last ten got through.
 */

export type WriterState = 'warm' | 'cold' | 'stale'

export interface WriterExpectation {
  /** What is written. */
  target: string
  /** What is supposed to write it. */
  writer: string
  /** When that writer shipped — a writer deployed yesterday being cold means nothing. */
  deployedAt: string
  /**
   * Whether the thing it records should have happened by now. FALSE for a feature awaiting its
   * first real use (nobody has built an agent yet); TRUE when the trigger has definitely
   * occurred and the absence of rows is therefore evidence of a fault.
   */
  triggerHasOccurred: boolean
  /** Days without a row after which a previously-warm writer is stale. */
  staleAfterDays?: number
  note?: string
}

export interface WriterObservation {
  rowCount: number
  lastRowAt: string | null
}

export interface WriterVerdict {
  target: string
  writer: string
  state: WriterState
  /** cold with triggerHasOccurred is the one that needs a human; everything else is information. */
  suspicious: boolean
  daysSinceDeploy: number
  daysSinceLastRow: number | null
  detail: string
}

const DAY_MS = 86_400_000

function daysBetween(from: string | number | Date, to: Date): number {
  const t = new Date(from).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((to.getTime() - t) / DAY_MS))
}

/**
 * Classify one writer. PURE — observations are passed in, so this is testable without a database
 * and cannot itself become another thing that silently does nothing.
 */
export function classifyWriter(
  expectation: WriterExpectation,
  observed: WriterObservation,
  now: Date = new Date(),
): WriterVerdict {
  const daysSinceDeploy = daysBetween(expectation.deployedAt, now)
  const daysSinceLastRow = observed.lastRowAt ? daysBetween(observed.lastRowAt, now) : null

  if (observed.rowCount === 0) {
    return {
      target: expectation.target,
      writer: expectation.writer,
      state: 'cold',
      // A writer whose trigger has genuinely happened and STILL has no rows is the trackUsage
      // shape. One whose trigger has not happened yet is simply unused.
      suspicious: expectation.triggerHasOccurred,
      daysSinceDeploy,
      daysSinceLastRow: null,
      detail: expectation.triggerHasOccurred
        ? `No rows in ${daysSinceDeploy} days since deploy, and the event it records HAS occurred — this is not "unused", it is not working.`
        : `No rows in ${daysSinceDeploy} days since deploy. The event it records has not happened yet, so this is expected.`,
    }
  }

  const staleAfter = expectation.staleAfterDays ?? 7
  if (daysSinceLastRow !== null && daysSinceLastRow > staleAfter) {
    return {
      target: expectation.target,
      writer: expectation.writer,
      state: 'stale',
      suspicious: true, // it worked once and stopped — always worth a look
      daysSinceDeploy,
      daysSinceLastRow,
      detail: `Wrote ${observed.rowCount} rows but nothing for ${daysSinceLastRow} days (threshold ${staleAfter}). It worked once and stopped.`,
    }
  }

  return {
    target: expectation.target,
    writer: expectation.writer,
    state: 'warm',
    suspicious: false,
    daysSinceDeploy,
    daysSinceLastRow,
    detail: `${observed.rowCount} rows, most recent ${daysSinceLastRow ?? 0} days ago.`,
  }
}

/**
 * THE REGISTRY — every writer this ledger watches, and when it shipped.
 *
 * Adding a writer here is how a future sprint's "exists, looks correct" code gets caught. Deploy
 * dates are the commit dates of the sprints that shipped them.
 */
export const WRITER_REGISTRY: readonly WriterExpectation[] = [
  {
    target: 'usage_logs',
    writer: 'trackUsage() — outlet/staff/agent/routine creation (MS14 phase 3)',
    deployedAt: '2026-08-22',
    triggerHasOccurred: true,
    note: 'Was cold for its whole life because `void builder` never dispatched. Fixed MS15 phase 1; the first rows should appear after the next outlet/staff/routine is created.',
  },
  {
    target: 'aria_business_memory (kind=house_rule)',
    writer: 'onboarding provisioning + the House Rules editor (MS14 phases 4-5)',
    deployedAt: '2026-08-22',
    triggerHasOccurred: false,
    note: 'No business has completed onboarding since the questions shipped, so zero is expected — it becomes suspicious the first time someone finishes onboarding and this stays empty.',
  },
  {
    target: 'aria_skills (kind=agent)',
    writer: 'the agent composer, on approve (MS13 phase 4)',
    deployedAt: '2026-08-22',
    triggerHasOccurred: false,
    note: 'Nobody has built an agent yet. Cold and expected.',
  },
  {
    target: 'stripe_events',
    writer: 'the Stripe lifecycle webhook (MS12 phase 4)',
    deployedAt: '2026-08-22',
    triggerHasOccurred: false,
    note: 'No Stripe products, prices or webhook endpoint exist yet, so nothing can arrive. Cold by design until Chahat completes the Stripe setup.',
  },
  {
    target: 'aria_conversation_summaries',
    writer: 'summariseConversation(), fire-and-forget after every Ask Aria turn',
    deployedAt: '2026-06-15',
    triggerHasOccurred: true,
    staleAfterDays: 14,
    note: 'ONE row in two months against 281 conversations. The write path exists and is called; the failure is inside a fire-and-forget .catch(() => {}) — RULE 7 in its purest form.',
  },
  {
    target: 'aria_advice_weights',
    writer: 'the outcome-check cron, adjustAdviceWeight()',
    deployedAt: '2026-07-16',
    triggerHasOccurred: true,
    staleAfterDays: 30,
  },
  {
    target: 'aria_action_log',
    writer: 'executeAction(), every Ask Aria action',
    deployedAt: '2026-06-25',
    triggerHasOccurred: true,
    staleAfterDays: 30,
  },
  {
    target: 'aria_task_outputs',
    writer: 'the deliverable pipeline',
    deployedAt: '2026-07-28',
    triggerHasOccurred: true,
    staleAfterDays: 30,
  },
]

/** A registered cron and when it last ran — the same question, asked of scheduled work. */
export interface CronExpectation { job: string; registeredPath: string }

export interface CronVerdict {
  job: string
  state: WriterState
  suspicious: boolean
  runs: number
  daysSinceLastRun: number | null
  detail: string
}

export function classifyCron(
  job: string,
  observed: { runs: number; lastRunAt: string | null; failures?: number },
  now: Date = new Date(),
  staleAfterDays = 3,
): CronVerdict {
  if (observed.runs === 0) {
    return {
      job, state: 'cold', suspicious: true, runs: 0, daysSinceLastRun: null,
      // A registered cron that has NEVER logged is the Smoke Suite shape: active, correct-looking,
      // and never once executed.
      detail: 'Registered but has never logged a run. It may not be firing at all.',
    }
  }
  const days = observed.lastRunAt ? daysBetween(observed.lastRunAt, now) : null
  if (days !== null && days > staleAfterDays) {
    return {
      job, state: 'stale', suspicious: true, runs: observed.runs, daysSinceLastRun: days,
      detail: `Last ran ${days} days ago after ${observed.runs} runs — it stopped.`,
    }
  }
  return {
    job, state: 'warm', suspicious: false, runs: observed.runs, daysSinceLastRun: days,
    detail: `${observed.runs} runs, last ${days ?? 0} days ago.`,
  }
}

/** Oldest-first, suspicious-first: the order you would actually work through the list. */
export function sortColdest<T extends { suspicious: boolean }>(items: T[], age: (t: T) => number): T[] {
  return [...items].sort((a, b) => {
    if (a.suspicious !== b.suspicious) return a.suspicious ? -1 : 1
    return age(b) - age(a)
  })
}

/**
 * MS15 PHASE 4 — one command, one number.
 *
 *   npx tsx scripts/run-evals.ts
 *
 * Exits non-zero when the score drops below the floor, so it can gate a change later. The floor
 * is deliberately the CURRENT score: a change that lowers it has to be a decision, not an
 * accident.
 */
import { runEvals, formatReport, perfectResponder } from '../src/lib/aria/evals/run'

const FLOOR = Number(process.env.ARIA_EVAL_FLOOR ?? '100')
const report = runEvals(perfectResponder)
console.log(formatReport(report))
if (report.score < FLOOR) {
  console.error(`[evals] score ${report.score} is below the floor of ${FLOOR}`)
  process.exit(1)
}

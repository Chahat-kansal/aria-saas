/**
 * M17 · BRAIN-1 PHASE 2 — WALL 9: ONE EXIT. The push gate.
 *
 *   npx tsx scripts/ask-one-exit-guard.ts
 *
 * A response may be constructed in exactly ONE file in the Ask Aria turn pipeline:
 * `src/lib/aria/ask/pipeline/render.ts`. Everywhere else under `pipeline/`, `strategies/`, and in
 * the turn route itself, a `NextResponse.json(…)` / `new NextResponse(…)` fails the push.
 *
 * ⚠️ THE RULE IS NOT IN THIS FILE. It is `isOneExitViolation()` in
 * `src/lib/aria/ask/pipeline/one-exit-rule.ts`, which the unit test also calls. That is the WALL 8
 * pattern: the rule enforced on push and the rule the test drives are one function, so they cannot
 * drift apart. This script only decides WHICH FILES to read and what to print.
 *
 * ⚠️ FULL-FILE SCAN, DELIBERATELY. `canon-rail-guard.ts` reads added lines only, and an added-lines
 * scanner cannot catch a REINTRODUCED line. This guards three small, new directories; reading them
 * whole costs milliseconds and cannot be fooled.
 *
 * ⚠️ IT FAILS ON SILENCE. A run that scanned nothing, or that guards a pipeline whose one exit has
 * disappeared, exits NON-ZERO with the reason. "Exists, looks correct, does nothing" is this
 * codebase's first failure pattern — a Canon Guard with 0 runs ever, a Smoke Suite with 0 runs, a
 * Deploy workflow that verified nothing in 8 seconds.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, posix, sep } from 'node:path'
import {
  ONE_EXIT_SCAN_ROOTS,
  ONE_EXIT_SCAN_FILES,
  ONE_EXIT_ALLOWLIST,
  ONE_EXIT_GRANDFATHERED,
  findOneExitViolations,
  oneExitIsIntact,
} from '../src/lib/aria/ask/pipeline/one-exit-rule'

function toPosix(p: string): string {
  return p.split(sep).join(posix.sep)
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(toPosix(full))
  }
}

function main(): void {
  const files: string[] = []
  for (const root of ONE_EXIT_SCAN_ROOTS) walk(root, files)
  for (const f of ONE_EXIT_SCAN_FILES) if (existsSync(f)) files.push(toPosix(f))

  const pairs = files.map(f => [f, readFileSync(f, 'utf8')] as const)

  // ── ANTI-VACUITY, BEFORE ANY VERDICT ────────────────────────────────────────────────────────
  const renderPath = ONE_EXIT_ALLOWLIST[0]
  const renderText = existsSync(renderPath) ? readFileSync(renderPath, 'utf8') : null
  const vacuous = oneExitIsIntact(files.length, renderText)
  if (vacuous) {
    console.error('[ask-one-exit-guard] ⚠️  THIS RUN CHECKED NOTHING MEANINGFUL: ' + vacuous)
    console.error('[ask-one-exit-guard] A guard that cannot fail is worse than no guard. Exiting non-zero.')
    process.exit(1)
  }

  const violations = findOneExitViolations(pairs)

  if (violations.length === 0) {
    console.log(
      `[ask-one-exit-guard] ${files.length} file(s) scanned whole, one exit intact (${renderPath}). Pass.`,
    )
    if (ONE_EXIT_GRANDFATHERED.length > 0) {
      console.log(
        '[ask-one-exit-guard] ⚠️  still grandfathered, and this list can only shrink: ' +
          ONE_EXIT_GRANDFATHERED.join(', '),
      )
    }
    process.exit(0)
  }

  console.error(
    `[ask-one-exit-guard] ${violations.length} response construction(s) outside the single exit:\n`,
  )
  for (const v of violations) console.error(`  ${v.file}:${v.line}\n    ${v.text}\n`)
  console.error('A lane does not return an HTTP response. It returns a TurnResult, and render() —')
  console.error(`${renderPath} — turns that into HTTP, once, after every stage has run.`)
  console.error('')
  console.error('This is the wall against the shape that produced M12\'s bathroom answer and M3\'s')
  console.error('0-of-288 missing provenance tiers: 28 exits, 22 of them before the council gate,')
  console.error('whichever condition matched first winning in source order. A new fast path that')
  console.error('returns early skips grounding, the council and the verifier, and nothing notices.')
  console.error('')
  console.error('Return makeTurnResult(lane, body, status) instead. See src/lib/aria/ask/pipeline/types.ts.')
  process.exit(1)
}

main()

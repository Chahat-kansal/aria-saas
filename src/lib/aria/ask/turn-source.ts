/**
 * M17B · PHASE 2 — THE ASK ARIA TURN, AS SOURCE TEXT, WHEREVER IT NOW LIVES.
 *
 * ⚠️ WHY THIS EXISTS. Sixteen test files read `src/app/api/aria/ask/route.ts` with `readFileSync`
 * and assert that particular code appears in it — the constitution splice, the anchor set, the
 * `advisors_lost` field, the branch modes, the thread-title call, and so on. They were written when
 * the turn WAS that one 2,820-line file.
 *
 * The turn is now a spine and twelve strategies, and the route is 182 lines that parse and delegate.
 * Every one of those assertions is still about something real and still worth holding — it just is
 * not in `route.ts` any more. Pointing them at a fixed path would have meant sixteen files quietly
 * asserting nothing, which is failure pattern #1 in its purest form: a test that passes because it
 * looks in a place where the thing cannot be.
 *
 * So they read THE TURN, not a file. When a lane moves again, this follows it.
 *
 * ⚠️ IT IS TEST SUPPORT AND NOTHING IMPORTS IT AT RUNTIME. It reads the filesystem; no request path
 * touches it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, sep, posix } from 'node:path'

/** Everything that is now "the Ask Aria turn". Order is stable so snapshots stay stable. */
export const TURN_SOURCE_PARTS = [
  'src/app/api/aria/ask/route.ts',
  'src/lib/aria/ask/pipeline',
  'src/lib/aria/ask/strategies',
] as const

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    // Test files are excluded: a test asserting on its own text would be circular.
    else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
}

let cached: string | null = null

/**
 * The concatenated source of the turn. Each file is preceded by a `// ==== <path>` banner so a
 * failing assertion can still be traced to a file.
 */
export function readTurnSource(): string {
  if (cached !== null) return cached
  const files: string[] = []
  for (const part of TURN_SOURCE_PARTS) {
    const full = join(process.cwd(), part)
    if (!existsSync(full)) continue
    if (statSync(full).isDirectory()) walk(full, files)
    else files.push(full)
  }
  cached = files
    .map(f => `\n// ==== ${f.split(sep).join(posix.sep).split('/src/').pop()}\n` + readFileSync(f, 'utf8'))
    .join('\n')
  return cached
}

/**
 * ⚠️ ANTI-VACUITY. If the walk finds nothing — a rename, a moved directory, a bad cwd — every test
 * that reads this would pass by asserting against an empty string. Call it in any suite that greps
 * the turn.
 */
export function assertTurnSourceIsReal(): string {
  const src = readTurnSource()
  if (src.length < 50_000) {
    throw new Error(
      `[turn-source] only ${src.length} characters of Ask Aria turn source found. The turn is tens of `
      + 'thousands of characters; this means the walk found nothing and every assertion against it '
      + 'would pass vacuously.',
    )
  }
  return src
}

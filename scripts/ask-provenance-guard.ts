/**
 * M18 · BRAIN-2 PHASE 4 — WALL 10: EVERY LANE STORES ITS ANCHORS. The push gate.
 *
 *   npx tsx scripts/ask-provenance-guard.ts
 *
 * A lane that stores an assistant message must pass the turn's provenance. Of the 22
 * `upsertConversation` call sites in the ask lane, ONE did before M18 phase 4 — and the live database
 * read 17.8% on `question` and 0.0% on every other intent. M3 recorded that as "0 of 288
 * conversations carried a tier"; it was read for months as a broken renderer. It was twenty-one lanes
 * not passing an argument, and nothing anywhere would have told the next person.
 *
 * ⚠️ THE RULE IS NOT IN THIS FILE. It is `findUnprovenancedCalls()` in
 * `src/lib/aria/ask/pipeline/provenance-rule.ts`, which `provenance-wiring.test.ts` also calls — the
 * WALL 8 pattern. The guard on push and the rule the test drives are one function, so they cannot
 * drift. This script only decides which files to read and what to print.
 *
 * ⚠️ FULL-FILE SCAN. `canon-rail-guard.ts` reads added lines only, and an added-lines scanner cannot
 * see a REINTRODUCED line — which is the exact shape of this regression: someone re-adds a lane's
 * store call without the argument.
 *
 * ⚠️ IT FAILS ON SILENCE. A run that scanned no files, or found no `upsertConversation` call at all,
 * exits NON-ZERO with the reason. A guard that passes because it looked at nothing is the pattern this
 * repo has seven instances of, and this one is not going to be the eighth.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findUnprovenancedCalls, PROVENANCE_EXEMPT } from '../src/lib/aria/ask/pipeline/provenance-rule'

const STRATEGIES = join(process.cwd(), 'src', 'lib', 'aria', 'ask', 'strategies')

const sources: Record<string, string> = {}
for (const f of readdirSync(STRATEGIES)) {
  if (!f.endsWith('.ts') || f.endsWith('.test.ts') || f === 'index.ts') continue
  sources[f] = readFileSync(join(STRATEGIES, f), 'utf8')
}

const scanned = Object.keys(sources).length
const callSites = Object.values(sources)
  .reduce((n, src) => n + (src.match(/upsertConversation\s*\(/g) ?? []).length, 0)

// ── anti-vacuity, before any verdict ─────────────────────────────────────────────────────────────
if (scanned === 0) {
  console.error('[ask-provenance-guard] scanned 0 files under ' + STRATEGIES + ' — the guard checked NOTHING. Failing.')
  process.exit(1)
}
if (callSites === 0) {
  console.error(
    '[ask-provenance-guard] found 0 `upsertConversation(` call sites across ' + scanned + ' files. '
    + 'Either the lanes stopped persisting turns or this guard is looking in the wrong place. '
    + 'Both are failures. Failing rather than reporting a clean pass.',
  )
  process.exit(1)
}

const violations = findUnprovenancedCalls(sources)

if (violations.length > 0) {
  console.error('[ask-provenance-guard] ' + violations.length + ' lane(s) store an assistant message with NO anchors:\n')
  for (const v of violations) {
    console.error('  ' + v.file + ':' + v.line)
    console.error('    ' + v.text.split('\n').map(l => l.trim()).join(' ').slice(0, 150))
  }
  console.error(
    '\n  Pass the turn\'s provenance: add `...provenanceTail(grounding)` as the tail of the call, or\n'
    + '  `provenanceOf(grounding)` as the 10th argument where the middle ones are already given.\n'
    + '  A lane that genuinely cannot (no grounding reaches it) belongs in PROVENANCE_EXEMPT with a reason.',
  )
  process.exit(1)
}

const exempt = Object.keys(PROVENANCE_EXEMPT)
console.log(
  '[ask-provenance-guard] ' + scanned + ' file(s) scanned whole, ' + callSites
  + ' upsertConversation call site(s), all carrying provenance'
  + (exempt.length ? ' (' + exempt.length + ' exempt: ' + exempt.join(', ') + ')' : '') + '. Pass.',
)

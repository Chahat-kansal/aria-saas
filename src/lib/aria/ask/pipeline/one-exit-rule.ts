/**
 * M17 · BRAIN-1 PHASE 2 — WALL 9: ONE EXIT.
 *
 * `_POST` had 28 `return NextResponse` statements, 22 of them before the council gate. Twenty-two
 * ways to leave the function before grounding, before the council, before the verifier — and
 * whichever condition matched first won, in source order. That is the architecture behind M12's
 * bathroom answer, M3's 0-of-288 missing provenance tiers, and a verifier reached about once in
 * three months because it sat after the exit carrying every request it was written for.
 *
 * THE RULE: **a response is constructed in exactly one place.** Every lane returns a `TurnResult`;
 * `render()` turns it into HTTP. A new lane, a new heuristic, a new "fast path" — the things every
 * sprint since June has added — cannot skip a stage, because there is nowhere else to exit from.
 *
 * ⚠️ THE RULE LIVES HERE, IN A FUNCTION, AND THE GUARD SCRIPT IMPORTS IT. That is the WALL 8
 * pattern (src/lib/agents/service-role-rule.ts): the rule enforced on push and the rule the unit
 * test drives are the same function, so they cannot drift apart. No assertion anywhere greps a
 * source file to decide what the rule is.
 *
 * ⚠️ THIS IS A FULL-FILE SCAN, NOT A DIFF SCAN. `scripts/canon-rail-guard.ts` reads added lines
 * only, and an added-lines scanner cannot catch a REINTRODUCED line. These are three small,
 * brand-new directories; reading them whole costs nothing and cannot be fooled.
 */

/** Everything under these prefixes is read whole. */
export const ONE_EXIT_SCAN_ROOTS = [
  'src/lib/aria/ask/pipeline/',
  'src/lib/aria/ask/strategies/',
] as const

/**
 * ⚠️ THE TURN ROUTE IS NAMED EXACTLY, NOT COVERED BY A PREFIX — and that correction matters.
 *
 * The obvious reading of "the route file" is `src/app/api/aria/ask/`, and scanning that prefix would
 * have been wrong: the directory holds **eleven other routes** — `action/`, `audit/`, `delete/`,
 * `escalate/`, `export/`, `history/`, `rollback/`, `search/`, `suggestions/`, `thread/`, `upload/` —
 * which are ordinary REST endpoints with no connection to the turn pipeline. Every one of them
 * legitimately constructs a response, and a prefix scan would have failed the push on all eleven.
 *
 * That is failure pattern #2, "the fix landed on the wrong file", in guard form: a rule that fires
 * on eleven innocent siblings gets loosened until it fires on nothing.
 */
export const ONE_EXIT_SCAN_FILES = ['src/app/api/aria/ask/route.ts'] as const

/**
 * THE ONE EXIT. Permanently exempt, because it is the thing the rule exists to concentrate into a
 * single place. If this file ever stops constructing a response, the guard is scanning a pipeline
 * with no way out — `oneExitIsIntact()` below is what notices.
 */
export const ONE_EXIT_ALLOWLIST = ['src/lib/aria/ask/pipeline/render.ts'] as const

/**
 * ⚠️ GRANDFATHERED FOR PHASES 2–3 ONLY, AND REMOVED IN PHASE 4.
 *
 * The route still holds all 28 exits while the lanes are being wrapped. Keeping it on this list is
 * what lets the guard be switched on before the migration finishes rather than after — a guard
 * added at the end of a sprint has never caught anything in this repo. Phase 4 empties this array,
 * and from that commit the route cannot exit early.
 *
 * It is an ARRAY rather than a constant so that emptying it is a one-line diff anyone can audit.
 */
export const ONE_EXIT_GRANDFATHERED: readonly string[] = [
  'src/app/api/aria/ask/route.ts',
]

/** A line that constructs or returns an HTTP response. */
const RESPONSE_CONSTRUCTION = /\bNextResponse\s*\.\s*(json|redirect|rewrite|next)\s*\(|\bnew\s+NextResponse\s*\(/

/**
 * Comments are stripped before matching — a rule that fires on the sentence describing it teaches
 * people to phrase around the guard instead of obeying it, and this file is full of such sentences.
 *
 * ⚠️ LINE-LEVEL ONLY. It cannot see a `/** … *\/` block that spans lines, because it is handed one
 * line at a time. Use `stripBlockComments()` on the whole file first — `findOneExitViolations()`
 * does, and `isOneExitViolation()` is the single-line API the tests drive.
 */
export function stripComments(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * ⚠️ ADDED AFTER THE GUARD FIRED ON ITS OWN DOCUMENTATION.
 *
 * Every strategy file opens with a doc block saying, in words, what the migration did:
 *
 *     *   · `return NextResponse.json(X)`  →  `return makeTurnResult('council', X)`
 *
 * Twelve files, twelve violations, none of them real. The first version of this rule stripped `//`
 * comments and single-line `/* … *\/`, and a line inside a MULTI-LINE block looks like ordinary
 * code when you only ever see one line of it.
 *
 * The fix is to make the rule understand block comments — **not** to stop writing the sentence. A
 * guard you have to phrase around is a guard people route around, and the sentence explaining a
 * migration is exactly the sentence the next reader needs.
 *
 * Line numbers are preserved: comment content is blanked, newlines are kept, so a violation still
 * reports the line it is really on.
 */
export function stripBlockComments(text: string): string {
  let out = ''
  let i = 0
  let inBlock = false
  let inString: string | null = null
  while (i < text.length) {
    const c = text[i]!
    if (inBlock) {
      if (c === '*' && text[i + 1] === '/') { out += '  '; i += 2; inBlock = false; continue }
      out += c === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (inString) {
      out += c
      if (c === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
      if (c === inString) inString = null
      i++
      continue
    }
    if (c === '/' && text[i + 1] === '*') { out += '  '; i += 2; inBlock = true; continue }
    // A `//` line comment is left for stripComments(); strings must be tracked so that a `/*`
    // inside one (a regex, a URL) does not open a phantom block.
    if (c === '"' || c === "'" || c === '`') { inString = c; out += c; i++; continue }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i++ }
      continue
    }
    out += c
    i++
  }
  return out
}

/** True when `file` is inside the guarded tree at all. */
export function isScanned(file: string): boolean {
  const f = file.replace(/\\/g, '/')
  return ONE_EXIT_SCAN_ROOTS.some(r => f.startsWith(r))
    || (ONE_EXIT_SCAN_FILES as readonly string[]).includes(f)
}

/** True when `file` is allowed to construct a response despite being inside the guarded tree. */
export function isExemptFromOneExit(file: string): boolean {
  const f = file.replace(/\\/g, '/')
  return (ONE_EXIT_ALLOWLIST as readonly string[]).includes(f) || ONE_EXIT_GRANDFATHERED.includes(f)
}

/**
 * ⚠️ THE DECISION, IN ONE FUNCTION. The guard script calls it; the unit test calls it. Nothing else
 * decides what a violation is.
 *
 * `line` is a single source line, uncommented or not — comments are stripped here so a caller
 * cannot forget to.
 */
export function isOneExitViolation(file: string, line: string): boolean {
  if (!isScanned(file)) return false
  if (isExemptFromOneExit(file)) return false
  // Test and spec files assert ON response shapes; they are describing the rule, not breaking it.
  if (/\.(test|spec)\.tsx?$/.test(file.replace(/\\/g, '/'))) return false
  return RESPONSE_CONSTRUCTION.test(stripComments(line))
}

export interface OneExitViolation {
  file: string
  line: number
  text: string
}

/**
 * Scan whole files. `files` is `[path, full text]` pairs — the script reads them off disk.
 *
 * ⚠️ Block comments are stripped from the WHOLE FILE first, then each line is judged. Judging a line
 * in isolation cannot tell code from the middle of a `/** … *\/`, which is how the first version of
 * this guard reported twelve violations that were all the same explanatory sentence.
 */
export function findOneExitViolations(files: ReadonlyArray<readonly [string, string]>): OneExitViolation[] {
  const out: OneExitViolation[] = []
  for (const [file, text] of files) {
    const original = text.split('\n')
    const code = stripBlockComments(text).split('\n')
    for (let i = 0; i < code.length; i++) {
      if (isOneExitViolation(file, code[i]!)) {
        out.push({ file: file.replace(/\\/g, '/'), line: i + 1, text: (original[i] ?? '').trim() })
      }
    }
  }
  return out
}

/**
 * ⚠️ ANTI-VACUITY. A guard that scanned nothing, or that guards a pipeline whose one exit no longer
 * exists, must FAIL rather than pass quietly. "Exists, looks correct, does nothing" is this
 * codebase's first failure pattern and it has seven confirmed instances — a Canon Guard with 0 runs
 * ever, a Smoke Suite with 0 runs, a Deploy workflow that verified nothing in 8 seconds.
 *
 * Returns the reason it is NOT intact, or null when it is.
 */
export function oneExitIsIntact(
  scannedFileCount: number,
  renderFileText: string | null,
): string | null {
  if (scannedFileCount < 2) {
    return `scanned ${scannedFileCount} file(s) — the guarded tree is empty or the walk is broken, so a pass here proves nothing`
  }
  if (renderFileText === null) {
    return `${ONE_EXIT_ALLOWLIST[0]} does not exist — there is no single exit for this guard to be protecting`
  }
  // Same block-comment strip as the scan — render.ts's own header describes what it does, and a
  // doc block must not be able to satisfy the check that render.ts still DOES it.
  const constructs = stripBlockComments(renderFileText)
    .split('\n')
    .some(l => RESPONSE_CONSTRUCTION.test(stripComments(l)))
  if (!constructs) {
    return `${ONE_EXIT_ALLOWLIST[0]} constructs no response — the one exit is gone, so forbidding the others guards nothing`
  }
  return null
}

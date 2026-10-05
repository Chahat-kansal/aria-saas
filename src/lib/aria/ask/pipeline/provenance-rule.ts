/**
 * M18 · BRAIN-2 PHASE 4 — WALL 10. EVERY LANE THAT STORES AN ASSISTANT MESSAGE PASSES PROVENANCE.
 *
 * ⚠️ THE MEASUREMENT THAT MADE THIS NECESSARY. Of the 22 `upsertConversation` call sites in the ask
 * lane, **one** passed provenance — `answer-council.ts:522`. The live database agreed to the row:
 *
 *     question        444 turns   79 with provenance   17.8%
 *     ai_outage       150 turns    0                    0.0%
 *     general         130 turns    0                    0.0%
 *     …every other intent                               0.0%
 *
 * M3 recorded this as "0 of 288 conversations carried a tier" and it was read for months as a broken
 * renderer or a missing column. It was neither. Twenty-one lanes never passed the argument.
 *
 * ⚠️ THIS IS A RULE AS A FUNCTION, NOT A SCRIPT, FOR THE REASON WALL 8 ESTABLISHED: a guard whose
 * logic lives inside a `scripts/` file can only ever be tested by running the script, so the test
 * ends up asserting that the script exists. Here the rule is `findUnprovenancedCalls()`, the script
 * imports it, and the test CALLS it — including against a fixture with a known-missing call, so the
 * rule is proven able to fail.
 *
 * It is a source rule rather than a runtime one because the thing being guarded is a CALL SITE: a new
 * lane added next month will store its turn and forget the argument, exactly as twenty-one did, and no
 * runtime test covers a lane nobody has written yet.
 */

/** One `upsertConversation(...)` call that stores a turn without its anchors. */
export interface UnprovenancedCall {
  readonly file: string
  readonly line: number
  /** The call as written, trimmed — so a report names the thing rather than pointing at a number. */
  readonly text: string
}

/**
 * Call sites that are allowed to omit provenance, each with the reason. A bare list would drift into
 * "everything is allowed"; the reason is what makes an entry reviewable.
 */
export const PROVENANCE_EXEMPT: Readonly<Record<string, string>> = {
  // `savePlanGate` is wired as `RunTurnOptions.savePlanGate`, which receives only `TurnInput` — it
  // runs BEFORE the classifiers and before stage 2, so no anchor set exists for it to pass. It also
  // makes no model call and states no figure. See ANCHOR_PLAN's entry for `save_plan`.
  'save-plan.ts': 'runs as a pre-classifier gate; it never receives a grounding, and asserts no figure',
}

const CALL = /upsertConversation\s*\(/

/**
 * Finds every `upsertConversation(...)` call that passes no provenance.
 *
 * `sources` maps a file name to its contents, so the test can feed it the real strategy files AND a
 * fixture — which is what lets the rule be proven able to report a violation rather than merely
 * returning an empty array on a clean tree.
 */
export function findUnprovenancedCalls(sources: Readonly<Record<string, string>>): UnprovenancedCall[] {
  const out: UnprovenancedCall[] = []

  for (const [file, src] of Object.entries(sources)) {
    if (PROVENANCE_EXEMPT[file]) continue
    const lines = src.split('\n')

    for (let i = 0; i < lines.length; i++) {
      if (!CALL.test(lines[i]!)) continue
      // A comment or a doc-block mentioning the function is not a call site. Checked before the
      // argument scan, because the headers in these files discuss `upsertConversation` by name.
      const trimmed = lines[i]!.trim()
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue

      // The call may span several lines. Read forward until the parentheses balance, so a multi-line
      // call is judged on its whole argument list rather than on its first line.
      let text = ''
      let depth = 0
      let started = false
      let end = i
      for (let j = i; j < Math.min(i + 12, lines.length); j++) {
        text += lines[j] + '\n'
        for (const ch of lines[j]!) {
          if (ch === '(') { depth++; started = true }
          else if (ch === ')') depth--
        }
        end = j
        if (started && depth <= 0) break
      }
      void end

      const passesProvenance = /provenanceTail\s*\(|provenanceOf\s*\(|turnProvenance/.test(text)
      if (!passesProvenance) {
        out.push({ file, line: i + 1, text: text.trim().slice(0, 160) })
      }
    }
  }

  return out
}

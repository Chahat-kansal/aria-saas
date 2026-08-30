/**
 * S9 PHASE 4 (#4) — ONE `safeParseJSON`.
 *
 * ── THE TWO THAT EXISTED ────────────────────────────────────────────────────────────────────────
 *   council.ts:101        .replace(/^```(?:json)?\n?/i, '')  .replace(/\n?```$/i, '')
 *   context-brain.ts:18   .replace(/^```(?:json)?/i,   '')  .replace(/```$/i,   '')
 *
 * The only difference is whether the fence regexes also eat a newline. It is immaterial: both then
 * call `.trim()` and slice from the first `{` to the last `}`, so a stray newline inside that slice
 * cannot survive and one outside it is discarded anyway. `safe-json.test.ts` does not take my word
 * for that — it runs BOTH original implementations over a corpus of real model tics and asserts
 * they agree on every one, and only then is the merge justified.
 *
 * ── WHICH SURVIVED, AND WHY ─────────────────────────────────────────────────────────────────────
 * council's. The decision table says use the one the canonical engine uses, and the council is that
 * engine — it is the path a complex owner question actually takes. Keeping the more thorough fence
 * strip also means the merge can only ever remove MORE junk, never less.
 *
 * ── WHAT THIS DELIBERATELY IS NOT ───────────────────────────────────────────────────────────────
 * It is not tolerant. It strips a code fence and takes the outermost braces; anything else is a
 * strict `JSON.parse`. A truncated object returns null, and that is the point — S4 and S8 both
 * established that the fix for truncation is the token budget, never a parser that accepts half an
 * object. `tolerantJSONParse` in artifact-segments.ts is a SEPARATE, deliberately different thing:
 * it repairs whole-document model tics (trailing commas, single quotes) for artifact payloads. The
 * two are not duplicates of each other and are not merged.
 */

/**
 * Parse a model's JSON reply, tolerating only a markdown code fence and surrounding prose.
 *
 * Returns null when nothing parses — never a partial object, never a guess.
 */
export function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    const s = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const start = s.indexOf('{'), end = s.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1))
    return null
  } catch { return null }
}

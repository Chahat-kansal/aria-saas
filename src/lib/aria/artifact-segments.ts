/**
 * S9 PHASE 3 — ARTIFACTS OFF `/classic`.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────────
 * Aria embeds structured output in her prose as `<aria_artifact type="..." title="...">{json}
 * </aria_artifact>`. Splitting an answer into text and artifact segments is how a chart becomes a
 * chart instead of a wall of JSON.
 *
 * ── WHY IT MOVED HERE ───────────────────────────────────────────────────────────────────────────
 * It lived inside `classic/page.tsx` (its own 1,691-line file) with a near-identical second copy in
 * `/pos/ask/page.tsx`. The default Ask Aria surface — the one every navigation entry point sends
 * owners to since S5 — had neither, so an answer containing an artifact rendered its raw tag soup
 * there. Migrating meant either a third copy or one module. The decision table settles it: migrate
 * behaviour, reuse handlers, never re-implement.
 *
 * ── THE PARSER IS PURE; REPORTING IS SEPARATE, AND THAT IS THE ONE DELIBERATE CHANGE ────────────
 * `classic` fired the parse-failure POST from inside the parser, during render. That works, but it
 * re-fires on every re-render of a message and React's StrictMode double-invokes it. Here the
 * parser only RETURNS the failures and `reportArtifactParseFailures` sends them, deduplicated by
 * content, so a re-render cannot resend one. Nothing is dropped: every failure that was reported
 * before is still reported, at most once per distinct payload per page load.
 *
 * That is the only behavioural difference. The regex, the tolerant-JSON ladder, the fallback
 * sentence and the endpoint are byte-identical to the originals.
 */

export type ArtifactSegment = { kind: 'artifact'; type: string; title?: string; data: Record<string, unknown> }
export type TextSegment = { kind: 'text'; content: string }
export type Segment = TextSegment | ArtifactSegment

export interface ArtifactParseFailure {
  /** The raw tag, capped exactly as the original did before POSTing it. */
  raw: string
  type: string
}

export interface ParsedAnswer {
  segments: Segment[]
  /** Empty when every artifact parsed. Never null, so a caller cannot read "absent" as "fine". */
  failures: ArtifactParseFailure[]
}

/**
 * The tolerant ladder, lifted from `classic` unchanged.
 *
 * NOTE what it does NOT do: it never accepts a truncated object. Each rung is a whole-document
 * repair of a well-known model tic (a trailing comma, single quotes, a raw newline inside a
 * string) and then a strict `JSON.parse`. S4's rule stands — the fix for truncation is the token
 * budget, never a parser that accepts half an object.
 */
export function tolerantJSONParse(raw: string): Record<string, unknown> | null {
  const cleanups: Array<(s: string) => string> = [
    s => s,
    s => s.replace(/,(\s*[}\]])/g, '$1'),
    s => s.replace(/,(\s*[}\]])/g, '$1').replace(/'/g, '"'),
    s => s.replace(/,(\s*[}\]])/g, '$1').replace(/\r?\n/g, '\\n'),
  ]
  for (const fix of cleanups) {
    try { return JSON.parse(fix(raw).trim()) } catch { /* try next */ }
  }
  return null
}

/** The sentence shown in place of an artifact whose JSON could not be recovered. */
export const ARTIFACT_FALLBACK_TEXT =
  'I tried to show a chart here but the data was malformed. Please ask again.'

const ARTIFACT_RE =
  /<aria_artifact\s+type="([^"]+)"(?:\s+title="([^"]+)")?\s*>([\s\S]*?)<\/aria_artifact>/g

/**
 * Split an answer into text and artifact segments.
 *
 * Pure: no fetch, no state. A malformed artifact becomes a plain-text apology in the stream AND an
 * entry in `failures` — the owner still sees something honest, and the failure is still reportable.
 */
export function parseAriaResponse(text: string): ParsedAnswer {
  const segments: Segment[] = []
  const failures: ArtifactParseFailure[] = []
  const regex = new RegExp(ARTIFACT_RE.source, 'g')   // fresh lastIndex per call
  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const t = text.slice(lastIdx, match.index).trim()
      if (t) segments.push({ kind: 'text', content: t })
    }
    const parsed = tolerantJSONParse(match[3] ?? '')
    if (parsed) {
      segments.push({ kind: 'artifact', type: match[1]!, title: match[2], data: parsed })
    } else {
      segments.push({ kind: 'text', content: ARTIFACT_FALLBACK_TEXT })
      failures.push({ raw: match[0].slice(0, 500), type: match[1] ?? 'unknown' })
    }
    lastIdx = regex.lastIndex
  }
  if (lastIdx < text.length) {
    const t = text.slice(lastIdx).trim()
    if (t) segments.push({ kind: 'text', content: t })
  }
  return { segments, failures }
}

/** True when the text carries no artifact at all — the common case, and worth not re-rendering for. */
export function hasArtifact(text: string): boolean {
  return new RegExp(ARTIFACT_RE.source).test(text)
}

/** Content-keyed, so a re-render or StrictMode's double-invoke cannot resend the same failure. */
const reported = new Set<string>()

/**
 * Report malformed artifacts to `/api/aria/artifact-parse-failure`.
 *
 * Fire-and-forget by design: a telemetry POST must never block or break the answer the owner is
 * reading. The `.catch(() => {})` is deliberate and is the one swallow in this file — it is
 * discarding a failure to report a failure, which is exactly where silence is correct.
 */
export function reportArtifactParseFailures(failures: ArtifactParseFailure[]): void {
  for (const f of failures) {
    const key = f.type + '|' + f.raw
    if (reported.has(key)) continue
    reported.add(key)
    void fetch('/api/aria/artifact-parse-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: f.raw, type: f.type }),
    }).catch(() => {})
  }
}

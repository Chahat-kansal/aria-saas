// AI-OUTPUT-INTEGRITY-1 — generalizes BRIEF-INTEGRITY-1's safeBriefingContent() into a
// non-briefing-specific guard usable by every AI-output write/return path in the app. Same
// failure class: text meant for the MODEL's own prompt (internal scaffold labels, section
// headers, instructional notes) — or a leaked echo of that internal scaffolding back out in the
// model's own response — glued onto or replacing real generated content on the SUCCESS path (not
// just error handling) before it reaches storage or an end user. See BRIEF-INTEGRITY-1-REPORT.md
// for the original incident (src/app/api/cron/generate-briefings/route.ts); AI-OUTPUT-INTEGRITY-
// 1-REPORT.md for the app-wide audit this generalizes from.

export type ScaffoldMarker = string | RegExp

// Superset of every scaffold/leak marker already confirmed relevant in this codebase:
// - the exact strings BRIEF-INTEGRITY-1 found leaking in production briefings
// - this app's own internal prompt-scaffold header text (grounded.ts's withGrounding()) — a real
//   leak of either means the model echoed system-prompt internals into its output
// - AI-GROUNDING-1's runCustomerFacingCopy leak-pattern regexes, generalized to every output kind
//   rather than customer-facing text alone
export const GENERIC_SCAFFOLD_MARKERS: ScaffoldMarker[] = [
  'DO NOT open', 'max 1)', 'prior briefings',
  'ANTI-HALLUCINATION', 'REAL DATA (the only source of truth',
  /\[INSERT[^\]]*\]/i, /\bTODO\b/, /\{\{[^}]*\}\}/, /\bplaceholder\b/i, /\bsystem prompt\b/i, /\bAPI key\b/i,
]

export function hasScaffoldMarkers(text: string, markers: ScaffoldMarker[] = GENERIC_SCAFFOLD_MARKERS): boolean {
  return markers.some((m) => (typeof m === 'string' ? text.includes(m) : m.test(text)))
}

export interface SafeAIOutputOptions {
  /** Override the default GENERIC_SCAFFOLD_MARKERS list (e.g. briefing-guard.ts's narrower set). */
  markers?: ScaffoldMarker[]
  /** Tag included in the console.error when a marker matches, for tracing which caller tripped it. */
  label?: string
}

// Never returns raw/empty/scaffold-contaminated text — the caller's fallback, or the trimmed real
// text, nothing in between (no partially-glued content ever passes through). This is the single
// choke point every AI-output write/return path should route through, the same role
// safeBriefingContent() already plays for aria_daily_briefings.content specifically.
export function safeAIOutput(text: string | null | undefined, fallback: string, opts: SafeAIOutputOptions = {}): string {
  if (!text) return fallback
  const trimmed = text.trim()
  if (!trimmed) return fallback
  if (hasScaffoldMarkers(trimmed, opts.markers ?? GENERIC_SCAFFOLD_MARKERS)) {
    console.error(`[ai-output-guard${opts.label ? '/' + opts.label : ''}] scaffold marker matched — refusing to store/return raw text, using fallback`)
    return fallback
  }
  return trimmed
}

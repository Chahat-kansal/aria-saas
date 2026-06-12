import { extractNumbers, RISKY_NUMERIC_RE } from './response-validator'

// SUMMARIZER-FIX-1: source-traceability filter for summary key_decisions / key_concerns.
// A numeric claim may only be recorded if it traces to the SOURCES corpus — the owner's own
// messages + ground-truth anchors. Aria's assistant messages are deliberately EXCLUDED from
// the corpus by the caller: a fabricated figure in Aria's reply must not be able to ground
// itself (that is exactly the feedback loop this closes — see PUSHBACK-AUDIT-1 Mechanism B).

export interface FilterResult {
  kept: string[]
  dropped: string[]
}

export function filterUngrounded(items: string[], sources: string): FilterResult {
  const corpusNumbers = extractNumbers(sources)
  const kept: string[] = []
  const dropped: string[] = []

  for (const item of items) {
    if (typeof item !== 'string' || !item.trim()) continue
    const matches = item.match(RISKY_NUMERIC_RE) ?? []
    if (matches.length === 0) {
      // Qualitative item — no fabrication risk, keep
      kept.push(item)
      continue
    }
    let grounded = true
    for (const m of matches) {
      const v = parseFloat(m.replace(/[^0-9.]/g, ''))
      if (!isFinite(v)) continue
      const ok = corpusNumbers.some(n => n === v || (n > 0 && Math.abs(n - v) / n <= 0.02))
      if (!ok) { grounded = false; break }
    }
    if (grounded) kept.push(item)
    else dropped.push(item)
  }

  return { kept, dropped }
}

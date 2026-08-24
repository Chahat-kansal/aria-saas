/**
 * MS16 PHASE 4 — CLICKABLE FIGURES THAT EXPAND THEIR PROVENANCE.
 *
 * The contract shows every number in an answer underlined and clickable, opening a panel that says
 * where it came from. That is only honest if the provenance is REAL, so this module does not
 * invent one: it reuses MS15's verifier anchors (the values actually computed from the business's
 * rows this turn) and MS9's cost-provenance tiers.
 *
 * THE RULE THIS ENFORCES (decision table): "any figure that would render without a provenance tier
 * is not ready — show the figure with its tier, or don't show the figure." So a figure gets one of
 * three treatments and never a fourth:
 *
 *   verified   — matches a value computed this turn. Blue underline, source named.
 *   estimated  — matches, but the cost beneath it is catalogue/unknown tier. Amber underline.
 *   plain      — no anchors were supplied for this turn, so nothing is claimed about it. NOT
 *                underlined, NOT clickable. An un-underlined number makes no promise; a blue one
 *                that turns out to be unbacked is the lie.
 *
 * Pure and dependency-free, so the same function runs in the route and in a test.
 */

export type FigureTier = 'verified' | 'estimated' | 'plain'

export interface FigureSegment {
  kind: 'text' | 'figure'
  text: string
  tier?: FigureTier
  /** Owner-facing sentence: where this number came from. Present only for verified/estimated. */
  source?: string
}

/** Same shape the verifier already matches on. Kept identical on purpose. */
const FIGURE_RE = /(?:A?\$\s?-?[\d,]+(?:\.\d+)?)|(?:-?[\d,]+(?:\.\d+)?\s?%)/g

/** 0.5% — a rounded citation of a real figure is the same figure, not a different one. */
const TOLERANCE = 0.005

export interface ProvenanceInput {
  /** Values computed from real rows this turn. EMPTY means "we know nothing" — not "nothing matches". */
  anchors?: number[]
  /** Optional per-anchor label, keyed by the anchor value, e.g. 954 → "completed sales, this week". */
  anchorLabels?: Record<string, string>
  /** Cost tiers in play this turn (resolve-cost.ts vocabulary). */
  weakCostTiers?: boolean
}

function parseFigure(raw: string): number | null {
  const n = Number(raw.replace(/[A$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function matchAnchor(value: number, anchors: number[]): number | null {
  for (const a of anchors) {
    if (a === value) return a
    const scale = Math.max(Math.abs(a), Math.abs(value), 1)
    if (Math.abs(a - value) / scale <= TOLERANCE) return a
  }
  return null
}

/**
 * Split an answer into text and figure segments, tagging each figure with its provenance.
 *
 * With NO anchors every figure comes back `plain` — deliberately. A turn whose ground truth was
 * never captured cannot retroactively vouch for its numbers, and dressing them in a blue underline
 * would be a claim the system cannot support.
 */
export function segmentFigures(text: string, input: ProvenanceInput = {}): FigureSegment[] {
  const src = String(text ?? '')
  const anchors = input.anchors ?? []
  const labels = input.anchorLabels ?? {}
  const segments: FigureSegment[] = []
  let cursor = 0

  for (const m of src.matchAll(FIGURE_RE)) {
    const raw = m[0]
    const start = m.index ?? 0
    if (start > cursor) segments.push({ kind: 'text', text: src.slice(cursor, start) })

    const value = parseFigure(raw)
    if (anchors.length === 0 || value === null) {
      // Nothing to check against — say nothing about it.
      segments.push({ kind: 'figure', text: raw, tier: 'plain' })
    } else {
      const hit = matchAnchor(value, anchors)
      if (hit === null) {
        // It matches nothing we computed. The VERIFIER blocks this case upstream; if one ever
        // reaches the UI it is shown plain rather than endorsed.
        segments.push({ kind: 'figure', text: raw, tier: 'plain' })
      } else {
        const tier: FigureTier = input.weakCostTiers ? 'estimated' : 'verified'
        const label = labels[String(hit)] ?? labels[hit.toFixed(2)]
        segments.push({
          kind: 'figure',
          text: raw,
          tier,
          source: tier === 'estimated'
            ? `${label ?? 'Computed from your data this turn'} — but the cost behind it is an estimate, not a recorded purchase price, so treat the margin as indicative.`
            : (label ?? 'Computed from your data this turn.'),
        })
      }
    }
    cursor = start + raw.length
  }

  if (cursor < src.length) segments.push({ kind: 'text', text: src.slice(cursor) })
  return segments
}

/** True when any figure in this answer carries real provenance — drives whether hints are shown. */
export function hasProvenance(segments: FigureSegment[]): boolean {
  return segments.some(s => s.kind === 'figure' && s.tier !== 'plain')
}

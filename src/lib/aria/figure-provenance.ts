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
/**
 * S6 PHASE 2 — AN ANCHOR EXISTS ONLY IF ITS MEANING CAN BE STATED.
 *
 * A live turn stored 33 anchors and 4 labels, so 29 numbers were underlined-and-clickable with
 * nothing to say. Two separate causes, and both are fixed here rather than hidden at the renderer:
 *
 * 1. UNLABELLED VALUES. route.ts spreads four bare `number[]` sets into the anchor list —
 *    healthAnchors, goalAnchors, benchmarkAnchors, hypothesisAnchors. They carry no per-value
 *    provenance, so they contributed the junk: -800, -600, -100, 100. A chart axis or a percentage
 *    constant is not a source. They are still passed to the VERIFIER (Check 6 validates against a
 *    wider corpus, and more is better there) — they simply stop being stored as clickable sources.
 *
 * 2. COLLISIONS. anchorLabels is keyed by String(value), so two metrics that happen to share a
 *    value collapse to one key and the last write wins. On a quiet day revenue-today, the weekly
 *    target and a promo count are ALL 0 — the owner would click 0 and read whichever label
 *    happened to be assigned last. A number whose meaning is ambiguous cannot be a source, so an
 *    ambiguous value is dropped entirely rather than labelled with a coin-flip.
 *
 * The result is the invariant the UI needs: anchors and labels are the same length, and every
 * stored anchor resolves.
 */
export interface LabelledAnchor { value: number | null | undefined; label: string }

export function buildProvenance(pairs: LabelledAnchor[]): { anchors: number[]; anchorLabels: Record<string, string> } {
  const byValue = new Map<string, { value: number; labels: Set<string> }>()

  for (const { value, label } of pairs) {
    if (typeof value !== 'number' || !isFinite(value)) continue
    if (typeof label !== 'string' || !label.trim()) continue
    const key = String(value)
    const entry = byValue.get(key) ?? { value, labels: new Set<string>() }
    entry.labels.add(label.trim())
    byValue.set(key, entry)
  }

  const anchors: number[] = []
  const anchorLabels: Record<string, string> = {}
  for (const [key, { value, labels }] of byValue) {
    // Ambiguous: the same number means two different things this turn. Saying either would be a
    // coin-flip presented as a fact, so it is not offered as a source at all.
    if (labels.size !== 1) continue
    anchors.push(value)
    anchorLabels[key] = [...labels][0]!
  }
  return { anchors, anchorLabels }
}

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

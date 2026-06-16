// AM-3 — the SIGNAL GATE. Inputs are already freshness-filtered (expires_at > now) by the context
// builders, so stale signals never reach here. This decides which FRESH signals are MATERIAL +
// RELEVANT enough to surface to Aria and excludes the rest — so low-signal noise doesn't crowd the
// prompt. It does NOT generate signals (that's signal-engine) and it does NOT re-surface the AM-1/AM-2
// baseline patterns (owner_pattern / customer_pattern have their own dedicated groundTruth blocks).

export interface GatedSignal {
  signal_type: string
  payload: Record<string, unknown> | null
  created_at?: string
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, alert: 3, watch: 2, info: 1 }
const MATERIALITY_FLOOR = SEVERITY_RANK.watch // RULE 5: anything below 'watch' (i.e. 'info') is noise — gated out
// Baseline pattern signals carry no severity and are surfaced via their own groundTruth blocks — keep
// them out of the raw monitoring-signal surface so they neither double-show nor crowd it.
const SURFACED_ELSEWHERE = new Set(['owner_pattern', 'customer_pattern'])

function rankOf(s: GatedSignal): number {
  return SEVERITY_RANK[String(s.payload?.severity ?? 'info')] ?? 1
}

// Keep only fresh + material (severity >= watch) monitoring signals, highest-severity first then most
// recent, capped. Callers pre-filter expires_at > now, so stale signals are already excluded.
export function gateSignals<T extends GatedSignal>(fresh: T[] | null | undefined, cap = 6): T[] {
  return (fresh ?? [])
    .filter(s => !SURFACED_ELSEWHERE.has(s.signal_type))
    .filter(s => rankOf(s) >= MATERIALITY_FLOOR)
    .sort((a, b) => {
      const d = rankOf(b) - rankOf(a)
      if (d !== 0) return d
      return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
    })
    .slice(0, cap)
}

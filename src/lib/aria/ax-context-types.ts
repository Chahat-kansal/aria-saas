/**
 * MS16 PHASE 6 — the client-safe half of the context panel.
 *
 * WHY THIS FILE EXISTS: ax-context.ts imports supabaseAdmin, which carries the service-role key.
 * The panel components need the types AND the zero-rule formatter, and importing a value from
 * ax-context.ts would drag the admin client into the browser bundle. Types erase at compile time;
 * a function does not. So the shared, dependency-free half lives here and ax-context.ts re-exports
 * it, leaving exactly one definition of each.
 */

export type AxProvenance = 'measured' | 'unknown'

export interface AxFigure {
  label: string
  /** null = genuinely unknown. 0 = genuinely zero. Never interchangeable. */
  value: number | null
  format: 'currency' | 'count'
  provenance: AxProvenance
  /** Why it is unknown, when it is. Shown to the owner, never swallowed. */
  note?: string
}

export interface AxNotice {
  id: string
  title: string
  subtitle: string
  /** Per-item identity dot only — never used as an accent (locked-token rule). */
  tone: 'blue' | 'amber' | 'violet' | 'green'
  /** What clicking it asks Aria. */
  prompt: string
  /** Higher first. Ranked by how much it matters, not by recency. */
  rank: number
}

export interface AxContext {
  /**
   * How many decisions are ACTUALLY pending — not how many this payload carries.
   * `awaiting` is capped for the panel; this is the real count, and it is what the badge shows.
   * They differed 6 vs 55 on the first live screenshot, which is a number reporting a page size.
   */
  awaitingTotal: number
  /**
   * S3 PHASE 5 — everything Aria noticed, counted server-side. `noticed` is capped for rendering;
   * this is not. The headline reads from this so a page size can never become a user-facing count.
   */
  noticedTotal: number
  /** Who to greet. null when the row has no owner_name — the greeting drops the name, never invents one. */
  ownerName: string | null
  businessName: string | null
  today: AxFigure[]
  awaiting: AxNotice[]
  didToday: Array<{ text: string; at: string | null }>
  tags: string[]
  /** The empty state's ranked list: what Aria actually noticed. */
  noticed: AxNotice[]
  /** True when there is genuinely nothing to say — the panel says so plainly. */
  quiet: boolean
}

/**
 * The zero rule, as a pure function so it can be tested rather than asserted about.
 *
 * A measured 0 formats as "A$0.00" / "0". Only a null — a read that FAILED — formats as "Not known".
 * Substituting a placeholder for a real zero is what this phase's mutation check reverts, and it
 * goes red here.
 */
export function formatAxFigure(f: AxFigure): string {
  if (f.value === null) return 'Not known'
  if (f.format === 'currency') return `A$${(Number(f.value) || 0).toFixed(2)}`
  return String(Number(f.value) || 0)
}

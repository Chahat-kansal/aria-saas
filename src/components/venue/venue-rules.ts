/**
 * VENUE-VIEW-1 — the venue view's PURE rules, with no JSX and no three.
 *
 * Split out of VenueView3D.tsx for one concrete reason: vitest.config.ts collects the .test.ts files under src
 * and this repo's tsconfig sets `jsx: "preserve"`, so a test importing a .tsx fails in vite's
 * import analysis before a single assertion runs. The alternative was adding a jsx transform to the
 * config that governs all 1,901 tests. This file is the smaller change, and the separation is the
 * right shape anyway: everything here is a pure function of a row.
 *
 * Tested by venue-view.test.ts. VenueView3D.tsx re-exports all of it, so importers see one module.
 */
/** Pixels of layout space per metre of world. PARK: per-venue setting needs DDL on `businesses`. */
export const PX_TO_M = 0.08

/* ── row + summary shapes ───────────────────────────────────────────────────────────────────── */

export interface VenueRow {
  id: string
  name: string | null
  display_name?: string | null
  table_number?: string | null
  zone?: string | null
  section?: string | null
  seating_area?: string | null
  seats?: number | null
  shape?: string | null
  element_type?: string | null
  status?: string | null
  current_sale_id?: string | null
  occupied_since?: string | null
  seated_at?: string | null
  pos_x?: number | null
  pos_y?: number | null
  width?: number | null
  height?: number | null
  rotation?: number | null
  /** Added by ?venue=1 only. */
  sale_total?: number | null
}

export interface VenueSummary {
  today_completed_total: number
  today_completed_count: number
  open_tables: number
  last_completed_at: string | null
}

/* ── pure helpers (no three in this module's top level) ─────────────────────────────────────── */

export const TOY = { green: '#22a06b', orange: '#f26b1d', red: '#e03a2f' } as const

/** Dashboard tokens, per the brief. The scene stays on the prototype's toy palette. */
export const T = {
  green: '#7FB897', darkGreen: '#2D5240', sand: '#C9A37A', red: '#E24B4A',
  card: 'var(--bg-surface,#0f1512)', text: '#F0F4F0',
  muted: 'var(--text-secondary,#A8B5A8)', line: 'rgba(127,184,151,0.15)',
  font: 'var(--font-body), system-ui, -apple-system, sans-serif',
} as const

export function rowLabel(r: VenueRow): string {
  return r.display_name ?? r.name ?? 'Unnamed table'
}

export function rowZone(r: VenueRow): string {
  return r.zone ?? r.section ?? r.seating_area ?? ''
}

/**
 * Busy means a guest is at it. The brief's DB set is {available,occupied,reserved,cleaning}; the
 * legacy values in FloorPlan's type are folded in so an older row is not mis-coloured (pre-flight 7).
 */
export function isBusy(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'occupied' || s === 'reserved'
    || s === 'seated' || s === 'ordering' || s === 'eating' || s === 'check'
}

/** Minutes since the guest sat down, or null when unknown. */
export function seatedMinutes(r: VenueRow, now = Date.now()): number | null {
  const iso = r.occupied_since ?? r.seated_at
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 60000))
}

/**
 * NEEDS-YOU — the only computed alert in this view.
 * Occupied, no sale rung, and seated more than 20 minutes ago.
 */
export function needsYou(r: VenueRow, now = Date.now()): boolean {
  if ((r.status ?? '').toLowerCase() !== 'occupied') return false
  if (r.current_sale_id) return false
  const mins = seatedMinutes(r, now)
  return mins !== null && mins > 20
}

export function dotColour(r: VenueRow, now = Date.now()): string {
  if (needsYou(r, now)) return TOY.red
  return isBusy(r.status) ? TOY.orange : TOY.green
}

export const money = (x: unknown) => '$' + (Number(x) || 0).toFixed(2)

const MELBOURNE = 'Australia/Melbourne'

export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: MELBOURNE })
}

export function minutesAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000))
  return m === 0 ? 'just now' : m + ' min ago'
}


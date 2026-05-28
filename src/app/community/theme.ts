// Aria Community — LOCKED design system ("Pipel direction").
// Single source of truth. NO inline hex codes anywhere in /community pages —
// everything imports from here. Do not introduce extra colours, greys, or
// pastels. The hard 1.5px ink borders are load-bearing; never soften to grey.
import type { CSSProperties } from 'react'

// ── Palette — the ONLY 7 colours ─────────────────────────────────────
export const PALETTE = {
  bg: '#fafafa',          // off-white page background
  surface: '#ffffff',     // cards, nav, modals
  surfaceAlt: '#f3f3f3',  // chips, search input, secondary buttons
  ink: '#0a0a0a',         // ALL primary text AND all card borders
  inkSoft: '#888888',     // secondary text
  accent: '#d9f54e',      // lime — active state, save, $price highlight, story rings, primary CTA, LIVE-pill bg
  live: '#ff3b5e',        // LIVE pill, urgent badges only
} as const

// Back-compat aliases — older code referenced C.text / C.muted / C.border etc.
// All resolved to the locked palette so nothing reads a stray grey.
export const C = {
  bg: PALETTE.bg,
  surface: PALETTE.surface,
  surfaceHi: PALETTE.surfaceAlt,
  surfaceAlt: PALETTE.surfaceAlt,
  border: PALETTE.ink,          // hard ink borders
  ink: PALETTE.ink,
  text: PALETTE.ink,
  textDim: PALETTE.ink,         // use opacity for subtlety, not a grey
  textMuted: PALETTE.inkSoft,
  inkSoft: PALETTE.inkSoft,
  accent: PALETTE.accent,
  accentDeep: PALETTE.accent,
  danger: PALETTE.live,
  live: PALETTE.live,
  warning: PALETTE.live,
} as const

// ── Borders / radii / shadows ────────────────────────────────────────
export const BORDER = `1.5px solid ${PALETTE.ink}`          // HARD ink — never grey
export const NAV_SHADOW = `4px 4px 0 ${PALETTE.ink}`        // flat hard offset, no blur

export const RADIUS = {
  pill: 12,    // pills / chips: 11-13px
  sm: 9,       // image tiles
  md: 14,      // smaller cards: 14-18px
  lg: 18,      // cards
  xl: 22,      // main cards / nav
  phone: 30,   // phone frame
}

// ── Typography ───────────────────────────────────────────────────────
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
// No separate display font in this system — Inter at 700/800 does the headings.
export const FONT_DISPLAY = FONT

export const TYPE = {
  display: { fontWeight: 700, letterSpacing: '-0.03em' as const },   // page titles, business names
  section: { fontWeight: 700, letterSpacing: '-0.02em' as const },   // section headings
  body:    { fontWeight: 500 },
  number:  { fontWeight: 700, letterSpacing: '-0.03em' as const },   // prices, stat values
  meta:    {
    fontWeight: 600,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em' as const,
    color: PALETTE.inkSoft,
  },
} as const

// ── Layout ───────────────────────────────────────────────────────────
export const MAX_W = 520        // mobile-first container
export const NAV_HEIGHT = 78    // floating nav clearance

// ── Signature helpers ────────────────────────────────────────────────
// Inline price highlight — wrap "$9" in a lime span. The signature move.
export const priceHighlightStyle: CSSProperties = {
  background: PALETTE.accent,
  color: PALETTE.ink,
  padding: '0 5px',
  borderRadius: 5,
}

// Lime CTA pill (follow / save / primary)
export const accentPillStyle: CSSProperties = {
  background: PALETTE.accent,
  color: PALETTE.ink,
  border: BORDER,
  borderRadius: RADIUS.pill,
  fontWeight: 700,
}

// Outline pill (message / secondary) on white
export const outlinePillStyle: CSSProperties = {
  background: PALETTE.surface,
  color: PALETTE.ink,
  border: BORDER,
  borderRadius: RADIUS.pill,
  fontWeight: 700,
}

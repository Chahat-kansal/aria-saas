// Shared Pipel design tokens for the booking flow — BOOKINGS-CX-BUILD-1.
// Byte-identical to the constants already shipped in RewardsClient.tsx / WalletClient.tsx /
// loyalty/[business_id]/page.tsx. Reused, not reinvented — see BOOKINGS-UI-SPEC.md Part 3.
import type { CSSProperties } from 'react'

export const BG = '#f3efe4'
export const INK = '#0a0a0a'
export const ACCENT = '#d9f54e'
export const ACCENT_TEXT = '#2f3a06'
export const INK_MUTED = '#6b7280'
export const RED = '#ef4444'
export const FD = "var(--font-display,'Cormorant',Georgia,serif)"
export const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

// The exact glass-card recipe used everywhere in RewardsClient.tsx (RewardCard, ChallengeCard,
// empty states) — reused verbatim rather than inventing a second shadow/border/blur recipe.
export const glassCard: CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.60)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
}

export const pillPrimary: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  background: ACCENT,
  color: ACCENT_TEXT,
  borderRadius: 100,
  border: 'none',
  fontFamily: FB,
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '0 0 18px rgba(217,245,78,0.50)',
}

export const pillOutline: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  background: 'transparent',
  color: INK,
  borderRadius: 100,
  border: '1px solid rgba(10,10,10,0.15)',
  fontFamily: FB,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

export const h1Style: CSSProperties = {
  fontFamily: FD,
  fontStyle: 'italic',
  fontSize: 32,
  fontWeight: 400,
  color: INK,
  margin: 0,
  textAlign: 'center',
  lineHeight: 1.1,
}

// BOOKINGS-POLISH-1 — the day/date mismatch bug: dateStr() previously round-tripped a picked
// calendar Date through toISOString(), which converts to UTC. For any customer in a positive
// UTC-offset timezone (all of Australia), that silently shifts the stored date a day earlier
// than the cell they actually clicked (local midnight on the clicked day = the previous day,
// afternoon, UTC). This reads the calendar Date's own local Y/M/D fields directly — no timezone
// conversion at all, so the stored string always matches the cell the customer clicked.
export function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// A booking's calendar day is the venue's day, not whatever timezone the browser (or the
// server rendering a confirmation email) happens to be in — so weekday/date-of-month are always
// derived from the SAME instant (noon UTC on the stored Y-M-D, comfortably clear of any date-line
// edge case) and explicitly formatted in the business's own timezone. Used identically by the
// booking flow, the manage/cancel pages, and the confirmation email, so all three can never
// disagree with each other the way "one side UTC, one side local" previously allowed.
export function fmtDateInTz(dateStr: string, tz: string = 'Australia/Sydney'): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return noonUtc.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
}

export function shimmerCss() {
  return `
    @keyframes booking-shimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } }
    .booking-skeleton {
      background: linear-gradient(90deg, rgba(10,10,10,0.06) 25%, rgba(10,10,10,0.10) 37%, rgba(10,10,10,0.06) 63%);
      background-size: 400px 100%;
      animation: booking-shimmer 1.4s ease infinite;
    }
  `
}

// OWNER-APP PH-1 — Pipel theme tokens (locked). Fonts are already loaded globally
// (src/app/layout.tsx: Outfit -> --font-body, JetBrains Mono -> --font-mono) — reused here, not
// re-imported.
export const BG = '#fafafa'
export const INK = '#0a0a0a'
export const ACCENT = '#d9f54e'
export const SUBTEXT = '#8a8a8a'
export const BORDER = '#e5e5e5'

export const FONT_BODY = 'var(--font-body)'
export const FONT_MONO = 'var(--font-mono)'

export const DOMAIN_LABELS: Record<string, string> = {
  money: 'Money', people: 'People', growth: 'Growth', supply: 'Supply', compliance: 'Compliance',
}

export function formatDollars(cents: number | null | undefined): string {
  return '$' + ((Number(cents ?? 0) / 100) || 0).toFixed(2)
}

// INV-PIPEL — the locked Pipel design tokens for the inventory staff PWA. Single source of truth, taken
// verbatim from mockups/aria-inventory-pipel-theme.html. VISUAL ONLY — no behaviour lives here. Every Pipel
// primitive and every reskinned screen pulls from this object so there is zero per-screen colour drift.

export const P = {
  ink: '#0a0a0a',
  lime: '#d9f54e',
  bg: '#fafafa',
  card: '#ffffff',
  muted: '#6f6f6f',
  faint: '#9a9a9a',
  line: '#0a0a0a',          // borders are ALWAYS ink
  soft: '#eceae3',          // bar track / inset fills
  amber: '#BA7517',         // action / "soon" semantic
  red: '#E24B4A',           // loss / waste ONLY
  // tints used for soft chip backgrounds (kept on-palette)
  limeSoft: '#f1fbcf',
  redSoft: '#fdeceb',
  amberSoft: '#f6efe0',
} as const

export const JAKARTA = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif"

/** Hard 3px offset shadow used on every tool tile. */
export const HARD_SHADOW = `3px 3px 0 ${P.ink}`

/** Money — dollars, no cents, grouped (matches the mockup's "$11,471"). */
export const pmoney = (n: number) => `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

/** Time-aware greeting word from the USER'S real clock (lowercase, per the mockup). */
export const greetWord = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening' }

/** Long date line, e.g. "Tuesday, 25 June". */
export const pipelDate = () => new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

export const pinitials = (name: string) => name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
export const pfirst = (name: string) => (name.split(' ')[0] ?? name).toLowerCase()

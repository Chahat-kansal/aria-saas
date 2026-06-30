// Single source of truth for menu theme derivation.
// Imported by both MenuClient (public page) and MenuBuilderClient (builder preview)
// so the two surfaces can never drift apart.

export type Theme = {
  bg: string; card: string; ink: string; accent: string
  accentSoft: string; line: string; muted: string; fontCss: string; bgCss: string
}

export const TEMPLATES = [
  { id: 'editorial', name: 'Editorial',       font: 'Fraunces',         look: { bg: '#fbf8f1', card: '#fff',     ink: '#1a1206', accent: '#BA7517', accentSoft: '#f5e6c8', line: '#e6ddc9', muted: '#7a6a52' } },
  { id: 'pipel',     name: 'Pipel',           font: 'Space Grotesk',    look: { bg: '#0a0a0a', card: '#1a1a1a', ink: '#fafafa', accent: '#d9f54e', accentSoft: '#d9f54e', line: '#262626', muted: '#a0a0a0' } },
  { id: 'garden',    name: 'Garden',          font: 'Cormorant',        look: { bg: '#f4f7f3', card: '#fff',     ink: '#21372b', accent: '#7FB897', accentSoft: '#d4edda', line: '#dde8df', muted: '#4a6b58' } },
  { id: 'grand',     name: 'Grand',           font: 'Playfair Display', look: { bg: '#fffdf9', card: '#fff',     ink: '#161616', accent: '#9a7b3f', accentSoft: '#f2e8d6', line: '#eceae3', muted: '#6b6050' } },
  { id: 'mono',      name: 'Mono',            font: 'Inter',            look: { bg: '#ffffff', card: '#f4f4f5', ink: '#111',    accent: '#111',    accentSoft: '#e4e4e7', line: '#ededed', muted: '#71717a' } },
  { id: 'noir',      name: 'Noir',            font: 'Inter',            look: { bg: '#16151a', card: '#1f1e24', ink: '#f4f4f5', accent: '#e8a87c', accentSoft: '#e8a87c', line: '#2c2b32', muted: '#9ca3af' } },
]

export const FONTS: Record<string, string> = {
  'Fraunces':         "'Fraunces',Georgia,serif",
  'Space Grotesk':    "'Space Grotesk',system-ui,sans-serif",
  'Cormorant':        "'Cormorant',Georgia,serif",
  'Playfair Display': "'Playfair Display',Georgia,serif",
  'Inter':            "'Inter',system-ui,sans-serif",
}

export const BGS: Record<string, string> = {
  'none':    '',
  'flowers': 'radial-gradient(circle at 18% 12%,#f6d7e4cc,transparent 36%),radial-gradient(circle at 82% 78%,#e9c6dccc,transparent 38%)',
  'coffee':  'radial-gradient(circle at 75% 18%,#caa98266,transparent 42%),radial-gradient(circle at 22% 82%,#a87f4f66,transparent 45%)',
  'linen':   'repeating-linear-gradient(45deg,#00000008 0 2px,transparent 2px 7px),repeating-linear-gradient(-45deg,#00000008 0 2px,transparent 2px 7px)',
  'marble':  'radial-gradient(circle at 28% 30%,#ececef,transparent 52%),radial-gradient(circle at 72% 70%,#dededf,transparent 55%)',
  'botanic': 'radial-gradient(circle at 12% 88%,#7FB89744,transparent 40%),radial-gradient(circle at 88% 12%,#2D524033,transparent 42%)',
  'warm':    'linear-gradient(135deg,#ffe9d0bb,#ffd9b388)',
  // 'blobs' swatch — picker preview only. deriveTheme() replaces this with theme-derived CSS at render time.
  'blobs':   'radial-gradient(circle at 25% 22%,rgba(160,140,120,0.26),transparent 44%),radial-gradient(circle at 72% 68%,rgba(140,120,100,0.20),transparent 48%)',
}

export function deriveTheme(
  templateId: string,
  brandKit: Record<string, unknown> | null,
  backgroundId: string | null,
): Theme {
  const tpl = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
  const bk = brandKit ?? {}
  const accent  = (bk.accent  as string  | undefined) ?? tpl.look.accent
  const fontId  = (bk.font    as string  | undefined) ?? tpl.font
  const fontCss = FONTS[fontId] ?? "'Inter',system-ui,sans-serif"
  // For 'blobs', compute CSS dynamically from the active theme accent + template's accentSoft
  // so blobs auto-tint per business. Other backgrounds use the static BGS map.
  let bgCss = BGS[backgroundId ?? 'none'] ?? ''
  if (backgroundId === 'blobs') {
    const bgR = parseInt(tpl.look.bg.slice(1, 3) || '80', 16)
    const isDark = bgR < 40
    const a1 = isDark ? '44' : '28'
    const a2 = isDark ? '33' : '1e'
    const a3 = isDark ? '22' : '14'
    bgCss =
      'radial-gradient(circle at 22% 20%,' + accent + a1 + ',transparent 42%),' +
      'radial-gradient(circle at 78% 72%,' + tpl.look.accentSoft + a2 + ',transparent 46%),' +
      'radial-gradient(circle at 56% 88%,' + accent + a3 + ',transparent 36%),' +
      'radial-gradient(circle at 14% 76%,' + tpl.look.accentSoft + a2 + ',transparent 38%)'
  }
  return {
    bg: tpl.look.bg, card: tpl.look.card, ink: tpl.look.ink,
    accent, accentSoft: tpl.look.accentSoft, line: tpl.look.line, muted: tpl.look.muted,
    fontCss, bgCss,
  }
}
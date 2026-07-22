import { PALETTE, RADIUS } from './theme'

// CX-GAME-LEAN — small lime level chip, e.g. "L3 · Insider". Reuses the locked community theme
// (theme.ts) — no new colours/fonts introduced. Renders nothing when level is null/undefined (a
// commenter/viewer with no established loyalty link for this business — never fabricate an L1).

export function LevelChip({ level }: { level: { level: number; name: string } | null | undefined }) {
  if (!level) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: PALETTE.accent, color: PALETTE.ink,
      borderRadius: RADIUS.pill, padding: '1px 8px',
      fontSize: 10, fontWeight: 600, letterSpacing: '0.01em', lineHeight: 1.6,
    }}>
      L{level.level} · {level.name}
    </span>
  )
}

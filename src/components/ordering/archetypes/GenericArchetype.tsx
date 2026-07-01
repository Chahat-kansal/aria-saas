import type { Theme } from '@/lib/menu/menu-theme'

function fmtPrice(d: number) { return 'A$' + d.toFixed(2) }

interface Opt { id: string; name: string; priceCents: number }
interface Grp {
  id: string; name: string
  isRequired: boolean; minSelections: number; maxSelections: number
  archetypeSlot: string | null
  options: Opt[]
}

interface Props {
  modifierGroups: Grp[]
  selectedMods: Record<string, string[]>
  onToggleMod: (grpId: string, modId: string, maxSel: number) => void
  theme: Theme
}

export function GenericArchetype({ modifierGroups, selectedMods, onToggleMod, theme }: Props) {
  if (modifierGroups.length === 0) return null
  return (
    <div>
      {modifierGroups.map(grp => {
        const sel = selectedMods[grp.id] ?? []
        const atMax = sel.length >= grp.maxSelections
        return (
          <div key={grp.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: theme.ink }}>{grp.name}</span>
              {grp.isRequired && (
                <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 4, padding: '1px 5px' }}>Required</span>
              )}
              {grp.maxSelections > 1 && (
                <span style={{ fontSize: 10, color: theme.muted }}>{'up to ' + grp.maxSelections}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              {grp.options.map(opt => {
                const isSel = sel.includes(opt.id)
                const isDisabled = !isSel && atMax
                return (
                  <button key={opt.id}
                    onClick={() => { if (!isDisabled) onToggleMod(grp.id, opt.id, grp.maxSelections) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10,
                      border: '1.5px solid ' + (isSel ? theme.accent : theme.line),
                      background: isSel ? theme.accent + '18' : theme.bg,
                      cursor: isDisabled ? 'default' : 'pointer',
                      opacity: isDisabled ? 0.45 : 1, textAlign: 'left' as const,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 16, height: 16,
                        borderRadius: grp.maxSelections === 1 ? '50%' : 3,
                        border: '2px solid ' + (isSel ? theme.accent : theme.line),
                        background: isSel ? theme.accent : 'transparent',
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 14, color: theme.ink, fontWeight: isSel ? 700 : 400 }}>{opt.name}</span>
                    </div>
                    {opt.priceCents > 0 && (
                      <span style={{ fontSize: 13, color: theme.accent, fontWeight: 600 }}>{'+ ' + fmtPrice(opt.priceCents / 100)}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
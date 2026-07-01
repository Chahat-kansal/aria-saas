import type { Theme } from '@/lib/menu/menu-theme'

function fmtPrice(d: number) { return 'A$' + d.toFixed(2) }

// Visual food slots — modifier groups with these archetype_slot values
// animate as burger layers; all others render as plain option rows below.
const VISUAL_SLOTS = new Set(['protein', 'cheese', 'topping', 'toppings', 'sauce', 'extras'])

// Layer appearance config per slot
const SLOT_CFG: Record<string, { bg: string }> = {
  protein:  { bg: '#5C3A0A' },
  sauce:    { bg: '#c0392b' },
  cheese:   { bg: '#F5C518' },
  topping:  { bg: '#4a7c59' },
  toppings: { bg: '#4a7c59' },
  extras:   { bg: '#6B8C5A' },
}

// Canonical order layers stack bottom-to-top inside the burger
const SLOT_ORDER = ['protein', 'sauce', 'cheese', 'topping', 'toppings', 'extras']

interface Opt { id: string; name: string; priceCents: number }
interface Grp {
  id: string; name: string; archetypeSlot: string | null
  isRequired: boolean; minSelections: number; maxSelections: number
  options: Opt[]
}

interface Props {
  modifierGroups: Grp[]
  selectedMods: Record<string, string[]>
  onToggleMod: (grpId: string, modId: string, maxSel: number) => void
  theme: Theme
}

export function FoodArchetype({ modifierGroups, selectedMods, onToggleMod, theme }: Props) {
  const visualGroups = modifierGroups.filter(g => g.archetypeSlot && VISUAL_SLOTS.has(g.archetypeSlot))
  const plainGroups  = modifierGroups.filter(g => !g.archetypeSlot || !VISUAL_SLOTS.has(g.archetypeSlot))

  // Build ordered active layers — each canonical slot appears at most once
  const seenSlots = new Set<string>()
  const activeLayers: Array<{ slot: string; group: Grp }> = []
  for (const slot of SLOT_ORDER) {
    const grp = visualGroups.find(g => g.archetypeSlot === slot || (slot === 'topping' && g.archetypeSlot === 'toppings'))
    if (!grp) continue
    const canonSlot = slot === 'toppings' ? 'topping' : slot
    if (seenSlots.has(canonSlot)) continue
    if ((selectedMods[grp.id] ?? []).length > 0) {
      seenSlots.add(canonSlot)
      activeLayers.push({ slot: canonSlot, group: grp })
    }
  }

  // Top bun: resting position sits flush on bottom bun (translateY=0).
  // Lifts by 24px per active layer.
  const topBunTranslate = -activeLayers.length * 24

  return (
    <div>
      {/* ── Burger figure ── */}
      <div style={{ position: 'relative', width: 200, height: 160, margin: '0 auto 20px' }}>

        {/* Top bun — dome, lifts up as layers appear */}
        <div style={{
          position: 'absolute', left: 20, right: 20,
          top: 62, height: 54,
          borderRadius: '35px 35px 0 0',
          background: '#C8832A',
          transform: 'translateY(' + topBunTranslate + 'px)',
          transition: 'transform 0.3s ease',
          zIndex: 3,
        }}>
          {/* Sesame seeds */}
          {[{l:28,t:14},{l:52,t:8},{l:76,t:15},{l:98,t:9},{l:116,t:17}].map((s, i) => (
            <div key={i} style={{ position: 'absolute', left: s.l, top: s.t, width: 6, height: 3, borderRadius: 3, background: '#f5e6c8', opacity: 0.72 }} />
          ))}
          {/* Shine */}
          <div style={{ position: 'absolute', top: 10, left: 24, width: 34, height: 10, borderRadius: 8, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Active ingredient layers (stacked above bottom bun, bottom-to-top) */}
        {activeLayers.map((layer, idx) => {
          const cfg = SLOT_CFG[layer.slot] ?? SLOT_CFG['extras']
          const sel = selectedMods[layer.group.id] ?? []
          const label = sel.map(mid => layer.group.options.find(o => o.id === mid)?.name ?? '').filter(Boolean).join(' + ')
          const isCheese = layer.slot === 'cheese'
          return (
            <div key={layer.slot} style={{
              position: 'absolute',
              left: isCheese ? 10 : 22,
              right: isCheese ? 10 : 22,
              height: 22,
              bottom: 44 + idx * 24,
              borderRadius: isCheese ? 2 : 5,
              background: cfg.bg,
              transition: 'bottom 0.3s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2,
            }}>
              {label.length > 0 && (
                <span style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.92)', fontWeight: 700,
                  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                }}>
                  {label.length > 18 ? label.slice(0, 16) + '…' : label}
                </span>
              )}
            </div>
          )
        })}

        {/* Bottom bun */}
        <div style={{
          position: 'absolute', left: 20, right: 20, bottom: 0, height: 44,
          borderRadius: '0 0 35px 35px',
          background: '#C8832A',
          zIndex: 1,
        }}>
          <div style={{ position: 'absolute', top: 6, left: 22, right: 22, height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.1)' }} />
        </div>
      </div>

      {/* ── Visual-slot groups — chip style (selections show as burger layers) ── */}
      {visualGroups.map(grp => {
        const sel = selectedMods[grp.id] ?? []
        const atMax = sel.length >= grp.maxSelections
        return (
          <div key={grp.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: theme.ink }}>{grp.name}</span>
              {grp.isRequired && (
                <span style={{ fontSize: 10, fontWeight: 700, color: theme.accent, border: '1px solid ' + theme.accent, borderRadius: 4, padding: '1px 5px' }}>Required</span>
              )}
              {grp.maxSelections > 1 && (
                <span style={{ fontSize: 10, color: theme.muted }}>{'up to ' + grp.maxSelections}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {grp.options.map(opt => {
                const isSel = sel.includes(opt.id)
                const isDisabled = !isSel && atMax
                return (
                  <button key={opt.id}
                    onClick={() => { if (!isDisabled) onToggleMod(grp.id, opt.id, grp.maxSelections) }}
                    style={{
                      padding: '7px 13px', borderRadius: 20,
                      border: '1.5px solid ' + (isSel ? theme.accent : theme.line),
                      background: isSel ? theme.accent + '18' : theme.bg,
                      cursor: isDisabled ? 'default' : 'pointer',
                      opacity: isDisabled ? 0.45 : 1,
                      fontSize: 13, fontWeight: isSel ? 700 : 400,
                      color: isSel ? theme.accent : theme.ink,
                    }}>
                    {opt.name}{opt.priceCents > 0 ? '  +' + fmtPrice(opt.priceCents / 100) : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Separator between visual and plain groups */}
      {visualGroups.length > 0 && plainGroups.length > 0 && (
        <div style={{ height: 1, background: theme.line, margin: '4px 0 14px' }} />
      )}

      {/* ── Plain groups (size, dairy, temp, etc.) — full-width row style ── */}
      {plainGroups.map(grp => {
        const sel = selectedMods[grp.id] ?? []
        const atMax = sel.length >= grp.maxSelections
        return (
          <div key={grp.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
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
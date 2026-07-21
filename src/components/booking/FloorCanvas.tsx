'use client'
// BOOKINGS-MOCKUP-MATCH — the ONE floor-plan renderer, shared by the owner's live preview and the
// customer-facing table picker, so they can never visually drift apart. Flat line-art per the
// mockup (Screen 3): no glass card, no blur, no shadow — just shapes on the page background.
import { INK, INK_MUTED, ACCENT, ACCENT_TEXT } from './tokens'

export interface FloorElement {
  id: string
  element_type: 'table' | 'bar' | 'counter' | 'kitchen' | 'entrance' | 'wall' | 'plant'
  name: string
  display_name?: string | null
  seats: number
  shape: 'square' | 'round' | 'rectangle' | 'booth'
  pos_x: number
  pos_y: number
  width: number
  height: number
  rotation: number
  seating_area?: string | null
  free?: boolean // only meaningful for element_type 'table'
}

const ELEMENT_FILL: Record<string, string> = {
  bar: 'rgba(10,10,10,0.85)',
  counter: 'rgba(10,10,10,0.65)',
  kitchen: 'rgba(10,10,10,0.10)',
  wall: 'rgba(10,10,10,0.35)',
}
const ELEMENT_LABEL_LIGHT: Record<string, boolean> = { bar: true, counter: true }

function radiusFor(shape: FloorElement['shape'], w: number, h: number): number {
  if (shape === 'round') return Math.min(w, h) / 2
  if (shape === 'booth') return 20
  return 10
}

// Small rectangular ticks around the perimeter standing in for individual chairs — matches the
// mockup's tables (2 ticks on short sides for 2-seaters, more spread around larger ones).
function ChairTicks({ seats, w, h }: { seats: number; w: number; h: number }) {
  if (seats <= 0) return null
  const ticks = Math.min(seats, 8)
  const perSideTop = Math.ceil(ticks / 4)
  const positions: { x: number; y: number; horiz: boolean }[] = []
  const sides: Array<'top' | 'bottom' | 'left' | 'right'> = ['top', 'bottom', 'left', 'right']
  let remaining = ticks
  for (const side of sides) {
    if (remaining <= 0) break
    const count = Math.min(perSideTop, remaining)
    for (let i = 0; i < count; i++) {
      const frac = (i + 1) / (count + 1)
      if (side === 'top') positions.push({ x: w * frac, y: -5, horiz: true })
      if (side === 'bottom') positions.push({ x: w * frac, y: h + 5, horiz: true })
      if (side === 'left') positions.push({ x: -5, y: h * frac, horiz: false })
      if (side === 'right') positions.push({ x: w + 5, y: h * frac, horiz: false })
    }
    remaining -= count
  }
  return (
    <>
      {positions.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: p.x - (p.horiz ? 5 : 3), top: p.y - (p.horiz ? 3 : 5),
          width: p.horiz ? 10 : 6, height: p.horiz ? 6 : 10,
          borderRadius: 2, background: 'rgba(10,10,10,0.30)',
        }} />
      ))}
    </>
  )
}

function EntranceIcon() {
  // Door-swing glyph — the standard floor-plan "entry point" marker, playing the staircase icon's
  // role in the mockup (a fixed location anchor, not a bookable element).
  return (
    <svg width="100%" height="100%" viewBox="0 0 60 44" fill="none">
      <line x1="4" y1="40" x2="4" y2="4" stroke={INK} strokeWidth="2" />
      <path d="M4 40 A36 36 0 0 0 40 4" stroke={INK} strokeWidth="1.2" strokeDasharray="3 3" fill="none" />
      <line x1="4" y1="40" x2="40" y2="4" stroke={INK} strokeWidth="2" />
    </svg>
  )
}

function PlantIcon() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="15" r="6" fill="rgba(45,82,64,0.25)" stroke={INK} strokeWidth="1" />
      <path d="M12 15V6M12 9c-3 0-4-3-4-3s3 0 4 3zM12 9c3 0 4-3 4-3s-3 0-4 3z" stroke={INK} strokeWidth="1" fill="none" />
    </svg>
  )
}

function renderElement(el: FloorElement, opts: {
  selected?: boolean
  interactive?: boolean
  onClick?: () => void
}) {
  const { selected, interactive, onClick } = opts
  const radius = radiusFor(el.shape, el.width, el.height)
  const label = el.display_name || el.name

  if (el.element_type === 'entrance') {
    return (
      <div key={el.id} style={{ position: 'absolute', left: el.pos_x, top: el.pos_y, width: el.width, height: el.height, transform: `rotate(${el.rotation}deg)` }}>
        <EntranceIcon />
      </div>
    )
  }
  if (el.element_type === 'plant') {
    return (
      <div key={el.id} style={{ position: 'absolute', left: el.pos_x, top: el.pos_y, width: el.width, height: el.height, transform: `rotate(${el.rotation}deg)` }}>
        <PlantIcon />
      </div>
    )
  }
  if (el.element_type === 'wall') {
    return (
      <div key={el.id} style={{
        position: 'absolute', left: el.pos_x, top: el.pos_y, width: el.width, height: el.height,
        background: ELEMENT_FILL.wall, borderRadius: 2, transform: `rotate(${el.rotation}deg)`,
      }} />
    )
  }
  if (el.element_type === 'bar' || el.element_type === 'counter' || el.element_type === 'kitchen') {
    const light = ELEMENT_LABEL_LIGHT[el.element_type]
    return (
      <div key={el.id} style={{
        position: 'absolute', left: el.pos_x, top: el.pos_y, width: el.width, height: el.height,
        background: ELEMENT_FILL[el.element_type], borderRadius: 10,
        border: '1px solid rgba(10,10,10,0.15)', transform: `rotate(${el.rotation}deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: light ? '#fff' : INK, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      </div>
    )
  }

  // element_type === 'table'
  const free = el.free !== false
  const fill = selected ? ACCENT : free ? 'rgba(217,245,78,0.16)' : 'rgba(10,10,10,0.04)'
  const border = selected ? ACCENT_TEXT : free ? ACCENT : 'rgba(10,10,10,0.18)'
  const textColor = selected ? ACCENT_TEXT : INK

  return (
    <button
      key={el.id}
      disabled={!interactive || !free}
      onClick={onClick}
      style={{
        position: 'absolute', left: el.pos_x, top: el.pos_y, width: el.width, height: el.height,
        transform: `rotate(${el.rotation}deg)`,
        borderRadius: radius, border: '2px solid ' + border, background: fill,
        cursor: interactive && free ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 0, fontFamily: 'inherit',
      }}
    >
      <ChairTicks seats={el.seats} w={el.width} h={el.height} />
      <span style={{ fontSize: 12, fontWeight: 700, color: textColor, transform: `rotate(${-el.rotation}deg)` }}>{label}</span>
      <span style={{ fontSize: 10, color: INK_MUTED, transform: `rotate(${-el.rotation}deg)` }}>{el.seats} seats</span>
    </button>
  )
}

export function FloorCanvas({ elements, selectedId, onSelectTable, interactive = false, height = 480 }: {
  elements: FloorElement[]
  selectedId?: string | null
  onSelectTable?: (id: string) => void
  interactive?: boolean
  height?: number
}) {
  const maxX = Math.max(300, ...elements.map(e => e.pos_x + e.width + 20))
  const maxY = Math.max(200, ...elements.map(e => e.pos_y + e.height + 20))

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, fontFamily: 'inherit', color: INK_MUTED }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid ' + ACCENT, display: 'inline-block' }} />
          Available
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(10,10,10,0.2)', display: 'inline-block' }} />
          Occupied
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: ACCENT, display: 'inline-block' }} />
          Selected
        </span>
      </div>
      <div style={{ position: 'relative', width: '100%', height, overflow: 'auto' }}>
        <div style={{ position: 'relative', width: maxX, height: maxY }}>
          {elements.map(el => renderElement(el, {
            selected: el.id === selectedId,
            interactive,
            onClick: () => onSelectTable?.(el.id),
          }))}
        </div>
      </div>
    </div>
  )
}

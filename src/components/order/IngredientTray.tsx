'use client'
import { useDraggable } from '@dnd-kit/core'
import { INGREDIENT_PATHS, OPTIONAL_TOPPINGS, type IngredientKey } from './ingredients'
import type { ModifierInfo } from './useOrderBuilder'

interface TileProps {
  id: IngredientKey
  isDefaultActive: boolean   // default included and NOT removed
  extraQty: number           // extra units added above defaults
  modInfo?: ModifierInfo
  onTap: () => void          // toggles default (if default) or adds 1 extra (if not)
  onQtyChange: (delta: number) => void
}

function DraggableTile({ id, isDefaultActive, extraQty, modInfo, onTap, onQtyChange }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })

  const isActive = isDefaultActive || extraQty > 0
  const allowQty = modInfo?.allowQty ?? false
  const maxQty   = modInfo?.maxQty  ?? 1
  const priceCents = modInfo?.priceCents ?? 0

  const tx = transform ? transform.x : 0
  const ty = transform ? transform.y : 0

  const priceLabel = isDefaultActive && extraQty === 0
    ? 'incl'
    : priceCents > 0
      ? '+$' + (priceCents / 100).toFixed(2)
      : ''

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onTap}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 8px 8px',
        borderRadius: 14,
        border: '2px solid ' + (isActive ? '#d9f54e' : '#e5e7eb'),
        background: isActive ? '#f7fde0' : '#ffffff',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        position: 'relative',
        width: 80,
        flexShrink: 0,
        transform: 'translate3d(' + tx + 'px,' + ty + 'px,0)',
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : 'auto',
        boxShadow: isActive
          ? '0 0 0 1px #d9f54e, 0 2px 8px rgba(217,245,78,0.20)'
          : '0 1px 4px rgba(0,0,0,0.07)',
        transition: isDragging ? 'none' : 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Check badge (for active items without stepper) */}
      {isActive && !allowQty && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 18, height: 18, borderRadius: '50%',
          background: '#d9f54e', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#2f3a06', fontWeight: 700,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)', pointerEvents: 'none',
        }}>
          ✓
        </div>
      )}

      {/* Qty stepper badge (for allowQty tiles) */}
      {allowQty && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: -8, right: -8,
            display: 'flex', alignItems: 'center', gap: 2,
            background: '#fff', border: '1.5px solid #d9f54e',
            borderRadius: 20, padding: '1px 4px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            zIndex: 10,
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); onQtyChange(-1) }}
            disabled={extraQty === 0 && !isDefaultActive}
            style={{
              width: 16, height: 16, borderRadius: '50%', border: 'none',
              background: extraQty > 0 ? '#d9f54e' : '#e5e7eb',
              color: '#2f3a06', fontSize: 12, fontWeight: 700,
              cursor: extraQty > 0 ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              padding: 0, flexShrink: 0,
            }}
          >−</button>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#2f3a06', minWidth: 10, textAlign: 'center' }}>
            {extraQty}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onQtyChange(1) }}
            disabled={extraQty >= maxQty}
            style={{
              width: 16, height: 16, borderRadius: '50%', border: 'none',
              background: extraQty < maxQty ? '#d9f54e' : '#e5e7eb',
              color: '#2f3a06', fontSize: 12, fontWeight: 700,
              cursor: extraQty < maxQty ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
              padding: 0, flexShrink: 0,
            }}
          >+</button>
        </div>
      )}

      <img
        src={INGREDIENT_PATHS[id]}
        alt={id}
        draggable={false}
        style={{ width: 52, height: 52, objectFit: 'contain', pointerEvents: 'none' }}
      />

      <span style={{
        fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500,
        color: '#374151', textAlign: 'center', lineHeight: 1.2, textTransform: 'capitalize',
      }}>
        {id.replace('-', ' ')}
      </span>

      <span style={{
        fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: '#6b7280',
      }}>
        {priceLabel}
      </span>
    </div>
  )
}

interface TrayProps {
  defaultKeys: IngredientKey[]
  removed: ReadonlySet<IngredientKey>
  extras: Readonly<Partial<Record<IngredientKey, number>>>
  modifierMap: Partial<Record<IngredientKey, ModifierInfo>>
  onTap: (key: IngredientKey) => void
  onQtyChange: (key: IngredientKey, delta: number) => void
}

export function IngredientTray({ defaultKeys, removed, extras, modifierMap, onTap, onQtyChange }: TrayProps) {
  const defaultSet = new Set(defaultKeys)

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
      padding: '16px 16px 100px', maxWidth: 480, margin: '0 auto',
    }}>
      {OPTIONAL_TOPPINGS.map(id => (
        <DraggableTile
          key={id}
          id={id}
          isDefaultActive={defaultSet.has(id) && !removed.has(id)}
          extraQty={extras[id] ?? 0}
          modInfo={modifierMap[id]}
          onTap={() => onTap(id)}
          onQtyChange={delta => onQtyChange(id, delta)}
        />
      ))}
    </div>
  )
}
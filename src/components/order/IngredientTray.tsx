'use client'
import { useDraggable } from '@dnd-kit/core'
import { INGREDIENT_PATHS, type IngredientKey } from './ingredients'
import { OPTIONAL_TOPPINGS, TOPPING_PRICES } from './useOrderBuilder'

interface TileProps {
  id: IngredientKey
  isActive: boolean
  onTap: () => void
  toppingPrices?: Partial<Record<IngredientKey, number>>
}

function DraggableTile({ id, isActive, onTap, toppingPrices }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })

  const tx = transform ? transform.x : 0
  const ty = transform ? transform.y : 0
  const transformStr = 'translate3d(' + tx + 'px,' + ty + 'px,0)'

  const delta = (toppingPrices ?? TOPPING_PRICES)[id]
  const deltaStr = delta !== undefined ? ('+$' + delta.toFixed(2)) : ''

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
        position: 'relative',
        width: 80,
        flexShrink: 0,
        transform: transformStr,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : 'auto',
        boxShadow: isActive
          ? '0 0 0 1px #d9f54e, 0 2px 8px rgba(217,245,78,0.20)'
          : '0 1px 4px rgba(0,0,0,0.07)',
        transition: isDragging ? 'none' : 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Check badge */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#d9f54e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: '#2f3a06',
            fontWeight: 700,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          ✓
        </div>
      )}

      {/* Thumbnail */}
      <img
        src={INGREDIENT_PATHS[id]}
        alt={id}
        draggable={false}
        style={{
          width: 52,
          height: 52,
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      {/* Name */}
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 10,
          fontWeight: 500,
          color: '#374151',
          textAlign: 'center',
          lineHeight: 1.2,
          textTransform: 'capitalize',
        }}
      >
        {id}
      </span>

      {/* Price delta */}
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 10,
          fontWeight: 600,
          color: '#6b7280',
        }}
      >
        {deltaStr}
      </span>
    </div>
  )
}

interface TrayProps {
  active: IngredientKey[]
  toggleTopping: (k: IngredientKey) => void
  toppingPrices?: Partial<Record<IngredientKey, number>>
}

export function IngredientTray({ active, toggleTopping, toppingPrices }: TrayProps) {
  const activeSet = new Set(active)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center',
        padding: '16px 16px 100px',  // bottom padding clears PriceBar
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      {OPTIONAL_TOPPINGS.map(id => (
        <DraggableTile
          key={id}
          id={id}
          isActive={activeSet.has(id)}
          onTap={() => toggleTopping(id)}
          toppingPrices={toppingPrices}
        />
      ))}
    </div>
  )
}
'use client'
import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { LayeredProduct } from './LayeredProduct'
import { IngredientTray } from './IngredientTray'
import { PriceBar } from './PriceBar'
import { useOrderBuilder, OPTIONAL_TOPPINGS } from './useOrderBuilder'
import { INGREDIENT_PATHS, type IngredientKey } from './ingredients'

const DROP_ZONE_ID = 'burger-drop-zone'

interface ModifierOption { id: string; name: string; priceCents: number }
interface ModifierGroup { id: string; name: string; options: ModifierOption[] }

export interface BuildConfig {
  mode: 'build'
  layers: IngredientKey[]
  modifiers: { id: string; name: string; priceCents: number }[]
  basePrice: number
  extrasCents: number
  total: number
}

function BurgerDropZone({
  layers,
  isOver,
  setRef,
  size,
}: {
  layers: IngredientKey[]
  isOver: boolean
  setRef: (el: HTMLElement | null) => void
  size: number
}) {
  return (
    <div
      ref={setRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        borderRadius: 20,
        padding: 16,
        transition: 'background 0.15s',
        background: isOver ? 'rgba(217,245,78,0.10)' : 'transparent',
        outline: isOver ? '2px dashed #d9f54e' : '2px dashed transparent',
      }}
    >
      <LayeredProduct layers={layers} size={size} />

      {/* "Drop here" hint shown while dragging over */}
      {isOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 8,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              background: '#d9f54e',
              color: '#2f3a06',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 20,
              padding: '4px 12px',
            }}
          >
            Drop to add
          </span>
        </div>
      )}
    </div>
  )
}

function DropZoneWrapper({
  layers,
  onDrop,
  size,
}: {
  layers: IngredientKey[]
  onDrop: (k: IngredientKey) => void
  size: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID })
  return (
    <BurgerDropZone
      layers={layers}
      isOver={isOver}
      setRef={setNodeRef}
      size={size}
    />
  )
}

interface Props {
  size?: number
  modifierGroups?: ModifierGroup[]
  productPrice?: number
  onAddToOrder?: (config: BuildConfig) => void
}

export function ProductCustomiser({ size = 220, modifierGroups, productPrice, onAddToOrder }: Props) {
  // Map each IngredientKey to the real DB modifier option (name-matched, case-insensitive).
  // e.g. 'cheese' matches "Extra Cheese" (priceCents=150), 'bacon' matches "Bacon" (250¢), etc.
  const ingredientToOption: Partial<Record<IngredientKey, ModifierOption>> = {}
  for (const group of modifierGroups ?? []) {
    for (const opt of group.options) {
      const nameLow = opt.name.toLowerCase()
      for (const key of OPTIONAL_TOPPINGS) {
        if (!ingredientToOption[key] && nameLow.includes(key)) {
          ingredientToOption[key] = opt
        }
      }
    }
  }

  const resolvedPrices: Partial<Record<IngredientKey, number>> = {}
  for (const key of OPTIONAL_TOPPINGS) {
    const opt = ingredientToOption[key]
    if (opt) resolvedPrices[key] = opt.priceCents / 100
  }
  const hasMappedPrices = Object.keys(resolvedPrices).length > 0

  const { active, layers, total, points, addTopping, toggleTopping } = useOrderBuilder(
    hasMappedPrices ? resolvedPrices : undefined,
    productPrice,
  )
  const [draggingId, setDraggingId] = useState<IngredientKey | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(event.active.id as IngredientKey)
  }

  function handleDragEnd(event: DragEndEvent) {
    if (event.over?.id === DROP_ZONE_ID && draggingId) {
      addTopping(draggingId)
    }
    setDraggingId(null)
  }

  function handleAddToOrder() {
    const selectedModifiers = active
      .map(key => ingredientToOption[key])
      .filter((opt): opt is ModifierOption => opt !== undefined)
      .map(opt => ({ id: opt.id, name: opt.name, priceCents: opt.priceCents }))

    const extrasCents = selectedModifiers.reduce((s, m) => s + m.priceCents, 0)

    onAddToOrder?.({
      mode: 'build',
      layers,
      modifiers: selectedModifiers,
      basePrice: productPrice ?? 0,
      extrasCents,
      total,
    })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          width: '100%',
        }}
      >
        {/* Burger stack with drop zone */}
        <DropZoneWrapper layers={layers} onDrop={addTopping} size={size} />

        {/* Tray — shows real DB prices when modifierGroups are passed */}
        <IngredientTray
          active={active}
          toggleTopping={toggleTopping}
          toppingPrices={hasMappedPrices ? resolvedPrices : undefined}
        />

        {/* Live price bar — onClick wired when onAddToOrder is provided */}
        <PriceBar
          total={total}
          points={points}
          onClick={onAddToOrder ? handleAddToOrder : undefined}
        />
      </div>

      {/* Floating drag ghost */}
      <DragOverlay dropAnimation={null}>
        {draggingId ? (
          <img
            src={INGREDIENT_PATHS[draggingId]}
            alt={draggingId}
            style={{
              width: 80,
              height: 80,
              objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
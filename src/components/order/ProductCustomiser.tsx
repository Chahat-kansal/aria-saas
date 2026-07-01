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
import { useOrderBuilder } from './useOrderBuilder'
import { INGREDIENT_PATHS, type IngredientKey } from './ingredients'

const DROP_ZONE_ID = 'burger-drop-zone'

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

export function ProductCustomiser({ size = 220 }: { size?: number }) {
  const { active, layers, total, points, addTopping, toggleTopping } = useOrderBuilder()
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

        {/* Tray */}
        <IngredientTray active={active} toggleTopping={toggleTopping} />

        {/* Live price bar */}
        <PriceBar total={total} points={points} />
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
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
import { useOrderBuilder, type ModifierInfo } from './useOrderBuilder'
import { ALL_PROTEINS, INGREDIENT_PATHS, OPTIONAL_TOPPINGS, type IngredientKey } from './ingredients'

const DROP_ZONE_ID = 'burger-drop-zone'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModifierOption {
  id: string
  name: string
  priceCents: number
  isDefault: boolean
  allowQuantity: boolean
  maxQuantity: number
  displayOrder: number | null
}

interface ModifierGroup {
  id: string
  name: string
  isRequired: boolean
  minSelections: number
  maxSelections: number
  allowQuantity: boolean
  selectionType: string
  archetypeSlot: string | null
  options: ModifierOption[]
}

export interface BuildConfig {
  mode: 'build'
  layers: IngredientKey[]
  added: { id: string; name: string; priceCents: number }[]
  removed: { name: string }[]
  modifiers: { id: string; name: string; priceCents: number }[]
  basePrice: number
  extrasCents: number
  total: number
}

// ── Name → IngredientKey helpers ──────────────────────────────────────────────

function nameToProteinKey(name: string): IngredientKey | null {
  const low = name.toLowerCase()
  if (low.includes('chicken')) return 'patty-chicken'
  if (low.includes('veg') || low.includes('plant') || low.includes('beyond') || low.includes('mushroom')) return 'patty-veg'
  if (low.includes('beef') || low.includes('patty') || low.includes('wagyu') || low.includes('angus')) return 'patty'
  return null
}

function nameToIngredientKey(name: string): IngredientKey | null {
  const low = name.toLowerCase()
  for (const key of OPTIONAL_TOPPINGS) {
    if (low.includes(key)) return key
  }
  return null
}

// ── Pill group (required single-choice) ──────────────────────────────────────

interface ProteinPillsProps {
  group: ModifierGroup
  proteinMap: Map<string, IngredientKey>   // optionId → IngredientKey
  activeProtein: IngredientKey
  onSelect: (key: IngredientKey, optId: string) => void
}

function ProteinPills({ group, proteinMap, activeProtein, onSelect }: ProteinPillsProps) {
  return (
    <div style={{ padding: '12px 16px 0', maxWidth: 480, margin: '0 auto' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: '#6b7280', marginBottom: 8,
      }}>
        {group.name}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {group.options.map(opt => {
          const key = proteinMap.get(opt.id)
          const isActive = key === activeProtein
          return (
            <button
              key={opt.id}
              onClick={() => key && onSelect(key, opt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 20,
                border: '2px solid ' + (isActive ? '#d9f54e' : '#e5e7eb'),
                background: isActive ? '#f7fde0' : '#fff',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                fontSize: 13, fontWeight: 600,
                color: isActive ? '#2f3a06' : '#374151',
                boxShadow: isActive
                  ? '0 0 0 1px #d9f54e, 0 2px 8px rgba(217,245,78,0.18)'
                  : '0 1px 4px rgba(0,0,0,0.07)',
                transition: 'all 0.15s',
              }}
            >
              {key && (
                <img
                  src={INGREDIENT_PATHS[key]}
                  alt={opt.name}
                  style={{ width: 28, height: 28, objectFit: 'contain', pointerEvents: 'none' }}
                />
              )}
              {opt.name}
              {opt.priceCents > 0 && (
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>
                  {'+$' + (opt.priceCents / 100).toFixed(2)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Drop zone wrapper ─────────────────────────────────────────────────────────

function DropZoneWrapper({ layers, size }: { layers: IngredientKey[]; size: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative', display: 'inline-block',
        borderRadius: 20, padding: 16,
        background: isOver ? 'rgba(217,245,78,0.10)' : 'transparent',
        outline: isOver ? '2px dashed #d9f54e' : '2px dashed transparent',
        transition: 'background 0.15s',
      }}
    >
      <LayeredProduct layers={layers} size={size} />
      {isOver && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 8, pointerEvents: 'none',
        }}>
          <span style={{
            background: '#d9f54e', color: '#2f3a06',
            fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700,
            borderRadius: 20, padding: '4px 12px',
          }}>Drop to add</span>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  size?: number
  modifierGroups?: ModifierGroup[]
  productPrice?: number
  onAddToOrder?: (config: BuildConfig) => void
}

export function ProductCustomiser({ size = 220, modifierGroups = [], productPrice, onAddToOrder }: Props) {

  // Classify groups: either-or pills (required, min=max=1) vs add-many trays
  const pillGroups = modifierGroups.filter(g =>
    g.isRequired && g.minSelections === 1 && g.maxSelections === 1,
  )
  const trayGroups = modifierGroups.filter(g =>
    !(g.isRequired && g.minSelections === 1 && g.maxSelections === 1),
  )

  // Build modifier maps from tray groups
  const modifierMap: Partial<Record<IngredientKey, ModifierInfo>> = {}
  const optionsByKey: Partial<Record<IngredientKey, ModifierOption>> = {}

  for (const group of trayGroups) {
    for (const opt of group.options) {
      const key = nameToIngredientKey(opt.name)
      if (key && !modifierMap[key]) {
        modifierMap[key] = {
          id: opt.id, name: opt.name, priceCents: opt.priceCents,
          allowQty: opt.allowQuantity || group.allowQuantity,
          maxQty: opt.maxQuantity > 1 ? opt.maxQuantity : (group.maxSelections > 1 ? group.maxSelections : 1),
        }
        optionsByKey[key] = opt
      }
    }
  }

  // Derive default ingredient keys from is_default=true options in tray groups
  const defaultKeys: IngredientKey[] = []
  for (const group of trayGroups) {
    for (const opt of group.options) {
      if (!opt.isDefault) continue
      const key = nameToIngredientKey(opt.name)
      if (key && !defaultKeys.includes(key)) defaultKeys.push(key)
    }
  }

  // Protein pill group mapping: optionId → IngredientKey
  const proteinPillGroup = pillGroups.find(g =>
    g.archetypeSlot === 'protein' ||
    g.options.some(o => nameToProteinKey(o.name) !== null),
  )
  const proteinMap = new Map<string, IngredientKey>()
  if (proteinPillGroup) {
    for (const opt of proteinPillGroup.options) {
      const key = nameToProteinKey(opt.name)
      if (key) proteinMap.set(opt.id, key)
    }
  }

  // Determine initial protein from default option in pill group
  let initialProtein: IngredientKey = 'patty'
  if (proteinPillGroup) {
    const defaultOpt = proteinPillGroup.options.find(o => o.isDefault)
    if (defaultOpt) {
      const k = proteinMap.get(defaultOpt.id)
      if (k) initialProtein = k
    } else if (proteinPillGroup.options.length > 0) {
      const k = proteinMap.get(proteinPillGroup.options[0].id)
      if (k) initialProtein = k
    }
  }

  const {
    protein, removed, extras, layers, total, points,
    toggleDefault, setExtraQty, swapProtein,
    addTopping,
  } = useOrderBuilder({ defaultKeys, modifierMap, basePrice: productPrice, initialProtein })

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

  function handleTap(key: IngredientKey) {
    if (defaultKeys.includes(key)) {
      toggleDefault(key)
    } else {
      const cur = extras[key] ?? 0
      setExtraQty(key, cur > 0 ? 0 : 1)
    }
  }

  function handleQtyChange(key: IngredientKey, delta: number) {
    setExtraQty(key, (extras[key] ?? 0) + delta)
  }

  function handleAddToOrder() {
    // Collect added extras (all extra-unit additions, repeated per qty)
    const added: { id: string; name: string; priceCents: number }[] = []
    for (const key of OPTIONAL_TOPPINGS) {
      const qty = extras[key] ?? 0
      if (qty > 0) {
        const info = modifierMap[key]
        if (info) {
          for (let i = 0; i < qty; i++) {
            added.push({ id: info.id, name: info.name, priceCents: info.priceCents })
          }
        }
      }
    }

    // Collect removed defaults (free removals for kitchen ticket)
    const removedItems: { name: string }[] = Array.from(removed).map(key => {
      const info = optionsByKey[key]
      return { name: info?.name ?? key }
    })

    const extrasCents = added.reduce((s, m) => s + m.priceCents, 0)

    onAddToOrder?.({
      mode: 'build',
      layers,
      added,
      removed: removedItems,
      modifiers: added,
      basePrice: productPrice ?? 0,
      extrasCents,
      total,
    })
  }

  const nonProteinPillGroups = pillGroups.filter(g => g !== proteinPillGroup)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}>

        {/* Protein swap pills */}
        {proteinPillGroup && (
          <ProteinPills
            group={proteinPillGroup}
            proteinMap={proteinMap}
            activeProtein={protein}
            onSelect={(key) => swapProtein(key)}
          />
        )}

        {/* Other required-single-choice groups (e.g. size) — rendered as pills too */}
        {nonProteinPillGroups.map(group => (
          <div key={group.id} style={{ padding: '8px 16px 0', maxWidth: 480, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>
              {group.name}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.options.map(opt => (
                <button key={opt.id} style={{
                  padding: '6px 14px', borderRadius: 20, border: '2px solid #e5e7eb',
                  background: '#fff', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontSize: 13, fontWeight: 600, color: '#374151',
                }}>
                  {opt.name}
                  {opt.priceCents > 0 && (
                    <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4 }}>
                      {'+$' + (opt.priceCents / 100).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Burger visual with drop zone */}
        <DropZoneWrapper layers={layers} size={size} />

        {/* Toppings tray */}
        <IngredientTray
          defaultKeys={defaultKeys}
          removed={removed}
          extras={extras}
          modifierMap={modifierMap}
          onTap={handleTap}
          onQtyChange={handleQtyChange}
        />

        {/* Fixed price bar */}
        <PriceBar
          total={total}
          points={points}
          onClick={onAddToOrder ? handleAddToOrder : undefined}
        />
      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null}>
        {draggingId && !(ALL_PROTEINS as readonly string[]).includes(draggingId) ? (
          <img
            src={INGREDIENT_PATHS[draggingId]}
            alt={draggingId}
            style={{
              width: 80, height: 80, objectFit: 'contain',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
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
import {
  ALL_PROTEINS, INGREDIENT_PATHS, OPTIONAL_TOPPINGS, FOOD_LIBRARIES,
  nameToFoodKey, type IngredientKey,
} from './ingredients'
import { ProductHero } from './ProductHero'

const DROP_ZONE_ID = 'burger-drop-zone'
const FOOD_HERO_ARCHETYPES: readonly string[] = ['salad', 'bowl', 'wrap']

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
  note?: string
}

// ── Name → IngredientKey helpers ──────────────────────────────────────────────

function nameToProteinKey(name: string): IngredientKey | null {
  const low = name.toLowerCase()
  if (low.includes('chicken')) return 'patty-chicken'
  if (low.includes('veg') || low.includes('plant') || low.includes('beyond') || low.includes('mushroom')) return 'patty-veg'
  if (low.includes('beef') || low.includes('patty') || low.includes('wagyu') || low.includes('angus')) return 'patty'
  return null
}

function nameToBurgerKey(name: string): IngredientKey | null {
  const low = name.toLowerCase()
  for (const key of OPTIONAL_TOPPINGS) {
    if (low.includes(key)) return key
  }
  return null
}

// ── Pill group (required single-choice) ──────────────────────────────────────

interface ProteinPillsProps {
  group: ModifierGroup
  proteinMap: Map<string, IngredientKey>
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

function DropZoneWrapper({ layers, size, layout }: {
  layers: IngredientKey[]
  size: number
  layout: 'stack' | 'bowl' | 'scatter'
}) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID })
  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '16px 24px 0',
        background: isOver ? 'rgba(217,245,78,0.06)' : 'transparent',
        borderRadius: 28,
        outline: isOver ? '2px dashed #d9f54e' : '2px dashed transparent',
        transition: 'all 0.15s',
      }}
    >
      <LayeredProduct layers={layers} size={size} layout={layout} />

      {/* Pedestal disc */}
      <div style={{
        width: size * 0.72, height: 18, borderRadius: '50%',
        background: '#ffffff',
        boxShadow: isOver
          ? '0 0 0 6px rgba(217,245,78,0.25), 0 8px 28px rgba(0,0,0,0.10)'
          : '0 8px 24px rgba(0,0,0,0.12)',
        marginTop: -6,
        transition: 'box-shadow 0.2s',
      }} />

      {isOver && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%',
          transform: 'translateX(-50%)', pointerEvents: 'none',
        }}>
          <span style={{
            background: '#d9f54e', color: '#0a0a0a',
            fontFamily: "'Outfit', Inter, sans-serif", fontSize: 12, fontWeight: 700,
            borderRadius: 9999, padding: '4px 14px', whiteSpace: 'nowrap',
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
  layout?: 'stack' | 'bowl' | 'scatter'
  archetype?: string
  imageUrl?: string
}

export function ProductCustomiser({ size = 220, modifierGroups = [], productPrice, onAddToOrder, layout, archetype, imageUrl }: Props) {

  // Resolve food library if archetype is set
  const foodLib = archetype ? (FOOD_LIBRARIES[archetype] ?? null) : null
  const effectiveLayout: 'stack' | 'bowl' | 'scatter' = layout ?? foodLib?.layout ?? 'stack'
  const isFoodBuild = foodLib !== null
  const trayLibrary: IngredientKey[] = isFoodBuild ? foodLib!.items : OPTIONAL_TOPPINGS
  const baseKey: IngredientKey | undefined = isFoodBuild ? foodLib!.base : undefined
  const isHeroMode = isFoodBuild && archetype != null && FOOD_HERO_ARCHETYPES.includes(archetype)

  // Name-to-key resolver: food-aware
  function resolveIngredientKey(name: string): IngredientKey | null {
    if (isFoodBuild) return nameToFoodKey(name, trayLibrary)
    return nameToBurgerKey(name)
  }

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
      const key = resolveIngredientKey(opt.name)
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
  const derivedDefaults: IngredientKey[] = []
  for (const group of trayGroups) {
    for (const opt of group.options) {
      if (!opt.isDefault) continue
      const key = resolveIngredientKey(opt.name)
      if (key && !derivedDefaults.includes(key)) derivedDefaults.push(key)
    }
  }
  // Fall back to library defaults when no modifier groups provide defaults
  const defaultKeys: IngredientKey[] = derivedDefaults.length > 0
    ? derivedDefaults
    : (isFoodBuild ? foodLib!.defaults : [])

  // Protein pill group mapping (burger mode only): optionId → IngredientKey
  const proteinPillGroup = isFoodBuild ? null : pillGroups.find(g =>
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
  } = useOrderBuilder({
    defaultKeys,
    modifierMap,
    basePrice: productPrice,
    initialProtein,
    mode: isFoodBuild ? 'food' : 'burger',
    library: isFoodBuild ? trayLibrary : undefined,
    baseLayer: baseKey,
  })

  // Hero mode state — hooks must be called unconditionally (before any early return)
  const initEitherOrSel: Record<string, string> = {}
  for (const g of pillGroups) {
    const def = g.options.find(o => o.isDefault)
    initEitherOrSel[g.id] = def?.id ?? (g.options[0]?.id ?? '')
  }
  const [eitherOrSel, setEitherOrSel] = useState<Record<string, string>>(initEitherOrSel)
  const [heroRemovedDefaults, setHeroRemovedDefaults] = useState<Set<string>>(new Set<string>())
  const [heroExtras, setHeroExtras] = useState<Record<string, number>>({})

  let heroEitherOrCents = 0
  for (const g of pillGroups) {
    const selId = eitherOrSel[g.id]
    if (selId) {
      const opt = g.options.find(o => o.id === selId)
      if (opt) heroEitherOrCents += opt.priceCents
    }
  }
  let heroExtrasCents = 0
  for (const g of trayGroups) {
    for (const opt of g.options) {
      if (!opt.isDefault) heroExtrasCents += (heroExtras[opt.id] ?? 0) * opt.priceCents
    }
  }
  const heroTotal = Number(((productPrice ?? 0) + (heroEitherOrCents + heroExtrasCents) / 100).toFixed(2))
  const heroPoints = Math.floor(heroTotal)

  const [draggingId, setDraggingId] = useState<IngredientKey | null>(null)
  const [buildNote, setBuildNote] = useState('')

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
    const orderItems = isFoodBuild ? trayLibrary : OPTIONAL_TOPPINGS
    const added: { id: string; name: string; priceCents: number }[] = []
    for (const key of orderItems) {
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
      note: buildNote.trim() || undefined,
    })
  }

  function handleHeroAddToOrder() {
    const addedItems: { id: string; name: string; priceCents: number }[] = []
    const removedItems: { name: string }[] = []
    for (const g of pillGroups) {
      const selId = eitherOrSel[g.id]
      if (selId) {
        const opt = g.options.find(o => o.id === selId)
        if (opt) addedItems.push({ id: opt.id, name: opt.name, priceCents: opt.priceCents })
      }
    }
    for (const g of trayGroups) {
      for (const opt of g.options) {
        if (opt.isDefault && heroRemovedDefaults.has(opt.id)) {
          removedItems.push({ name: opt.name })
        } else if (!opt.isDefault) {
          const qty = heroExtras[opt.id] ?? 0
          for (let i = 0; i < qty; i++) {
            addedItems.push({ id: opt.id, name: opt.name, priceCents: opt.priceCents })
          }
        }
      }
    }
    onAddToOrder?.({
      mode: 'build',
      layers: [],
      added: addedItems,
      removed: removedItems,
      modifiers: addedItems,
      basePrice: productPrice ?? 0,
      extrasCents: heroEitherOrCents + heroExtrasCents,
      total: heroTotal,
      note: buildNote.trim() || undefined,
    })
  }

  // ── Hero mode render (salad / bowl / wrap / toastie / sandwich) ──────────────
  if (isHeroMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}>

        {/* Hero image */}
        <div style={{ padding: '24px 16px 8px', display: 'flex', justifyContent: 'center' }}>
          {imageUrl
            ? <ProductHero imageSrc={imageUrl} name="" alt="product" size={220} />
            : <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72 }}>🥗</div>
          }
        </div>

        {/* Modifier groups */}
        <div style={{ width: '100%', paddingBottom: 80 }}>

          {/* Either-or pill groups */}
          {pillGroups.map(group => (
            <div key={group.id} style={{ padding: '12px 16px 0', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#6b7280', marginBottom: 8, fontFamily: "'Outfit', Inter, sans-serif" }}>
                {group.name}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                {group.options.map(opt => {
                  const isActive = eitherOrSel[group.id] === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setEitherOrSel(prev => ({ ...prev, [group.id]: opt.id }))}
                      style={{
                        padding: '8px 16px', borderRadius: 20,
                        border: '2px solid ' + (isActive ? '#d9f54e' : '#e5e7eb'),
                        background: isActive ? '#f7fde0' : '#fff',
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                        fontSize: 13, fontWeight: 600,
                        color: isActive ? '#2f3a06' : '#374151',
                        boxShadow: isActive ? '0 0 0 1px #d9f54e, 0 2px 8px rgba(217,245,78,0.18)' : '0 1px 4px rgba(0,0,0,0.07)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {opt.name}
                      {opt.priceCents > 0 && (
                        <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4, fontWeight: 500 }}>
                          {'+$' + (opt.priceCents / 100).toFixed(2)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Customise heading */}
          {trayGroups.length > 0 && (
            <div style={{ padding: '18px 16px 4px', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#6b7280', fontFamily: "'Outfit', Inter, sans-serif" }}>
                Customise
              </div>
            </div>
          )}

          {/* Tray groups: toggle list */}
          {trayGroups.map(group => (
            <div key={group.id} style={{ padding: '8px 16px 0', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
              {trayGroups.length > 1 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, fontFamily: 'Inter, sans-serif' }}>
                  {group.name}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.options.map(opt => {
                  const isDefault = opt.isDefault
                  const isRemovedDefault = isDefault && heroRemovedDefaults.has(opt.id)
                  const extraQty = heroExtras[opt.id] ?? 0
                  const isActive = isDefault ? !isRemovedDefault : extraQty > 0
                  const allowQty = opt.allowQuantity || group.allowQuantity
                  return (
                    <div
                      key={opt.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', borderRadius: 14,
                        background: isActive ? '#f7fde0' : '#fafafa',
                        border: '1.5px solid ' + (isActive ? '#d9f54e' : '#e5e7eb'),
                        transition: 'all 0.15s',
                      }}
                    >
                      <button
                        onClick={() => {
                          if (isDefault) {
                            setHeroRemovedDefaults(prev => {
                              const next = new Set(prev)
                              if (next.has(opt.id)) next.delete(opt.id); else next.add(opt.id)
                              return next
                            })
                          } else {
                            setHeroExtras(prev => ({ ...prev, [opt.id]: extraQty > 0 ? 0 : 1 }))
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, textAlign: 'left' as const }}
                      >
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: '2px solid ' + (isActive ? '#b5d600' : '#d1d5db'),
                          background: isActive ? '#d9f54e' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isActive && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <polyline points="1.5,6 5,9.5 10.5,2.5" stroke="#2f3a06" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <span style={{
                            fontSize: 13, fontWeight: 600,
                            color: isRemovedDefault ? '#9ca3af' : (isActive ? '#2f3a06' : '#374151'),
                            fontFamily: 'Inter, sans-serif',
                            textDecoration: isRemovedDefault ? 'line-through' : 'none',
                          }}>
                            {opt.name}
                          </span>
                          {isDefault && (
                            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6, fontWeight: 400 }}>included</span>
                          )}
                          {!isDefault && opt.priceCents > 0 && (
                            <span style={{ display: 'block', fontSize: 11, color: '#6b7280' }}>
                              {'+$' + (opt.priceCents / 100).toFixed(2)}
                            </span>
                          )}
                        </div>
                      </button>
                      {allowQty && !isDefault && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                          <button
                            onClick={e => { e.stopPropagation(); setHeroExtras(prev => ({ ...prev, [opt.id]: Math.max(0, (prev[opt.id] ?? 0) - 1) })) }}
                            style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 18, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >−</button>
                          <span style={{ fontSize: 13, fontWeight: 700, minWidth: 16, textAlign: 'center' as const, color: '#111' }}>{extraQty}</span>
                          <button
                            onClick={e => { e.stopPropagation(); setHeroExtras(prev => ({ ...prev, [opt.id]: (prev[opt.id] ?? 0) + 1 })) }}
                            style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 18, color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Note input */}
          <div style={{ padding: '12px 16px 0', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'Outfit', Inter, sans-serif" }}>
              Add a note
            </label>
            <textarea
              value={buildNote}
              onChange={e => setBuildNote(e.target.value.slice(0, 200))}
              placeholder="E.g. extra sauce, no onion..."
              maxLength={200}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 14, boxSizing: 'border-box' as const,
                border: '1.5px solid #e5e7eb', fontSize: 14, color: '#0a0a0a', background: '#ffffff',
                fontFamily: "'Outfit', Inter, sans-serif", outline: 'none', resize: 'none' as const, minHeight: 60, lineHeight: 1.5,
              }}
            />
            {buildNote.length > 0 && (
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right' as const, marginTop: 3 }}>{buildNote.length}/200</div>
            )}
          </div>
        </div>

        <PriceBar
          total={heroTotal}
          points={heroPoints}
          onClick={onAddToOrder ? handleHeroAddToOrder : undefined}
        />
      </div>
    )
  }

  const nonProteinPillGroups = pillGroups.filter(g => g !== proteinPillGroup)

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, width: '100%' }}>

        {/* Protein swap pills (burger mode only) */}
        {proteinPillGroup && (
          <ProteinPills
            group={proteinPillGroup}
            proteinMap={proteinMap}
            activeProtein={protein}
            onSelect={(key) => swapProtein(key)}
          />
        )}

        {/* Other required-single-choice groups (e.g. size) */}
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

        {/* Visual with drop zone */}
        <DropZoneWrapper layers={layers} size={size} layout={effectiveLayout} />

        {/* Drag to build heading */}
        <div style={{ width: '100%', maxWidth: 480, padding: '18px 16px 4px', textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#6b7280', fontFamily: "'Outfit', Inter, sans-serif" }}>
            {isFoodBuild ? 'Tap to customise' : 'Drag to build'}
          </div>
        </div>

        {/* Toppings tray */}
        <IngredientTray
          defaultKeys={defaultKeys}
          removed={removed}
          extras={extras}
          modifierMap={modifierMap}
          onTap={handleTap}
          onQtyChange={handleQtyChange}
          library={isFoodBuild ? trayLibrary : undefined}
          baseKey={baseKey}
        />

        {/* Note input */}
        <div style={{ width: '100%', maxWidth: 480, padding: '8px 16px 80px', boxSizing: 'border-box' as const }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontFamily: "'Outfit', Inter, sans-serif" }}>
            Add a note
          </label>
          <textarea
            value={buildNote}
            onChange={e => setBuildNote(e.target.value.slice(0, 200))}
            placeholder="E.g. extra hot, no salt..."
            maxLength={200}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 14, boxSizing: 'border-box' as const,
              border: '1.5px solid #e5e7eb', fontSize: 14, color: '#0a0a0a', background: '#ffffff',
              fontFamily: "'Outfit', Inter, sans-serif", outline: 'none', resize: 'none' as const, minHeight: 60, lineHeight: 1.5,
            }}
          />
          {buildNote.length > 0 && (
            <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 3 }}>{buildNote.length}/200</div>
          )}
        </div>

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
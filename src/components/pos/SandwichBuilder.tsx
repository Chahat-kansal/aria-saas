'use client'
import { useReducer, useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ModifierGroup, ConfiguredCartItem, SelectedModifier } from '@/types/pos-modifiers'
import { formatSandwichForKitchen } from '@/lib/pos/kitchen-summary'

interface Product { id: string; name: string; price: number; image_url?: string | null }

interface SandwichBuilderProps {
  product: Product
  onClose: () => void
  onConfirm: (item: ConfiguredCartItem) => void
}

// ── State ─────────────────────────────────────────────────────────────────────

interface BuilderState {
  currentStep: number
  selections: Record<string, { quantity: number; operator: null }>
  specialInstructions: string
}

type BuilderAction =
  | { type: 'TOGGLE_SINGLE'; groupId: string; modifierId: string; modIds: string[] }
  | { type: 'TOGGLE_MULTI';  modifierId: string }
  | { type: 'SET_INSTRUCTIONS'; text: string }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_TO'; step: number }

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'TOGGLE_SINGLE': {
      const next = { ...state.selections }
      for (const id of action.modIds) delete next[id]
      if (!state.selections[action.modifierId]) {
        next[action.modifierId] = { quantity: 1, operator: null }
      }
      return { ...state, selections: next }
    }
    case 'TOGGLE_MULTI': {
      const next = { ...state.selections }
      if (next[action.modifierId]) delete next[action.modifierId]
      else next[action.modifierId] = { quantity: 1, operator: null }
      return { ...state, selections: next }
    }
    case 'SET_INSTRUCTIONS': return { ...state, specialInstructions: action.text }
    case 'NEXT_STEP': return { ...state, currentStep: state.currentStep + 1 }
    case 'PREV_STEP': return { ...state, currentStep: Math.max(0, state.currentStep - 1) }
    case 'GO_TO': return { ...state, currentStep: action.step }
    default: return state
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALLERGY_GROUP = 'Allergy Flags'
const INSTRUCTION_STEP_NAME = 'Special Instructions'

function calcTotal(basePrice: number, groups: ModifierGroup[], selections: Record<string, { quantity: number }>): number {
  let total = basePrice
  for (const g of groups) {
    for (const m of g.modifiers ?? []) {
      if (selections[m.id]) total += m.price_adjustment * selections[m.id].quantity
    }
  }
  return Math.max(0, total)
}

function buildSummaryLines(groups: ModifierGroup[], selections: Record<string, { quantity: number }>): string[] {
  const lines: string[] = []
  for (const g of groups) {
    if (g.name === INSTRUCTION_STEP_NAME) continue
    const chosen = (g.modifiers ?? []).filter(m => selections[m.id])
    if (chosen.length === 0) continue
    const label = chosen.map(m => {
      const qty = selections[m.id]?.quantity ?? 1
      return qty > 1 ? `${qty}x ${m.name}` : m.name
    }).join(', ')
    if (g.name === ALLERGY_GROUP) lines.push(`⚠ ${label}`)
    else lines.push(label)
  }
  return lines
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SandwichBuilder({ product, onClose, onConfirm }: SandwichBuilderProps) {
  const [groups, setGroups]   = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef             = useRef<HTMLDivElement>(null)

  const [state, dispatch] = useReducer(builderReducer, {
    currentStep: 0, selections: {}, specialInstructions: '',
  })

  useEffect(() => {
    Promise.all([
      fetch(`/api/pos/products/${product.id}/modifiers`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([modData]) => {
      const raw: ModifierGroup[] = (modData.data ?? []).map((pmg: any) => ({
        ...pmg.pos_modifier_groups,
        modifiers: (pmg.pos_modifier_groups?.pos_modifiers ?? []).filter((m: any) => m.is_active)
          .sort((a: any, b: any) => a.display_order - b.display_order),
        is_required: pmg.override_required ?? pmg.pos_modifier_groups?.is_required ?? false,
        max_selections: pmg.override_max ?? pmg.pos_modifier_groups?.max_selections ?? null,
      })).sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))

      // Pre-select defaults
      const sel: BuilderState['selections'] = {}
      for (const g of raw) {
        for (const m of g.modifiers ?? []) {
          if (m.is_default) sel[m.id] = { quantity: 1, operator: null }
        }
      }
      dispatch({ type: 'GO_TO', step: 0 })
      Object.assign(state.selections, sel)
      setGroups(raw)
      setLoading(false)
    })
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [state.currentStep])

  // Build the step list — includes a special "instructions" step at the end
  const steps: Array<ModifierGroup | { name: string; isInstructions: true }> = [
    ...groups,
    { name: INSTRUCTION_STEP_NAME, isInstructions: true as const },
  ]
  const totalSteps  = steps.length
  const currentStep = steps[state.currentStep]
  const isLast      = state.currentStep === totalSteps - 1
  const isFirst     = state.currentStep === 0

  const currentGroup = 'isInstructions' in currentStep ? null : currentStep as ModifierGroup
  const allergies    = groups.find(g => g.name === ALLERGY_GROUP)
  const hasAllergy   = allergies
    ? (allergies.modifiers ?? []).some(m => state.selections[m.id])
    : false

  const total        = calcTotal(product.price, groups, state.selections)
  const summaryLines = buildSummaryLines(groups, state.selections)

  const handleConfirm = () => {
    const selectedMods: SelectedModifier[] = []
    for (const g of groups) {
      for (const m of g.modifiers ?? []) {
        if (!state.selections[m.id]) continue
        selectedMods.push({
          modifier_id:   m.id,
          group_id:      g.id,
          group_name:    g.name,
          modifier_name: m.name,
          price:         m.price_adjustment,
          quantity:      state.selections[m.id].quantity,
          operator:      null,
        })
      }
    }
    const item: ConfiguredCartItem & { special_instructions?: string } = {
      product_id:         product.id,
      product_name:       product.name,
      variation_id:       null,
      variation_name:     null,
      base_price:         product.price,
      selected_modifiers: selectedMods,
      total_price:        total,
      display_summary:    summaryLines.join(' · ') || product.name,
      kitchen_summary:    formatSandwichForKitchen({
        product_id: product.id, product_name: product.name,
        variation_id: null, variation_name: null,
        base_price: product.price, selected_modifiers: selectedMods,
        total_price: total, display_summary: '', kitchen_summary: '', quantity: 1,
        special_instructions: state.specialInstructions,
      } as any),
      quantity:           1,
      special_instructions: state.specialInstructions,
    }
    onConfirm(item)
  }

  const handleOptionTap = (g: ModifierGroup, modId: string) => {
    const modIds = (g.modifiers ?? []).map(m => m.id)
    if (g.selection_type === 'single') {
      dispatch({ type: 'TOGGLE_SINGLE', groupId: g.id, modifierId: modId, modIds })
      // Auto-advance on single-select
      if (state.currentStep < totalSteps - 1) {
        setTimeout(() => dispatch({ type: 'NEXT_STEP' }), 180)
      }
    } else {
      dispatch({ type: 'TOGGLE_MULTI', modifierId: modId })
    }
  }

  const S = {
    screen: { position: 'fixed' as const, inset: 0, zIndex: 210, background: '#090e0b', display: 'flex', flexDirection: 'column' as const, fontFamily: "'Manrope',sans-serif" },
    topBar: { flexShrink: 0, padding: '12px 16px', background: 'rgba(0,0,0,0.6)', borderBottom: '1px solid rgba(127,184,151,0.15)', display: 'flex', alignItems: 'center', gap: 12 },
    chip: (active: boolean, color = '#7FB897'): React.CSSProperties => ({
      padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
      border: 'none', background: active ? `${color}25` : 'rgba(255,255,255,0.05)',
      color: active ? color : 'rgba(255,255,255,0.65)',
      outline: active ? `2px solid ${color}70` : '2px solid transparent',
      transition: 'all 0.1s', fontFamily: 'inherit',
    }),
  }

  const allergyColor = '#EF4444'

  return (
    <motion.div style={S.screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* ── Top bar ── */}
      <div style={S.topBar}>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>←</button>
        {product.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Fraunces',serif" }}>{product.name}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
            Step {state.currentStep + 1} of {totalSteps}
          </p>
        </div>
        {/* Step dots */}
        <div style={{ display: 'flex', gap: 4 }}>
          {steps.map((s, i) => (
            <div key={i} onClick={() => dispatch({ type: 'GO_TO', step: i })}
              style={{ width: i === state.currentStep ? 18 : 6, height: 6, borderRadius: 3, background: i === state.currentStep ? '#7FB897' : i < state.currentStep ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s' }} />
          ))}
        </div>
      </div>

      {/* ── Allergy banner ── */}
      <AnimatePresence>
        {hasAllergy && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ background: 'rgba(239,68,68,0.15)', borderBottom: `1px solid ${allergyColor}40`, padding: '6px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: allergyColor, fontSize: 13, fontWeight: 800 }}>⚠ ALLERGY FLAG ACTIVE</span>
            <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.7)' }}>
              {(allergies?.modifiers ?? []).filter(m => state.selections[m.id]).map(m => m.name).join(', ')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content (two-column on desktop) ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left: summary */}
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Your build</p>
          {summaryLines.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>Nothing selected yet</p>
          ) : summaryLines.map((line, i) => (
            <p key={i} style={{ color: line.startsWith('⚠') ? allergyColor : 'rgba(255,255,255,0.75)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>{line}</p>
          ))}
        </div>

        {/* Right: current step */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading options…</p>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key={state.currentStep}
                initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.15 }}>

                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ color: currentGroup?.color ?? '#7FB897', fontSize: 17, fontWeight: 700, margin: '0 0 4px', fontFamily: "'Fraunces',serif" }}>
                    {'isInstructions' in currentStep ? 'Special Instructions' : currentStep.name}
                    {currentGroup?.is_required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
                  </h2>
                  {currentGroup?.max_selections && (
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: 0 }}>
                      {currentGroup.selection_type === 'single' ? 'Pick one' : `Up to ${currentGroup.max_selections}`}
                    </p>
                  )}
                </div>

                {'isInstructions' in currentStep ? (
                  <div>
                    <textarea
                      value={state.specialInstructions}
                      onChange={e => dispatch({ type: 'SET_INSTRUCTIONS', text: e.target.value })}
                      placeholder="Any special requests? (optional)"
                      maxLength={280}
                      rows={5}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'right', margin: '4px 0 0' }}>
                      {state.specialInstructions.length}/280
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(currentGroup?.modifiers ?? []).map(m => {
                      const active    = !!state.selections[m.id]
                      const color     = currentGroup?.color ?? '#7FB897'
                      const atMax     = currentGroup?.max_selections != null
                        && (currentGroup?.modifiers ?? []).filter(mod => state.selections[mod.id]).length >= currentGroup.max_selections!
                        && !active
                      const isAllergy = currentGroup?.name === ALLERGY_GROUP

                      return (
                        <button key={m.id} disabled={atMax}
                          onClick={() => handleOptionTap(currentGroup!, m.id)}
                          style={{ ...S.chip(active, isAllergy ? allergyColor : color), opacity: atMax ? 0.35 : 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 100 }}>
                          <span>{m.name}</span>
                          {m.price_adjustment !== 0 && (
                            <span style={{ fontSize: 11, opacity: 0.7, fontStyle: 'italic' }}>
                              {m.price_adjustment > 0 ? '+' : ''}A${m.price_adjustment.toFixed(2)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div style={{ flexShrink: 0, padding: '12px 16px', background: 'rgba(0,0,0,0.7)', borderTop: '1px solid rgba(127,184,151,0.12)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => dispatch({ type: 'PREV_STEP' })} disabled={isFirst}
          style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: isFirst ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)', cursor: isFirst ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          ← Back
        </button>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: '#7FB897', fontSize: 15, fontWeight: 800, fontFamily: "'Fraunces',serif", fontStyle: 'italic' }}>
            A${total.toFixed(2)}
          </span>
        </div>

        {isLast ? (
          <button onClick={handleConfirm}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#2D5240,#7FB897)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800 }}>
            Add to Cart ✓
          </button>
        ) : (
          <button onClick={() => dispatch({ type: 'NEXT_STEP' })}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#7FB897', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
            Next →
          </button>
        )}
      </div>
    </motion.div>
  )
}

export default SandwichBuilder
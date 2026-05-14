'use client'
import { useReducer, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ModifierGroup, Modifier, ProductVariation, ConfiguredCartItem, SelectedModifier } from '@/types/pos-modifiers'

interface Product {
  id: string
  name: string
  price: number
  image_url?: string | null
  pos_categories?: { name: string } | null
}

interface ModifierModalProps {
  product: Product
  onClose: () => void
  onConfirm: (item: ConfiguredCartItem) => void
}

// ── State & Reducer ────────────────────────────────────────────────────────────

interface ModalState {
  variationId: string | null
  variationName: string | null
  variationPrice: number | null
  // key: modifierId, value: { quantity, operator }
  selected: Record<string, { quantity: number; operator: 'add' | 'extra' | 'no' | null }>
}

type Action =
  | { type: 'SET_VARIATION'; id: string; name: string; price: number }
  | { type: 'TOGGLE_SINGLE'; groupId: string; modifierId: string; groupModifierIds: string[] }
  | { type: 'TOGGLE_MULTI'; modifierId: string }
  | { type: 'SET_QTY'; modifierId: string; qty: number }
  | { type: 'SET_OPERATOR'; modifierId: string; operator: 'add' | 'extra' | 'no' }
  | { type: 'CLEAR_GROUP'; groupModifierIds: string[] }

function reducer(state: ModalState, action: Action): ModalState {
  switch (action.type) {
    case 'SET_VARIATION':
      return { ...state, variationId: action.id, variationName: action.name, variationPrice: action.price }

    case 'TOGGLE_SINGLE': {
      const next = { ...state.selected }
      for (const id of action.groupModifierIds) delete next[id]
      if (!state.selected[action.modifierId]) {
        next[action.modifierId] = { quantity: 1, operator: 'add' }
      }
      return { ...state, selected: next }
    }

    case 'TOGGLE_MULTI': {
      const next = { ...state.selected }
      if (next[action.modifierId]) {
        delete next[action.modifierId]
      } else {
        next[action.modifierId] = { quantity: 1, operator: 'add' }
      }
      return { ...state, selected: next }
    }

    case 'SET_QTY': {
      if (action.qty <= 0) {
        const next = { ...state.selected }
        delete next[action.modifierId]
        return { ...state, selected: next }
      }
      return { ...state, selected: { ...state.selected, [action.modifierId]: { ...state.selected[action.modifierId], quantity: action.qty } } }
    }

    case 'SET_OPERATOR':
      return { ...state, selected: { ...state.selected, [action.modifierId]: { ...state.selected[action.modifierId], operator: action.operator } } }

    case 'CLEAR_GROUP': {
      const next = { ...state.selected }
      for (const id of action.groupModifierIds) delete next[id]
      return { ...state, selected: next }
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildSummary(groups: ModifierGroup[], state: ModalState): string {
  const parts: string[] = []
  if (state.variationName) parts.push(state.variationName)
  for (const g of groups.filter(g => isGroupVisible(g as any, groups, state))) {
    for (const m of g.modifiers ?? []) {
      const sel = state.selected[m.id]
      if (!sel) continue
      if (sel.operator === 'no') { parts.push(`No ${m.name}`); continue }
      const prefix = sel.operator === 'extra' ? 'Extra ' : ''
      const qty = sel.quantity > 1 ? `${sel.quantity}x ` : ''
      parts.push(`${prefix}${qty}${m.name}`)
    }
  }
  return parts.join(', ')
}

function calcTotal(basePrice: number, variationPrice: number | null, groups: ModifierGroup[], state: ModalState, sizeKey: string | null): number {
  let total = variationPrice ?? basePrice
  for (const g of groups.filter(g => isGroupVisible(g as any, groups, state))) {
    for (const m of g.modifiers ?? []) {
      const sel = state.selected[m.id]
      if (!sel || sel.operator === 'no') continue
      const adj = sizeKey && m.price_per_size[sizeKey] != null ? m.price_per_size[sizeKey] : m.price_adjustment
      total += adj * sel.quantity
    }
  }
  return Math.max(0, total)
}

/** Evaluate show_when — returns true if the group should be rendered */
function isGroupVisible(
  group: ModifierGroup & { show_when?: { group_name: string; modifier_name: string } | null },
  allGroups: ModifierGroup[],
  state: ModalState
): boolean {
  const sw = (group as any).show_when
  if (!sw) return true
  const parentGroup = allGroups.find(g => g.name === sw.group_name)
  if (!parentGroup) return false
  const targetMod = (parentGroup.modifiers ?? []).find(m => m.name === sw.modifier_name)
  if (!targetMod) return false
  return !!state.selected[targetMod.id]
}

function isValid(groups: ModifierGroup[], state: ModalState): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  for (const g of groups) {
    // Skip hidden groups in validation
    if (!isGroupVisible(g as any, groups, state)) continue
    const required = g.is_required
    const min = g.min_selections
    const modIds = (g.modifiers ?? []).map(m => m.id)
    const selectedCount = modIds.filter(id => state.selected[id]).length
    if (required && selectedCount < 1) errors.push(`Please choose ${g.display_name ?? g.name}`)
    else if (min > 0 && selectedCount < min) errors.push(`${g.display_name ?? g.name}: pick at least ${min}`)
  }
  return { valid: errors.length === 0, errors }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ModifierModal({ product, onClose, onConfirm }: ModifierModalProps) {
  const [groups, setGroups]         = useState<ModifierGroup[]>([])
  const [variations, setVariations] = useState<ProductVariation[]>([])
  const [loading, setLoading]       = useState(true)

  const initialState: ModalState = { variationId: null, variationName: null, variationPrice: null, selected: {} }
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    Promise.all([
      fetch(`/api/pos/products/${product.id}/modifiers`).then(r => r.json()).catch(() => ({ data: [], product_defaults: [] })),
      fetch(`/api/pos/products/${product.id}/variations`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([modData, varData]) => {
      const rawGroups: ModifierGroup[] = (modData.data ?? []).map((pmg: any) => ({
        ...pmg.pos_modifier_groups,
        modifiers: (pmg.pos_modifier_groups?.pos_modifiers ?? []).filter((m: any) => m.is_active),
        is_required: pmg.override_required ?? pmg.pos_modifier_groups?.is_required ?? false,
        min_selections: pmg.override_min ?? pmg.pos_modifier_groups?.min_selections ?? 0,
        max_selections: pmg.override_max ?? pmg.pos_modifier_groups?.max_selections ?? null,
      }))
      // Per-product defaults override group-level is_default
      const productDefaultMap: Record<string, number> = {}
      for (const pd of (modData.product_defaults ?? [])) {
        productDefaultMap[pd.modifier_id] = pd.quantity
      }
      if (Object.keys(productDefaultMap).length > 0) {
        // Clear group-level defaults and apply product-level ones
        const sel: ModalState['selected'] = {}
        for (const g of rawGroups) {
          for (const m of g.modifiers ?? []) {
            if (productDefaultMap[m.id] != null) {
              sel[m.id] = { quantity: productDefaultMap[m.id], operator: 'add' }
            }
          }
        }
        Object.assign(initialState.selected, sel)
      }
      setGroups(rawGroups)
      setVariations(varData.data ?? [])

      // Pre-select defaults
      const sel: ModalState['selected'] = {}
      for (const g of rawGroups) {
        for (const m of g.modifiers ?? []) {
          if (m.is_default) sel[m.id] = { quantity: 1, operator: 'add' }
        }
      }
      for (const v of varData.data ?? []) {
        if (v.is_default) dispatch({ type: 'SET_VARIATION', id: v.id, name: v.name, price: v.price })
      }
      Object.assign(initialState.selected, sel)
      dispatch({ type: 'CLEAR_GROUP', groupModifierIds: [] }) // force re-render with defaults
      setLoading(false)
    })
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select defaults once groups load
  useEffect(() => {
    if (groups.length === 0) return
    for (const g of groups) {
      for (const m of g.modifiers ?? []) {
        if (m.is_default && !state.selected[m.id]) {
          if (g.selection_type === 'single') {
            const ids = (g.modifiers ?? []).map(mod => mod.id)
            dispatch({ type: 'TOGGLE_SINGLE', groupId: g.id, modifierId: m.id, groupModifierIds: ids })
          }
        }
      }
    }
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  const defaultVariation = variations.find(v => v.is_default)
  const sizeKey = variations.find(v => v.id === state.variationId)?.size_key
    ?? defaultVariation?.size_key
    ?? null

  const total    = calcTotal(product.price, state.variationPrice, groups, state, sizeKey)
  const summary  = buildSummary(groups, state)
  const { valid, errors } = isValid(groups, state)

  const handleConfirm = () => {
    if (!valid) return
    const selectedMods: SelectedModifier[] = []
    for (const g of groups) {
      for (const m of g.modifiers ?? []) {
        const sel = state.selected[m.id]
        if (!sel) continue
        const adj = sizeKey && m.price_per_size[sizeKey] != null ? m.price_per_size[sizeKey] : m.price_adjustment
        selectedMods.push({
          modifier_id: m.id,
          group_id: g.id,
          group_name: g.name,
          modifier_name: m.name,
          price: adj * sel.quantity,
          quantity: sel.quantity,
          operator: sel.operator,
        })
      }
    }
    const item: ConfiguredCartItem = {
      product_id: product.id,
      product_name: product.name,
      variation_id: state.variationId,
      variation_name: state.variationName,
      base_price: product.price,
      selected_modifiers: selectedMods,
      total_price: total,
      display_summary: summary,
      kitchen_summary: summary,
      quantity: 1,
    }
    onConfirm(item)
  }

  const S = {
    overlay: { position: 'fixed' as const, inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
    sheet:   { width: '100%', maxWidth: 520, background: 'linear-gradient(180deg,#0f1a14,#0a130e)', borderRadius: '20px 20px 0 0', border: '1px solid rgba(127,184,151,0.2)', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    chip: (selected: boolean, color: string): React.CSSProperties => ({
      padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
      fontSize: 13, fontWeight: selected ? 700 : 500, border: 'none',
      background: selected ? `${color}30` : 'rgba(255,255,255,0.05)',
      color: selected ? color : 'rgba(255,255,255,0.65)',
      outline: selected ? `2px solid ${color}80` : '2px solid transparent',
      transition: 'all 0.12s',
      fontFamily: 'inherit',
    }),
  }

  return (
    <AnimatePresence>
      <motion.div style={S.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.div style={S.sheet} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {product.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Fraunces', serif" }}>{product.name}</h2>
                <p style={{ color: '#7FB897', fontSize: 14, margin: '3px 0 0', fontFamily: "'Manrope',sans-serif" }}>
                  Base A${product.price.toFixed(2)}
                </p>
              </div>
              <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(127,184,151,0.15)', margin: '14px 0 0' }} />
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 8px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>Loading options…</div>
            ) : (
              <>
                {/* Variations (Size presets) */}
                {variations.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                      Size <span style={{ color: '#ef4444' }}>*</span>
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {variations.map(v => (
                        <button key={v.id} style={S.chip(state.variationId === v.id, '#7FB897')}
                          onClick={() => dispatch({ type: 'SET_VARIATION', id: v.id, name: v.name, price: v.price })}>
                          {v.name}
                          <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>A${v.price.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modifier groups — filtered by show_when */}
                {groups.filter(g => isGroupVisible(g as any, groups, state)).map(g => {
                  const modIds = (g.modifiers ?? []).map(m => m.id)
                  const selectedCount = modIds.filter(id => state.selected[id]).length
                  const atMax = g.max_selections != null && selectedCount >= g.max_selections

                  return (
                    <div key={g.id} style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: g.color ?? '#7FB897', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                          {g.display_name ?? g.name}
                          {g.is_required && <span style={{ color: '#ef4444' }}> *</span>}
                        </p>
                        {g.max_selections && (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
                            {g.min_selections > 0 ? `Pick ${g.min_selections}${g.max_selections !== g.min_selections ? `–${g.max_selections}` : ''}` : `Up to ${g.max_selections}`}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(g.modifiers ?? []).filter(m => m.is_active).map(m => {
                          const sel = state.selected[m.id]
                          const isSelected = !!sel
                          const adj = sizeKey && m.price_per_size[sizeKey] != null ? m.price_per_size[sizeKey] : m.price_adjustment
                          const color = g.color ?? '#7FB897'
                          const disabled = !isSelected && atMax

                          return (
                            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {/* Conversational operators */}
                              {g.show_conversational_buttons && isSelected && (
                                <div style={{ display: 'flex', gap: 2 }}>
                                  {(['add', 'extra', 'no'] as const).map(op => (
                                    <button key={op} onClick={() => dispatch({ type: 'SET_OPERATOR', modifierId: m.id, operator: op })}
                                      style={{ padding: '2px 7px', borderRadius: 5, cursor: 'pointer', fontSize: 9, fontWeight: 700, border: 'none', fontFamily: 'inherit', background: sel?.operator === op ? `${color}50` : 'rgba(255,255,255,0.06)', color: sel?.operator === op ? color : 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                                      {op === 'add' ? 'Add' : op === 'extra' ? 'Extra' : 'No'}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <button
                                  disabled={disabled}
                                  onClick={() => {
                                    if (g.selection_type === 'single') {
                                      dispatch({ type: 'TOGGLE_SINGLE', groupId: g.id, modifierId: m.id, groupModifierIds: modIds })
                                    } else {
                                      dispatch({ type: 'TOGGLE_MULTI', modifierId: m.id })
                                    }
                                  }}
                                  style={{ ...S.chip(isSelected, color), opacity: disabled ? 0.4 : 1 }}>
                                  {m.name}
                                  {adj !== 0 && (
                                    <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>
                                      {adj > 0 ? '+' : ''}A${adj.toFixed(2)}
                                    </span>
                                  )}
                                </button>

                                {/* Quantity stepper */}
                                {isSelected && m.allow_quantity && sel.operator !== 'no' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <button onClick={() => dispatch({ type: 'SET_QTY', modifierId: m.id, qty: sel.quantity - 1 })}
                                      style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      −
                                    </button>
                                    <span style={{ fontSize: 12, color: '#fff', minWidth: 16, textAlign: 'center' }}>{sel.quantity}</span>
                                    <button onClick={() => {
                                      if (sel.quantity < m.max_quantity) dispatch({ type: 'SET_QTY', modifierId: m.id, qty: sel.quantity + 1 })
                                    }} disabled={sel.quantity >= m.max_quantity}
                                      style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: sel.quantity >= m.max_quantity ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)', color: sel.quantity >= m.max_quantity ? 'rgba(255,255,255,0.3)' : '#fff', cursor: sel.quantity >= m.max_quantity ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      +
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Sticky footer */}
          <div style={{ flexShrink: 0, padding: '12px 20px 20px', borderTop: '1px solid rgba(127,184,151,0.12)', background: 'rgba(10,19,14,0.95)' }}>
            {errors.length > 0 && (
              <p style={{ color: '#f87171', fontSize: 12, margin: '0 0 8px' }}>⚠ {errors[0]}</p>
            )}
            {summary && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 10px', lineHeight: 1.4, fontStyle: 'italic' }}>
                {summary}
              </p>
            )}
            <button onClick={handleConfirm} disabled={!valid || loading}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: valid && !loading ? 'pointer' : 'not-allowed', background: valid ? 'linear-gradient(135deg,#2D5240,#7FB897)' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, fontWeight: 800, fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'opacity 0.15s', opacity: valid ? 1 : 0.5 }}>
              <span>Add to Cart</span>
              <span style={{ fontFamily: "'Fraunces',serif", fontStyle: 'italic' }}>A${total.toFixed(2)}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ModifierModal
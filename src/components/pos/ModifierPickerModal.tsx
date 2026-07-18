'use client'
import { useState, useEffect, useCallback } from 'react'
import type { ModifierGroup, ModifierSelection } from '@/lib/pos/modifier-engine'
import { validateSelections, computeLineUnitPrice, defaultSelections } from '@/lib/pos/modifier-engine'

interface Props {
  productId: string
  productName: string
  basePrice: number
  onConfirm: (sel: ModifierSelection[], unitPrice: number, notes: string) => void
  onCancel: () => void
  // POS-MODIFIER-SPEED-1 — prefetched at POS boot (see terminal/page.tsx's
  // modifierGroupsCache). When present, skips the fetch entirely — the sheet
  // renders with real data on the same tick it opens. Undefined (not just an
  // empty array) means "no prefetch available, fetch for yourself."
  initialGroups?: ModifierGroup[]
}

export default function ModifierPickerModal({ productId, productName, basePrice, onConfirm, onCancel, initialGroups }: Props) {
  const [groups, setGroups] = useState<ModifierGroup[]>(initialGroups ?? [])
  const [selections, setSelections] = useState<ModifierSelection[]>(initialGroups ? defaultSelections(initialGroups) : [])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(initialGroups === undefined)

  const load = useCallback(async () => {
    const r = await fetch(`/api/pos/product-modifier-groups?product_id=${productId}`)
    const d = await r.json()
    const g: ModifierGroup[] = d.groups ?? []
    setGroups(g)
    setSelections(defaultSelections(g))
    setLoading(false)
  }, [productId])
  useEffect(() => {
    // POS-MODIFIER-SPEED-1 — only the fallback (cache-miss) path fetches; the
    // prefetched path already has real data and must never refetch on open.
    if (initialGroups === undefined) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  function toggleModifier(group: ModifierGroup, modifier: ModifierGroup['modifiers'][number]) {
    setSelections(prev => {
      const inThisGroup = prev.filter(s => group.modifiers.some(m => m.id === s.modifier_id))
      const alreadySelected = inThisGroup.find(s => s.modifier_id === modifier.id)
      if (group.selection_type === 'single') {
        const others = prev.filter(s => !group.modifiers.some(m => m.id === s.modifier_id))
        if (alreadySelected) return others
        return [...others, { modifier_id: modifier.id, name: modifier.name, price_adjustment: Number(modifier.price_adjustment) || 0, quantity: 1 }]
      }
      if (alreadySelected) return prev.filter(s => s.modifier_id !== modifier.id)
      return [...prev, { modifier_id: modifier.id, name: modifier.name, price_adjustment: Number(modifier.price_adjustment) || 0, quantity: 1 }]
    })
  }

  function setQty(modifierId: string, qty: number) {
    setSelections(prev => prev.map(s => s.modifier_id === modifierId ? { ...s, quantity: Math.max(1, qty) } : s))
  }

  const errors = validateSelections(groups, selections)
  const unitPrice = computeLineUnitPrice(basePrice, selections)

  if (loading) {
    // POS-MODIFIER-SPEED-1 — real skeleton, not a blank screen. Only reachable via
    // the fallback fetch (cache-miss race at POS boot); the prefetched path never
    // sets loading=true, so this never blocks a warm-cache tap.
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-[#0e1612] border border-[rgba(127,184,151,0.15)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-[#E8EDE8]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Customise {productName}</h2>
              <div className="h-3 w-40 rounded mt-2 animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </div>
          <div className="space-y-5">
            {[0, 1].map(i => (
              <div key={i}>
                <div className="flex items-center justify-between mb-2">
                  <div className="h-4 w-28 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  <div className="h-3 w-16 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map(j => (
                    <div key={j} className="h-10 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(127,184,151,0.1)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-[#0e1612] border border-[rgba(127,184,151,0.15)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-[#E8EDE8]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Customise {productName}</h2>
            <div className="text-xs text-[rgba(232,237,232,0.5)] mt-0.5">
              Base ${(Number(basePrice) || 0).toFixed(2)} → with options ${unitPrice.toFixed(2)}
            </div>
          </div>
          <button onClick={onCancel} className="text-2xl leading-none text-[rgba(232,237,232,0.5)]" aria-label="Close">×</button>
        </div>

        {groups.length === 0 ? (
          <div className="text-sm text-[rgba(232,237,232,0.5)] py-8 text-center">
            No customisation options for this product. Add some in Settings → Modifiers.
          </div>
        ) : (
          <div className="space-y-5">
            {[...groups].sort((a, b) => (a.step_number ?? 99) - (b.step_number ?? 99)).map(g => {
              const inGroup = selections.filter(s => g.modifiers.some(m => m.id === s.modifier_id))
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">
                      {g.display_name ?? g.name}
                      {g.is_required && <span className="text-[#FF6B6B] ml-1">*</span>}
                    </h3>
                    <span className="text-xs text-[rgba(232,237,232,0.5)]">
                      {g.selection_type === 'single' ? 'Pick one' : `${g.min_selections || 0}–${g.max_selections || '∞'}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {g.modifiers.filter(m => m.is_active).map(m => {
                      const sel = inGroup.find(s => s.modifier_id === m.id)
                      const active = !!sel
                      return (
                        <button
                          key={m.id}
                          onClick={() => toggleModifier(g, m)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition ${
                            active
                              ? 'bg-[rgba(127,184,151,0.15)] border-[#7FB897] text-[#E8EDE8]'
                              : 'bg-[rgba(255,255,255,0.03)] border-[rgba(127,184,151,0.15)] text-[rgba(232,237,232,0.85)]'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {active && <span className="text-[#7FB897]">✓</span>}
                            {m.name}
                          </span>
                          <span className="text-xs text-[rgba(232,237,232,0.6)]">
                            {Number(m.price_adjustment) > 0 ? `+$${(Number(m.price_adjustment) || 0).toFixed(2)}`
                              : Number(m.price_adjustment) < 0 ? `-$${Math.abs(Number(m.price_adjustment) || 0).toFixed(2)}`
                              : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {g.modifiers.some(m => m.allow_quantity) && inGroup.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {inGroup.filter(s => g.modifiers.find(m => m.id === s.modifier_id)?.allow_quantity).map(s => (
                        <div key={s.modifier_id} className="flex items-center justify-between text-xs">
                          <span>{s.name} qty</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setQty(s.modifier_id, s.quantity - 1)} className="w-7 h-7 rounded-lg border border-[rgba(127,184,151,0.3)]">−</button>
                            <span className="w-6 text-center">{s.quantity}</span>
                            <button onClick={() => setQty(s.modifier_id, s.quantity + 1)} className="w-7 h-7 rounded-lg border border-[rgba(127,184,151,0.3)]">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div>
              <label className="block text-xs mb-1 text-[rgba(232,237,232,0.7)]">Special instructions (kitchen)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="No onions, well done, etc."
                className="w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8] placeholder:text-[rgba(232,237,232,0.3)]"
              />
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-3 text-xs text-[#FF6B6B]">
            {errors.map((e, i) => <div key={i}>{e.message}</div>)}
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm border border-[rgba(127,184,151,0.2)] text-[rgba(232,237,232,0.7)]">Cancel</button>
          <button
            disabled={errors.length > 0}
            onClick={() => onConfirm(selections, unitPrice, notes)}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#2D5240] text-[#7FB897] disabled:opacity-50"
          >
            Add to cart — ${unitPrice.toFixed(2)}
          </button>
        </div>
      </div>
    </div>
  )
}

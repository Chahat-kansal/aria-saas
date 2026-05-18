'use client'
import { useState } from 'react'

interface ModifierRow {
  id?: string
  name: string
  price_adjustment: number
  is_default: boolean
  allow_quantity: boolean
  max_quantity: number
}

interface ModifierGroupForm {
  name: string
  display_name: string
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number
  allow_quantity: boolean
  step_number: string
  color: string
  modifiers: ModifierRow[]
}

interface Props {
  initial?: {
    id?: string
    name?: string
    display_name?: string | null
    selection_type?: string
    is_required?: boolean
    min_selections?: number
    max_selections?: number
    allow_quantity?: boolean
    step_number?: number | null
    color?: string | null
    modifiers?: ModifierRow[]
  }
  onSave: (form: ModifierGroupForm & { id?: string }) => void
  onClose: () => void
}

const COLOR_PALETTE = ['#7FB897', '#4A90E2', '#E8A838', '#E57373', '#9C6DD9', '#5DADE2', '#58D68D', '#EB984E']

export default function ModifierGroupModal({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState<ModifierGroupForm>({
    name: initial?.name ?? '',
    display_name: initial?.display_name ?? '',
    selection_type: (initial?.selection_type as 'single' | 'multi') ?? 'single',
    is_required: initial?.is_required ?? false,
    min_selections: initial?.min_selections ?? 0,
    max_selections: initial?.max_selections ?? 1,
    allow_quantity: initial?.allow_quantity ?? false,
    step_number: initial?.step_number != null ? String(initial.step_number) : '',
    color: initial?.color ?? '#7FB897',
    modifiers: initial?.modifiers?.map(m => ({
      name: m.name ?? '',
      price_adjustment: Number(m.price_adjustment) || 0,
      is_default: !!m.is_default,
      allow_quantity: !!m.allow_quantity,
      max_quantity: Number(m.max_quantity) || 1,
    })) ?? [],
  })

  function addModifier() {
    setForm(f => ({ ...f, modifiers: [...f.modifiers, { name: '', price_adjustment: 0, is_default: false, allow_quantity: false, max_quantity: 1 }] }))
  }

  function removeModifier(idx: number) {
    setForm(f => ({ ...f, modifiers: f.modifiers.filter((_, i) => i !== idx) }))
  }

  function updateModifier(idx: number, key: keyof ModifierRow, value: unknown) {
    setForm(f => ({ ...f, modifiers: f.modifiers.map((m, i) => i === idx ? { ...m, [key]: value } : m) }))
  }

  function submit() {
    if (!form.name.trim()) { alert('Group name is required'); return }
    onSave({ ...form, id: initial?.id })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#131a16] border border-[rgba(127,184,151,0.15)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-[#E8EDE8]" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">{initial?.id ? 'Edit modifier group' : 'New modifier group'}</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Internal name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="milk_type" className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]" />
          </div>
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Display name (shown to cashier)</label>
            <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Milk type" className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Selection type</label>
            <select value={form.selection_type} onChange={e => setForm(f => ({ ...f, selection_type: e.target.value as 'single' | 'multi' }))} className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]">
              <option value="single">Single (pick one)</option>
              <option value="multi">Multi (pick several)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Step order (for multi-step flows)</label>
            <input type="number" min={1} value={form.step_number} onChange={e => setForm(f => ({ ...f, step_number: e.target.value }))} placeholder="1" className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_required" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} />
            <label htmlFor="is_required" className="text-sm">Required</label>
          </div>
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Min selections</label>
            <input type="number" min={0} value={form.min_selections} onChange={e => setForm(f => ({ ...f, min_selections: parseInt(e.target.value) || 0 }))} className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]" />
          </div>
          <div>
            <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-1">Max selections</label>
            <input type="number" min={1} value={form.max_selections} onChange={e => setForm(f => ({ ...f, max_selections: parseInt(e.target.value) || 1 }))} className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-2 text-sm text-[#E8EDE8]" />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-[rgba(232,237,232,0.6)] mb-2">Colour</label>
          <div className="flex gap-2">
            {COLOR_PALETTE.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                style={{ background: c, width: 28, height: 28, borderRadius: '50%', border: form.color === c ? '2px solid #E8EDE8' : '2px solid transparent' }}
              />
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Options</h3>
            <button onClick={addModifier} className="text-xs px-3 py-1 rounded-lg bg-[rgba(127,184,151,0.15)] text-[#7FB897]">+ Add option</button>
          </div>
          {form.modifiers.length === 0 && (
            <p className="text-xs text-[rgba(232,237,232,0.4)] py-2">No options yet. Click + Add option to create some.</p>
          )}
          <div className="space-y-2">
            {form.modifiers.map((m, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  value={m.name}
                  onChange={e => updateModifier(idx, 'name', e.target.value)}
                  placeholder="Option name"
                  className="col-span-4 bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-3 py-1.5 text-sm text-[#E8EDE8]"
                />
                <div className="col-span-3 flex items-center gap-1">
                  <span className="text-xs text-[rgba(232,237,232,0.5)]">+$</span>
                  <input
                    type="number" step="0.50"
                    value={m.price_adjustment}
                    onChange={e => updateModifier(idx, 'price_adjustment', parseFloat(e.target.value) || 0)}
                    className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(127,184,151,0.2)] rounded-xl px-2 py-1.5 text-sm text-[#E8EDE8]"
                  />
                </div>
                <label className="col-span-2 flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={m.is_default} onChange={e => updateModifier(idx, 'is_default', e.target.checked)} />
                  Default
                </label>
                <label className="col-span-2 flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={m.allow_quantity} onChange={e => updateModifier(idx, 'allow_quantity', e.target.checked)} />
                  Qty
                </label>
                <button onClick={() => removeModifier(idx)} className="col-span-1 text-[#FF6B6B] text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm border border-[rgba(127,184,151,0.2)] text-[rgba(232,237,232,0.7)]">Cancel</button>
          <button onClick={submit} className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#2D5240] text-[#7FB897]">Save group</button>
        </div>
      </div>
    </div>
  )
}

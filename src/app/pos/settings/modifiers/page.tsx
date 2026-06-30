'use client'
import { useState, useEffect, useCallback } from 'react'
import ModifierGroupModal from '@/components/pos/settings/ModifierGroupModal'

interface Modifier {
  id: string
  name: string
  price_cents?: number | null
  price_adjustment: number
  is_default: boolean
  allow_quantity: boolean
  max_quantity: number
}

interface ModifierGroup {
  id: string
  name: string
  display_name: string | null
  selection_type: 'single' | 'multi'
  is_required: boolean
  min_selections: number
  max_selections: number
  allow_quantity: boolean
  step_number: number | null
  color: string | null
  modifiers: Modifier[]
}

export default function ModifiersPage() {
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<ModifierGroup | null>(null)
  const [seeding, setSeeding] = useState(false)

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/pos/modifier-groups')
    const d = await r.json()
    setGroups(d.groups ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGroups() }, [fetchGroups])

  async function saveNew(form: object) {
    const r = await fetch('/api/pos/modifier-groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (r.ok) { setShowAdd(false); fetchGroups() }
    else alert('Failed to save modifier group')
  }

  async function saveEdit(form: object & { id?: string }) {
    const { id, ...updates } = form as { id?: string; [k: string]: unknown }
    const r = await fetch(`/api/pos/modifier-groups/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (r.ok) { setEditing(null); fetchGroups() }
    else alert('Failed to update modifier group')
  }

  async function remove(id: string) {
    if (!confirm('Delete this modifier group? This cannot be undone.')) return
    const r = await fetch(`/api/pos/modifier-groups/${id}`, { method: 'DELETE' })
    const d = await r.json()
    if (!r.ok) { alert(d.error ?? 'Failed to delete'); return }
    fetchGroups()
  }

  async function seedCafeDefaults() {
    setSeeding(true)
    try {
      const r = await fetch('/api/pos/modifier-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'milk_type', display_name: 'Milk type', selection_type: 'single',
          is_required: true, min_selections: 1, max_selections: 1, step_number: 1, color: '#7FB897',
          modifiers: [
            { name: 'Full cream', price_adjustment: 0, is_default: true },
            { name: 'Skim', price_adjustment: 0, is_default: false },
            { name: 'Oat', price_adjustment: 0.50, is_default: false },
            { name: 'Soy', price_adjustment: 0.50, is_default: false },
            { name: 'Almond', price_adjustment: 0.50, is_default: false },
          ],
        }),
      })
      if (!r.ok) { alert('Could not seed milk type'); return }
      await fetch('/api/pos/modifier-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'extra_shot', display_name: 'Extra shot', selection_type: 'multi',
          is_required: false, min_selections: 0, max_selections: 3, allow_quantity: true, step_number: 2, color: '#EB984E',
          modifiers: [{ name: 'Extra shot', price_adjustment: 1.00, is_default: false, allow_quantity: true, max_quantity: 3 }],
        }),
      })
      await fetch('/api/pos/modifier-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'sugar', display_name: 'Sugar', selection_type: 'single',
          is_required: false, min_selections: 0, max_selections: 1, step_number: 3, color: '#4A90E2',
          modifiers: [
            { name: 'No sugar', price_adjustment: 0, is_default: true },
            { name: '1 sugar', price_adjustment: 0, is_default: false },
            { name: '2 sugars', price_adjustment: 0, is_default: false },
            { name: '3 sugars', price_adjustment: 0, is_default: false },
          ],
        }),
      })
      fetchGroups()
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Modifier Groups</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Create customisation options (milk type, extra shot, etc.) and attach them to products.</p>
        </div>
        <div className="flex gap-2">
          {groups.length === 0 && (
            <button onClick={seedCafeDefaults} disabled={seeding} className="px-3 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.1)] text-[#1a1a16]">
              {seeding ? 'Seeding…' : 'Seed café defaults'}
            </button>
          )}
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a16] text-white">+ New group</button>
        </div>
      </div>

      {loading ? <div className="text-sm text-[rgba(26,26,22,.5)]">Loading…</div> : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden">
          {groups.length === 0 ? (
            <p className="text-sm text-[rgba(26,26,22,.4)] p-8 text-center">No modifier groups yet. Create one or seed café defaults to get started.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
                <tr>
                  <th className="text-left px-4 py-3">Group</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Required</th>
                  <th className="text-right px-4 py-3">Options</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.id} className="border-t border-[rgba(0,0,0,.04)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {g.color && <span style={{ width: 10, height: 10, borderRadius: '50%', background: g.color, display: 'inline-block' }} />}
                        <span className="font-medium">{g.display_name ?? g.name}</span>
                        {g.step_number && <span className="text-[10px] text-[rgba(26,26,22,.4)] ml-1">step {g.step_number}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize">{g.selection_type}</td>
                    <td className="px-4 py-3 text-xs">{g.is_required ? 'Yes' : 'Optional'}</td>
                    <td className="px-4 py-3 text-right text-xs">{g.modifiers?.length ?? 0}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(g)} className="text-xs text-[#8B5CF6] mr-3">Edit</button>
                      <button onClick={() => remove(g.id)} className="text-xs text-red-600">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {(showAdd || editing) && (
        <ModifierGroupModal
          initial={editing ?? undefined}
          onSave={(form) => editing ? saveEdit({ ...form, id: editing.id }) : saveNew(form)}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

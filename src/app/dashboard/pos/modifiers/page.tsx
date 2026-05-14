'use client'
import { useState, useEffect } from 'react'
import type { ModifierGroup } from '@/types/pos-modifiers'
import { ModifierGroupList } from '@/components/pos/modifiers/ModifierGroupList'
import { ModifierEditor } from '@/components/pos/modifiers/ModifierEditor'
import { GroupForm } from '@/components/pos/modifiers/GroupForm'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', sage: '#7FB897', red: '#EF4444' }

export default function ModifierManagerPage() {
  const [bid, setBid]               = useState<string | null>(null)
  const [industry, setIndustry]     = useState<string | null>(null)
  const [groups, setGroups]         = useState<ModifierGroup[]>([])
  const [selectedGroup, setSelected] = useState<ModifierGroup | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [seeding, setSeeding]       = useState(false)
  const [seedMsg, setSeedMsg]       = useState('')

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) {
        setBid(d.business_id)
        setIndustry(d.business_type ?? null)
        loadGroups(d.business_id)
      } else {
        setLoading(false)
      }
    }).catch(() => setLoading(false))
  }, [])

  async function loadGroups(businessId: string) {
    setLoading(true)
    const res = await fetch(`/api/pos/modifier-groups?business_id=${businessId}`)
    const d = await res.json()
    if (d.ok) setGroups(d.data ?? [])
    setLoading(false)
  }

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    const reordered = [...groups]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setGroups(reordered)
    // Persist new display_order for all affected groups
    await Promise.all(reordered.map((g, i) =>
      fetch(`/api/pos/modifier-groups/${g.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_order: i }),
      })
    ))
  }

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this modifier group? This removes it from all products.')) return
    await fetch(`/api/pos/modifier-groups/${id}`, { method: 'DELETE' })
    if (selectedGroup?.id === id) setSelected(null)
    if (bid) loadGroups(bid)
  }

  const handleCreateGroup = async (data: Partial<ModifierGroup>) => {
    await fetch('/api/pos/modifier-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, business_id: bid }),
    })
    setShowForm(false)
    if (bid) loadGroups(bid)
  }

  const handleSeed = async () => {
    if (!bid) return
    setSeeding(true)
    setSeedMsg('')
    const res = await fetch('/api/pos/cafe/seed-modifiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid }),
    })
    const d = await res.json()
    setSeedMsg(d.message ?? 'Done')
    loadGroups(bid)
    setSeeding(false)
  }

  // ── Non-cafe empty state ──
  if (!loading && industry && industry !== 'cafe') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>☕</div>
        <p style={{ color: C.muted, fontSize: 15 }}>Modifier groups are for cafe businesses only.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Modifier Groups</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            Configure drink customisations — size, milk, shots, syrups and more.
          </p>
        </div>
        <button onClick={handleSeed} disabled={seeding}
          style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.08)', color: C.sage, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, opacity: seeding ? 0.6 : 1 }}>
          {seeding ? 'Seeding…' : '↺ Reseed standard library'}
        </button>
        <button onClick={() => setShowForm(v => !v)}
          style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: C.sage, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
          + New Group
        </button>
      </div>

      {seedMsg && (
        <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: C.sage }}>
          {seedMsg}
        </div>
      )}

      {/* New group form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 20, maxWidth: 480 }}>
          <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>New Modifier Group</h3>
          <GroupForm onSave={handleCreateGroup} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {loading ? (
        <p style={{ color: C.dim, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Left: group list */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
              {groups.length} Groups — drag to reorder
            </p>
            {groups.length === 0 ? (
              <p style={{ color: C.dim, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                No groups yet. Click "Reseed standard library" to add the standard 12.
              </p>
            ) : (
              <ModifierGroupList
                groups={groups}
                selectedId={selectedGroup?.id ?? null}
                onSelect={g => setSelected({ ...g, modifiers: groups.find(grp => grp.id === g.id)?.modifiers })}
                onDelete={handleDeleteGroup}
                onReorder={handleReorder}
              />
            )}
          </div>

          {/* Right: modifier editor */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
            {selectedGroup && bid ? (
              <ModifierEditor
                key={selectedGroup.id}
                group={selectedGroup}
                businessId={bid}
                onRefresh={() => {
                  if (bid) loadGroups(bid).then(() => {
                    // refresh the selected group from updated list
                  })
                }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.dim }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>☕</div>
                <p style={{ fontSize: 13 }}>Select a modifier group to edit its options</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
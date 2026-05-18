'use client'
import { useEffect, useState } from 'react'
import type { KdsStation } from '@/lib/pos/kds-types'

export default function KdsStationsPage() {
  const [stations, setStations] = useState<KdsStation[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const r = await fetch('/api/pos/kds/stations?include_inactive=1')
    const j = await r.json()
    setStations(j.stations ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newKey.trim() || !newName.trim()) return
    setSaving(true)
    const r = await fetch('/api/pos/kds/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_key: newKey, display_name: newName }),
    })
    setSaving(false)
    if (r.ok) {
      setNewKey(''); setNewName('')
      load()
    } else {
      const j = await r.json()
      alert(j.error ?? 'Failed to create station')
    }
  }

  const toggle = async (id: string, field: string, value: unknown) => {
    await fetch(`/api/pos/kds/stations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    load()
  }

  const archive = async (id: string) => {
    if (!confirm('Archive this station? It will no longer appear on ticket routing.')) return
    await fetch(`/api/pos/kds/stations/${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <div className="p-6 text-sm" style={{ color: 'var(--text-primary, #E8EDE7)' }}>Loading…</div>

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <h1 className="text-2xl font-medium">Kitchen Stations</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Configure which kitchen screens orders route to. Open a station screen at <code className="font-mono text-xs">/pos/kds/[station_key]</code>.
        </p>
      </header>

      <section className="rounded-lg p-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <h2 className="text-sm uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Add station</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="key (e.g. espresso)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="flex-1 px-3 py-2 rounded text-sm"
            style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
          />
          <input
            type="text"
            placeholder="Display name (e.g. Espresso Bar)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded text-sm"
            style={{ background: 'var(--bg-input, #0F1612)', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-primary, #E8EDE7)' }}
          />
          <button onClick={create} disabled={saving} className="px-4 py-2 rounded text-sm font-semibold" style={{ background: '#2D5240', color: '#7FB897' }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {stations.map(s => (
          <div
            key={s.id}
            className="rounded-lg p-4"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', opacity: s.is_active ? 1 : 0.5 }}
          >
            <div className="flex justify-between items-baseline mb-3">
              <div>
                <h3 className="font-medium">{s.display_name}</h3>
                <code className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{s.station_key}</code>
              </div>
              <div className="flex gap-3 text-sm">
                <a href={`/pos/kds/${s.station_key}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: '#7FB897' }}>Open screen ↗</a>
                {s.is_active ? (
                  <button onClick={() => archive(s.id)} className="hover:underline" style={{ color: '#FF6B6B' }}>Archive</button>
                ) : (
                  <button onClick={() => toggle(s.id, 'is_active', true)} className="hover:underline" style={{ color: '#7FB897' }}>Restore</button>
                )}
              </div>
            </div>
            <div className="flex gap-5 text-sm flex-wrap">
              {[
                ['sound_enabled', 'Sound on new ticket', s.sound_enabled],
                ['show_modifiers', 'Show modifiers', s.show_modifiers],
                ['show_allergens', 'Show allergens', s.show_allergens],
              ].map(([field, label, checked]) => (
                <label key={field as string} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked as boolean}
                    onChange={e => toggle(s.id, field as string, e.target.checked)}
                  />
                  {label as string}
                </label>
              ))}
            </div>
          </div>
        ))}
        {stations.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            No stations yet. Add one above or they will be seeded automatically for cafe/restaurant/bakery.
          </div>
        )}
      </section>
    </div>
  )
}

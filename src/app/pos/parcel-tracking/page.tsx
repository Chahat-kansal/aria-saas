'use client'
import { useState, useEffect, useCallback } from 'react'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'rgba(127,184,151,0.15)',
  green: '#7FB897', sage: '#2D5240', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  red: '#ef4444', amber: '#f59e0b', blue: '#60a5fa', violet: '#8B5CF6',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending:           { label: 'Registered',       color: C.dim,    icon: '⏳' },
  in_transit:        { label: 'In Transit',        color: C.blue,   icon: '🚚' },
  out_for_delivery:  { label: 'Out for Delivery',  color: C.amber,  icon: '📦' },
  delivered:         { label: 'Delivered',         color: C.green,  icon: '✅' },
  exception:         { label: 'Exception',         color: C.red,    icon: '⚠️' },
  unknown:           { label: 'Unknown',           color: C.dim,    icon: '❓' },
}

const CARRIERS = [
  { value: 'auspost',        label: 'Australia Post' },
  { value: 'aramex',         label: 'Aramex' },
  { value: 'startrack',      label: 'StarTrack' },
  { value: 'dhl',            label: 'DHL Express' },
  { value: 'fedex',          label: 'FedEx' },
  { value: 'couriersplease', label: 'Couriers Please' },
  { value: 'tnt',            label: 'TNT' },
  { value: 'other',          label: 'Other / Auto-detect' },
]

interface Parcel {
  id: string
  tracking_number: string
  carrier: string
  carrier_name: string
  label: string | null
  direction: 'inbound' | 'outbound'
  status: string
  status_detail: string | null
  events: Array<{ time: string; location: string; description: string }>
  estimated_delivery: string | null
  delivered_at: string | null
  last_checked_at: string | null
  notes: string | null
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: cfg.color + '18', color: cfg.color, border: `1px solid ${cfg.color}30`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDateTime(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ParcelTrackingPage() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Parcel | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'delivered'>('active')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [addForm, setAddForm] = useState({
    tracking_number: '', carrier: 'other', label: '', direction: 'inbound', notes: ''
  })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (direction !== 'all') params.set('direction', direction)
    const res = await fetch(`/api/pos/parcel-tracking?${params}`)
    if (res.ok) {
      const d = await res.json() as { parcels: Parcel[] }
      setParcels(d.parcels ?? [])
    }
    setLoading(false)
  }, [filter, direction])

  useEffect(() => { load() }, [load])

  async function addParcel() {
    if (!addForm.tracking_number.trim()) { setAddError('Enter a tracking number'); return }
    setAdding(true); setAddError('')
    const res = await fetch('/api/pos/parcel-tracking', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const d = await res.json() as { parcel?: Parcel; error?: string }
    if (d.error) { setAddError(d.error); setAdding(false); return }
    setShowAdd(false)
    setAddForm({ tracking_number: '', carrier: 'other', label: '', direction: 'inbound', notes: '' })
    setAdding(false)
    await load()
    if (d.parcel) setSelected(d.parcel)
  }

  async function refresh(id: string) {
    setRefreshing(id)
    const res = await fetch('/api/pos/parcel-tracking', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, refresh: true }),
    })
    const d = await res.json() as { parcel?: Parcel }
    if (d.parcel) {
      setParcels(ps => ps.map(p => p.id === id ? d.parcel! : p))
      if (selected?.id === id) setSelected(d.parcel)
    }
    setRefreshing(null)
  }

  async function remove(id: string) {
    if (!confirm('Remove this parcel?')) return
    await fetch('/api/pos/parcel-tracking', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setParcels(ps => ps.filter(p => p.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const btn = (label: string, onClick: () => void, active = false, color = C.green) => (
    <button onClick={onClick} style={{
      height: 30, padding: '0 12px', borderRadius: 7, border: `1px solid ${active ? color : C.border}`,
      background: active ? color + '18' : 'transparent', color: active ? color : C.muted,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
    }}>{label}</button>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: C.bg, fontFamily: 'var(--font-ui,Inter,system-ui,sans-serif)', color: C.text }}>

      {/* Left panel */}
      <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.border}` }}>

        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Parcel Tracking</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>AusPost · Aramex · DHL · StarTrack · more</div>
            </div>
            <button onClick={() => setShowAdd(true)} style={{
              height: 32, padding: '0 14px', borderRadius: 8, border: 'none',
              background: C.sage, color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>+ Add parcel</button>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {btn('Active', () => setFilter('active'), filter === 'active')}
            {btn('All', () => setFilter('all'), filter === 'all')}
            {btn('Delivered', () => setFilter('delivered'), filter === 'delivered')}
            <div style={{ width: 1, background: C.border, margin: '0 2px' }} />
            {btn('Inbound', () => setDirection(direction === 'inbound' ? 'all' : 'inbound'), direction === 'inbound')}
            {btn('Outbound', () => setDirection(direction === 'outbound' ? 'all' : 'outbound'), direction === 'outbound')}
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div style={{ padding: 14, borderBottom: `1px solid ${C.border}`, background: 'rgba(127,184,151,0.04)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: C.green }}>Add tracking number</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={addForm.tracking_number} onChange={e => setAddForm(f => ({ ...f, tracking_number: e.target.value }))}
                placeholder="Tracking number (e.g. ES123456789AU)"
                style={{ height: 34, borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, padding: '0 10px', fontSize: 12, fontFamily: 'monospace', outline: 'none', width: '100%' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select value={addForm.carrier} onChange={e => setAddForm(f => ({ ...f, carrier: e.target.value }))}
                  style={{ height: 34, borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.text, padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}>
                  {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select value={addForm.direction} onChange={e => setAddForm(f => ({ ...f, direction: e.target.value }))}
                  style={{ height: 34, borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, color: C.text, padding: '0 8px', fontSize: 12, fontFamily: 'inherit' }}>
                  <option value="inbound">📥 Inbound (supplier → me)</option>
                  <option value="outbound">📤 Outbound (me → customer)</option>
                </select>
              </div>
              <input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Label (e.g. PO #1234 from Dan Murphy's)"
                style={{ height: 34, borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, padding: '0 10px', fontSize: 12, outline: 'none', width: '100%' }} />
              {addError && <div style={{ fontSize: 11, color: C.red }}>{addError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addParcel} disabled={adding} style={{
                  flex: 1, height: 32, borderRadius: 7, border: 'none',
                  background: C.sage, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1, fontFamily: 'inherit',
                }}>{adding ? 'Adding...' : 'Add & Track'}</button>
                <button onClick={() => setShowAdd(false)} style={{
                  height: 32, padding: '0 14px', borderRadius: 7, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Parcel list */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading...</div>
          ) : parcels.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No parcels tracked</div>
              <div style={{ fontSize: 12, color: C.dim }}>Add a tracking number from AusPost,<br />Aramex, DHL, StarTrack and more</div>
            </div>
          ) : parcels.map(p => {
            const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.unknown
            const isSelected = selected?.id === p.id
            return (
              <div key={p.id} onClick={() => setSelected(p)} style={{
                padding: '12px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                background: isSelected ? 'rgba(127,184,151,0.06)' : 'transparent',
                borderLeft: isSelected ? `3px solid ${C.green}` : '3px solid transparent',
                transition: 'all 0.12s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: C.text, fontWeight: 600, marginBottom: 2 }}>
                      {p.direction === 'inbound' ? '📥' : '📤'} {p.tracking_number}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.label ?? p.carrier_name}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {p.estimated_delivery && p.status !== 'delivered' && (
                      <div style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>ETA {formatDate(p.estimated_delivery)}</div>
                    )}
                    {p.delivered_at && (
                      <div style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>✓ {formatDate(p.delivered_at)}</div>
                    )}
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{p.carrier_name}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.dim }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>🚚</div>
            <div style={{ fontSize: 14 }}>Select a parcel to view details</div>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', marginBottom: 4 }}>{selected.tracking_number}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <StatusBadge status={selected.status} />
                  <span style={{ fontSize: 12, color: C.muted }}>{selected.carrier_name}</span>
                  <span style={{ fontSize: 12, color: C.dim }}>{selected.direction === 'inbound' ? '📥 Inbound' : '📤 Outbound'}</span>
                </div>
                {selected.label && (
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{selected.label}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => refresh(selected.id)} disabled={refreshing === selected.id}
                  style={{ height: 30, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {refreshing === selected.id ? '...' : '↻ Refresh'}
                </button>
                <button onClick={() => remove(selected.id)}
                  style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Remove
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div style={{ padding: '14px 20px', display: 'flex', gap: 12, borderBottom: `1px solid ${C.border}` }}>
              {[
                { label: 'Status', value: STATUS_CONFIG[selected.status]?.label ?? 'Unknown' },
                { label: 'Est. Delivery', value: formatDate(selected.estimated_delivery) },
                { label: 'Delivered', value: formatDate(selected.delivered_at) },
                { label: 'Last Updated', value: formatDateTime(selected.last_checked_at) },
              ].map(item => (
                <div key={item.label} style={{ flex: 1, background: C.card, borderRadius: 10, padding: '10px 12px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Status detail */}
            {selected.status_detail && (
              <div style={{ margin: '12px 20px 0', padding: '10px 14px', background: 'rgba(127,184,151,0.06)', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.muted }}>
                {selected.status_detail}
              </div>
            )}

            {/* Events timeline */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {!selected.events?.length ? (
                <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, padding: '40px 0' }}>
                  {process.env.NEXT_PUBLIC_TRACK17_CONFIGURED === 'true'
                    ? 'No tracking events yet — click Refresh to check for updates'
                    : (
                      <div>
                        <div style={{ fontSize: 13, marginBottom: 8 }}>Live tracking requires a Track17 API key</div>
                        <div style={{ fontSize: 11, color: C.dim }}>
                          Get a free key at <a href="https://www.track17.com" target="_blank" rel="noopener" style={{ color: C.green }}>track17.com</a> (free tier: 100 requests/day)<br />
                          Then set <code style={{ background: 'rgba(127,184,151,0.1)', padding: '1px 5px', borderRadius: 3 }}>TRACK17_API_KEY</code> in your Vercel environment variables
                        </div>
                      </div>
                    )
                  }
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Tracking Events</div>
                  {selected.events.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 16, position: 'relative' }}>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%',
                          background: i === 0 ? C.green : C.border,
                          border: `2px solid ${i === 0 ? C.green : C.dim}`,
                          marginTop: 3,
                        }} />
                        {i < selected.events.length - 1 && (
                          <div style={{ width: 1, flex: 1, background: C.border, minHeight: 20, marginTop: 3 }} />
                        )}
                      </div>
                      <div style={{ flex: 1, paddingBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: i === 0 ? C.text : C.muted, marginBottom: 2 }}>{ev.description}</div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.dim }}>
                          {ev.location && <span>📍 {ev.location}</span>}
                          <span>🕐 {formatDateTime(ev.time)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: '#F0F4F0', muted: 'var(--text-secondary,#A8B5A8)', green: '#7FB897', darkGreen: '#2D5240', red: '#ef4444', amber: '#f59e0b', border: 'rgba(127,184,151,0.15)' }

interface Outlet { id: string; name: string; accepts_online_orders: boolean; delivery_enabled: boolean; delivery_fee: number; min_order_amount: number; prep_time_minutes: number; pickup_ready_estimate_minutes: number | null; online_ordering_note: string | null }
interface OnlineOrder { id: string; order_number: string; customer_name: string; customer_phone: string | null; customer_email: string | null; fulfillment_type: string; status: string; total: number; subtotal: number; delivery_fee: number; items: Array<{ name: string; qty: number; price: number; notes?: string }>; notes: string | null; special_instructions: string | null; aria_upsell: string | null; created_at: string; accepted_at: string | null; estimated_ready_at: string | null }

const STATUS_COLOR: Record<string, string> = { pending: C.amber, accepted: '#60a5fa', preparing: '#a78bfa', ready: C.green, completed: C.muted, rejected: C.red }

function elapsed(from: string) {
  const s = Math.floor((Date.now() - new Date(from).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
}

export default function OnlineOrderingPage() {
  const [bizId, setBizId]       = useState('')
  const [outlet, setOutlet]     = useState<Outlet | null>(null)
  const [orders, setOrders]     = useState<OnlineOrder[]>([])
  const [selected, setSelected] = useState<OnlineOrder | null>(null)
  const [tab, setTab]           = useState<'queue' | 'settings'>('queue')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [tick, setTick]         = useState(0)
  const [settings, setSettings] = useState<Partial<Outlet>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://ariaos.site'

  const loadAll = useCallback(async (bid: string) => {
    const [outRes, ordRes] = await Promise.all([
      fetch(`/api/pos/outlets?business_id=${bid}`),
      fetch('/api/pos/online-orders'),
    ])
    const outData = await outRes.json().catch(() => ({}))
    const ordData = await ordRes.json().catch(() => ({}))
    const o = (outData.outlet ?? outData.outlets?.[0]) as Outlet | null
    setOutlet(o)
    if (o) setSettings({ accepts_online_orders: o.accepts_online_orders, delivery_enabled: o.delivery_enabled, delivery_fee: o.delivery_fee, min_order_amount: o.min_order_amount, prep_time_minutes: o.prep_time_minutes, online_ordering_note: o.online_ordering_note })
    setOrders((ordData.orders ?? []) as OnlineOrder[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then((d: Record<string,unknown>) => {
      if (d.business_id) { setBizId(d.business_id as string); loadAll(d.business_id as string) }
      else setLoading(false)
    }).catch(() => setLoading(false))
  }, [loadAll])

  useEffect(() => {
    if (!bizId) return
    pollRef.current = setInterval(() => {
      fetch('/api/pos/online-orders').then(r => r.json()).then((d: Record<string,unknown>) => setOrders((d.orders ?? []) as OnlineOrder[]))
    }, 20_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [bizId])

  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t) }, [])
  void tick

  async function updateOrder(id: string, status: string, extra?: Record<string, unknown>) {
    const res = await fetch('/api/pos/online-orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...extra }) })
    const d = await res.json() as { order?: OnlineOrder }
    if (d.order) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...d.order } : o))
      if (selected?.id === id) setSelected(s => s ? { ...s, ...d.order } : s)
    }
  }

  async function saveSettings() {
    if (!outlet) return
    setSaving(true)
    await fetch(`/api/pos/outlets?id=${outlet.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    setOutlet(o => o ? { ...o, ...settings } : o)
    setSaving(false)
  }

  const pending = orders.filter(o => o.status === 'pending')
  const active  = orders.filter(o => ['accepted','preparing','ready'].includes(o.status))
  const done    = orders.filter(o => ['completed','rejected'].includes(o.status))
  const menuUrl = `${APP_URL}/menu/${bizId}`

  if (loading) return <div style={{ padding: 32, color: C.muted }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', display: 'flex', gap: 0 }}>

      {/* Left: order list */}
      <div style={{ flex: 1, padding: 24, maxWidth: 520, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Online Orders</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['queue','settings'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t ? C.darkGreen : 'transparent', color: tab === t ? C.green : C.muted }}>
                {t === 'queue' ? `Queue${pending.length > 0 ? ` (${pending.length} new)` : ''}` : 'Settings'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'queue' && (
          <>
            {pending.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>⚡ Needs action ({pending.length})</p>
                {pending.map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              </div>
            )}
            {active.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>In progress ({active.length})</p>
                {active.map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              </div>
            )}
            {done.slice(0, 20).length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Completed</p>
                {done.slice(0, 20).map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              </div>
            )}
            {orders.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No orders yet. Share your menu link to start receiving orders.</p>}
          </>
        )}

        {tab === 'settings' && outlet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ background: C.card, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Order settings</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <input type="checkbox" checked={!!settings.accepts_online_orders} onChange={e => setSettings(s => ({ ...s, accepts_online_orders: e.target.checked }))} />
                Accept online orders
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                <input type="checkbox" checked={!!settings.delivery_enabled} onChange={e => setSettings(s => ({ ...s, delivery_enabled: e.target.checked }))} />
                Enable delivery
              </label>
              {([
                { label: 'Delivery fee ($)', key: 'delivery_fee', type: 'number' },
                { label: 'Min order ($)', key: 'min_order_amount', type: 'number' },
                { label: 'Prep time (mins)', key: 'prep_time_minutes', type: 'number' },
              ] as const).map(({ label, key, type }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>{label}</label>
                  <input type={type} value={String(settings[key] ?? '')} onChange={e => setSettings(s => ({ ...s, [key]: parseFloat(e.target.value) || 0 }))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Note shown to customers at checkout</label>
                <textarea value={settings.online_ordering_note ?? ''} onChange={e => setSettings(s => ({ ...s, online_ordering_note: e.target.value }))} rows={2}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <button onClick={saveSettings} disabled={saving} style={{ alignSelf: 'flex-start', background: C.darkGreen, color: C.green, border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, alignSelf: 'flex-start' }}>Your order link</h3>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(menuUrl)}&bgcolor=ffffff&color=0f1a26`} alt="QR" style={{ width: 180, height: 180, borderRadius: 10 }} />
              <p style={{ fontSize: 12, color: C.muted, wordBreak: 'break-all', textAlign: 'center' }}>{menuUrl}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(menuUrl)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer' }}>Copy link</button>
                <a href={menuUrl} target="_blank" rel="noopener" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, color: C.muted, border: `1px solid ${C.border}`, textDecoration: 'none' }}>Preview ↗</a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: order detail */}
      {selected && (
        <div style={{ width: 360, borderLeft: `1px solid ${C.border}`, padding: 24, overflowY: 'auto', background: C.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>#{selected.order_number}</h2>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[selected.status] || C.muted) + '22', color: STATUS_COLOR[selected.status] || C.muted, fontWeight: 700 }}>{selected.status.toUpperCase()}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{selected.fulfillment_type === 'delivery' ? '🚗 Delivery' : '🏪 Pickup'}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{elapsed(selected.created_at)} ago</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{selected.customer_name}</p>
            {selected.customer_phone && <p style={{ fontSize: 13, color: C.muted }}>{selected.customer_phone}</p>}
            {selected.customer_email && <p style={{ fontSize: 13, color: C.muted }}>{selected.customer_email}</p>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600 }}>ITEMS</p>
            {(selected.items ?? []).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                <span>{item.qty}× {item.name}{item.notes ? <span style={{ color: C.muted }}> ({item.notes})</span> : ''}</span>
                <span>${((item.price || 0) * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 16 }}>
              <span>Total</span><span>${(Number(selected.total)||0).toFixed(2)}</span>
            </div>
          </div>
          {(selected.notes || selected.special_instructions) && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: C.muted }}>
              {selected.notes || selected.special_instructions}
            </div>
          )}
          {selected.aria_upsell && (
            <div style={{ background: 'rgba(127,184,151,0.08)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <span style={{ color: C.green, fontWeight: 600 }}>✦ Aria · </span>{selected.aria_upsell}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selected.status === 'pending' && (
              <>
                <button onClick={() => updateOrder(selected.id, 'accepted')} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>✓ Accept order</button>
                <button onClick={() => { const r = prompt('Rejection reason (optional):'); updateOrder(selected.id, 'rejected', { rejection_reason: r || 'Unable to fulfil' }) }} style={{ background: 'rgba(239,68,68,0.1)', color: C.red, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 10, padding: '10px 0', fontWeight: 600, cursor: 'pointer' }}>✕ Reject</button>
              </>
            )}
            {selected.status === 'accepted' && (
              <button onClick={() => updateOrder(selected.id, 'preparing')} style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Start preparing</button>
            )}
            {selected.status === 'preparing' && (
              <button onClick={() => updateOrder(selected.id, 'ready')} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Mark ready for {selected.fulfillment_type === 'delivery' ? 'pickup' : 'collection'}</button>
            )}
            {selected.status === 'ready' && (
              <button onClick={() => updateOrder(selected.id, 'completed')} style={{ background: 'rgba(127,184,151,0.1)', color: C.green, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Complete order</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, selected, onClick, elapsedStr }: { order: OnlineOrder; selected: boolean; onClick: () => void; elapsedStr: string }) {
  const color = STATUS_COLOR[order.status] || '#A8B5A8'
  return (
    <div onClick={onClick} style={{ background: selected ? 'rgba(127,184,151,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selected ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>#{order.order_number}</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: color + '22', color, fontWeight: 700 }}>{order.status}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 13, color: '#F0F4F0' }}>{order.customer_name}</span>
        <span style={{ fontSize: 13, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: '#7FB897' }}>${(Number(order.total)||0).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary,#A8B5A8)' }}>{order.fulfillment_type === 'delivery' ? '🚗' : '🏪'} {elapsedStr}</span>
        {order.aria_upsell && <span style={{ fontSize: 11, color: '#7FB897' }}>✦ Aria tip</span>}
      </div>
    </div>
  )
}

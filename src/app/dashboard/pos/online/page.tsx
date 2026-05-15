'use client'
import { useState, useEffect } from 'react'

interface Outlet { id: string; name: string; accepts_online_orders: boolean; online_order_throttle_per_15min: number | null; pickup_ready_estimate_minutes: number | null }
interface OnlineOrder { id: string; order_number: string; customer_name: string; customer_phone: string | null; status: string; total: number; notes: string | null; created_at: string }

const APP_URL = typeof window !== 'undefined' ? window.location.origin : 'https://ariaos.site'

function QRImage({ url }: { url: string }) {
  const encoded = encodeURIComponent(url)
  return (
    <div style={{ textAlign: 'center' }}>
      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&bgcolor=ffffff&color=0f1a26`} alt="QR code" style={{ width: 200, height: 200, borderRadius: 12, border: '4px solid #fff' }} />
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, wordBreak: 'break-all', maxWidth: 200 }}>{url}</p>
      <a href={url} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--violet)' }}>Open menu ↗</a>
    </div>
  )
}

export default function OnlineOrderingPage() {
  const [outlet, setOutlet] = useState<Outlet | null>(null)
  const [bizId,  setBizId]  = useState('')
  const [orders, setOrders] = useState<OnlineOrder[]>([])
  const [loading,setLoading]= useState(true)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    async function load() {
      const bizRes = await fetch('/api/pos/products').then(r => r.json()).catch(() => ({}))
      const bid = bizRes.business_id
      if (bid) setBizId(bid)

      const outRes = await fetch('/api/pos/outlets').then(r => r.json()).catch(() => ({}))
      const first = (outRes.outlets ?? outRes.data ?? [])[0] as Outlet | undefined
      if (first) setOutlet({ ...first, online_order_throttle_per_15min: first.online_order_throttle_per_15min ?? 10, pickup_ready_estimate_minutes: first.pickup_ready_estimate_minutes ?? 10 })

      if (bid) {
        const ordRes = await fetch(`/api/pos/online-orders?business_id=${bid}&limit=20`).then(r => r.json()).catch(() => ({ orders: [] }))
        setOrders(ordRes.orders ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    if (!outlet) return
    setSaving(true)
    await fetch(`/api/pos/outlets/${outlet.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accepts_online_orders: outlet.accepts_online_orders, online_order_throttle_per_15min: outlet.online_order_throttle_per_15min, pickup_ready_estimate_minutes: outlet.pickup_ready_estimate_minutes }),
    }).catch(() => {})
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function updateOrderStatus(id: string, status: string) {
    await fetch(`/api/pos/online-orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => {})
    setOrders(os => os.map(o => o.id === id ? { ...o, status } : o))
  }

  const menuUrl = bizId ? `${APP_URL}/menu/${bizId}` : ''
  const kioskUrl = outlet ? `${APP_URL}/kiosk/${outlet.id}` : ''
  const displayUrl = outlet ? `${APP_URL}/pickup-display/${outlet.id}` : ''

  const STATUS_COLOR: Record<string,string> = { pending: '#F59E0B', confirmed: '#6B96B0', preparing: '#8B5CF6', ready: '#7FB897', collected: '#94A3B8', cancelled: '#EF4444' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Online Ordering</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>Accept orders via QR code, kiosk, or web menu.</p>

      {loading ? (
        <div style={{ height: 200, background: 'var(--bg-surface)', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <>
          {/* Settings card */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>Accept online orders</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{outlet?.name ?? 'Main outlet'}</p>
              </div>
              {outlet && (
                <button onClick={() => setOutlet(o => o ? { ...o, accepts_online_orders: !o.accepts_online_orders } : o)}
                  style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative', background: outlet.accepts_online_orders ? '#7FB897' : 'var(--bg-elevated)', boxShadow: 'inset 0 0 0 1px var(--divider)', transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: outlet.accepts_online_orders ? 27 : 3, width: 22, height: 22, borderRadius: '50%', background: outlet.accepts_online_orders ? '#fff' : 'var(--text-tertiary)', transition: 'left 0.2s' }} />
                </button>
              )}
            </div>

            {outlet?.accepts_online_orders && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Orders per 15 min (throttle)</label>
                  <input type="number" min={1} max={50} value={outlet.online_order_throttle_per_15min ?? 10}
                    onChange={e => setOutlet(o => o ? { ...o, online_order_throttle_per_15min: parseInt(e.target.value) } : o)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Pickup estimate (minutes)</label>
                  <input type="number" min={1} max={120} value={outlet.pickup_ready_estimate_minutes ?? 10}
                    onChange={e => setOutlet(o => o ? { ...o, pickup_ready_estimate_minutes: parseInt(e.target.value) } : o)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={save} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved && <span style={{ fontSize: 12, color: '#7FB897', fontWeight: 600 }}>✓ Saved</span>}
            </div>
          </div>

          {/* QR codes */}
          {bizId && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 20px' }}>QR Codes</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 24 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>Public Menu</p>
                  <QRImage url={menuUrl} />
                </div>
                {kioskUrl && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>Kiosk Mode</p>
                    <QRImage url={kioskUrl} />
                  </div>
                )}
                {displayUrl && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>Pickup Display</p>
                    <QRImage url={displayUrl} />
                    <a href={displayUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--violet)', display: 'block', marginTop: 4, textAlign: 'center' }}>Open on TV ↗</a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recent orders */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Recent online orders</h2>
            {orders.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '24px 0' }}>No online orders yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {orders.map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{o.order_number} · {o.customer_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{new Date(o.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · A${(o.total ?? 0).toFixed(2)}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: `${STATUS_COLOR[o.status] ?? '#94A3B8'}18`, color: STATUS_COLOR[o.status] ?? '#94A3B8' }}>{o.status}</span>
                    {['pending','confirmed','preparing'].includes(o.status) && (
                      <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)}
                        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <option value="confirmed">Confirmed</option>
                        <option value="preparing">Preparing</option>
                        <option value="ready">Ready</option>
                        <option value="collected">Collected</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

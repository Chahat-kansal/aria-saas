'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: '#F0F4F0', muted: '#A8B5A8', green: '#7FB897', darkGreen: '#2D5240', red: '#ef4444', amber: '#f59e0b', border: 'rgba(127,184,151,0.15)' }
const PLATFORMS = [
  { key: 'uber_eats', label: 'Uber Eats', color: '#06C167', emoji: '🟢', csvPath: 'Reports → Payment Details Report → Download CSV' },
  { key: 'doordash', label: 'DoorDash', color: '#FF3008', emoji: '🔴', csvPath: 'Merchant Portal → Financials → Orders Breakdown → Export' },
  { key: 'menulog', label: 'Menulog', color: '#FF8000', emoji: '🟠', csvPath: 'Restaurant Hub → Payments → Download CSV' },
  { key: 'deliveroo', label: 'Deliveroo', color: '#00CCBC', emoji: '🩵', csvPath: 'Restaurant Hub → Finance → Export' },
  { key: 'custom', label: 'Other Platform', color: '#7FB897', emoji: '📦', csvPath: 'Export from your platform dashboard' },
]
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', accepted: '#60a5fa', preparing: '#a78bfa', ready: '#7FB897', picked_up: '#A8B5A8', delivered: '#A8B5A8', cancelled: '#ef4444', rejected: '#ef4444' }

interface Connection { id: string; platform: string; status: string; store_name: string | null; commission_rate: number; auto_accept: boolean }
interface Order { id: string; platform: string; platform_order_number: string; status: string; customer_name: string; items: Array<{ name: string; quantity: number; price: number }>; total: number; commission: number; net_payout: number; notes: string | null; created_at: string }
interface Analytics { summary: { total_orders: number; total_revenue: string; total_commission: string; total_net: string; avg_commission_rate: string }; by_platform: Record<string, { orders: number; revenue: number; commission: number; net: number }>; aria_insight: string | null }
interface ImportResult { imported: number; skipped: number; platform: string; errors: string[] }

function elapsed(s: string) {
  const sec = Math.floor((Date.now() - new Date(s).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}
function pInfo(key: string) { return PLATFORMS.find(p => p.key === key) ?? PLATFORMS[PLATFORMS.length - 1] }

function OrderCard({ order, selected, onClick, elapsedStr }: { order: Order; selected: boolean; onClick: () => void; elapsedStr: string }) {
  const pi = pInfo(order.platform)
  return (
    <div onClick={onClick} style={{ padding: '12px 14px', borderRadius: 12, marginBottom: 8, cursor: 'pointer', background: selected ? 'rgba(127,184,151,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${selected ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: 11, color: STATUS_COLOR[order.status] ?? '#ccc', fontWeight: 700, marginRight: 8 }}>{order.status.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: C.muted }}>{pi.emoji} #{order.platform_order_number}</span>
        </div>
        <span style={{ fontSize: 11, color: C.muted }}>{elapsedStr}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 13 }}>{order.customer_name}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>${(Number(order.total) || 0).toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function DeliveryPage() {
  const [tab, setTab] = useState<'orders' | 'import' | 'analytics'>('import')
  const [connections, setConns] = useState<Connection[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [selected, setSelected] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [importPlatform, setImportPlatform] = useState('uber_eats')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [connectForm, setConnectForm] = useState({ platform: 'uber_eats', store_name: '', commission_rate: 30 })
  const [showConnect, setShowConnect] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [tick, setTick] = useState(0)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [cRes, oRes] = await Promise.all([fetch('/api/delivery/connections'), fetch('/api/delivery/orders?days=7')])
    const [cData, oData] = await Promise.all([cRes.json().catch(() => ({})), oRes.json().catch(() => ({}))])
    setConns(cData.connections ?? [])
    setOrders(oData.orders ?? [])
    setLoading(false)
  }, [])

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    const r = await fetch('/api/delivery/analytics?days=30')
    if (r.ok) setAnalytics(await r.json())
    setAnalyticsLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { if (tab === 'analytics' && !analytics) loadAnalytics() }, [tab, analytics, loadAnalytics])
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetch('/api/delivery/orders?days=2').then(r => r.json()).then(d => setOrders(d.orders ?? []))
    }, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 1000); return () => clearInterval(t) }, [])
  void tick

  async function updateOrder(id: string, status: string, extra?: Record<string, unknown>) {
    const r = await fetch('/api/delivery/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, ...extra }) })
    const d = await r.json()
    if (d.order) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, ...d.order } : o))
      if (selected?.id === id) setSelected(s => s ? { ...s, ...d.order } : s)
    }
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setImporting(true); setImportResult(null)
    const form = new FormData()
    form.append('file', file)
    form.append('platform', importPlatform)
    const r = await fetch('/api/delivery/import-csv', { method: 'POST', body: form })
    const d = await r.json()
    setImportResult(d)
    setImporting(false)
    if (d.imported > 0) { loadAll(); setAnalytics(null) }
  }

  async function connect() {
    if (!connectForm.store_name) return
    setSaving(true)
    const r = await fetch('/api/delivery/connections', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...connectForm, store_id: connectForm.store_name.toLowerCase().replace(/\s+/g, '_'), status: 'connected' }),
    })
    const d = await r.json()
    if (d.connection) { setConns(prev => [...prev.filter(c => c.platform !== d.connection.platform), d.connection]); setShowConnect(false) }
    setSaving(false)
  }

  async function toggleAutoAccept(conn: Connection) {
    const r = await fetch('/api/delivery/connections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: conn.id, auto_accept: !conn.auto_accept }) })
    const d = await r.json()
    if (d.connection) setConns(prev => prev.map(c => c.id === conn.id ? { ...c, ...d.connection } : c))
  }

  const pending = orders.filter(o => o.status === 'pending')
  const active = orders.filter(o => ['accepted', 'preparing', 'ready'].includes(o.status))
  const done = orders.filter(o => ['picked_up', 'delivered', 'cancelled', 'rejected'].includes(o.status))
  const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, width: '100%' }
  const connectedPlatforms = connections.filter(c => c.status === 'connected')

  if (loading) return <div style={{ padding: 32, color: C.muted }}>Loading…</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', display: 'flex' }}>
      <div style={{ flex: 1, maxWidth: 580, padding: 24, overflowY: 'auto', borderRight: `1px solid ${C.border}` }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Delivery Platforms</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['import', 'orders', 'analytics'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t ? C.darkGreen : 'transparent', color: tab === t ? C.green : C.muted }}>
                {t === 'orders' ? `Orders${pending.length > 0 ? ` (${pending.length})` : ''}` : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Platform chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {PLATFORMS.slice(0, 4).map(p => {
            const conn = connections.find(c => c.platform === p.key)
            return (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: conn?.status === 'connected' ? 'rgba(127,184,151,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${conn?.status === 'connected' ? 'rgba(127,184,151,0.3)' : C.border}`, fontSize: 12 }}>
                <span>{p.emoji}</span>
                <span style={{ color: conn?.status === 'connected' ? C.green : C.muted }}>{p.label}</span>
                {conn?.status === 'connected'
                  ? <span style={{ color: C.green, fontSize: 10 }}>●</span>
                  : <button onClick={() => { setConnectForm(f => ({ ...f, platform: p.key })); setShowConnect(true) }} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 10, padding: 0 }}>+ Add</button>}
              </div>
            )
          })}
        </div>

        {/* IMPORT TAB */}
        {tab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: C.card, borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Import delivery sales into Aria</h3>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Upload your weekly CSV from any platform. Aria will see your delivery revenue and factor it into briefings, signals, and recommendations.</p>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 6 }}>Platform</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PLATFORMS.map(p => (
                    <button key={p.key} onClick={() => setImportPlatform(p.key)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${importPlatform === p.key ? C.green : C.border}`, background: importPlatform === p.key ? 'rgba(127,184,151,0.1)' : 'transparent', color: importPlatform === p.key ? C.green : C.muted, fontSize: 12, cursor: 'pointer', fontWeight: importPlatform === p.key ? 600 : 400 }}>
                      {p.emoji} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: 'rgba(127,184,151,0.06)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: C.muted }}>
                <strong style={{ color: C.green }}>How to get your {pInfo(importPlatform).label} CSV:</strong><br />
                {pInfo(importPlatform).csvPath}
              </div>

              <div style={{ marginBottom: 12 }}>
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} id="csvUpload" />
                <label htmlFor="csvUpload" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: C.text }}>
                  📂 Choose CSV file
                </label>
              </div>

              <button onClick={handleImport} disabled={importing} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: importing ? 0.7 : 1 }}>
                {importing ? 'Importing…' : '⬆ Import to Aria'}
              </button>

              {importResult && (
                <div style={{ marginTop: 16, padding: 14, background: importResult.imported > 0 ? 'rgba(127,184,151,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: 10, border: `1px solid ${importResult.imported > 0 ? 'rgba(127,184,151,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  {importResult.imported > 0 ? (
                    <>
                      <p style={{ color: C.green, fontWeight: 600, fontSize: 14 }}>✓ {importResult.imported} orders imported from {pInfo(importResult.platform).label}</p>
                      <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Aria now has visibility into your delivery revenue. Check Analytics tab for commission insights.</p>
                    </>
                  ) : (
                    <p style={{ color: C.red, fontSize: 13 }}>No orders imported. {importResult.errors[0] ?? 'Check that you selected the correct CSV format.'}</p>
                  )}
                  {importResult.skipped > 0 && <p style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{importResult.skipped} rows skipped (already imported or missing order ID)</p>}
                </div>
              )}
            </div>

            {connectedPlatforms.length > 0 && (
              <div style={{ background: C.card, borderRadius: 14, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Commission rates</h3>
                {connectedPlatforms.map(conn => (
                  <div key={conn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 13 }}>{pInfo(conn.platform).emoji} {pInfo(conn.platform).label}{conn.store_name ? ` — ${conn.store_name}` : ''}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, color: C.amber, fontWeight: 600 }}>{conn.commission_rate}%</span>
                      <label style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={conn.auto_accept} onChange={() => toggleAutoAccept(conn)} />
                        Auto-accept
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ORDERS TAB */}
        {tab === 'orders' && (
          <>
            {pending.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>⚡ New ({pending.length})</p>
                {pending.map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              </div>
            )}
            {active.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>In progress</p>
                {active.map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Recent (7 days)</p>
              {done.slice(0, 20).map(o => <OrderCard key={o.id} order={o} selected={selected?.id === o.id} onClick={() => setSelected(o)} elapsedStr={elapsed(o.created_at)} />)}
              {done.length === 0 && pending.length === 0 && active.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                  <p style={{ marginBottom: 8 }}>No orders yet.</p>
                  <button onClick={() => setTab('import')} style={{ color: C.green, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}>Import from CSV →</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {analyticsLoading && <p style={{ color: C.muted }}>Loading analytics…</p>}
            {analytics && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Total orders', value: String(analytics.summary.total_orders) },
                    { label: 'Gross revenue', value: `$${parseFloat(analytics.summary.total_revenue).toFixed(2)}` },
                    { label: 'Commission paid', value: `$${parseFloat(analytics.summary.total_commission).toFixed(2)}`, warn: true },
                    { label: 'Net payout', value: `$${parseFloat(analytics.summary.total_net).toFixed(2)}` },
                  ].map(({ label, value, warn }) => (
                    <div key={label} style={{ background: C.card, borderRadius: 12, padding: '14px 16px' }}>
                      <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: warn ? C.amber : C.green }}>{value}</p>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.muted }}>Avg commission rate: <strong style={{ color: C.amber }}>{analytics.summary.avg_commission_rate}%</strong> · last 30 days</p>

                {Object.entries(analytics.by_platform).map(([platform, data]) => (
                  <div key={platform} style={{ background: C.card, borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontWeight: 600 }}>{pInfo(platform).emoji} {pInfo(platform).label}</span>
                      <span style={{ fontSize: 12, color: C.muted }}>{data.orders} orders</span>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                      <span>Revenue <strong>${data.revenue.toFixed(2)}</strong></span>
                      <span style={{ color: C.amber }}>Commission <strong>${data.commission.toFixed(2)}</strong></span>
                      <span style={{ color: C.green }}>Net <strong>${data.net.toFixed(2)}</strong></span>
                    </div>
                    <div style={{ marginTop: 10, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                      <div style={{ height: 6, background: C.amber, borderRadius: 3, width: `${data.revenue > 0 ? Math.min(data.commission / data.revenue * 100, 100) : 0}%` }} />
                    </div>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{data.revenue > 0 ? (data.commission / data.revenue * 100).toFixed(1) : 0}% commission rate</p>
                  </div>
                ))}

                {analytics.aria_insight && (
                  <div style={{ background: 'rgba(127,184,151,0.08)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px', fontSize: 14 }}>
                    <p style={{ color: C.green, fontWeight: 600, marginBottom: 6 }}>✦ Aria insight</p>
                    <p style={{ color: C.text, lineHeight: 1.6 }}>{analytics.aria_insight}</p>
                  </div>
                )}
                <button onClick={loadAnalytics} style={{ alignSelf: 'flex-start', fontSize: 12, color: C.green, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 16px', cursor: 'pointer' }}>Refresh</button>
              </>
            )}
            {!analytics && !analyticsLoading && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>
                <p style={{ marginBottom: 8 }}>No delivery data yet.</p>
                <button onClick={() => setTab('import')} style={{ color: C.green, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13 }}>Import a CSV first →</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel — order detail */}
      {selected && (
        <div style={{ width: 360, padding: 24, overflowY: 'auto', background: C.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, color: C.muted }}>{pInfo(selected.platform).emoji} {pInfo(selected.platform).label}</p>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>#{selected.platform_order_number}</h2>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
          </div>
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: (STATUS_COLOR[selected.status] ?? C.muted) + '22', color: STATUS_COLOR[selected.status] ?? C.muted, fontWeight: 700 }}>{selected.status.toUpperCase()}</span>
          <p style={{ marginTop: 12, fontWeight: 600 }}>{selected.customer_name}</p>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{elapsed(selected.created_at)} ago</p>

          {(selected.items ?? []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8 }}>ITEMS</p>
              {(selected.items ?? []).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                  <span>{item.quantity}× {item.name}</span>
                  <span>${((item.price || 0) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.muted, marginBottom: 4 }}>
              <span>Gross revenue</span><span>${(Number(selected.total) || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.amber, marginBottom: 4 }}>
              <span>Platform commission</span><span>-${(Number(selected.commission) || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 16 }}>
              <span>Net payout</span><span style={{ color: C.green }}>${(Number(selected.net_payout) || 0).toFixed(2)}</span>
            </div>
          </div>

          {selected.notes && <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13, color: C.muted }}>{selected.notes}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selected.status === 'pending' && (
              <>
                <button onClick={() => updateOrder(selected.id, 'accepted')} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>✓ Accept order</button>
                <button onClick={() => updateOrder(selected.id, 'rejected', { rejection_reason: 'Unable to fulfil' })} style={{ background: 'rgba(239,68,68,0.1)', color: C.red, border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 0', cursor: 'pointer' }}>✕ Reject</button>
              </>
            )}
            {selected.status === 'accepted' && <button onClick={() => updateOrder(selected.id, 'preparing')} style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Start preparing</button>}
            {selected.status === 'preparing' && <button onClick={() => updateOrder(selected.id, 'ready')} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Mark ready</button>}
            {selected.status === 'ready' && <button onClick={() => updateOrder(selected.id, 'picked_up')} style={{ background: 'rgba(127,184,151,0.1)', color: C.green, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer' }}>Picked up ✓</button>}
          </div>
        </div>
      )}

      {/* Connect platform modal */}
      {showConnect && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1a2420', borderRadius: 18, padding: 28, width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Add platform</h3>
              <button onClick={() => setShowConnect(false)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Platform</label>
              <select value={connectForm.platform} onChange={e => setConnectForm(f => ({ ...f, platform: e.target.value }))} style={INP}>
                {PLATFORMS.map(p => <option key={p.key} value={p.key} style={{ background: '#1a2420', color: C.text }}>{p.emoji} {p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Store name (as it appears on the platform)</label>
              <input value={connectForm.store_name} onChange={e => setConnectForm(f => ({ ...f, store_name: e.target.value }))} placeholder="e.g. Sip Café Brunswick" style={INP} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 4 }}>Your commission rate (%)</label>
              <input type="number" value={connectForm.commission_rate} onChange={e => setConnectForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 30 }))} min="0" max="60" style={INP} />
            </div>
            <button onClick={connect} disabled={saving || !connectForm.store_name} style={{ background: C.darkGreen, color: C.green, border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 700, cursor: 'pointer', opacity: saving || !connectForm.store_name ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Add platform'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

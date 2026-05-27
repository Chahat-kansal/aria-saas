'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Today { revenue: number; transactions: number; avg_ticket: number; payment_breakdown: Record<string, number> }
interface Session { id: string; opened_at: string; opened_by: string | null; opening_float: number | null; status: string | null }
interface Sale { id: string; total_amount: number | null; payment_method: string | null; created_at: string; served_by: string | null; status: string | null }
interface StaffOnline { id: string; name: string; last_seen_at: string }
interface DashData { today: Today; open_session: Session | null; recent_sales: Sale[]; staff_online: StaffOnline[] }

const C = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', amber: '#f59e0b', violet: '#A78BFA', red: '#ef4444', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

const QUICK_LINKS = [
  { label: 'Open till', href: '/pos/terminal', icon: '🧾' },
  { label: 'Sales', href: '/pos/sales', icon: '📊' },
  { label: 'Stocktake', href: '/pos/stocktake', icon: '📋' },
  { label: 'Suppliers', href: '/dashboard/suppliers', icon: '🚚' },
  { label: 'Price tickets', href: '/dashboard/price-tickets', icon: '🏷️' },
  { label: 'Shift reports', href: '/dashboard/shift-reports', icon: '⏱' },
]

const POS_ROUTES = [
  { name: 'Sales', path: '/api/pos/sales' },
  { name: 'Products', path: '/api/pos/products' },
  { name: 'Sessions', path: '/api/pos/sessions' },
  { name: 'Inventory', path: '/api/pos/inventory' },
]

const HARDWARE = [
  { name: 'Receipt printer', connected: typeof window !== 'undefined' && 'serial' in (navigator as { serial?: unknown }) },
  { name: 'Cash drawer', connected: false },
  { name: 'Barcode scanner', connected: typeof window !== 'undefined' && 'mediaDevices' in (navigator as { mediaDevices?: unknown }) },
]

export default function PosDashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<Record<string, 'ok' | 'fail' | 'pending'>>({})

  useEffect(() => {
    async function load() {
      const r = await fetch('/api/pos/dashboard').then(r => r.json()).catch(() => null)
      setData(r); setLoading(false)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    POS_ROUTES.forEach(rt => {
      setHealth(h => ({ ...h, [rt.name]: 'pending' }))
      fetch(rt.path, { method: 'HEAD' }).then(res => {
        setHealth(h => ({ ...h, [rt.name]: res.ok || res.status === 401 ? 'ok' : 'fail' }))
      }).catch(() => setHealth(h => ({ ...h, [rt.name]: 'fail' })))
    })
  }, [])

  if (loading) return <div style={{ padding: 40, color: C.dim, fontFamily: 'Manrope, sans-serif' }}>Loading…</div>

  return (
    <div style={{ padding: 24, maxWidth: 1100, color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>POS Dashboard</h1>
        <p style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>Live overview of your point-of-sale operation</p>
      </div>

      {/* Today's stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Revenue today', value: 'A$' + (data?.today.revenue ?? 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), color: C.green },
          { label: 'Transactions', value: data?.today.transactions ?? 0, color: C.violet },
          { label: 'Avg ticket', value: 'A$' + (data?.today.avg_ticket ?? 0).toFixed(2), color: C.amber },
        ].map(s => (
          <div key={s.label} style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
            <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Session status */}
      <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: data?.open_session ? 'rgba(127,184,151,0.06)' : C.surface, border: '1px solid ' + (data?.open_session ? 'rgba(127,184,151,0.25)' : C.border) }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: data?.open_session ? C.green : C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          {data?.open_session ? '● Active register session' : 'No active session'}
        </p>
        {data?.open_session ? (
          <>
            <p style={{ fontSize: 13 }}>Opened by <strong>{data.open_session.opened_by ?? 'Unknown'}</strong> at {new Date(data.open_session.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</p>
            <p style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Opening float: A${Number(data.open_session.opening_float ?? 0).toFixed(2)}</p>
          </>
        ) : (
          <p style={{ fontSize: 12, color: C.dim }}>Open a register at the terminal to start trading.</p>
        )}
      </div>

      {/* Staff online */}
      {data?.staff_online && data.staff_online.length > 0 && (
        <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Staff online ({data.staff_online.length})</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.staff_online.map(s => (
              <span key={s.id} style={{ padding: '4px 10px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: C.green, fontSize: 11, fontWeight: 600 }}>● {s.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div style={{ marginBottom: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Quick links</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {QUICK_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={{ padding: 14, borderRadius: 10, background: C.surface, border: '1px solid ' + C.border, color: C.text, fontSize: 12, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent sales */}
      <div style={{ marginBottom: 18, padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Recent sales</p>
        {(!data?.recent_sales || data.recent_sales.length === 0) ? <p style={{ fontSize: 12, color: C.dim }}>No sales yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.recent_sales.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 12, color: C.dim }}>{new Date(s.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', color: C.dim, textTransform: 'capitalize' }}>{s.payment_method ?? 'cash'}</span>
                <span style={{ fontSize: 11, color: C.dim }}>{s.served_by ?? '—'}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.status === 'voided' ? C.red : C.green }}>A${Number(s.total_amount ?? 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* POS Health + Hardware */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>POS health</p>
          {POS_ROUTES.map(r => {
            const s = health[r.name] ?? 'pending'
            const color = s === 'ok' ? C.green : s === 'fail' ? C.red : C.dim
            return (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ flex: 1 }}>{r.name}</span>
                <span style={{ color, fontFamily: 'monospace', fontSize: 10 }}>{s.toUpperCase()}</span>
              </div>
            )
          })}
        </div>
        <div style={{ padding: 16, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Hardware</p>
          {HARDWARE.map(h => (
            <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: h.connected ? C.green : C.muted }} />
              <span style={{ flex: 1 }}>{h.name}</span>
              <span style={{ color: h.connected ? C.green : C.dim, fontSize: 10 }}>{h.connected ? 'AVAILABLE' : 'NOT DETECTED'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

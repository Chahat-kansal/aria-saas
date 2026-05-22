'use client'
import { useState, useEffect, useCallback } from 'react'

interface ShiftReport {
  id: string; session_id: string | null; cashier_name: string | null
  shift_start: string; shift_end: string
  total_transactions: number; total_revenue: number; avg_basket: number
  total_refunds: number; total_refund_value: number; total_voids: number
  opening_float: number; closing_float: number | null; variance_cents: number
  top_products: Array<{ name: string; qty: number; revenue: number }>
  payment_breakdown: Record<string, number>
  staff_on_shift: Array<{ name: string; hours: number | null }>
  aria_summary: string | null; created_at: string
}

function fmt(n: number) { return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function dur(start: string, end: string) { const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000); return mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm' }
function dt(iso: string) { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export default function ShiftReportsPage() {
  const [reports, setReports] = useState<ShiftReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ShiftReport | null>(null)
  const load = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/pos/shift-reports?limit=30'); const d = await r.json() as { reports?: ShiftReport[] }; setReports(d.reports ?? []) } finally { setLoading(false) } }, [])
  useEffect(() => { load() }, [load])
  const S = { surface: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }
  return (
    <div style={{ padding: 24, maxWidth: 1100, color: '#e8ede7' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Shift Reports</h1>
        <p style={{ fontSize: 13, color: S.dim, marginTop: 4 }}>Auto-generated when each register session closes</p>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>Loading…</div> : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: S.dim }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>No shift reports yet.</p>
          <p style={{ fontSize: 13 }}>Reports generate automatically when a register session is closed.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 400px' : '1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => setSelected(selected?.id === r.id ? null : r)}
                style={{ background: selected?.id === r.id ? 'rgba(127,184,151,0.08)' : S.surface, border: '1px solid ' + (selected?.id === r.id ? 'rgba(127,184,151,0.3)' : S.border), borderRadius: 12, padding: '14px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{dt(r.shift_start)}</p>
                    <p style={{ fontSize: 12, color: S.dim, margin: '2px 0 0' }}>{dur(r.shift_start, r.shift_end)} · {r.cashier_name || 'Unknown'}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, color: S.green, margin: 0 }}>{fmt(r.total_revenue)}</p>
                    <p style={{ fontSize: 11, color: S.muted, margin: '2px 0 0' }}>{r.total_transactions} sales</p>
                  </div>
                </div>
                {r.aria_summary && <p style={{ fontSize: 12, color: S.dim, margin: '10px 0 0', fontStyle: 'italic', lineHeight: 1.5 }}>"{r.aria_summary}"</p>}
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                  {[['Avg basket', fmt(r.avg_basket)], ['Voids', String(r.total_voids)], ['Refunds', String(r.total_refunds)], ['Variance', (r.variance_cents >= 0 ? '+' : '') + fmt(r.variance_cents / 100)]].map(([label, val]) => (
                    <div key={label}>
                      <p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 0', color: label === 'Variance' && r.variance_cents !== 0 ? (r.variance_cents > 0 ? S.green : '#ef4444') : '#e8ede7' }}>{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {selected && (
            <div style={{ background: S.surface, border: '1px solid ' + S.border, borderRadius: 16, padding: 20, height: 'fit-content', position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Detail</h2>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              {selected.top_products.length > 0 && (<div style={{ marginBottom: 16 }}><p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Top Products</p>{selected.top_products.map((p, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{p.name}</span><span style={{ color: S.dim }}>x{p.qty} · {fmt(p.revenue)}</span></div>))}</div>)}
              {Object.keys(selected.payment_breakdown).length > 0 && (<div style={{ marginBottom: 16 }}><p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Payments</p>{Object.entries(selected.payment_breakdown).map(([m, a]) => (<div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ textTransform: 'capitalize' }}>{m}</span><span style={{ color: S.green }}>{fmt(a)}</span></div>))}</div>)}
              {selected.staff_on_shift.length > 0 && (<div><p style={{ fontSize: 10, color: S.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Staff</p>{selected.staff_on_shift.map((s, i) => (<div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span>{s.name}</span><span style={{ color: S.dim }}>{s.hours ? s.hours + 'h' : '—'}</span></div>))}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

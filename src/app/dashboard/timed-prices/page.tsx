'use client'
import { useState, useEffect, useCallback } from 'react'

interface Product { id: string; name: string; price: number | null }
interface Schedule { id: string; product_id: string; product_name: string; original_price: number | null; timed_price: number | null; days_of_week: number[] | null; start_time: string | null; end_time: string | null; label: string | null; is_active: boolean }

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const C = { surface: 'rgba(255,255,255,0.03)', surface2: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.07)', green: '#7FB897', amber: '#f59e0b', violet: '#A78BFA', red: '#ef4444', text: '#E8EDE7', dim: 'rgba(255,255,255,0.4)', muted: 'rgba(255,255,255,0.2)' }

function isActiveNow(s: Schedule) {
  if (!s.is_active || !s.days_of_week || !s.start_time || !s.end_time) return false
  const now = new Date()
  const dow = now.getDay()
  if (!s.days_of_week.includes(dow)) return false
  const hhmm = now.toTimeString().slice(0, 5)
  return hhmm >= s.start_time.slice(0, 5) && hhmm <= s.end_time.slice(0, 5)
}

export default function TimedPricesPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<{ product_id: string; timed_price: string; days_of_week: number[]; start_time: string; end_time: string; label: string }>({ product_id: '', timed_price: '', days_of_week: [], start_time: '17:00', end_time: '18:00', label: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s] = await Promise.all([
        fetch('/api/pos/products').then(r => r.json()),
        fetch('/api/pos/timed-prices').then(r => r.json()),
      ])
      setProducts((p.products ?? []).filter((x: { is_active?: boolean }) => x.is_active !== false))
      setSchedules(s.schedules ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  function toggleDay(d: number) {
    setForm(f => ({ ...f, days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter(x => x !== d) : [...f.days_of_week, d].sort() }))
  }

  async function add() {
    if (!form.product_id || !form.timed_price || form.days_of_week.length === 0) { setMsg('Pick product, price, and at least one day'); return }
    setSaving(true); setMsg('')
    const res = await fetch('/api/pos/timed-prices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: form.product_id, timed_price: Number(form.timed_price), days_of_week: form.days_of_week, start_time: form.start_time, end_time: form.end_time, label: form.label || null }),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    setSaving(false)
    if (res.error) { setMsg('Error: ' + res.error); return }
    setMsg('✓ Schedule added')
    setForm({ product_id: '', timed_price: '', days_of_week: [], start_time: '17:00', end_time: '18:00', label: '' })
    load()
  }

  async function toggle(id: string, next: boolean) {
    await fetch(`/api/pos/timed-prices?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: next }) })
    setSchedules(ss => ss.map(s => s.id === id ? { ...s, is_active: next } : s))
  }
  async function remove(id: string) {
    if (!confirm('Delete this schedule?')) return
    await fetch(`/api/pos/timed-prices?id=${id}`, { method: 'DELETE' })
    setSchedules(ss => ss.filter(s => s.id !== id))
  }

  const inp = { padding: '8px 12px', borderRadius: 8, background: C.surface2, border: '1px solid ' + C.border, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' } as const

  return (
    <div style={{ padding: 24, maxWidth: 1000, color: C.text, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Timed Prices</h1>
        <p style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>Happy hour, lunch specials, weekend pricing — recurring price windows applied automatically</p>
      </div>

      {/* Add form */}
      <div style={{ marginBottom: 24, padding: 18, borderRadius: 12, background: C.surface, border: '1px solid ' + C.border }}>
        <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: C.green }}>+ New schedule</p>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
          <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} style={inp}>
            <option value="" style={{ background: '#1A2620' }}>Select product…</option>
            {products.map(p => <option key={p.id} value={p.id} style={{ background: '#1A2620' }}>{p.name} (A${Number(p.price ?? 0).toFixed(2)})</option>)}
          </select>
          <input type="number" step="0.01" value={form.timed_price} onChange={e => setForm(f => ({ ...f, timed_price: e.target.value }))} placeholder="Timed price A$" style={inp} />
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. Happy Hour)" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {DAY_NAMES.map((n, i) => {
            const on = form.days_of_week.includes(i)
            return (
              <button key={n} onClick={() => toggleDay(i)} type="button"
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid ' + (on ? C.green : C.border), background: on ? 'rgba(127,184,151,0.15)' : 'transparent', color: on ? C.green : C.dim, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{n}</button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inp} />
          <span style={{ color: C.dim }}>→</span>
          <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inp} />
        </div>
        <button onClick={add} disabled={saving} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: C.green, color: '#0E1812', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Add schedule'}
        </button>
        {msg && <p style={{ marginTop: 8, fontSize: 12, color: msg.startsWith('✓') ? C.green : C.red }}>{msg}</p>}
      </div>

      {/* Active schedules */}
      {loading ? <p style={{ color: C.dim, textAlign: 'center', padding: 24 }}>Loading…</p>
        : schedules.length === 0 ? <p style={{ color: C.dim, textAlign: 'center', padding: 24 }}>No schedules yet — create one above.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {schedules.map(s => {
              const live = isActiveNow(s)
              return (
                <div key={s.id} style={{ padding: 14, borderRadius: 12, background: C.surface, border: '1px solid ' + (live ? 'rgba(127,184,151,0.4)' : C.border), display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, opacity: s.is_active ? 1 : 0.5 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 14, fontWeight: 700 }}>{s.product_name}</p>
                      {s.label && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(167,139,250,0.15)', color: C.violet, fontWeight: 700 }}>{s.label}</span>}
                      {live && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.2)', color: C.green, fontWeight: 700 }}>● Active now</span>}
                    </div>
                    <p style={{ fontSize: 12, color: C.dim }}>
                      A${Number(s.original_price ?? 0).toFixed(2)} → <strong style={{ color: C.amber }}>A${Number(s.timed_price ?? 0).toFixed(2)}</strong>
                      {' · '}
                      {(s.days_of_week ?? []).map(d => DAY_NAMES[d]).join(' ') || '—'}
                      {' · '}
                      {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggle(s.id, !s.is_active)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: s.is_active ? C.dim : C.green, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{s.is_active ? 'Pause' : 'Resume'}</button>
                    <button onClick={() => remove(s.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

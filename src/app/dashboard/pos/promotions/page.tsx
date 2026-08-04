'use client'
import { useState, useEffect } from 'react'

interface Promo {
  id: string; name: string; promotion_type: string; applies_to: string | null
  category_id: string | null; product_id: string | null; product_ids: string[] | null
  discount_percent: number | null; discount_amount: number | null; bundle_price: number | null
  active_days: number[] | null; active_hour_start: number | null; active_hour_end: number | null
  // S-PROMO-RULE-1 — null trigger_type = "Always", which is every existing promotion.
  trigger_type?: string | null; trigger_config?: { celsius?: number } | null
  requires_code: string | null; stacks_with_others: boolean; active: boolean
  starts_at: string | null; ends_at: string | null; min_spend: number | null
  buy_quantity: number | null; get_quantity: number | null; notes: string | null
  created_at: string
}

const TYPES = [
  { key: 'percent_off',  label: '% Off',        desc: 'Percentage discount on order or items' },
  { key: 'amount_off',   label: '$ Off',         desc: 'Fixed amount off the order' },
  { key: 'bogo',         label: 'BOGO',          desc: 'Buy N get N free' },
  { key: 'bogo_half',    label: 'BOGO Half',     desc: 'Buy N get N at half price' },
  { key: 'combo',        label: 'Combo',         desc: 'Fixed price for a combination of items' },
  { key: 'happy_hour',   label: 'Happy Hour',    desc: '% off during set hours' },
  { key: 'free_item',    label: 'Free Item',     desc: 'Get a specific item free' },
]
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const SCOPE_OPTS = ['order','category','item']

const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }

function TypeBadge({ t }: { t: string }) {
  const colors: Record<string,string> = { percent_off:'#8B5CF6', amount_off:'#6B96B0', bogo:'#7FB897', bogo_half:'#34D399', combo:'#F59E0B', happy_hour:'#F97316', free_item:'#EF4444' }
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 700, background: `${colors[t] ?? '#94A3B8'}18`, color: colors[t] ?? '#94A3B8', border: `1px solid ${colors[t] ?? '#94A3B8'}30` }}>{TYPES.find(x => x.key === t)?.label ?? t}</span>
}

const BLANK: Partial<Promo> = { promotion_type: 'percent_off', applies_to: 'order', active_days: [1,2,3,4,5], active_hour_start: 0, active_hour_end: 23 }

export default function PromotionsPage() {
  const [promos,   setPromos]   = useState<Promo[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState<Partial<Promo>>(BLANK)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/pos/promotions').then(r => r.json()).catch(() => ({ promotions: [] }))
    setPromos(res.promotions ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/pos/promotions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !active }) })
    setPromos(ps => ps.map(p => p.id === id ? { ...p, active: !active } : p))
  }

  async function del(id: string) {
    if (!confirm('Delete this promotion?')) return
    await fetch(`/api/pos/promotions/${id}`, { method: 'DELETE' })
    setPromos(ps => ps.filter(p => p.id !== id))
  }

  async function save() {
    if (!form.name?.trim() || !form.promotion_type) return
    setSaving(true); setError('')
    const payload = { ...form, active: true, active_days: form.active_days ?? [1,2,3,4,5,6,7] }
    const res = await fetch('/api/pos/promotions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) { setError(res.error); setSaving(false); return }
    setShowForm(false); setForm(BLANK); load()
    setSaving(false)
  }

  function setupHappyHour() {
    setForm({ promotion_type: 'happy_hour', name: 'Happy Hour', applies_to: 'category', active_days: [1,2,3,4,5], active_hour_start: 15, active_hour_end: 17, discount_percent: 20 })
    setShowForm(true)
  }

  function toggleDay(d: number) {
    const days = form.active_days ?? []
    setForm(f => ({ ...f, active_days: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() }))
  }

  const t = form.promotion_type ?? 'percent_off'

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Promotions & Discounts</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Automatic discounts, happy hour, combos and coupon codes.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={setupHappyHour} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            ☀️ Happy Hour preset
          </button>
          <button onClick={() => { setShowForm(v => !v); setForm(BLANK) }} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + New Promotion
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px' }}>New Promotion</h2>
          {/* Type selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
            {TYPES.map(type => (
              <button key={type.key} onClick={() => setForm(f => ({ ...f, promotion_type: type.key }))}
                style={{ padding: '8px 10px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', border: `2px solid ${form.promotion_type === type.key ? 'var(--violet)' : 'var(--divider)'}`, background: form.promotion_type === type.key ? 'rgba(139,92,246,0.08)' : 'var(--bg-elevated)', textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: form.promotion_type === type.key ? 'var(--violet)' : 'var(--text-primary)', marginBottom: 2 }}>{type.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>{type.desc}</div>
              </button>
            ))}
          </div>

          {/* Name + scope */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Promotion name *</label>
              <input style={inp} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Happy Hour, Combo deal" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Applies to</label>
              <select style={{ ...inp, background: 'var(--bg-base)', cursor: 'pointer' }} value={form.applies_to ?? 'order'} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))}>
                {SCOPE_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Type-specific fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {(t === 'percent_off' || t === 'happy_hour') && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Discount %</label>
                <input style={inp} type="number" min={1} max={100} value={form.discount_percent ?? ''} onChange={e => setForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) || null }))} placeholder="e.g. 20" />
              </div>
            )}
            {t === 'amount_off' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Amount off (A$)</label>
                <input style={inp} type="number" step="0.01" min={0.01} value={form.discount_amount ?? ''} onChange={e => setForm(f => ({ ...f, discount_amount: parseFloat(e.target.value) || null }))} placeholder="e.g. 5.00" />
              </div>
            )}
            {t === 'combo' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Combo price (A$)</label>
                <input style={inp} type="number" step="0.01" min={0.01} value={form.bundle_price ?? ''} onChange={e => setForm(f => ({ ...f, bundle_price: parseFloat(e.target.value) || null }))} placeholder="e.g. 10.00" />
              </div>
            )}
            {(t === 'bogo' || t === 'bogo_half') && (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Buy qty</label>
                  <input style={inp} type="number" min={1} value={form.buy_quantity ?? 1} onChange={e => setForm(f => ({ ...f, buy_quantity: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Get qty</label>
                  <input style={inp} type="number" min={1} value={form.get_quantity ?? 1} onChange={e => setForm(f => ({ ...f, get_quantity: parseInt(e.target.value) || 1 }))} />
                </div>
              </>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min spend (A$, optional)</label>
              <input style={inp} type="number" step="0.01" min={0} value={form.min_spend ?? ''} onChange={e => setForm(f => ({ ...f, min_spend: parseFloat(e.target.value) || null }))} placeholder="No minimum" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Coupon code (optional)</label>
              <input style={inp} value={form.requires_code ?? ''} onChange={e => setForm(f => ({ ...f, requires_code: e.target.value.toUpperCase() || null }))} placeholder="e.g. STUDENT10" />
            </div>
          </div>

          {/* Days + hours */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Active days</label>
            <div style={{ display: 'flex', gap: 5 }}>
              {DAYS.map((d, i) => {
                const iso = i + 1 // Mon=1..Sun=7
                const on = (form.active_days ?? []).includes(iso)
                return (
                  <button key={d} onClick={() => toggleDay(iso)}
                    style={{ padding: '5px 8px', borderRadius: 7, fontSize: 11, fontWeight: on ? 700 : 400, cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: on ? 'var(--violet)' : 'var(--bg-elevated)', color: on ? '#fff' : 'var(--text-tertiary)' }}>
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Active from (hour)</label>
              <input style={inp} type="number" min={0} max={23} value={form.active_hour_start ?? 0} onChange={e => setForm(f => ({ ...f, active_hour_start: parseInt(e.target.value) }))} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Active until (hour)</label>
              <input style={inp} type="number" min={0} max={23} value={form.active_hour_end ?? 23} onChange={e => setForm(f => ({ ...f, active_hour_end: parseInt(e.target.value) }))} />
            </div>
          </div>
          {/* S-PROMO-RULE-1 — "Only when…". Default Always, so nothing about existing promotions
              changes. The plain-words line underneath exists because "weather_max_temp_below / 10"
              is not a sentence an owner should have to decode. */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Only when&hellip;</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                style={{ ...inp, background: 'var(--surface-2)' }}
                value={form.trigger_type ?? ''}
                onChange={e => {
                  const v = e.target.value
                  setForm(f2 => ({
                    ...f2,
                    trigger_type: v || null,
                    trigger_config: v ? { celsius: f2.trigger_config?.celsius ?? 10 } : null,
                  }))
                }}
              >
                <option value="">Always</option>
                <option value="weather_max_temp_below">Cold day</option>
                <option value="weather_max_temp_above">Hot day</option>
              </select>
              {form.trigger_type ? (
                <input
                  style={{ ...inp, width: 90 }} type="number" min={-10} max={50}
                  value={form.trigger_config?.celsius ?? 10}
                  onChange={e => setForm(f2 => ({ ...f2, trigger_config: { celsius: parseInt(e.target.value) } }))}
                />
              ) : null}
              {form.trigger_type ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>&deg;C</span> : null}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              {form.trigger_type === 'weather_max_temp_below'
                ? 'Applies when the day’s maximum is ' + (form.trigger_config?.celsius ?? 10) + '°C or below.'
                : form.trigger_type === 'weather_max_temp_above'
                ? 'Applies when the day’s maximum is ' + (form.trigger_config?.celsius ?? 10) + '°C or above.'
                : 'Applies whenever the schedule above allows.'}
            </p>
          </div>
          {error && <p style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name?.trim()} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Create Promotion'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Promotions list */}
      {loading ? (
        <div style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
      ) : promos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏷️</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>No promotions yet</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Create a promo above or use the Happy Hour preset.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {promos.map(p => {
            const activeDays = (p.active_days ?? []).map(d => DAYS[d - 1]).join(', ')
            const hours = p.active_hour_start !== null && p.active_hour_end !== null
              ? `${p.active_hour_start}:00–${p.active_hour_end}:00`
              : 'All day'
            const valueStr = p.discount_percent ? `${p.discount_percent}% off`
              : p.discount_amount ? `A$${p.discount_amount.toFixed(2)} off`
              : p.bundle_price ? `Combo A$${p.bundle_price.toFixed(2)}`
              : p.buy_quantity ? `Buy ${p.buy_quantity} Get ${p.get_quantity ?? 1}`
              : ''
            return (
              <div key={p.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                    <TypeBadge t={p.promotion_type} />
                    {p.requires_code && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.1)', color: '#F59E0B', fontWeight: 700 }}>CODE: {p.requires_code}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
                    {valueStr && <span>{valueStr}</span>}
                    {activeDays && <span>📅 {activeDays}</span>}
                    <span>🕐 {hours}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Toggle */}
                  <button onClick={() => toggle(p.id, p.active)}
                    style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', background: p.active ? 'var(--violet)' : 'var(--bg-elevated)', boxShadow: 'inset 0 0 0 1px var(--divider)' }}>
                    <span style={{ position: 'absolute', top: 2, left: p.active ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: p.active ? '#fff' : 'var(--text-tertiary)', transition: 'left 0.2s' }} />
                  </button>
                  <button onClick={() => del(p.id)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--destructive)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
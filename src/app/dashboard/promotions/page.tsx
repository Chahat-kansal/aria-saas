'use client'
import { useEffect, useState, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

const C = { bg: 'transparent', card: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.06)', text: '#e8ede7', muted: 'rgba(255,255,255,0.45)', green: '#7FB897', dark: '#2D5240', amber: '#f59e0b', red: '#ef4444' }
const tabBtn = (a: boolean): React.CSSProperties => ({ padding: '6px 16px', borderRadius: 7, border: '1px solid ' + (a ? 'rgba(127,184,151,0.4)' : C.border), background: a ? 'rgba(127,184,151,0.1)' : 'transparent', color: a ? C.green : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const smBtn = (c = C.green): React.CSSProperties => ({ padding: '5px 12px', borderRadius: 6, border: '1px solid ' + c + '44', background: c + '18', color: c, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
const inp: React.CSSProperties = { padding: '6px 10px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 6, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }
const card: React.CSSProperties = { background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }

type PromoType = 'percent_off' | 'amount_off' | 'bogo' | 'bogo_half' | 'combo' | 'free_item' | 'happy_hour'
interface Promo { id: string; name: string; promotion_type: PromoType; applies_to: string | null; discount_percent: number | null; discount_amount: number | null; active: boolean; starts_at: string | null; ends_at: string | null; requires_code: string | null; max_total_uses: number | null; current_uses: number; stacks_with_others: boolean }
interface PriceList { id: string; name: string; description: string | null; item_count: number; customer_group_ids: string[] | null }
interface PLItem { id: string; product_id: string; override_price: number; pos_products: { id: string; name: string; price: number } | null }
interface ScheduledChange { id: string; product_id: string; new_price: number; effective_date: string; applied: boolean; status: string; reason: string | null; pos_products: { name: string; price: number } | null }
interface TimedPrice { id: string; product_id: string | null; category_id: string | null; product_name: string | null; timed_price: number | null; discount_pct: number | null; start_time: string; end_time: string; days_of_week: number[]; label: string | null; is_active: boolean; is_active_now: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPE_LABELS: Record<string, string> = { percent_off: '% off', amount_off: '$ off', bogo: 'BOGO', bogo_half: 'BOGO ½', combo: 'Bundle', free_item: 'Free item', happy_hour: 'Happy hour', percentage_discount: '% off', fixed_discount: '$ off' }

function StatusBadge({ active }: { active: boolean }) {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: active ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)', color: active ? C.green : C.muted, fontWeight: 700 }}>{active ? 'ACTIVE' : 'PAUSED'}</span>
}

function PromotionsTab({ bid }: { bid: string }) {
  const [promos, setPromos] = useState<Promo[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', promotion_type: 'percent_off' as PromoType, applies_to: 'all', discount_percent: '', discount_amount: '', requires_code: '', max_total_uses: '', starts_at: '', ends_at: '', stacks_with_others: false })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch('/api/pos/promotions').then(r => r.json()).then(d => setPromos(d.promotions ?? [])).catch(() => {})
  }, [])
  useEffect(() => { if (bid) load() }, [bid, load])

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await fetch('/api/pos/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, discount_percent: form.discount_percent ? Number(form.discount_percent) : null, discount_amount: form.discount_amount ? Number(form.discount_amount) : null, max_total_uses: form.max_total_uses ? Number(form.max_total_uses) : null, requires_code: form.requires_code.trim() || null, starts_at: form.starts_at || null, ends_at: form.ends_at || null, active: true }) })
    setSaving(false); setShowForm(false); setForm({ name: '', promotion_type: 'percent_off', applies_to: 'all', discount_percent: '', discount_amount: '', requires_code: '', max_total_uses: '', starts_at: '', ends_at: '', stacks_with_others: false }); load()
  }
  const toggle = async (p: Promo) => { await fetch('/api/pos/promotions?id=' + p.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) }); load() }
  const del = async (id: string) => { if (!confirm('Delete this promotion?')) return; await fetch('/api/pos/promotions?id=' + id, { method: 'DELETE' }); load() }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: C.muted }}>{promos.length} promotion{promos.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setShowForm(!showForm)} style={smBtn(C.green)}>+ New promo</button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 12 }}>New promotion</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Name</label><input style={{ ...inp, width: '100%' }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Happy Hour 20% off" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Type</label>
              <select style={{ ...inp, width: '100%', background: '#1a2420' }} value={form.promotion_type} onChange={e => setForm({ ...form, promotion_type: e.target.value as PromoType })}>
                {Object.entries(TYPE_LABELS).slice(0, 7).map(([k, v]) => <option key={k} value={k} style={{ background: '#1a2420' }}>{v}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Applies to</label>
              <select style={{ ...inp, width: '100%', background: '#1a2420' }} value={form.applies_to} onChange={e => setForm({ ...form, applies_to: e.target.value })}>
                {['all', 'category', 'product', 'customer_group'].map(v => <option key={v} value={v} style={{ background: '#1a2420' }}>{v}</option>)}
              </select>
            </div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Discount %</label><input style={{ ...inp, width: '100%' }} type="number" value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} placeholder="e.g. 20" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Discount $ (fixed)</label><input style={{ ...inp, width: '100%' }} type="number" value={form.discount_amount} onChange={e => setForm({ ...form, discount_amount: e.target.value })} placeholder="e.g. 5.00" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Code (optional)</label><input style={{ ...inp, width: '100%' }} value={form.requires_code} onChange={e => setForm({ ...form, requires_code: e.target.value })} placeholder="SUMMER20" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Max uses</label><input style={{ ...inp, width: '100%' }} type="number" value={form.max_total_uses} onChange={e => setForm({ ...form, max_total_uses: e.target.value })} placeholder="unlimited" /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Start date</label><input style={{ ...inp, width: '100%' }} type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>End date</label><input style={{ ...inp, width: '100%' }} type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.stacks_with_others} onChange={e => setForm({ ...form, stacks_with_others: e.target.checked })} />
              Stackable with other promos
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving || !form.name.trim()} style={{ ...smBtn(C.green), opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Create promotion'}</button>
            <button onClick={() => setShowForm(false)} style={smBtn()}>Cancel</button>
          </div>
        </div>
      )}

      {promos.length === 0
        ? <p style={{ fontSize: 12, color: C.muted }}>No promotions yet. Create one above.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid ' + C.border }}>
                {['Name', 'Type', 'Discount', 'Applies to', 'Uses', 'End date', 'Status', ''].map((h, i) => <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{h}</th>)}
              </tr></thead>
              <tbody>{promos.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid ' + C.border }}>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.name}{p.requires_code && <span style={{ fontSize: 9, marginLeft: 6, padding: '1px 5px', borderRadius: 3, background: 'rgba(99,102,241,0.2)', color: '#6366f1' }}>CODE</span>}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{TYPE_LABELS[p.promotion_type] ?? p.promotion_type}</td>
                  <td style={{ padding: '8px 10px', color: C.green }}>{p.discount_percent ? p.discount_percent + '%' : p.discount_amount ? '$' + p.discount_amount : '—'}</td>
                  <td style={{ padding: '8px 10px', color: C.muted, textTransform: 'capitalize' }}>{p.applies_to ?? 'all'}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{p.current_uses}{p.max_total_uses ? ' / ' + p.max_total_uses : ''}</td>
                  <td style={{ padding: '8px 10px', color: C.muted }}>{p.ends_at ? p.ends_at.slice(0, 10) : '—'}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge active={p.active} /></td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => toggle(p)} style={smBtn(p.active ? C.amber : C.green)}>{p.active ? 'Pause' : 'Activate'}</button>
                      <button onClick={() => del(p.id)} style={smBtn(C.red)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
    </div>
  )
}

function PriceListsTab({ bid }: { bid: string }) {
  const [lists, setLists] = useState<PriceList[]>([])
  const [selected, setSelected] = useState<PriceList | null>(null)
  const [items, setItems] = useState<PLItem[]>([])
  const [newName, setNewName] = useState('')
  const [editPrices, setEditPrices] = useState<Record<string, string>>({})

  const load = useCallback(() => { fetch('/api/pos/price-lists').then(r => r.json()).then(d => setLists(d.price_lists ?? [])).catch(() => {}) }, [])
  useEffect(() => { if (bid) load() }, [bid, load])

  const loadItems = (list: PriceList) => {
    setSelected(list); setEditPrices({})
    fetch('/api/pos/price-lists?list_id=' + list.id).then(r => r.json()).then(d => {
      setItems(d.items ?? [])
      const prices: Record<string, string> = {}
      ;(d.items ?? []).forEach((i: PLItem) => { prices[i.product_id] = String(i.override_price) })
      setEditPrices(prices)
    }).catch(() => {})
  }
  const createList = async () => {
    if (!newName.trim()) return
    await fetch('/api/pos/price-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) })
    setNewName(''); load()
  }
  const savePrice = async (item: PLItem) => {
    const p = editPrices[item.product_id]
    if (p == null) return
    await fetch('/api/pos/price-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { price_list_id: selected!.id, product_id: item.product_id, override_price: Number(p) } }) })
    if (selected) loadItems(selected)
  }
  const exportCsv = () => { if (selected) window.open('/api/pos/price-lists?list_id=' + selected.id + '&export=csv', '_blank') }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '200px 1fr' : '1fr', gap: 16 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input style={{ ...inp, flex: 1 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="New list name" onKeyDown={e => e.key === 'Enter' && createList()} />
          <button onClick={createList} style={smBtn(C.green)}>+</button>
        </div>
        {lists.map(l => (
          <div key={l.id} onClick={() => loadItems(l)} style={{ ...card, marginBottom: 6, cursor: 'pointer', borderColor: selected?.id === l.id ? 'rgba(127,184,151,0.4)' : C.border }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{l.name}</p>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{l.item_count} products</p>
          </div>
        ))}
      </div>
      {selected && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.green, margin: 0 }}>{selected.name}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={exportCsv} style={smBtn()}>Export CSV</button>
              <button onClick={() => setSelected(null)} style={smBtn()}>×</button>
            </div>
          </div>
          {items.length === 0
            ? <p style={{ fontSize: 12, color: C.muted }}>No products in this price list yet. Add products via the POS product editor.</p>
            : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid ' + C.border }}>
                  {['Product', 'Regular price', 'Override price', ''].map((h, i) => <th key={i} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: C.muted, textTransform: 'uppercase' }}>{h}</th>)}
                </tr></thead>
                <tbody>{items.map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid ' + C.border }}>
                    <td style={{ padding: '7px 10px' }}>{item.pos_products?.name ?? '—'}</td>
                    <td style={{ padding: '7px 10px', color: C.muted }}>${(Number(item.pos_products?.price) || 0).toFixed(2)}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <input style={{ ...inp, width: 80 }} type="number" value={editPrices[item.product_id] ?? ''} onChange={e => setEditPrices({ ...editPrices, [item.product_id]: e.target.value })} />
                    </td>
                    <td style={{ padding: '7px 10px' }}><button onClick={() => savePrice(item)} style={smBtn(C.green)}>Save</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
        </div>
      )}
    </div>
  )
}

function ScheduledTab({ bid }: { bid: string }) {
  const [changes, setChanges] = useState<ScheduledChange[]>([])
  const [form, setForm] = useState({ product_id: '', new_price: '', effective_date: '', reason: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => { fetch('/api/pos/scheduled-price-changes').then(r => r.json()).then(d => setChanges(d.changes ?? [])).catch(() => {}) }, [])
  useEffect(() => { if (bid) load() }, [bid, load])

  const save = async () => {
    if (!form.product_id || !form.new_price || !form.effective_date) return
    setSaving(true)
    await fetch('/api/pos/scheduled-price-changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: form.product_id, new_price: Number(form.new_price), effective_date: form.effective_date, reason: form.reason || null }) })
    setSaving(false); setForm({ product_id: '', new_price: '', effective_date: '', reason: '' }); load()
  }
  const cancel = async (id: string) => { await fetch('/api/pos/scheduled-price-changes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'cancelled' }) }); load() }

  return (
    <div>
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Schedule a price change</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Product ID</label><input style={inp} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} placeholder="UUID" /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>New price ($)</label><input style={{ ...inp, width: 90 }} type="number" value={form.new_price} onChange={e => setForm({ ...form, new_price: e.target.value })} placeholder="9.99" /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Effective date</label><input style={inp} type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Reason</label><input style={{ ...inp, width: 200 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Cost increase Jan 2027" /></div>
          <button onClick={save} disabled={saving} style={smBtn(C.green)}>{saving ? 'Saving…' : 'Schedule'}</button>
        </div>
      </div>
      {changes.length === 0
        ? <p style={{ fontSize: 12, color: C.muted }}>No upcoming price changes.</p>
        : changes.map(c => (
          <div key={c.id} style={{ ...card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{c.pos_products?.name ?? c.product_id}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                {c.pos_products?.price ? '$' + c.pos_products.price + ' → ' : ''}
                <strong style={{ color: C.green }}>${c.new_price}</strong>
                {' · '}{c.effective_date}
                {c.reason ? ' · ' + c.reason : ''}
              </p>
            </div>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: c.status === 'completed' ? 'rgba(127,184,151,0.15)' : c.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: c.status === 'completed' ? C.green : c.status === 'cancelled' ? C.red : C.amber, fontWeight: 700, textTransform: 'uppercase' }}>{c.status ?? 'scheduled'}</span>
            {c.status !== 'completed' && c.status !== 'cancelled' && <button onClick={() => cancel(c.id)} style={smBtn(C.red)}>Cancel</button>}
          </div>
        ))}
    </div>
  )
}

function TimedPricingTab({ bid }: { bid: string }) {
  const [rules, setRules] = useState<TimedPrice[]>([])
  const [form, setForm] = useState({ product_id: '', discount_pct: '', start_time: '16:00', end_time: '18:00', days: [1, 2, 3, 4, 5] as number[], label: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => { fetch('/api/pos/timed-prices').then(r => r.json()).then(d => setRules(d.schedules ?? [])).catch(() => {}) }, [])
  useEffect(() => { if (bid) load() }, [bid, load])

  const toggleDay = (d: number) => setForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] }))
  const save = async () => {
    if (!form.product_id || !form.discount_pct) return
    setSaving(true)
    await fetch('/api/pos/timed-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: form.product_id, discount_pct: Number(form.discount_pct), start_time: form.start_time, end_time: form.end_time, days_of_week: form.days, label: form.label || null }) })
    setSaving(false); setForm({ product_id: '', discount_pct: '', start_time: '16:00', end_time: '18:00', days: [1, 2, 3, 4, 5], label: '' }); load()
  }
  const del = async (id: string) => { await fetch('/api/pos/timed-prices?id=' + id, { method: 'DELETE' }); load() }
  const toggle = async (r: TimedPrice) => { await fetch('/api/pos/timed-prices?id=' + r.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !r.is_active }) }); load() }

  const activeNow = rules.filter(r => r.is_active_now)

  return (
    <div>
      {activeNow.length > 0 && (
        <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>ACTIVE NOW</span>
          {activeNow.map(r => <span key={r.id} style={{ fontSize: 11, color: C.text }}>{r.product_name ?? r.label ?? 'Unnamed'} {r.discount_pct ? '(' + r.discount_pct + '% off)' : ''}</span>)}
        </div>
      )}
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 10 }}>Add timed price rule</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Product ID</label><input style={inp} value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} placeholder="UUID" /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Discount %</label><input style={{ ...inp, width: 70 }} type="number" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: e.target.value })} placeholder="20" /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Start (HH:MM)</label><input style={{ ...inp, width: 80 }} value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>End (HH:MM)</label><input style={{ ...inp, width: 80 }} value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
          <div><label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 3 }}>Label</label><input style={inp} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Happy Hour" /></div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: C.muted }}>Days:</span>
          {DAYS.map((d, i) => (
            <button key={i} onClick={() => toggleDay(i)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid ' + (form.days.includes(i) ? 'rgba(127,184,151,0.5)' : C.border), background: form.days.includes(i) ? 'rgba(127,184,151,0.15)' : 'transparent', color: form.days.includes(i) ? C.green : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>{d}</button>
          ))}
          <button onClick={save} disabled={saving || !form.product_id || !form.discount_pct} style={{ ...smBtn(C.green), marginLeft: 8, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Add rule'}</button>
        </div>
      </div>

      {rules.length === 0
        ? <p style={{ fontSize: 12, color: C.muted }}>No timed pricing rules.</p>
        : rules.map(r => (
          <div key={r.id} style={{ ...card, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{r.label ?? r.product_name ?? 'Rule'}{r.is_active_now && <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 700 }}>● LIVE</span>}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                {r.discount_pct ? r.discount_pct + '% off' : r.timed_price != null ? '$' + r.timed_price : ''}
                {' · '}{r.start_time?.slice(0, 5)} – {r.end_time?.slice(0, 5)}
                {' · '}{(r.days_of_week ?? []).map((d: number) => DAYS[d]).join(', ')}
              </p>
            </div>
            <button onClick={() => toggle(r)} style={smBtn(r.is_active ? C.amber : C.green)}>{r.is_active ? 'Disable' : 'Enable'}</button>
            <button onClick={() => del(r.id)} style={smBtn(C.red)}>Delete</button>
          </div>
        ))}
    </div>
  )
}

export default function PromotionsPage() {
  const { business } = useBusinessContext()
  const bid = business?.id ?? ''
  const [tab, setTab] = useState<'promotions' | 'price-lists' | 'scheduled' | 'timed'>('promotions')
  const TABS = [{ id: 'promotions' as const, label: 'Promotions' }, { id: 'price-lists' as const, label: 'Price Lists' }, { id: 'scheduled' as const, label: 'Scheduled Changes' }, { id: 'timed' as const, label: 'Timed Pricing' }]
  return (
    <div style={{ padding: 24, maxWidth: 1280, color: C.text }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Promotions &amp; Pricing</h1>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Promotions, price lists, scheduled changes, and timed pricing</p>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid ' + C.border, paddingBottom: 12 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id)}>{t.label}</button>)}
      </div>
      {tab === 'promotions' && bid && <PromotionsTab bid={bid} />}
      {tab === 'price-lists' && bid && <PriceListsTab bid={bid} />}
      {tab === 'scheduled' && bid && <ScheduledTab bid={bid} />}
      {tab === 'timed' && bid && <TimedPricingTab bid={bid} />}
    </div>
  )
}

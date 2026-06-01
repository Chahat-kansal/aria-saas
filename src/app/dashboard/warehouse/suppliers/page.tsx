'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { AriaIntelligencePanel } from '@/components/dashboard/AriaIntelligencePanel'

type Tab = 'overview' | 'orders' | 'schedule' | 'prices' | 'settings'

interface Supplier {
  id: string; name: string; email: string | null; phone: string | null
  contact_name: string | null; payment_terms: string | null; lead_time_days: number | null
  minimum_order_cents: number | null; short_code: string | null; order_email: string | null
  region: string | null; notes: string | null; delivery_days: number[]; order_cutoff_days: number[]
  custom_columns: Array<{ key: string; label: string; type: string }>
  total_orders: number; on_time_pct: number | null; fill_rate_pct: number | null
  discrepancies: number; avg_lead_days: number | null; last_order: string
}
interface Insight { supplier: string; insight: string; rating: string }
interface DayEntry {
  date: string; day: string; is_today: boolean
  deliveries: Array<{ supplier_id: string; short_code: string | null; name: string }>
  cutoffs: Array<{ supplier_id: string; short_code: string | null; name: string; delivers_on: string }>
}
interface UrgentItem { supplier_id: string; name: string; product_name: string; stock_days: number; must_order_by: string }
interface PriceProduct {
  product_id: string | null; product_name: string; supplier_code: string | null
  history: Array<{ date: string; price: number }>; current_price: number; price_change_pct: number
}
interface PO {
  id: string; po_number: string; status: string; supplier_id: string
  total_amount: number | null; created_at: string; sent_at: string | null
  expected_delivery_date: string | null; ai_generated?: boolean
  items: Array<{ product_name: string; qty: number; unit_cost?: number }>
}
interface AISuggestion {
  product_id: string; product_name: string; current_qty: number; suggested_qty: number
  velocity_per_week: number; stock_days_remaining: number; trend: 'up' | 'down' | 'same'
  price_change_pct: number; urgency_score: number; reason?: string
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const AVAILABLE_COLUMNS = [
  { key: 'supplier_code', label: 'Supplier Code' }, { key: 'product_code', label: 'Product Code' },
  { key: 'sku', label: 'SKU' }, { key: 'case_qty', label: 'Case Qty' },
  { key: 'pack_size', label: 'Pack Size' }, { key: 'unit', label: 'Unit' },
  { key: 'base_cost', label: 'Base Cost' }, { key: 'cost_price', label: 'Cost Price' },
  { key: 'price_per_unit', label: 'Price/Unit' }, { key: 'rrp', label: 'RRP' },
  { key: 'ordered_cases', label: 'Ordered (cases)' }, { key: 'qty_ordered', label: 'Qty Ordered' },
  { key: 'qty', label: 'Qty' }, { key: 'total_ex', label: 'Total (ex GST)' },
  { key: 'total_inc', label: 'Total (inc GST)' }, { key: 'subtotal', label: 'Subtotal' },
  { key: 'gst', label: 'GST' }, { key: 'total', label: 'Total' },
  { key: 'received', label: 'Received' }, { key: 'qty_received', label: 'Qty Received' },
]

const BLANK_FORM = { name: '', contact_name: '', email: '', phone: '', payment_terms: 'net30', lead_time_days: '7', minimum_order_cents: '' }
const BLANK_SETTINGS = {
  name: '', short_code: '', email: '', phone: '', order_email: '', contact_name: '',
  payment_terms: 'net30', lead_time_days: '7', region: '', notes: '', minimum_order_cents: '',
  delivery_days: [] as number[], order_cutoff_days: [] as number[], custom_columns: [] as string[],
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs" style={{ color: '#4b5563' }}>N/A</span>
  const color = value >= 90 ? '#1D9E75' : value >= 70 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: Math.min(100, value) + '%', background: color }} />
      </div>
      <span className="text-xs w-8 text-right" style={{ color }}>{value}%</span>
    </div>
  )
}

function PriceSparkline({ history }: { history: Array<{ date: string; price: number }> }) {
  if (history.length < 2) return null
  const prices = history.map(h => h.price)
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const W = 80, H = 24
  const pts = prices.map((p, i) => (i / (prices.length - 1)) * W + ',' + (H - ((p - min) / range) * H)).join(' ')
  const color = prices[prices.length - 1] > prices[0] ? '#ef4444' : '#1D9E75'
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DayToggleRow({ active, onChange, color }: { active: number[]; onChange: (d: number[]) => void; color: string }) {
  return (
    <div className="flex gap-1.5">
      {DAY_NAMES.map((d, i) => {
        const on = active.includes(i)
        return (
          <button key={d} type="button" onClick={() => onChange(on ? active.filter(x => x !== i) : [...active, i])}
            className="w-9 h-9 rounded-full text-xs font-medium flex items-center justify-center"
            style={{ background: on ? color : 'rgba(255,255,255,0.06)', color: on ? '#fff' : '#6b7280', border: '1px solid ' + (on ? color : 'rgba(255,255,255,0.08)') }}>
            {d.slice(0, 2)}
          </button>
        )
      })}
    </div>
  )
}

export default function SuppliersPage() {
  const { business } = useBusinessContext()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [saving, setSaving] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [scheduleData, setScheduleData] = useState<{ week: DayEntry[]; urgent: UrgentItem[] } | null>(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [pricesData, setPricesData] = useState<PriceProduct[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [orders, setOrders] = useState<PO[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [orderStatusFilter, setOrderStatusFilter] = useState('all')
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [settingsForm, setSettingsForm] = useState({ ...BLANK_SETTINGS })
  const [savingSettings, setSavingSettings] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const res = await fetch('/api/warehouse/suppliers?business_id=' + business.id).then(r => r.json()).catch(() => ({ suppliers: [] }))
    setSuppliers(res.suppliers ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (activeTab !== 'schedule' || !business?.id) return
    const doLoad = async () => {
      setLoadingSchedule(true)
      const ws = new Date()
      const dow = (ws.getDay() + 6) % 7
      ws.setDate(ws.getDate() - dow + weekOffset * 7)
      const weekStartStr = ws.toISOString().split('T')[0]
      const res = await fetch('/api/warehouse/delivery-schedule?business_id=' + business.id + '&week_start=' + weekStartStr).then(r => r.json()).catch(() => null)
      if (res) setScheduleData(res)
      setLoadingSchedule(false)
    }
    doLoad()
  }, [activeTab, business?.id, weekOffset])

  useEffect(() => {
    if (activeTab !== 'prices' || !business?.id || !selectedSupplierId) return
    const doLoad = async () => {
      setLoadingPrices(true)
      const res = await fetch('/api/warehouse/suppliers/' + selectedSupplierId + '/prices?business_id=' + business.id).then(r => r.json()).catch(() => ({ prices: [] }))
      setPricesData(res.prices ?? [])
      setLoadingPrices(false)
    }
    doLoad()
  }, [activeTab, selectedSupplierId, business?.id])

  useEffect(() => {
    if (activeTab !== 'orders' || !business?.id) return
    const doLoad = async () => {
      setLoadingOrders(true)
      const url = '/api/warehouse/purchase-orders?business_id=' + business.id + (selectedSupplierId ? '&supplier_id=' + selectedSupplierId : '')
      const res = await fetch(url).then(r => r.json()).catch(() => ({ orders: [] }))
      setOrders(res.orders ?? [])
      setLoadingOrders(false)
    }
    doLoad()
  }, [activeTab, business?.id, selectedSupplierId])

  useEffect(() => {
    if (activeTab !== 'settings' || !selectedSupplierId) return
    const s = suppliers.find(x => x.id === selectedSupplierId)
    if (!s) return
    setSettingsForm({
      name: s.name, short_code: s.short_code ?? '', email: s.email ?? '', phone: s.phone ?? '',
      order_email: s.order_email ?? '', contact_name: s.contact_name ?? '',
      payment_terms: s.payment_terms ?? 'net30', lead_time_days: String(s.lead_time_days ?? 7),
      region: s.region ?? '', notes: s.notes ?? '',
      minimum_order_cents: s.minimum_order_cents ? String(s.minimum_order_cents / 100) : '',
      delivery_days: s.delivery_days ?? [], order_cutoff_days: s.order_cutoff_days ?? [],
      custom_columns: (s.custom_columns ?? []).map(c => c.key),
    })
  }, [activeTab, selectedSupplierId, suppliers])

  async function getInsights() {
    if (!business?.id || !suppliers.length) return
    setLoadingInsights(true)
    const res = await fetch('/api/aria/supplier-insights', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, suppliers }),
    }).then(r => r.json()).catch(() => ({ insights: [] }))
    setInsights(res.insights ?? [])
    setLoadingInsights(false)
  }

  async function saveSupplier() {
    if (!business?.id || !form.name.trim()) return
    setSaving(true)
    const payload = {
      business_id: business.id, name: form.name, contact_name: form.contact_name || null,
      email: form.email || null, phone: form.phone || null, payment_terms: form.payment_terms || 'net30',
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      minimum_order_cents: form.minimum_order_cents ? Math.round(parseFloat(form.minimum_order_cents) * 100) : null,
    }
    if (editingId) {
      await fetch('/api/warehouse/suppliers/' + editingId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/warehouse/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false); setShowAdd(false); setEditingId(null); setForm({ ...BLANK_FORM }); load()
  }

  async function saveSettings() {
    if (!business?.id || !selectedSupplierId || !settingsForm.name.trim()) return
    setSavingSettings(true)
    const customCols = settingsForm.custom_columns.map(key => {
      const col = AVAILABLE_COLUMNS.find(c => c.key === key)
      return { key, label: col?.label ?? key, type: 'text' }
    })
    await fetch('/api/warehouse/suppliers/' + selectedSupplierId, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: business.id, name: settingsForm.name,
        short_code: settingsForm.short_code || null, email: settingsForm.email || null,
        phone: settingsForm.phone || null, order_email: settingsForm.order_email || null,
        contact_name: settingsForm.contact_name || null, payment_terms: settingsForm.payment_terms || 'net30',
        lead_time_days: settingsForm.lead_time_days ? parseInt(settingsForm.lead_time_days) : null,
        region: settingsForm.region || null, notes: settingsForm.notes || null,
        minimum_order_cents: settingsForm.minimum_order_cents ? Math.round(parseFloat(settingsForm.minimum_order_cents) * 100) : null,
        delivery_days: settingsForm.delivery_days, order_cutoff_days: settingsForm.order_cutoff_days,
        custom_columns: customCols,
      }),
    })
    setSavingSettings(false); load()
  }

  async function getAISuggestions() {
    if (!business?.id || !selectedSupplierId) return
    setLoadingAI(true); setShowAIPanel(true)
    const res = await fetch('/api/warehouse/ai-order-suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, supplier_id: selectedSupplierId }),
    }).then(r => r.json()).catch(() => ({ suggestions: [], summary: 'Error loading suggestions.' }))
    setAiSuggestions(res.suggestions ?? []); setAiSummary(res.summary ?? ''); setLoadingAI(false)
  }

  const insightMap: Record<string, Insight> = {}
  for (const ins of insights) insightMap[ins.supplier] = ins

  const inputCls = 'w-full px-3 py-2 rounded-xl text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.4)]'
  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' }, { id: 'orders', label: 'Orders' },
    { id: 'schedule', label: 'Delivery Schedule' }, { id: 'prices', label: 'Price Comparison' },
    { id: 'settings', label: 'Settings' },
  ]
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId)
  const filteredOrders = orders.filter(o => {
    if (selectedSupplierId && o.supplier_id !== selectedSupplierId) return false
    if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false
    return true
  })
  const priceAlerts = pricesData.filter(p => p.price_change_pct > 3).length

  const statusColor = (st: string) =>
    st === 'received' ? '#1D9E75' : st === 'sent' ? '#3b82f6' : '#6b7280'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Suppliers</h1>
          <p style={{ color: '#6b7280' }}>Manage suppliers, delivery schedules, and purchase orders.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === 'overview' && (
            <>
              <button onClick={getInsights} disabled={loadingInsights || !suppliers.length}
                className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex items-center gap-1"
                style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                {loadingInsights ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Analysing…</> : '✦ Aria Insights'}
              </button>
              <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ ...BLANK_FORM }) }}
                className="px-3 py-2 rounded-xl text-xs font-medium text-white" style={{ background: '#1D9E75' }}>
                + Add supplier
              </button>
            </>
          )}
          {activeTab === 'orders' && selectedSupplierId && (
            <button onClick={getAISuggestions} disabled={loadingAI}
              className="px-3 py-2 rounded-xl text-xs font-medium disabled:opacity-40 flex items-center gap-1"
              style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
              {loadingAI ? <><span className="inline-block w-2.5 h-2.5 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />Thinking…</> : '✦ AI suggest order'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="px-4 py-2.5 text-sm font-medium rounded-t-lg"
            style={{ color: activeTab === t.id ? '#1D9E75' : '#6b7280', borderBottom: activeTab === t.id ? '2px solid #1D9E75' : '2px solid transparent', background: 'transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div>
          <AriaIntelligencePanel mode="supplier" />
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}</div>
          ) : suppliers.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-3xl mb-3">🏭</div>
              <p className="font-semibold text-white mb-1">No suppliers yet</p>
              <p className="text-sm mb-4" style={{ color: '#6b7280' }}>Add suppliers and receive GRNs to track performance automatically.</p>
              <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#1D9E75' }}>Add your first supplier</button>
            </div>
          ) : (
            <div className="space-y-3">
              {suppliers.map(s => {
                const ins = insightMap[s.name]
                return (
                  <div key={s.id} className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-white font-medium">
                          {s.name}
                          {s.short_code && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897' }}>{s.short_code}</span>}
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                          {s.total_orders} GRN{s.total_orders !== 1 ? 's' : ''} · Last: {s.last_order}
                          {s.avg_lead_days !== null ? ' · Avg lead: ' + s.avg_lead_days + 'd' : ''}
                          {s.delivery_days?.length ? ' · Delivers: ' + s.delivery_days.map(d => DAY_NAMES[d]).join(', ') : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ins && (
                          <span className={'text-xs px-2 py-0.5 rounded-full ' + (ins.rating === 'good' ? 'bg-green-900/30 text-green-400' : ins.rating === 'fair' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400')}>
                            {ins.rating}
                          </span>
                        )}
                        <button onClick={() => { setEditingId(s.id); setForm({ name: s.name, contact_name: s.contact_name ?? '', email: s.email ?? '', phone: s.phone ?? '', payment_terms: s.payment_terms ?? 'net30', lead_time_days: String(s.lead_time_days ?? 7), minimum_order_cents: s.minimum_order_cents ? String(s.minimum_order_cents / 100) : '' }); setShowAdd(true) }}
                          className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Edit</button>
                        <button onClick={() => { setSelectedSupplierId(s.id); setActiveTab('settings') }}
                          className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(127,184,151,0.08)', color: '#7FB897' }}>Schedule</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div><p className="text-xs mb-2" style={{ color: '#6b7280' }}>On-time delivery</p><ScoreBar value={s.on_time_pct} /></div>
                      <div><p className="text-xs mb-2" style={{ color: '#6b7280' }}>Fill rate</p><ScoreBar value={s.fill_rate_pct} /></div>
                      <div>
                        <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Discrepancies</p>
                        <p className="text-sm font-medium" style={{ color: s.discrepancies > 0 ? '#ef4444' : '#1D9E75' }}>{s.discrepancies === 0 ? 'None' : s.discrepancies + ' found'}</p>
                      </div>
                      <div><p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total orders</p><p className="text-sm font-medium text-white">{s.total_orders}</p></div>
                    </div>
                    {ins && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-xs" style={{ color: '#9ca3af' }}><span style={{ color: '#1D9E75' }}>✦ Aria: </span>{ins.insight}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <select value={selectedSupplierId ?? ''} onChange={e => setSelectedSupplierId(e.target.value || null)}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 200 }}>
              <option value="" style={{ background: '#1a1a2e' }}>All suppliers</option>
              {suppliers.map(s => <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>{s.name}</option>)}
            </select>
            <div className="flex gap-1">
              {['all', 'draft', 'sent', 'received'].map(st => (
                <button key={st} onClick={() => setOrderStatusFilter(st)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
                  style={{ background: orderStatusFilter === st ? 'rgba(29,158,117,0.15)' : 'rgba(255,255,255,0.04)', color: orderStatusFilter === st ? '#1D9E75' : '#6b7280', border: '1px solid ' + (orderStatusFilter === st ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.06)') }}>
                  {st}
                </button>
              ))}
            </div>
          </div>

          {showAIPanel && (
            <div className="mb-4 rounded-xl p-4" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium" style={{ color: '#1D9E75' }}>✦ AI Order Suggestions</p>
                <button onClick={() => setShowAIPanel(false)} className="text-xs" style={{ color: '#6b7280' }}>Dismiss</button>
              </div>
              {loadingAI ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: '#6b7280' }}>
                  <span className="inline-block w-4 h-4 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
                  Analysing velocity, trends, and stock levels…
                </div>
              ) : (
                <>
                  {aiSummary && <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>{aiSummary}</p>}
                  <div className="space-y-2">
                    {aiSuggestions.slice(0, 10).map(s => (
                      <div key={s.product_id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-sm w-4 text-center" style={{ color: s.trend === 'up' ? '#1D9E75' : s.trend === 'down' ? '#ef4444' : '#6b7280' }}>
                          {s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{s.product_name}</p>
                          {s.reason && <p className="text-xs truncate" style={{ color: '#6b7280' }}>{s.reason}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-medium text-white">{s.suggested_qty} units</p>
                          <p className="text-xs" style={{ color: s.stock_days_remaining <= 5 ? '#ef4444' : '#6b7280' }}>{s.stock_days_remaining}d stock</p>
                        </div>
                        {s.urgency_score >= 1 && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Urgent</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {loadingOrders ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}</div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm text-white mb-1">No {orderStatusFilter !== 'all' ? orderStatusFilter + ' ' : ''}orders</p>
              <p className="text-xs" style={{ color: '#6b7280' }}>
                {selectedSupplierId ? 'Use ✦ AI suggest order to generate a new order.' : 'Select a supplier and use AI suggestions to create an order.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(o => {
                const sup = suppliers.find(s => s.id === o.supplier_id)
                return (
                  <div key={o.id} className="rounded-xl px-4 py-3 flex items-center gap-4" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-white">{o.po_number}</p>
                        {o.ai_generated && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897' }}>AI</span>}
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: o.status === 'received' ? 'rgba(29,158,117,0.15)' : o.status === 'sent' ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)', color: statusColor(o.status) }}>
                          {o.status}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {sup?.name ?? 'Unknown supplier'} · {new Date(o.created_at).toLocaleDateString('en-AU')} · {(o.items ?? []).length} lines
                        {o.expected_delivery_date ? ' · Exp: ' + o.expected_delivery_date : ''}
                      </p>
                    </div>
                    {o.total_amount !== null && <p className="text-sm font-medium text-white shrink-0">${Number(o.total_amount).toFixed(2)}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* DELIVERY SCHEDULE TAB */}
      {activeTab === 'schedule' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>←</button>
            <p className="text-sm font-medium text-white">
              {weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : (weekOffset > 0 ? '+' : '') + weekOffset + ' weeks'}
            </p>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>→</button>
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>Today</button>}
          </div>
          {loadingSchedule ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {[...Array(7)].map((_, i) => <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}
            </div>
          ) : scheduleData ? (
            <>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {scheduleData.week.map(day => (
                  <div key={day.date} className="rounded-xl p-3 min-h-28"
                    style={{ background: day.is_today ? 'rgba(29,158,117,0.08)' : '#13131a', border: '1px solid ' + (day.is_today ? 'rgba(29,158,117,0.35)' : 'rgba(255,255,255,0.07)') }}>
                    <p className="text-xs font-semibold mb-0.5" style={{ color: day.is_today ? '#1D9E75' : '#9ca3af' }}>{day.day}</p>
                    <p className="text-xs mb-2" style={{ color: '#4b5563' }}>{day.date.slice(5).replace('-', '/')}</p>
                    {day.deliveries.map(d => (
                      <div key={d.supplier_id} className="text-xs px-1.5 py-0.5 rounded mb-1 truncate" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                        {d.short_code ?? d.name.slice(0, 6)}
                      </div>
                    ))}
                    {day.cutoffs.map(c => (
                      <div key={c.supplier_id + 'c'} className="text-xs px-1.5 py-0.5 rounded mb-1 truncate" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        ✂ {c.short_code ?? c.name.slice(0, 4)}{c.delivers_on ? ' →' + c.delivers_on : ''}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 mb-4">
                {[['rgba(59,130,246,0.35)', 'Delivery day'], ['rgba(245,158,11,0.35)', 'Order cutoff'], ['rgba(29,158,117,0.3)', 'Today']].map(([bg, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ background: bg }} />
                    <span className="text-xs" style={{ color: '#6b7280' }}>{label}</span>
                  </div>
                ))}
              </div>
              {scheduleData.urgent.length > 0 ? (
                <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p className="text-sm font-medium mb-3" style={{ color: '#ef4444' }}>Urgent: Low Stock Alerts</p>
                  <div className="space-y-2">
                    {scheduleData.urgent.map((u, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-xs">
                        <div><span className="text-white font-medium">{u.product_name}</span><span style={{ color: '#6b7280' }}> · {u.name}</span></div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span style={{ color: '#ef4444' }}>{u.stock_days}d left</span>
                          <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Order by {u.must_order_by}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4"><p className="text-xs" style={{ color: '#1D9E75' }}>✓ No urgent stock alerts this week</p></div>
              )}
            </>
          ) : (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>No schedule data. Add suppliers with delivery days in Settings.</p>
            </div>
          )}
        </div>
      )}

      {/* PRICE COMPARISON TAB */}
      {activeTab === 'prices' && (
        <div>
          <div className="mb-4">
            <select value={selectedSupplierId ?? ''} onChange={e => { setSelectedSupplierId(e.target.value || null); setPricesData([]) }}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 220 }}>
              <option value="" style={{ background: '#1a1a2e' }}>Select a supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>{s.name}</option>)}
            </select>
          </div>
          {!selectedSupplierId ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>Select a supplier to view price history.</p>
            </div>
          ) : loadingPrices ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}</div>
          ) : (
            <>
              {priceAlerts > 0 && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span style={{ color: '#1D9E75' }}>✦ Aria: </span>
                  <span style={{ color: '#fca5a5' }}>{priceAlerts} item{priceAlerts !== 1 ? 's have' : ' has'} increased more than 3% — review before placing your next order.</span>
                </div>
              )}
              {pricesData.length === 0 ? (
                <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-sm" style={{ color: '#6b7280' }}>No price history yet. Price points are recorded when you create and receive purchase orders.</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Product', 'Code', 'First Price', 'Current', 'Change', 'Trend'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#6b7280', background: '#13131a' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pricesData.map((p, i) => {
                        const first = p.history[0]?.price ?? p.current_price
                        const chgColor = p.price_change_pct > 3 ? '#ef4444' : p.price_change_pct > 0 ? '#f59e0b' : '#1D9E75'
                        return (
                          <tr key={p.product_id ?? p.product_name} style={{ borderBottom: i < pricesData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: '#13131a' }}>
                            <td className="px-4 py-3 text-sm text-white">{p.product_name}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{p.supplier_code ?? '—'}</td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#9ca3af' }}>${first.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm font-medium text-white">${p.current_price.toFixed(2)}</td>
                            <td className="px-4 py-3 text-sm font-medium" style={{ color: chgColor }}>{p.price_change_pct > 0 ? '+' : ''}{p.price_change_pct.toFixed(1)}%</td>
                            <td className="px-4 py-3"><PriceSparkline history={p.history} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div>
          <div className="mb-5">
            <select value={selectedSupplierId ?? ''} onChange={e => setSelectedSupplierId(e.target.value || null)}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 240 }}>
              <option value="" style={{ background: '#1a1a2e' }}>Select a supplier</option>
              {suppliers.map(s => <option key={s.id} value={s.id} style={{ background: '#1a1a2e' }}>{s.name}</option>)}
            </select>
          </div>
          {!selectedSupplierId ? (
            <div className="rounded-xl p-10 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>Select a supplier to edit their settings and delivery schedule.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <h3 className="text-sm font-semibold text-white mb-4">Basic Information</h3>
                <div className="space-y-3">
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Supplier name *</label><input value={settingsForm.name} onChange={e => setSettingsForm(p => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Short code</label><input value={settingsForm.short_code} onChange={e => setSettingsForm(p => ({ ...p, short_code: e.target.value }))} className={inputCls} placeholder="ALM" /></div>
                    <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Region</label><input value={settingsForm.region} onChange={e => setSettingsForm(p => ({ ...p, region: e.target.value }))} className={inputCls} placeholder="VIC" /></div>
                  </div>
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Contact name</label><input value={settingsForm.contact_name} onChange={e => setSettingsForm(p => ({ ...p, contact_name: e.target.value }))} className={inputCls} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Phone</label><input value={settingsForm.phone} onChange={e => setSettingsForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Lead time (days)</label><input type="number" min={0} value={settingsForm.lead_time_days} onChange={e => setSettingsForm(p => ({ ...p, lead_time_days: e.target.value }))} className={inputCls} /></div>
                  </div>
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>General email</label><input type="email" value={settingsForm.email} onChange={e => setSettingsForm(p => ({ ...p, email: e.target.value }))} className={inputCls} /></div>
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Order email (POs sent here)</label><input type="email" value={settingsForm.order_email} onChange={e => setSettingsForm(p => ({ ...p, order_email: e.target.value }))} className={inputCls} /></div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Payment terms</label>
                    <select value={settingsForm.payment_terms} onChange={e => setSettingsForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputCls}>
                      {['net7', 'net14', 'net30', 'net60', 'cod', 'prepaid'].map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Minimum order (A$)</label><input type="number" min={0} step={0.01} value={settingsForm.minimum_order_cents} onChange={e => setSettingsForm(p => ({ ...p, minimum_order_cents: e.target.value }))} className={inputCls} placeholder="0.00" /></div>
                  <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Notes</label><textarea value={settingsForm.notes} onChange={e => setSettingsForm(p => ({ ...p, notes: e.target.value }))} rows={2} className={inputCls + ' resize-none'} /></div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <h3 className="text-sm font-semibold text-white mb-2">Delivery Days</h3>
                  <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Which days does this supplier deliver?</p>
                  <DayToggleRow active={settingsForm.delivery_days} onChange={days => setSettingsForm(p => ({ ...p, delivery_days: days }))} color="#3b82f6" />
                </div>
                <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <h3 className="text-sm font-semibold text-white mb-2">Order Cutoff Days</h3>
                  <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Which days must you place your order?</p>
                  <DayToggleRow active={settingsForm.order_cutoff_days} onChange={days => setSettingsForm(p => ({ ...p, order_cutoff_days: days }))} color="#f59e0b" />
                </div>
                <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <h3 className="text-sm font-semibold text-white mb-2">Custom Order Columns</h3>
                  <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Select which columns appear on this supplier's order lines.</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AVAILABLE_COLUMNS.map(col => {
                      const on = settingsForm.custom_columns.includes(col.key)
                      return (
                        <button key={col.key} type="button"
                          onClick={() => setSettingsForm(p => ({ ...p, custom_columns: on ? p.custom_columns.filter(k => k !== col.key) : [...p.custom_columns, col.key] }))}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs"
                          style={{ background: on ? 'rgba(29,158,117,0.12)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (on ? 'rgba(29,158,117,0.3)' : 'rgba(255,255,255,0.06)'), color: on ? '#1D9E75' : '#6b7280' }}>
                          <span>{on ? '✓' : '+'}</span>{col.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex items-center justify-between gap-3">
                <button onClick={() => setShowDeleteConfirm(true)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                  Delete supplier
                </button>
                <button onClick={saveSettings} disabled={savingSettings || !settingsForm.name.trim()} className="px-6 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                  {savingSettings ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">{editingId ? 'Edit supplier' : 'Add supplier'}</h3>
              <button onClick={() => { setShowAdd(false); setEditingId(null) }} className="text-gray-400 hover:text-white text-lg">×</button>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Supplier name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. ALM Australia" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Contact name</label><input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} className={inputCls} placeholder="John Smith" /></div>
                <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="03 9xxx xxxx" /></div>
              </div>
              <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="orders@supplier.com.au" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Payment terms</label>
                  <select value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} className={inputCls}>
                    {['net7', 'net14', 'net30', 'net60', 'cod', 'prepaid'].map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t.toUpperCase()}</option>)}
                  </select>
                </div>
                <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Lead time (days)</label><input type="number" min={0} value={form.lead_time_days} onChange={e => setForm(p => ({ ...p, lead_time_days: e.target.value }))} className={inputCls} placeholder="7" /></div>
              </div>
              <div><label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Minimum order (A$)</label><input type="number" min={0} step={0.01} value={form.minimum_order_cents} onChange={e => setForm(p => ({ ...p, minimum_order_cents: e.target.value }))} className={inputCls} placeholder="0.00" /></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowAdd(false); setEditingId(null) }} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={saveSupplier} disabled={saving || !form.name.trim()} className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {showDeleteConfirm && selectedSupplierId && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-white font-semibold mb-2">Delete supplier?</h3>
            <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
              This will delete {selectedSupplier?.name ?? 'this supplier'}. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>Cancel</button>
              <button onClick={async () => {
                await fetch('/api/warehouse/suppliers/' + selectedSupplierId, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business?.id }) })
                setShowDeleteConfirm(false); setSelectedSupplierId(null); setActiveTab('overview'); load()
              }} className="flex-1 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Package, Truck, PackageCheck, AlertTriangle, PauseCircle, XCircle, MapPin,
  Clock, Search, Plus, Upload, BarChart3, RefreshCcw, Trash2, Sparkles, Link as LinkIcon,
  ArrowDownToLine, ArrowUpFromLine, Store, HelpCircle, X, AlertCircle, ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { AriaSays, invalidateAriaInsight } from '@/components/dashboard/AriaSays'

// ── Theme — CSS vars only ─────────────────────────────────────────────
const C = {
  bg: 'var(--bg-base)',
  card: 'var(--bg-surface)',
  cardHi: 'var(--bg-elevated, rgba(127,184,151,0.04))',
  border: 'rgba(127,184,151,0.15)',
  borderSoft: 'rgba(255,255,255,0.06)',
  green: '#7FB897',
  sage: '#2D5240',
  text: 'var(--text-primary)',
  muted: 'var(--text-secondary)',
  dim: 'var(--text-tertiary)',
  red: '#EF4444',
  amber: '#F59E0B',
  blue: '#60A5FA',
  violet: '#A78BFA',
}

const FONT = 'var(--font-ui, Inter, system-ui, sans-serif)'

// ── Status config — no emoji, Lucide icons ────────────────────────────
type StatusKey = 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'on_hold' | 'awaiting_collection' | 'cancelled' | 'failed' | 'unknown'

const STATUS_CFG: Record<StatusKey, { label: string; color: string; Icon: LucideIcon }> = {
  pending:             { label: 'Registered',           color: C.dim,   Icon: Clock },
  in_transit:          { label: 'In transit',           color: C.blue,  Icon: Truck },
  out_for_delivery:    { label: 'Out for delivery',     color: C.amber, Icon: Package },
  delivered:           { label: 'Delivered',            color: C.green, Icon: PackageCheck },
  exception:           { label: 'Exception',            color: C.red,   Icon: AlertTriangle },
  on_hold:             { label: 'On hold',              color: C.amber, Icon: PauseCircle },
  awaiting_collection: { label: 'Awaiting collection',  color: C.violet,Icon: Store },
  cancelled:           { label: 'Cancelled',            color: C.red,   Icon: XCircle },
  failed:              { label: 'Failed',               color: C.red,   Icon: XCircle },
  unknown:             { label: 'Unknown',              color: C.dim,   Icon: HelpCircle },
}

const CARRIERS = [
  { value: 'other', label: 'Auto-detect' },
  { value: 'auspost', label: 'Australia Post' },
  { value: 'aramex', label: 'Aramex' },
  { value: 'startrack', label: 'StarTrack' },
  { value: 'dhl', label: 'DHL Express' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'couriersplease', label: 'Couriers Please' },
  { value: 'tnt', label: 'TNT' },
]

const MANUAL_STATUSES: { value: StatusKey; label: string }[] = [
  { value: 'delivered',           label: 'Delivered' },
  { value: 'on_hold',             label: 'On hold' },
  { value: 'awaiting_collection', label: 'Awaiting collection' },
  { value: 'cancelled',           label: 'Cancelled' },
  { value: 'failed',              label: 'Failed' },
]

interface Parcel {
  id: string; tracking_number: string; carrier: string; carrier_name: string;
  label: string | null; direction: 'inbound' | 'outbound';
  status: string; status_detail: string | null; manual_status: string | null;
  events: Array<{ time: string; location: string; description: string }>;
  estimated_delivery: string | null; delivered_at: string | null;
  last_checked_at: string | null; notes: string | null; created_at: string;
  recipient_name: string | null; recipient_phone: string | null;
  recipient_address: string | null; recipient_city: string | null;
  recipient_state: string | null; recipient_postcode: string | null;
  order_reference: string | null;
  aria_insight: string | null; predicted_late: boolean | null;
}

const fmt   = (d: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtDT = (d: string | null) => d ? new Date(d).toLocaleString('en-AU',     { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const isToday = (d: string | null) => { if (!d) return false; const x = new Date(d), now = new Date(); return x.toDateString() === now.toDateString() }
const cfgFor = (s: string) => (STATUS_CFG as Record<string, typeof STATUS_CFG.unknown>)[s] ?? STATUS_CFG.unknown

function Badge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const c = cfgFor(status)
  const pad = size === 'md' ? '4px 12px' : '3px 9px'
  const fs = size === 'md' ? 12 : 11
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 999, fontSize: fs, fontWeight: 700, background: c.color + '18', color: c.color, border: `1px solid ${c.color}30`, whiteSpace: 'nowrap' }}>
      <c.Icon size={size === 'md' ? 13 : 11} />
      {c.label}
    </span>
  )
}

const inp = {
  height: 36, borderRadius: 8, border: `1px solid ${C.border}`,
  background: 'transparent', color: C.text, padding: '0 12px',
  fontSize: 13, fontFamily: FONT, outline: 'none', width: '100%',
} as const

const emptyForm = {
  tracking_number: '', carrier: 'other', label: '', direction: 'inbound',
  order_reference: '', recipient_name: '', recipient_phone: '',
  recipient_address: '', recipient_city: '', recipient_state: '',
  recipient_postcode: '', notes: '',
}

export default function ParcelTrackingPage() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Parcel | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'delivered'>('active')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [addErr, setAddErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [view, setView] = useState<'list' | 'analytics'>('list')
  const [analytics, setAnalytics] = useState<{
    summary: {
      total: number;
      by_carrier: Array<{ carrier: string; name: string; total: number; delivered: number; exceptions: number; exception_rate: number; avg_days: number | null }>;
      monthly: Array<{ month: string; count: number }>;
      exceptions: { stuck: number; failed: number; returned: number };
      top_carrier: string | null;
    } | null;
  } | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  const [bulkCsv, setBulkCsv] = useState('')
  const [bulkResult, setBulkResult] = useState('')
  const [prediction, setPrediction] = useState<{ prediction: string; baseline_days: number; sample_size: number } | null>(null)
  const [predLoading, setPredLoading] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const p = new URLSearchParams()
    if (filter !== 'all') p.set('status', filter)
    if (direction !== 'all') p.set('direction', direction)
    if (search.trim()) p.set('search', search.trim())
    const res = await fetch(`/api/pos/parcel-tracking?${p}`)
    if (res.ok) {
      const d = await res.json() as { parcels: Parcel[] }
      const list = d.parcels ?? []
      setParcels(list)
      if (selected) { const u = list.find(p => p.id === selected.id); if (u) setSelected(u) }
    }
    if (!silent) setLoading(false)
  }, [filter, direction, search, selected])

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, direction])
  useEffect(() => { pollRef.current = setInterval(() => load(true), 60000); return () => { if (pollRef.current) clearInterval(pollRef.current) } }, [load])
  useEffect(() => { const t = setTimeout(() => load(), 400); return () => clearTimeout(t) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search])

  async function addParcel() {
    if (!form.tracking_number.trim()) { setAddErr('Enter a tracking number'); return }
    setAdding(true); setAddErr('')
    const res = await fetch('/api/pos/parcel-tracking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json() as { parcel?: Parcel; error?: string; warning?: string; tracking_live?: boolean }
    if (d.error) { setAddErr(d.error); setAdding(false); return }
    setShowAdd(false); setForm(emptyForm); setAdding(false)
    setNotice(d.warning ?? (d.tracking_live ? 'Parcel added — live tracking is on.' : ''))
    await load(); if (d.parcel) setSelected(d.parcel)
    invalidateAriaInsight(null, 'delivery')
  }

  async function refresh(id: string) {
    setRefreshing(id)
    const res = await fetch('/api/pos/parcel-tracking', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, refresh: true }) })
    const d = await res.json() as { parcel?: Parcel; warning?: string }
    if (d.parcel) { setParcels(ps => ps.map(p => p.id === id ? d.parcel! : p)); if (selected?.id === id) setSelected(d.parcel) }
    if (d.warning) setNotice(d.warning)
    setRefreshing(null)
  }

  async function setManualStatus(id: string, manual_status: string) {
    setSaving(true)
    const res = await fetch('/api/pos/parcel-tracking', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, manual_status }) })
    const d = await res.json() as { parcel?: Parcel }
    if (d.parcel) { setParcels(ps => ps.map(p => p.id === id ? d.parcel! : p)); if (selected?.id === id) setSelected(d.parcel) }
    setSaving(false)
    invalidateAriaInsight(null, 'delivery')
  }

  async function remove(id: string) {
    if (!confirm('Remove this parcel from tracking?')) return
    await fetch('/api/pos/parcel-tracking', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setParcels(ps => ps.filter(p => p.id !== id))
    if (selected?.id === id) setSelected(null)
    invalidateAriaInsight(null, 'delivery')
  }

  async function runBulk() {
    if (!bulkCsv.trim()) return
    const lines = bulkCsv.trim().split('\n').slice(1)
    const rows = lines.map(l => {
      const [tracking_number, carrier, recipient_name, recipient_phone, order_reference] = l.split(',').map(s => s.replace(/^"|"$/g, '').trim())
      return { tracking_number, carrier: carrier || 'other', recipient_name, recipient_phone, order_reference }
    }).filter(r => r.tracking_number)
    if (rows.length === 0) { setBulkResult('No valid rows'); return }
    const res = await fetch('/api/parcel-tracking/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) }).then(r => r.json()).catch(() => ({ error: 'Network error' }))
    if (res.error) setBulkResult(`Error: ${res.error}`)
    else { setBulkResult(`Imported ${res.imported} parcels`); load(); invalidateAriaInsight(null, 'delivery') }
  }

  async function predictDelivery(id: string) {
    setPredLoading(true); setPrediction(null)
    const res = await fetch('/api/aria/delivery-prediction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parcel_id: id }) }).then(r => r.json()).catch(() => null)
    setPrediction(res); setPredLoading(false)
  }

  useEffect(() => {
    if (view !== 'analytics') return
    fetch('/api/parcel-tracking/analytics').then(r => r.json()).then(setAnalytics).catch(() => {})
  }, [view])

  // ── Hero stats ────────────────────────────────────────────────────
  const activeCt    = parcels.filter(p => !['delivered', 'exception', 'cancelled', 'failed'].includes(p.status)).length
  const inTransitCt = parcels.filter(p => p.status === 'in_transit' || p.status === 'out_for_delivery').length
  const deliveredTodayCt = parcels.filter(p => p.status === 'delivered' && isToday(p.delivered_at)).length
  const exceptionCt = parcels.filter(p => {
    if (['exception', 'failed', 'returned'].includes(p.status)) return true
    if (p.status === 'delivered' || p.status === 'cancelled') return false
    const last = p.last_checked_at ? new Date(p.last_checked_at).getTime() : new Date(p.created_at).getTime()
    return Date.now() - last > 5 * 86400_000
  }).length

  // ── Filter chip ───────────────────────────────────────────────────
  const Chip = ({ label, active, onClick, icon: Icon, danger }: { label: string; active: boolean; onClick: () => void; icon?: LucideIcon; danger?: boolean }) => (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      height: 32, padding: '0 14px', borderRadius: 999,
      border: `1px solid ${active ? (danger ? C.red : C.green) : C.border}`,
      background: active ? (danger ? 'rgba(239,68,68,0.1)' : 'rgba(127,184,151,0.1)') : 'transparent',
      color: active ? (danger ? C.red : C.green) : C.muted,
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
      transition: 'all 160ms',
    }}>
      {Icon && <Icon size={13} />}
      {label}
    </button>
  )

  return (
    <div className="parcel-page" style={{ minHeight: '100vh', background: C.bg, fontFamily: FONT, color: C.text }}>
      <style jsx global>{`
        .parcel-card { transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
        .parcel-card:hover { transform: translateY(-1px); border-color: ${C.green}40; box-shadow: 0 8px 24px rgba(0,0,0,0.18); }
        .parcel-icon-btn { transition: background 140ms, color 140ms; }
        .parcel-icon-btn:hover { background: ${C.cardHi}; color: ${C.text}; }
        @media (max-width: 768px) {
          .parcel-layout { flex-direction: column !important; }
          .parcel-detail-split { grid-template-columns: 1fr !important; }
          .parcel-list-col { width: 100% !important; max-width: 100% !important; border-right: none !important; border-bottom: 1px solid ${C.border}; }
          .parcel-hero { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* ── HEADER + HERO STRIP ────────────────────────────────── */}
      <div style={{ padding: '28px 28px 0', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Parcel tracking</h1>
            <p style={{ fontSize: 13, color: C.dim, margin: '4px 0 0' }}>Live updates every 60 seconds · inbound and outbound combined.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setView(v => v === 'analytics' ? 'list' : 'analytics')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: view === 'analytics' ? 'rgba(127,184,151,0.1)' : 'transparent', color: view === 'analytics' ? C.green : C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <BarChart3 size={14} /> Analytics
            </button>
            <button onClick={() => { setShowBulk(v => !v); setShowAdd(false) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              <Upload size={14} /> Bulk import
            </button>
            <button onClick={() => { setShowAdd(v => !v); setShowBulk(false) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              {showAdd ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add parcel</>}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <AriaSays businessId={null} page="delivery" />
        </div>

        {/* Hero stats */}
        <div className="parcel-hero" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'In transit',        value: String(inTransitCt),      Icon: Truck,          color: C.blue },
            { label: 'Active total',      value: String(activeCt),         Icon: Package,        color: C.text  },
            { label: 'Delivered today',   value: String(deliveredTodayCt), Icon: PackageCheck,   color: C.green },
            { label: 'Need attention',    value: String(exceptionCt),      Icon: AlertTriangle,  color: exceptionCt > 0 ? C.red : C.dim },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '14px 16px', borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: stat.color }}>
                <stat.Icon size={16} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.dim }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, letterSpacing: '-0.02em' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Notice banner */}
        {notice && (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: 13, color: '#FBBF24', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{notice}</span>
            <button onClick={() => setNotice('')} className="parcel-icon-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#FBBF24', padding: 0, display: 'flex' }}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT ────────────────────────────────────────── */}
      <div className="parcel-layout" style={{ display: 'flex', maxWidth: 1280, margin: '0 auto', alignItems: 'flex-start' }}>
        {/* LEFT — list */}
        <div className="parcel-list-col" style={{ width: 440, flexShrink: 0, padding: '0 12px 28px 28px', borderRight: `1px solid ${C.border}` }}>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.dim }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracking number, name, order ref…"
              style={{ ...inp, paddingLeft: 36 }} />
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            <Chip label="Active" active={filter === 'active'} onClick={() => setFilter('active')} />
            <Chip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            <Chip label="Delivered" active={filter === 'delivered'} onClick={() => setFilter('delivered')} />
            <div style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 4px' }} />
            <Chip label="Inbound" icon={ArrowDownToLine} active={direction === 'inbound'} onClick={() => setDirection(v => v === 'inbound' ? 'all' : 'inbound')} />
            <Chip label="Outbound" icon={ArrowUpFromLine} active={direction === 'outbound'} onClick={() => setDirection(v => v === 'outbound' ? 'all' : 'outbound')} />
          </div>

          {/* Add form */}
          {showAdd && (
            <div style={{ padding: 16, marginBottom: 14, borderRadius: 12, background: 'rgba(127,184,151,0.04)', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>New parcel</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} placeholder="Tracking number *" style={{ ...inp, fontFamily: 'monospace' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} style={inp}>
                    {CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} style={inp}>
                    <option value="inbound">Inbound (to me)</option>
                    <option value="outbound">Outbound (to customer)</option>
                  </select>
                </div>
                <input value={form.order_reference} onChange={e => setForm(f => ({ ...f, order_reference: e.target.value }))} placeholder="Order reference (e.g. Order #1052)" style={inp} />
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. Stock from ALM)" style={inp} />
                <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, marginTop: 4 }}>Recipient (optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} placeholder="Name" style={inp} />
                  <input value={form.recipient_phone} onChange={e => setForm(f => ({ ...f, recipient_phone: e.target.value }))} placeholder="Phone" style={inp} />
                </div>
                <input value={form.recipient_address} onChange={e => setForm(f => ({ ...f, recipient_address: e.target.value }))} placeholder="Address" style={inp} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                  <input value={form.recipient_city} onChange={e => setForm(f => ({ ...f, recipient_city: e.target.value }))} placeholder="City" style={inp} />
                  <input value={form.recipient_state} onChange={e => setForm(f => ({ ...f, recipient_state: e.target.value }))} placeholder="State" style={inp} />
                  <input value={form.recipient_postcode} onChange={e => setForm(f => ({ ...f, recipient_postcode: e.target.value }))} placeholder="Postcode" style={inp} />
                </div>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" style={inp} />
                {addErr && <div style={{ fontSize: 12, color: C.red }}>{addErr}</div>}
                <button onClick={addParcel} disabled={adding} style={{ height: 38, borderRadius: 8, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1, fontFamily: FONT }}>
                  {adding ? 'Adding…' : 'Add & track'}
                </button>
              </div>
            </div>
          )}

          {/* Bulk form */}
          {showBulk && (
            <div style={{ padding: 16, marginBottom: 14, borderRadius: 12, background: 'rgba(127,184,151,0.04)', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Bulk import (CSV)</div>
              <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, lineHeight: 1.5 }}>Columns: tracking_number, carrier, recipient_name, recipient_phone, order_reference</div>
              <textarea value={bulkCsv} onChange={e => setBulkCsv(e.target.value)} rows={5}
                placeholder={'tracking_number,carrier,recipient_name,recipient_phone,order_reference\nEP123456789AU,auspost,Jane Doe,0400000000,ORD-001'}
                style={{ ...inp, height: 'auto', padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginBottom: 10 }} />
              <button onClick={runBulk} disabled={!bulkCsv.trim()} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: C.sage, color: '#fff', fontSize: 13, fontWeight: 700, cursor: bulkCsv.trim() ? 'pointer' : 'not-allowed', opacity: bulkCsv.trim() ? 1 : 0.5, fontFamily: FONT }}>Import batch</button>
              {bulkResult && <div style={{ fontSize: 12, color: bulkResult.startsWith('Imported') ? C.green : C.red, marginTop: 8 }}>{bulkResult}</div>}
            </div>
          )}

          {/* List */}
          {view === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
              ) : !parcels.length ? (
                <div style={{ padding: '48px 20px', textAlign: 'center', color: C.dim, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
                  <Package size={28} style={{ color: C.dim, opacity: 0.5, marginBottom: 10 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: C.text }}>No parcels tracked yet</div>
                  <div style={{ fontSize: 12, color: C.dim }}>Click &quot;Add parcel&quot; to start tracking</div>
                </div>
              ) : parcels.map(p => {
                const isSelected = selected?.id === p.id
                const DirIcon = p.direction === 'inbound' ? ArrowDownToLine : ArrowUpFromLine
                return (
                  <div key={p.id} onClick={() => setSelected(p)} className="parcel-card" style={{
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    background: isSelected ? 'rgba(127,184,151,0.08)' : C.card,
                    border: `1px solid ${isSelected ? C.green + '60' : C.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <DirIcon size={12} style={{ color: C.dim, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.tracking_number}</span>
                        </div>
                        {(p.order_reference || p.recipient_name) && (
                          <div style={{ fontSize: 12, color: C.muted, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.order_reference ?? ''}{p.order_reference && p.recipient_name ? ' · ' : ''}{p.recipient_name ?? ''}
                          </div>
                        )}
                        {p.label && !p.order_reference && (
                          <div style={{ fontSize: 12, color: C.dim, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                        )}
                        <Badge status={p.status} />
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        {p.estimated_delivery && !['delivered', 'cancelled', 'failed'].includes(p.status) && (
                          <div style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>ETA {fmt(p.estimated_delivery)}</div>
                        )}
                        {p.delivered_at && (
                          <div style={{ fontSize: 11, color: C.green, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <PackageCheck size={11} /> {fmt(p.delivered_at)}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{p.carrier_name}</div>
                      </div>
                      <ChevronRight size={14} style={{ color: C.dim, alignSelf: 'center', flexShrink: 0 }} />
                    </div>
                    {p.predicted_late && p.aria_insight && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                        <Sparkles size={13} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{p.aria_insight}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Analytics */}
          {view === 'analytics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!analytics?.summary ? (
                <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
                      <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Total (90 days)</p>
                      <p style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 0' }}>{analytics.summary.total}</p>
                    </div>
                    <div style={{ padding: 14, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
                      <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Top carrier</p>
                      <p style={{ fontSize: 15, fontWeight: 700, color: C.green, margin: '6px 0 0' }}>{analytics.summary.top_carrier ?? '—'}</p>
                    </div>
                  </div>
                  {(analytics.summary.exceptions.stuck + analytics.summary.exceptions.failed + analytics.summary.exceptions.returned) > 0 && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: C.red, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={14} />
                      Exceptions — Stuck {analytics.summary.exceptions.stuck} · Failed {analytics.summary.exceptions.failed} · Returned {analytics.summary.exceptions.returned}
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>By carrier</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {analytics.summary.by_carrier.map(c => (
                        <div key={c.carrier} style={{ padding: '10px 12px', borderRadius: 10, background: C.card, border: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.name}</span>
                            <span style={{ fontSize: 11, color: C.muted }}>{c.total} parcels</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: C.dim }}>
                            <span>{c.avg_days ? `Avg ${c.avg_days}d` : 'No data'}</span>
                            <span style={{ color: c.exception_rate > 10 ? C.red : C.dim }}>{c.exception_rate}% exceptions</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Monthly volume</p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72, padding: 4, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
                      {(() => {
                        const max = Math.max(1, ...analytics.summary!.monthly.map(m => m.count))
                        return analytics.summary!.monthly.slice(-12).map(m => (
                          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={`${m.month}: ${m.count}`}>
                            <div style={{ width: '100%', background: C.green, borderRadius: '3px 3px 0 0', height: `${(m.count / max) * 100}%`, minHeight: 3 }} />
                            <span style={{ fontSize: 9, color: C.dim }}>{m.month.slice(5)}</span>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — detail */}
        <div style={{ flex: 1, padding: '0 28px 28px 28px', minWidth: 0 }}>
          {!selected ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: C.dim, background: C.card, borderRadius: 12, border: `1px dashed ${C.border}` }}>
              <Truck size={48} style={{ color: C.dim, opacity: 0.4, marginBottom: 16 }} />
              <div style={{ fontSize: 14 }}>Select a parcel to view tracking details</div>
            </div>
          ) : (
            <>
              {/* Detail header */}
              <div style={{ padding: 20, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Badge status={selected.status} size="md" />
                      {selected.manual_status && (
                        <span style={{ fontSize: 10, color: C.amber, background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>manually set</span>
                      )}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', marginBottom: 6 }}>{selected.tracking_number}</div>
                    <div style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{selected.carrier_name}</span>
                      <span style={{ color: C.dim }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {selected.direction === 'inbound' ? <><ArrowDownToLine size={11} /> Inbound</> : <><ArrowUpFromLine size={11} /> Outbound</>}
                      </span>
                      {selected.order_reference && <><span style={{ color: C.dim }}>·</span><span>{selected.order_reference}</span></>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => predictDelivery(selected.id)} disabled={predLoading}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.violet, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      <Sparkles size={13} /> {predLoading ? '…' : 'Predict'}
                    </button>
                    <a href={`/track/${encodeURIComponent(selected.tracking_number)}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, textDecoration: 'none' }}>
                      <LinkIcon size={13} /> Share
                    </a>
                    <button onClick={() => refresh(selected.id)} disabled={refreshing === selected.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      <RefreshCcw size={13} className={refreshing === selected.id ? 'spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => remove(selected.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
                {prediction?.prediction && (
                  <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', color: C.violet, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={14} />
                    {prediction.prediction}
                  </div>
                )}
              </div>

              {/* Quick stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Status',       value: cfgFor(selected.status).label },
                  { label: 'Est. delivery', value: fmt(selected.estimated_delivery) },
                  { label: 'Delivered',    value: fmt(selected.delivered_at) },
                  { label: 'Last updated', value: fmtDT(selected.last_checked_at) },
                ].map(item => (
                  <div key={item.label} style={{ background: C.card, borderRadius: 10, padding: '10px 14px', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Split: timeline + recipient/manual */}
              <div className="parcel-detail-split" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
                {/* Timeline */}
                <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Tracking events</div>
                  {selected.status_detail && (
                    <div style={{ padding: '10px 12px', background: 'rgba(127,184,151,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted, marginBottom: 14 }}>
                      {selected.status_detail}
                    </div>
                  )}
                  {!selected.events?.length ? (
                    <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, padding: '24px 0', lineHeight: 1.6 }}>
                      <div style={{ marginBottom: 8, color: C.muted, fontWeight: 600 }}>No tracking events yet</div>
                      Set <code style={{ background: 'rgba(127,184,151,0.1)', padding: '1px 6px', borderRadius: 4 }}>TRACK17_API_KEY</code> in Vercel env vars<br />
                      Webhook: <code style={{ background: 'rgba(127,184,151,0.1)', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>ariaos.site/api/pos/parcel-tracking/webhook</code><br />
                      <a href="https://features.17track.net/en/api" target="_blank" rel="noopener" style={{ color: C.green }}>Sign up free at 17track.net</a>
                    </div>
                  ) : (
                    <div>
                      {selected.events.map((ev, i) => (
                        <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
                          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: i === 0 ? C.green : 'transparent', border: `2px solid ${i === 0 ? C.green : C.border}`, marginTop: 2, flexShrink: 0 }} />
                            {i < selected.events.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, minHeight: 16, marginTop: 4 }} />}
                          </div>
                          <div style={{ flex: 1, paddingBottom: 6 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? C.text : C.muted, marginBottom: 4 }}>{ev.description}</div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.dim, flexWrap: 'wrap' }}>
                              {ev.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {ev.location}</span>}
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {fmtDT(ev.time)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recipient + manual override */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {selected.recipient_name && (
                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Recipient</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{selected.recipient_name}</div>
                      {selected.recipient_phone && <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{selected.recipient_phone}</div>}
                      {(selected.recipient_address || selected.recipient_city) && (
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
                          {selected.recipient_address && <div>{selected.recipient_address}</div>}
                          {(selected.recipient_city || selected.recipient_state || selected.recipient_postcode) && (
                            <div>{[selected.recipient_city, selected.recipient_state, selected.recipient_postcode].filter(Boolean).join(' ')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Manual status override</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {MANUAL_STATUSES.map(ms => {
                        const isActive = selected.status === ms.value
                        const c = STATUS_CFG[ms.value]
                        return (
                          <button key={ms.value} onClick={() => setManualStatus(selected.id, ms.value)} disabled={saving} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            height: 36, padding: '0 12px', borderRadius: 8,
                            border: `1px solid ${isActive ? c.color : C.border}`,
                            background: isActive ? c.color + '18' : 'transparent',
                            color: isActive ? c.color : C.muted,
                            fontSize: 13, cursor: 'pointer', fontFamily: FONT, fontWeight: 600,
                            textAlign: 'left',
                          }}>
                            <c.Icon size={14} />
                            {ms.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {selected.notes && (
                    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Notes</div>
                      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>{selected.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes parcel-spin { to { transform: rotate(360deg); } }
        .spin { animation: parcel-spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

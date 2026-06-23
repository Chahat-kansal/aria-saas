'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

interface Product { id: string; name: string; sku: string | null; barcode: string | null; price: number | null }
interface Template { id: string; name: string; [k: string]: unknown }
interface Business { id: string; trading_name: string | null; name: string | null }
interface CanvasEl { id: string; type: string; x: number; y: number; w: number; h: number; text: string; color: string; bg: string; fontSize: number; bold: boolean }
interface Batch { id: string; name: string; status: string; item_count: number; created_by: string; created_at: string; printed_at: string | null; template_id: string | null }
interface BatchItem { id: string; product_id: string; product_name: string; product_sku: string | null; qty: number; price_snapshot: number; was_price_snapshot: number | null; promo_label: string | null }
interface BatchDetail { batch: Batch; items: BatchItem[] }
interface Props { business: Business; products: Product[]; templates: Template[] }

const SIZES: Record<string, { label: string; w: number; h: number }> = {
  shelf:    { label: 'Shelf edge',   w: 580, h: 90  },
  standard: { label: 'Standard',     w: 283, h: 198 },
  small:    { label: 'Small label',  w: 200, h: 141 },
  a6:       { label: 'A6 promo',     w: 397, h: 283 },
  a4:       { label: 'A4 poster',    w: 566, h: 800 },
  a0:       { label: 'A0 poster',    w: 400, h: 566 },
}

const PRESETS = [
  { k: 'standard',  label: 'Standard',     bg: '#ffffff', band: '#374151', bandText: '#ffffff', price: '#111827' },
  { k: 'woolies',   label: 'Special',      bg: '#ffffff', band: '#00853F', bandText: '#FFD700', price: '#111827' },
  { k: 'coles',     label: 'Member',       bg: '#ffffff', band: '#D41227', bandText: '#ffffff', price: '#111827' },
  { k: 'multibuy',  label: 'Multi-buy',    bg: '#1a4a7a', band: '#FFD700', bandText: '#111827', price: '#FFD700' },
  { k: 'clearance', label: 'Clearance',    bg: '#D41227', band: '#111827', bandText: '#ffffff', price: '#ffffff' },
  { k: 'premium',   label: 'Premium',      bg: '#111827', band: '#374151', bandText: '#9ca3af', price: '#ffffff' },
]

const ELEM_TYPES: { type: string; label: string }[] = [
  { type: 'promo_band',    label: 'Promo band'    },
  { type: 'product_name',  label: 'Product name'  },
  { type: 'price_block',   label: 'Price block'   },
  { type: 'barcode',       label: 'Barcode + SKU' },
  { type: 'member_price',  label: 'Member price'  },
  { type: 'per_unit',      label: 'Per-unit price' },
  { type: 'savings',       label: 'You save'      },
  { type: 'logo',          label: 'Logo area'     },
  { type: 'custom_text',   label: 'Custom text'   },
]

function fitZoom(w: number, h: number) { return Math.min(560 / w, 400 / h, 1) }

function defaultEls(w: number, h: number): CanvasEl[] {
  return [
    { id: 'el-1', type: 'promo_band',   x: 0, y: 0,                   w, h: Math.round(h * 0.2),  text: 'PRICE',        color: '#ffffff', bg: '#374151', fontSize: 13, bold: true },
    { id: 'el-2', type: 'product_name', x: 6, y: Math.round(h * 0.22), w: w - 12, h: Math.round(h * 0.28), text: 'Product Name', color: '#111827', bg: 'transparent', fontSize: 14, bold: false },
    { id: 'el-3', type: 'price_block',  x: 6, y: Math.round(h * 0.52), w: w - 12, h: Math.round(h * 0.36), text: '$0.00',        color: '#111827', bg: 'transparent', fontSize: 28, bold: true  },
  ]
}

const G = '#7FB897'
const BG = '#0d0d14'
const PANEL = '#13131a'
const BORDER = 'rgba(255,255,255,0.07)'
const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 6, color: '#e5e7eb', fontSize: 11, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 10, color: '#6b7280', display: 'block', marginBottom: 3 }
const sec: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, marginTop: 14 }

export default function PriceTicketApp({ products, templates: initTpls }: Props) {
  const [tab, setTab] = useState<'design' | 'print' | 'batches'>('design')
  // TICKETS-REBUILD+BATCH-1 — scanned batches from the inventory app.
  const [batches, setBatches] = useState<Batch[]>([])
  const [batchesState, setBatchesState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [activeBatch, setActiveBatch] = useState<BatchDetail | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [sizeKey, setSizeKey] = useState('standard')
  const [cw, setCw] = useState(283)
  const [ch, setCh] = useState(198)
  const [zoom, setZoom] = useState(() => fitZoom(283, 198))
  const [canvasBg, setCanvasBg] = useState('#ffffff')
  const [elements, setElements] = useState<CanvasEl[]>(() => defaultEls(283, 198))
  const [selId, setSelId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ id: string; sx: number; sy: number; ow: number; oh: number } | null>(null)
  const [templates, setTemplates] = useState(initTpls)
  const [aiInput, setAiInput] = useState('')
  const [aiSugg, setAiSugg] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [printProds, setPrintProds] = useState<Set<string>>(new Set())
  const [copies, setCopies] = useState(1)
  const [selTpl, setSelTpl] = useState(initTpls[0]?.id ?? '')
  const [printing, setPrinting] = useState(false)
  const [saving, setSaving] = useState(false)
  // TICKETS-FIX — name input (not the button label), the row being edited (update vs insert), default flag.
  const [tplName, setTplName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)

  const loadTemplateObj = useCallback((t: Template) => {
    setEditingId(t.id)
    setTplName(String(t.name ?? ''))
    setIsDefault(Boolean(t.is_default))
    const els = Array.isArray(t.canvas_elements) ? (t.canvas_elements as unknown as CanvasEl[]) : []
    if (els.length) setElements(els)
    if (t.background_color) setCanvasBg(String(t.background_color))
    const w = Number(t.width_mm) || 283, h = Number(t.height_mm) || 198
    setCw(w); setCh(h); setZoom(fitZoom(w, h))
    if (typeof t.layout === 'string' && SIZES[t.layout]) setSizeKey(t.layout)
    setSelId(null)
  }, [])

  // Round-trip: on load, render the active (default, else newest) saved template so the design comes back.
  useEffect(() => {
    const def = initTpls.find(t => (t as { is_default?: boolean }).is_default) ?? initTpls[initTpls.length - 1]
    const ce = def ? (def as Record<string, unknown>).canvas_elements : null
    if (def && Array.isArray(ce) && ce.length) loadTemplateObj(def)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function mv(e: MouseEvent) {
      if (dragRef.current) {
        const d = dragRef.current
        const dx = (e.clientX - d.sx) / zoom
        const dy = (e.clientY - d.sy) / zoom
        setElements(p => p.map(el => el.id === d.id ? { ...el, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) } : el))
      } else if (resizeRef.current) {
        const r = resizeRef.current
        const dx = (e.clientX - r.sx) / zoom
        const dy = (e.clientY - r.sy) / zoom
        setElements(p => p.map(el => el.id === r.id ? { ...el, w: Math.max(30, Math.round(r.ow + dx)), h: Math.max(16, Math.round(r.oh + dy)) } : el))
      }
    }
    function up() { dragRef.current = null; resizeRef.current = null }
    document.addEventListener('mousemove', mv)
    document.addEventListener('mouseup', up)
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up) }
  }, [zoom])

  const onDrag = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelId(id)
    const el = elements.find(x => x.id === id)
    if (el) dragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y }
  }, [elements])

  const onResize = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const el = elements.find(x => x.id === id)
    if (el) resizeRef.current = { id, sx: e.clientX, sy: e.clientY, ow: el.w, oh: el.h }
  }, [elements])

  function addEl(type: string) {
    const label = ELEM_TYPES.find(e => e.type === type)?.label ?? type
    const id = `el-${Date.now()}`
    setElements(p => [...p, { id, type, x: 10, y: 10, w: cw - 20, h: 40, text: label, color: '#111827', bg: 'transparent', fontSize: 14, bold: false }])
    setSelId(id)
  }

  function setSize(key: string) {
    const { w: nw, h: nh } = SIZES[key]
    const sx = nw / cw, sy = nh / ch
    setElements(p => p.map(el => ({ ...el, x: Math.round(el.x * sx), y: Math.round(el.y * sy), w: Math.round(el.w * sx), h: Math.round(el.h * sy) })))
    setCw(nw); setCh(nh); setSizeKey(key)
    setZoom(key === 'a0' ? 0.47 : fitZoom(nw, nh))
  }

  function applyPreset(p: typeof PRESETS[0]) {
    setCanvasBg(p.bg)
    setElements(prev => prev.map(el =>
      el.type === 'promo_band'  ? { ...el, bg: p.band, color: p.bandText } :
      el.type === 'price_block' ? { ...el, color: p.price } : el
    ))
  }

  function moveLayer(id: string, dir: 1 | -1) {
    setElements(prev => {
      const idx = prev.findIndex(e => e.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const a = [...prev]
      ;[a[idx], a[next]] = [a[next], a[idx]]
      return a
    })
  }

  async function saveTemplate() {
    // TICKETS-FIX — name from the real input (reject empty / the button label); send the API's ACTUAL field
    // names (canvas_elements/background_color/width_mm/height_mm) so the design is no longer dropped; UPDATE the
    // same row when editing (updated_at moves) instead of inserting a duplicate.
    const name = tplName.trim()
    if (!name || name.toLowerCase() === 'save') { alert('Give the template a name before saving.'); return }
    setSaving(true)
    try {
      const payload = {
        name,
        canvas_elements: elements,
        background_color: canvasBg,
        width_mm: cw, height_mm: ch,
        layout: sizeKey,
        is_default: isDefault,
      }
      const url = editingId ? `/api/tickets/templates/${editingId}` : '/api/tickets/templates'
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json())
      if (res.template) {
        const t = res.template as Template
        setTemplates(p => [...p.filter(x => x.id !== t.id), t])
        setEditingId(t.id); setSelTpl(t.id)
      } else if (res.error) { alert('Save failed: ' + res.error) }
    } finally { setSaving(false) }
  }

  async function deleteTemplate() {
    if (!editingId) return
    if (!confirm('Delete this template?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tickets/templates/${editingId}`, { method: 'DELETE' }).then(r => r.json())
      if (res.ok) {
        setTemplates(p => p.filter(x => x.id !== editingId))
        setEditingId(null); setTplName(''); setIsDefault(false); setElements(defaultEls(cw, ch)); setSelId(null)
      }
    } finally { setSaving(false) }
  }

  async function askAria() {
    if (!aiInput.trim()) return
    setAiLoading(true); setAiSugg('')
    try {
      const res = await fetch('/api/tickets/ai-suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiInput, size: sizeKey }) }).then(r => r.json())
      setAiSugg(res.suggestion || 'Couldn’t reach the assistant — try a bold promo band, high price/background contrast, and a large price font.')
    } catch { setAiSugg('Couldn’t reach the assistant just now.') }
    setAiLoading(false)
  }

  async function printTickets() {
    if (!printProds.size || !selTpl) return
    setPrinting(true)
    try {
      const res = await fetch('/api/tickets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [...printProds], templateId: selTpl, copies }),
      })
      if (res.ok) {
        const html = await res.text()
        const w = window.open('', '_blank')
        if (w) { w.document.write(html); w.document.close() }
      }
    } finally { setPrinting(false) }
  }

  const loadBatches = useCallback(async () => {
    setBatchesState('loading')
    try {
      const d = await fetch('/api/tickets/batches').then(r => r.json())
      setBatches(d.batches ?? []); setBatchesState('ok')
    } catch { setBatchesState('error') }
  }, [])
  useEffect(() => { loadBatches() }, [loadBatches])

  async function openBatch(id: string) {
    setBatchBusy(true)
    try {
      const d = await fetch(`/api/tickets/batches/${id}`).then(r => r.json())
      if (d.batch) setActiveBatch(d as BatchDetail)
    } finally { setBatchBusy(false) }
  }
  async function printBatch() {
    if (!activeBatch || !selTpl) return
    setBatchBusy(true)
    try {
      const res = await fetch(`/api/tickets/batches/${activeBatch.batch.id}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: selTpl }) })
      if (res.ok) {
        const html = await res.text()
        const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() }
        setActiveBatch(a => a ? { ...a, batch: { ...a.batch, status: 'printed' } } : a)
        loadBatches()
      }
    } finally { setBatchBusy(false) }
  }

  const selEl = elements.find(e => e.id === selId)
  const updEl = (id: string, u: Partial<CanvasEl>) => setElements(p => p.map(e => e.id === id ? { ...e, ...u } : e))

  return (
    <div style={{ background: BG, color: '#e5e7eb', minHeight: '100vh', fontFamily: 'Inter,system-ui,sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: PANEL, borderBottom: `1px solid ${BORDER}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#fff', fontSize: 17, margin: 0, lineHeight: 1 }}>Price Tickets</h1>
          <p style={{ fontSize: 10, color: '#6b7280', margin: 0 }}>Design · Print</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Tabs */}
          {(['design', 'print', 'batches'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: tab === t ? G : 'rgba(255,255,255,0.06)', color: tab === t ? '#070d09' : 'rgba(255,255,255,0.55)', transition: 'all 0.15s' }}>
              {t === 'design' ? 'Design canvas' : t === 'print' ? 'Print' : `Scanned batches${batches.filter(b => b.status !== 'printed').length ? ` (${batches.filter(b => b.status !== 'printed').length})` : ''}`}
            </button>
          ))}
          {templates.length > 0 && (
            <select value={editingId ?? ''} onChange={e => { if (e.target.value) { const t = templates.find(x => x.id === e.target.value); if (t) loadTemplateObj(t) } else { setEditingId(null); setTplName(''); setIsDefault(false); setElements(defaultEls(cw, ch)); setSelId(null) } }}
              style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: '#e5e7eb', fontSize: 12, padding: '5px 8px', cursor: 'pointer' }}>
              <option value="">＋ New template</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name as string}{(t as { is_default?: boolean }).is_default ? ' ★' : ''}</option>)}
            </select>
          )}
          <input value={tplName} onChange={e => setTplName(e.target.value)} placeholder="Template name"
            style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, color: '#e5e7eb', fontSize: 12, padding: '5px 10px', width: 130 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> Default
          </label>
          <button onClick={saveTemplate} disabled={saving} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${G}`, cursor: 'pointer', background: editingId ? 'transparent' : G, color: editingId ? G : '#070d09' }}>
            {saving ? 'Saving…' : editingId ? 'Update' : 'Save template'}
          </button>
          {editingId && <button onClick={deleteTemplate} disabled={saving} title="Delete template" style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid rgba(239,68,68,0.4)', cursor: 'pointer', background: 'transparent', color: '#f87171' }}>Delete</button>}
        </div>
      </div>

      {/* DESIGN TAB */}
      {tab === 'design' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left panel */}
          <div style={{ width: 196, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: '12px 10px', overflowY: 'auto', background: PANEL }}>

            <p style={sec}>Presets</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 14 }}>
              {PRESETS.map(p => (
                <button key={p.k} onClick={() => applyPreset(p)} title={p.label}
                  style={{ height: 46, borderRadius: 7, cursor: 'pointer', border: `2px solid ${p.band}`, overflow: 'hidden', position: 'relative', background: p.bg, padding: 0 }}>
                  {/* Mini ticket preview */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '35%', background: p.band }} />
                  <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: p.price, fontWeight: 700 }}>$0.00</div>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '35%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 7, color: p.bandText, fontWeight: 700, textTransform: 'uppercase' }}>{p.label}</span>
                  </div>
                </button>
              ))}
            </div>

            <p style={sec}>Size</p>
            <select value={sizeKey} onChange={e => setSize(e.target.value)} style={{ ...inp, marginBottom: 14 }}>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            <p style={sec}>Add element</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {ELEM_TYPES.map(({ type, label }) => (
                <button key={type} onClick={() => addEl(type)}
                  style={{ textAlign: 'left', padding: '5px 8px', borderRadius: 6, fontSize: 11, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: G }}>+</span> {label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <p style={sec}>Ask Aria</p>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="Describe your style…" style={{ ...inp, marginBottom: 4 }} />
              <button onClick={askAria} disabled={aiLoading} style={{ width: '100%', padding: '5px', borderRadius: 6, border: 'none', cursor: 'pointer', background: G, color: '#070d09', fontSize: 11, fontWeight: 600 }}>
                {aiLoading ? 'Thinking…' : 'Go'}
              </button>
              {aiSugg && <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af', lineHeight: 1.55, padding: 7, background: 'rgba(127,184,151,0.07)', borderRadius: 6 }}>{aiSugg}</div>}
            </div>
          </div>

          {/* Canvas area */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', background: BG }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 0', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={() => setZoom(z => Math.max(0.15, z - 0.1))} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 13 }}>−</button>
              <span style={{ fontSize: 11, color: '#6b7280', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 13 }}>+</button>
              <button onClick={() => setZoom(fitZoom(cw, ch))} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>Fit</button>
              {selId && <>
                <div style={{ width: 1, height: 16, background: BORDER, margin: '0 2px' }} />
                <button onClick={() => moveLayer(selId, -1)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>↑ Forward</button>
                <button onClick={() => moveLayer(selId, 1)} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>↓ Back</button>
                <button onClick={() => { setElements(p => p.filter(e => e.id !== selId)); setSelId(null) }} style={{ padding: '3px 9px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', background: 'rgba(239,68,68,0.07)', color: '#f87171', fontSize: 11 }}>Delete</button>
              </>}
            </div>

            {/* Canvas */}
            <div style={{ transformOrigin: 'top center', transform: `scale(${zoom})`, flexShrink: 0, marginBottom: 40 }}>
              <div onClick={() => setSelId(null)}
                style={{ position: 'relative', width: cw, height: ch, background: canvasBg, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', cursor: 'default' }}>
                {elements.map(el => (
                  <div key={el.id} onMouseDown={e => onDrag(e, el.id)}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, background: el.bg === 'transparent' ? 'transparent' : el.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', outline: selId === el.id ? `2px dashed ${G}` : 'none', outlineOffset: 1, boxSizing: 'border-box' }}>
                    <span style={{ fontSize: el.fontSize, color: el.color, fontWeight: el.bold ? 700 : 400, pointerEvents: 'none', userSelect: 'none', textAlign: 'center', lineHeight: 1.2 }}>{el.text}</span>
                    {selId === el.id && (
                      <div onMouseDown={e => onResize(e, el.id)}
                        style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, background: G, cursor: 'se-resize', borderRadius: '2px 0 0 0' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ width: 196, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, padding: '12px 10px', overflowY: 'auto', background: PANEL }}>
            {selEl ? (
              <>
                <p style={{ ...sec, marginTop: 0, color: G }}>Element</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, textTransform: 'capitalize' }}>{selEl.type.replace(/_/g, ' ')}</p>

                <label style={lbl}>Text</label>
                <input value={selEl.text} onChange={e => updEl(selEl.id, { text: e.target.value })} style={{ ...inp, marginBottom: 8 }} />

                <label style={lbl}>Font size</label>
                <input type="number" min={6} max={120} value={selEl.fontSize} onChange={e => updEl(selEl.id, { fontSize: Number(e.target.value) })} style={{ ...inp, marginBottom: 8 }} />

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                  <input type="checkbox" checked={selEl.bold} onChange={e => updEl(selEl.id, { bold: e.target.checked })} />
                  Bold
                </label>

                <p style={sec}>Position & size</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
                  {(['x', 'y', 'w', 'h'] as const).map(k => (
                    <div key={k}>
                      <label style={lbl}>{k.toUpperCase()}</label>
                      <input type="number" value={selEl[k]} onChange={e => updEl(selEl.id, { [k]: Number(e.target.value) })} style={inp} />
                    </div>
                  ))}
                </div>

                <p style={sec}>Colours</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Text</label>
                    <input type="color" value={selEl.color} onChange={e => updEl(selEl.id, { color: e.target.value })} style={{ width: '100%', height: 28, borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Fill</label>
                    <input type="color" value={selEl.bg === 'transparent' ? '#ffffff' : selEl.bg} onChange={e => updEl(selEl.id, { bg: e.target.value })} style={{ width: '100%', height: 28, borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer' }} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <p style={{ ...sec, marginTop: 0 }}>Canvas</p>
                <label style={lbl}>Background</label>
                <input type="color" value={canvasBg} onChange={e => setCanvasBg(e.target.value)} style={{ width: '100%', height: 28, borderRadius: 5, border: `1px solid ${BORDER}`, cursor: 'pointer', marginBottom: 12 }} />
              </>
            )}

            <p style={sec}>Layers</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[...elements].reverse().map(el => (
                <div key={el.id} onClick={() => setSelId(el.id)}
                  style={{ padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, background: selId === el.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selId === el.id ? 'rgba(127,184,151,0.3)' : BORDER}`, color: selId === el.id ? G : 'rgba(255,255,255,0.6)' }}>
                  {el.type.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* PRINT TAB */}
      {tab === 'print' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: 16, overflowY: 'auto', background: PANEL }}>
            <p style={{ ...sec, marginTop: 0 }}>Products</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={() => setPrintProds(new Set(products.map(p => p.id)))} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>All</button>
              <button onClick={() => setPrintProds(new Set())} style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', color: '#9ca3af', fontSize: 11 }}>None</button>
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
              {products.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.8)', borderBottom: `1px solid ${BORDER}` }}>
                  <input type="checkbox" checked={printProds.has(p.id)} onChange={e => {
                    const s = new Set(printProds)
                    e.target.checked ? s.add(p.id) : s.delete(p.id)
                    setPrintProds(s)
                  }} />
                  {p.name}
                  <span style={{ marginLeft: 'auto', color: G, fontSize: 11 }}>${(Number(p.price) || 0).toFixed(2)}</span>
                </label>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
              <label style={lbl}>Copies per ticket</label>
              <input type="number" min={1} max={100} value={copies} onChange={e => setCopies(Math.max(1, Math.min(100, Number(e.target.value))))} style={{ ...inp, marginBottom: 8 }} />
              <label style={lbl}>Template</label>
              <select value={selTpl} onChange={e => setSelTpl(e.target.value)} style={{ ...inp, marginBottom: 4 }}>
                <option value="">Select template…</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name as string}</option>)}
              </select>
              {templates.length === 0 && <p style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>Save a template first in the Design canvas tab.</p>}
            </div>
          </div>

          <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '16px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, maxWidth: 360 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Print summary</p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0' }}>{printProds.size} products × {copies} copies = <span style={{ color: G, fontWeight: 600 }}>{printProds.size * copies} tickets</span></p>
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0' }}>Template: {templates.find(t => t.id === selTpl)?.name as string ?? '—'}</p>
            </div>
            <button onClick={printTickets} disabled={printing || !printProds.size || !selTpl}
              style={{ alignSelf: 'flex-start', padding: '10px 24px', borderRadius: 10, border: 'none', cursor: printing || !printProds.size || !selTpl ? 'not-allowed' : 'pointer', background: printing || !printProds.size || !selTpl ? 'rgba(127,184,151,0.3)' : G, color: '#070d09', fontSize: 13, fontWeight: 600 }}>
              {printing ? 'Opening…' : `Print ${printProds.size * copies} ticket${printProds.size * copies !== 1 ? 's' : ''}`}
            </button>
            <p style={{ fontSize: 11, color: '#6b7280' }}>Opens in a new tab. Use Ctrl+P / Cmd+P to print to your label printer or PDF.</p>
          </div>
        </div>
      )}

      {/* SCANNED BATCHES TAB */}
      {tab === 'batches' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${BORDER}`, padding: 16, overflowY: 'auto', background: PANEL }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ ...sec, marginTop: 0, marginBottom: 0 }}>Scanned batches</p>
              <button onClick={loadBatches} style={{ fontSize: 10, color: '#9ca3af', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>Refresh</button>
            </div>
            {batchesState === 'loading' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[...Array(3)].map((_, i) => <div key={i} style={{ height: 58, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }} />)}</div>
            ) : batchesState === 'error' ? (
              <div style={{ padding: 16, textAlign: 'center' }}><p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>Couldn’t load batches</p><button onClick={loadBatches} style={{ fontSize: 11, color: G, background: 'transparent', border: `1px solid ${G}`, borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>Retry</button></div>
            ) : batches.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}><div style={{ fontSize: 26, marginBottom: 6 }}>🏷️</div><p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.5 }}>No scanned batches yet. Staff build these in the inventory app — scan items into a batch and they appear here to print.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {batches.map(b => {
                  const sc = b.status === 'printed' ? '#34d399' : '#f59e0b'
                  return (
                    <button key={b.id} onClick={() => openBatch(b.id)} style={{ textAlign: 'left', background: activeBatch?.batch.id === b.id ? 'rgba(127,184,151,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${activeBatch?.batch.id === b.id ? 'rgba(127,184,151,0.35)' : BORDER}`, borderRadius: 9, padding: '10px 12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <b style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>{b.name}</b>
                        <span style={{ fontSize: 9, fontWeight: 700, color: sc, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{b.status}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: '#6b7280' }}>{b.item_count} item{b.item_count === 1 ? '' : 's'} · {b.created_by} · {new Date(b.created_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            {!activeBatch ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 13 }}>{batchBusy ? 'Loading…' : 'Select a batch to view its tickets and print.'}</div>
            ) : (
              <div style={{ maxWidth: 560 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h2 style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#fff', fontSize: 19, margin: 0 }}>{activeBatch.batch.name}</h2>
                    <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{activeBatch.items.length} products · {activeBatch.items.reduce((s, i) => s + i.qty, 0)} tickets · {activeBatch.batch.status}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
                  {activeBatch.items.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
                      <div><span style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 600 }}>{it.product_name}</span>{it.product_sku && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 6 }}>SKU {it.product_sku}</span>}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{it.was_price_snapshot != null ? <span><span style={{ textDecoration: 'line-through', opacity: 0.6 }}>${it.was_price_snapshot.toFixed(2)}</span> <span style={{ color: G }}>${it.price_snapshot.toFixed(2)}</span>{it.promo_label ? ` · ${it.promo_label}` : ''}</span> : <span style={{ color: G }}>${it.price_snapshot.toFixed(2)}</span>}</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>×{it.qty}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
                  <label style={lbl}>Template (WYSIWYG — prints the canvas design)</label>
                  <select value={selTpl} onChange={e => setSelTpl(e.target.value)} style={{ ...inp, marginBottom: 12 }}>
                    <option value="">Select template…</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name as string}{(t as { is_default?: boolean }).is_default ? ' ★' : ''}</option>)}
                  </select>
                  {templates.length === 0 && <p style={{ fontSize: 10, color: '#f59e0b', marginBottom: 8 }}>Design + save a template first.</p>}
                  <button onClick={printBatch} disabled={batchBusy || !selTpl} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: (batchBusy || !selTpl) ? 'not-allowed' : 'pointer', background: (batchBusy || !selTpl) ? 'rgba(127,184,151,0.3)' : G, color: '#070d09', fontSize: 13, fontWeight: 600 }}>
                    {batchBusy ? 'Opening…' : `Print batch (${activeBatch.items.reduce((s, i) => s + i.qty, 0)} tickets)`}
                  </button>
                  <p style={{ fontSize: 10, color: '#6b7280', marginTop: 8, textAlign: 'center' }}>Prices are the snapshot from when staff scanned — a later price change won’t alter this batch.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

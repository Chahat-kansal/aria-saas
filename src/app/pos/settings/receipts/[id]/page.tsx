'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

type CompType = 'header'|'products'|'tax'|'totals'|'payments'|'loyalty'|
  'barcode'|'outlet_logo'|'surcharge'|'gift_cards'|'account'|
  'tax_indicator'|'external_receipt'|'text'|'image'|'columns'|'spacer'

interface Comp { type: CompType; config: Record<string, unknown> }

const PALETTE: { type: CompType; icon: string; label: string }[] = [
  { type:'header',           icon:'H',   label:'Header'        },
  { type:'barcode',          icon:'|||', label:'Barcode'       },
  { type:'outlet_logo',      icon:'🏷',  label:'Outlet Logo'   },
  { type:'products',         icon:'🛒',  label:'Products'      },
  { type:'tax',              icon:'%',   label:'Tax'           },
  { type:'tax_indicator',    icon:'✕',   label:'Tax Indicator' },
  { type:'payments',         icon:'💳',  label:'Payments'      },
  { type:'surcharge',        icon:'+',   label:'Surcharge'     },
  { type:'loyalty',          icon:'🏆',  label:'Loyalty'       },
  { type:'account',          icon:'👤',  label:'Account'       },
  { type:'totals',           icon:'Σ',   label:'Totals'        },
  { type:'gift_cards',       icon:'🎁',  label:'Gift Cards'    },
  { type:'external_receipt', icon:'📄',  label:'Ext. Receipt'  },
  { type:'text',             icon:'T',   label:'Custom Text'   },
  { type:'image',            icon:'🖼',  label:'Image'         },
  { type:'columns',          icon:'⊞',  label:'Columns'       },
  { type:'spacer',           icon:'—',   label:'Spacer'        },
]

// Renders a component inside the white receipt card preview
function renderComp(comp: Comp): React.ReactNode {
  const S: React.CSSProperties = { fontSize: 11, fontFamily: "'Courier New',monospace", color: '#000' }
  const LINE = <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />
  const ROW = (l: string, r: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', ...S }}>
      <span>{l}</span><span>{r}</span>
    </div>
  )
  const footer = (comp.config.footer as string) || ''
  switch (comp.type) {
    case 'header': return (
      <div style={{ textAlign: 'center', ...S }}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{(comp.config.business_name as string) || 'Your Business Name'}</div>
        <div style={{ color: '#555', fontSize: 10 }}>123 Main St, Melbourne VIC 3000</div>
        <div style={{ color: '#555', fontSize: 10 }}>ABN: 12 345 678 901</div>
        {LINE}
        <div style={{ fontWeight: 'bold' }}>TAX INVOICE</div>
        <div>6 May 2026 · 4:22 PM · Inv #8939</div>
        {footer ? <div style={{ marginTop: 4, fontSize: 10, color: '#444' }}>{footer}</div> : null}
      </div>
    )
    case 'products': return (
      <div style={S}>
        {LINE}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span style={{ flex: 1 }}>Item</span>
          <span style={{ width: 25, textAlign: 'center' }}>Qty</span>
          <span style={{ width: 55, textAlign: 'right' }}>Price</span>
        </div>
        {LINE}
        {[['Coffee (large)', '2', '$9.80'], ['Blueberry muffin*', '1', '$5.50']].map(([n, q, p]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1 }}>{n}</span>
            <span style={{ width: 25, textAlign: 'center' }}>{q}</span>
            <span style={{ width: 55, textAlign: 'right' }}>{p}</span>
          </div>
        ))}
      </div>
    )
    case 'tax':          return <div style={S}>{LINE}{ROW('GST (10% incl.):', '$1.39')}</div>
    case 'totals':       return (
      <div style={S}>
        {LINE}
        {ROW('Subtotal:', '$15.30')}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13 }}>
          <span>TOTAL:</span><span>$15.30</span>
        </div>
      </div>
    )
    case 'payments':     return <div style={S}>{LINE}{ROW('EFTPOS:', '$15.30')}</div>
    case 'loyalty':      return <div style={S}>{LINE}{ROW('Points earned:', '15')}{ROW('Total points:', '210')}</div>
    case 'surcharge':    return <div style={S}>{ROW('Card surcharge (1.5%):', '$0.23')}</div>
    case 'gift_cards':   return <div style={S}>{ROW('Gift Card:', '-$10.00')}</div>
    case 'account':      return <div style={S}>{ROW('Account – Jane Smith:', '$50.00')}</div>
    case 'tax_indicator': return <div style={{ ...S, fontSize: 9, color: '#666' }}>* = GST applicable</div>
    case 'external_receipt': return (
      <div style={{ ...S, textAlign: 'center', border: '1px dashed #ccc', padding: 4 }}>[External Receipt]</div>
    )
    case 'barcode': return (
      <div style={{ textAlign: 'center', ...S }}>
        <div style={{ fontSize: 20, letterSpacing: 2 }}>{'|'.repeat(28)}</div>
        <div>00008939</div>
      </div>
    )
    case 'outlet_logo': return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, border: '1px dashed #ccc', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa' }}>
          LOGO
        </div>
      </div>
    )
    case 'text': return (
      <div style={{
        ...S,
        textAlign: (comp.config.align as React.CSSProperties['textAlign']) || 'center',
        fontWeight: comp.config.bold ? 'bold' : 'normal',
        fontSize: comp.config.size === 'large' ? 14 : comp.config.size === 'small' ? 9 : 11,
      }}>
        {(comp.config.text as string) || <span style={{ color: '#bbb' }}>← add text in the panel →</span>}
      </div>
    )
    case 'image': {
      const url = comp.config.url as string
      const h   = (comp.config.height as number) || 80
      return url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={(comp.config.alt as string) || ''} style={{ width: '100%', maxHeight: h, objectFit: 'contain' }} />
      ) : (
        <div style={{ width: '100%', height: h, border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa', flexDirection: 'column', gap: 4 }}>
          🖼 <span>Add image URL in the panel →</span>
        </div>
      )
    }
    case 'columns': return (
      <div style={{ display: 'flex', gap: 4, ...S }}>
        <div style={{ flex: 1, border: '1px dashed #ccc', padding: 4, textAlign: 'center', color: '#aaa' }}>Column 1</div>
        <div style={{ flex: 1, border: '1px dashed #ccc', padding: 4, textAlign: 'center', color: '#aaa' }}>Column 2</div>
      </div>
    )
    case 'spacer': return <div style={{ height: (comp.config.height as number) || 12 }} />
    default: return <div style={{ fontSize: 9, color: '#aaa' }}>[{comp.type}]</div>
  }
}

// Config panel for the selected component — shows relevant controls for its type
function CompConfig({ comp, onChange, onRemove }: {
  comp: Comp
  onChange: (key: string, value: unknown) => void
  onRemove: () => void
}) {
  const iCls: React.CSSProperties = { width: '100%', background: 'rgba(15,25,45,0.8)', border: '1px solid #2A2A4A', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'rgba(220,240,255,0.9)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const lCls: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
  const pillBtn = (active: boolean): React.CSSProperties => ({ flex: 1, padding: '6px', borderRadius: 7, fontSize: 11, border: `1px solid ${active ? '#8B5CF6' : '#2A2A4A'}`, background: active ? 'rgba(139,92,246,0.15)' : 'transparent', color: active ? '#8B5CF6' : 'rgba(130,160,200,0.7)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: 12, fontWeight: 700, color: '#8B5CF6', textTransform: 'capitalize' }}>
        ✎ Editing: {comp.type.replace(/_/g, ' ')}
      </div>

      {/* Header config */}
      {comp.type === 'header' && (
        <>
          <div>
            <label style={lCls}>Business name override</label>
            <input value={(comp.config.business_name as string) || ''} onChange={e => onChange('business_name', e.target.value)} placeholder="Leave blank to use account name" style={iCls} />
          </div>
          <div>
            <label style={lCls}>Footer / tagline</label>
            <input value={(comp.config.footer as string) || ''} onChange={e => onChange('footer', e.target.value)} placeholder="e.g. Thank you for your visit!" style={iCls} />
          </div>
        </>
      )}

      {/* Text config */}
      {comp.type === 'text' && (
        <>
          <div>
            <label style={lCls}>Content</label>
            <textarea rows={3} value={(comp.config.text as string) || ''}
              onChange={e => onChange('text', e.target.value)}
              placeholder="Type your text here…"
              style={{ ...iCls, fontFamily: "'Courier New',monospace", resize: 'vertical' }} />
          </div>
          <div>
            <label style={lCls}>Alignment</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['left', 'center', 'right'].map(a => (
                <button key={a} onClick={() => onChange('align', a)} style={pillBtn(comp.config.align === a)}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lCls}>Size</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['small','Small'],['normal','Normal'],['large','Large']].map(([v, l]) => (
                <button key={v} onClick={() => onChange('size', v)} style={pillBtn((comp.config.size || 'normal') === v)}>{l}</button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!comp.config.bold} onChange={e => onChange('bold', e.target.checked)} />
            <span style={{ fontSize: 12, color: 'rgba(220,240,255,0.8)' }}>Bold</span>
          </label>
        </>
      )}

      {/* Image config */}
      {comp.type === 'image' && (
        <>
          <div>
            <label style={lCls}>Image URL</label>
            <input value={(comp.config.url as string) || ''} onChange={e => onChange('url', e.target.value)} placeholder="https://example.com/logo.png" style={iCls} />
            <p style={{ fontSize: 10, color: 'rgba(80,110,150,0.7)', marginTop: 4 }}>Paste a public image URL. It will appear in the receipt preview above.</p>
          </div>
          <div>
            <label style={lCls}>Alt text</label>
            <input value={(comp.config.alt as string) || ''} onChange={e => onChange('alt', e.target.value)} placeholder="e.g. Business logo" style={iCls} />
          </div>
          <div>
            <label style={lCls}>Max height (px)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[40, 60, 80, 100, 120].map(h => (
                <button key={h} onClick={() => onChange('height', h)} style={pillBtn((comp.config.height || 80) === h)}>{h}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Spacer config */}
      {comp.type === 'spacer' && (
        <div>
          <label style={lCls}>Height</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {[4, 8, 12, 16, 24, 32].map(h => (
              <button key={h} onClick={() => onChange('height', h)} style={pillBtn((comp.config.height || 12) === h)}>{h}px</button>
            ))}
          </div>
        </div>
      )}

      {/* Components that use live sale data — no config needed */}
      {['products','tax','totals','payments','loyalty','surcharge','gift_cards','account','tax_indicator','barcode','outlet_logo','external_receipt','columns'].includes(comp.type) && (
        <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.6)', lineHeight: 1.6, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
          This component automatically fills with real data from the sale when printing. No manual configuration needed.
        </p>
      )}

      <button onClick={onRemove} style={{ marginTop: 4, padding: '8px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
        🗑 Remove this component
      </button>
    </div>
  )
}

export default function ReceiptBuilderPage() {
  const { id }    = useParams() as { id: string }
  const router    = useRouter()
  const [name, setName]       = useState('New Receipt')
  const [rtype, setRtype]     = useState<'normal' | 'email'>('normal')
  const [forType, setForType] = useState<'sale' | 'payment'>('sale')
  const [comps, setComps]     = useState<Comp[]>([
    { type: 'header',   config: {} },
    { type: 'products', config: {} },
    { type: 'tax',      config: {} },
    { type: 'totals',   config: {} },
    { type: 'payments', config: {} },
  ])
  const [selIdx, setSelIdx]   = useState<number | null>(null)
  const [tab, setTab]         = useState<'add' | 'edit'>('add')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [loading, setLoading] = useState(true)
  const selRef = useRef(selIdx)
  selRef.current = selIdx  // keep ref in sync for use in closures

  useEffect(() => {
    fetch(`/api/pos/receipt-templates/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.template) {
          setName(d.template.name || 'New Receipt')
          setRtype(d.template.type || 'normal')
          setForType(d.template.for_type || 'sale')
          if (Array.isArray(d.template.components) && d.template.components.length) {
            setComps(d.template.components)
          }
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  async function save() {
    setSaving(true)
    const res = await fetch('/api/pos/receipt-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, type: rtype, for_type: forType, components: comps }),
    })
    const d = await res.json()
    setMsg(d.error ? `Error: ${d.error}` : 'Saved ✓')
    setTimeout(() => setMsg(''), 3000)
    setSaving(false)
  }

  function addComp(type: CompType) {
    const newIdx = comps.length
    setComps(p => [...p, { type, config: {} }])
    setSelIdx(newIdx)
    setTab('edit')  // auto-switch to edit panel so user sees config immediately
  }

  function removeComp(i: number) {
    setComps(p => p.filter((_, j) => j !== i))
    setSelIdx(null)
    setTab('add')
  }

  // Updates a config key on the selected component — drives live preview
  function updateCfg(i: number, key: string, value: unknown) {
    setComps(p => p.map((c, j) => j === i ? { ...c, config: { ...c.config, [key]: value } } : c))
  }

  function selectComp(i: number) {
    setSelIdx(i)
    setTab('edit')
  }

  function onDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDropIdx(null); return }
    const arr = [...comps]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(targetIdx, 0, item)
    setComps(arr)
    // Keep selection on the moved item
    if (selIdx === dragIdx) setSelIdx(targetIdx)
    setDragIdx(null); setDropIdx(null)
  }

  function preview() {
    const body = comps.map(c => {
      switch (c.type) {
        case 'header':   return `<div style="text-align:center"><strong style="font-size:13px">${(c.config.business_name as string)||'Your Business'}</strong><br><span style="font-size:10px;color:#666">123 Main St, Melbourne VIC 3000 | ABN: 12 345 678 901</span></div><hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="text-align:center"><strong>TAX INVOICE</strong></div><div style="text-align:center">6 May 2026 · 4:22 PM · Inv #8939</div>${(c.config.footer as string)?`<div style="text-align:center;font-size:10px;color:#444;margin-top:4px">${c.config.footer}</div>`:''}`
        case 'products': return `<hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="display:flex;font-weight:bold"><span style="flex:1">Item</span><span>Qty</span><span style="margin-left:8px">Total</span></div><hr style="border:none;border-top:1px dashed #000;margin:3px 0"><div style="display:flex"><span style="flex:1">Coffee (large)</span><span>2</span><span style="margin-left:8px">$9.80</span></div><div style="display:flex"><span style="flex:1">Blueberry muffin*</span><span>1</span><span style="margin-left:8px">$5.50</span></div>`
        case 'tax':      return `<hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="display:flex;justify-content:space-between"><span>GST (10% incl.):</span><span>$1.39</span></div>`
        case 'totals':   return `<hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>$15.30</span></div>`
        case 'payments': return `<hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="display:flex;justify-content:space-between"><span>EFTPOS:</span><span>$15.30</span></div>`
        case 'loyalty':  return `<hr style="border:none;border-top:1px dashed #000;margin:5px 0"><div style="display:flex;justify-content:space-between"><span>Points earned:</span><span>15</span></div>`
        case 'tax_indicator': return `<div style="font-size:9px;color:#666">* = GST applicable</div>`
        case 'spacer':   return `<div style="height:${(c.config.height as number)||12}px"></div>`
        case 'text':     return `<div style="text-align:${(c.config.align as string)||'center'};font-weight:${c.config.bold?'bold':'normal'};font-size:${c.config.size==='large'?14:c.config.size==='small'?9:11}px">${(c.config.text as string)||''}</div>`
        case 'image':    return (c.config.url as string) ? `<img src="${c.config.url}" alt="${(c.config.alt as string)||''}" style="width:100%;max-height:${(c.config.height as number)||80}px;object-fit:contain">` : ''
        case 'barcode':  return `<div style="text-align:center"><div style="font-size:18px;letter-spacing:2px">${'|'.repeat(24)}</div><div>00008939</div></div>`
        default:         return ''
      }
    }).filter(Boolean).join('\n')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;width:300px;padding:12px}@media print{@page{size:80mm auto;margin:0}body{width:80mm;padding:4mm}}</style></head><body>${body}</body></html>`
    const w = window.open('', '_blank', 'width=420,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#030510', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Manrope,system-ui' }}>Loading…</div>
  )

  const selComp = selIdx !== null && selIdx < comps.length ? comps[selIdx] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif", background: '#12112a', color: 'rgba(220,240,255,0.9)' }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px', borderBottom: '1px solid #2A2A4A', background: '#0e0d22', flexShrink: 0 }}>
        <button onClick={() => router.push('/pos/settings/receipts')} style={{ background: 'none', border: 'none', color: '#8888AA', cursor: 'pointer', fontSize: 20, padding: '0 4px' }}>←</button>
        <span style={{ color: '#8888AA', fontSize: 13 }}>Receipt Templates /</span>
        <input value={name} onChange={e => setName(e.target.value)} style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(220,240,255,0.95)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', minWidth: 140, flex: 1 }} />
        {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#EF4444' : '#22C55E' }}>{msg}</span>}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button onClick={preview} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #2A2A4A', background: 'transparent', color: 'rgba(220,240,255,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🖨 Preview &amp; Print</button>
          <button onClick={() => router.push('/pos/settings/receipts')} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #2A2A4A', background: 'transparent', color: 'rgba(220,240,255,0.7)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 22px', borderRadius: 7, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — RECEIPT PREVIEW (55%) */}
        <div style={{ flex: '0 0 55%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px', gap: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(80,110,150,0.6)', marginBottom: 14 }}>80mm Receipt Preview — click a row to edit it</p>
          <div style={{ width: 300, background: '#fff', borderRadius: 4, padding: '16px 14px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', minHeight: 400 }}>
            {comps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc', fontSize: 12 }}>
                Add components from the right panel →
              </div>
            ) : (
              comps.map((comp, i) => (
                <div key={i} draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setDropIdx(i); }}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
                  onClick={() => selectComp(i)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 4,
                    padding: '3px 2px', borderRadius: 3, cursor: 'pointer',
                    outline: selIdx === i ? '2px solid #2563EB' : dropIdx === i ? '2px dashed #8B5CF6' : 'none',
                    outlineOffset: 2,
                    background: dragIdx === i ? 'rgba(139,92,246,0.06)' : 'transparent',
                    transition: 'outline 100ms',
                  }}>
                  <span style={{ fontSize: 12, color: '#ccc', cursor: 'grab', userSelect: 'none', flexShrink: 0, marginTop: 3, paddingRight: 2 }}>⠿</span>
                  <div style={{ flex: 1, minWidth: 0 }}>{renderComp(comp)}</div>
                  <button onClick={e => { e.stopPropagation(); removeComp(i); }}
                    style={{ background: 'none', border: 'none', color: '#ddd', cursor: 'pointer', fontSize: 15, flexShrink: 0, padding: '0 3px', lineHeight: 1 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#ddd')}>×</button>
                </div>
              ))
            )}
          </div>
          <p style={{ marginTop: 10, fontSize: 10, color: 'rgba(80,110,150,0.5)' }}>Drag ⠿ to reorder · Click to select + edit · × to remove</p>
        </div>

        {/* RIGHT — ADD / EDIT PANEL (45%) */}
        <div style={{ flex: '0 0 45%', borderLeft: '1px solid #2A2A4A', background: '#14132b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2A2A4A', flexShrink: 0 }}>
            {[['add', '+ Add Component'], ['edit', '✎ Edit Selected']].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v as 'add' | 'edit')}
                style={{ flex: 1, padding: '11px', border: 'none', background: tab === v ? 'rgba(139,92,246,0.1)' : 'transparent', color: tab === v ? '#8B5CF6' : 'rgba(130,160,200,0.65)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === v ? '2px solid #8B5CF6' : '2px solid transparent' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {tab === 'add' ? (
              <>
                <p style={{ fontSize: 11, color: 'rgba(130,160,200,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  Click a component to add it to the receipt. Then click it in the preview to edit its settings.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {PALETTE.map(p => (
                    <button key={p.type} onClick={() => addComp(p.type)}
                      style={{ padding: '12px 8px', borderRadius: 10, border: '1px solid #2A2A4A', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#8B5CF6'; e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A2A4A'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}>
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{p.icon}</span>
                      <span style={{ fontSize: 10, color: 'rgba(180,200,240,0.8)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{p.label}</span>
                    </button>
                  ))}
                </div>

                {/* Template-level settings */}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #2A2A4A', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(80,110,150,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Template Settings</p>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', marginBottom: 5 }}>Type</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['normal', 'Print'], ['email', 'Email']].map(([v, l]) => (
                        <button key={v} onClick={() => setRtype(v as 'normal' | 'email')}
                          style={{ flex: 1, padding: '7px', borderRadius: 7, border: `1px solid ${rtype === v ? '#8B5CF6' : '#2A2A4A'}`, background: rtype === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: rtype === v ? '#8B5CF6' : 'rgba(130,160,200,0.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', marginBottom: 5 }}>Used For</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['sale', 'Sale'], ['payment', 'Payment']].map(([v, l]) => (
                        <button key={v} onClick={() => setForType(v as 'sale' | 'payment')}
                          style={{ flex: 1, padding: '7px', borderRadius: 7, border: `1px solid ${forType === v ? '#8B5CF6' : '#2A2A4A'}`, background: forType === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: forType === v ? '#8B5CF6' : 'rgba(130,160,200,0.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : selComp !== null && selIdx !== null ? (
              <CompConfig
                comp={selComp}
                onChange={(key, value) => updateCfg(selIdx, key, value)}
                onRemove={() => removeComp(selIdx)}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'rgba(130,160,200,0.5)', textAlign: 'center', padding: 24 }}>
                <span style={{ fontSize: 32 }}>←</span>
                <p style={{ fontSize: 13 }}>Click any component in the receipt preview to edit its settings here.</p>
                <p style={{ fontSize: 11 }}>Or switch to the Add tab to add new components.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

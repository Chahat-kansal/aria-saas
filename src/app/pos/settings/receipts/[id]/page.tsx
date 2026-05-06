'use client'
import { useState, useEffect } from 'react'
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
  { type:'text',             icon:'T',   label:'Text'          },
  { type:'image',            icon:'🖼',  label:'Image'         },
  { type:'columns',          icon:'⊞',  label:'Columns'       },
  { type:'spacer',           icon:'—',   label:'Spacer'        },
]

function renderComp(comp: Comp) {
  const S: React.CSSProperties = { fontSize: 11, fontFamily: "'Courier New',monospace", color: '#000' }
  const LINE = <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />
  const ROW = (l: string, r: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', ...S }}>
      <span>{l}</span><span>{r}</span>
    </div>
  )
  switch (comp.type) {
    case 'header': return (
      <div style={{ textAlign: 'center', ...S }}>
        <div style={{ fontWeight: 'bold', fontSize: 13 }}>Business Name Pty Ltd</div>
        <div style={{ color: '#555', fontSize: 10 }}>123 Main St, Melbourne VIC 3000</div>
        <div style={{ color: '#555', fontSize: 10 }}>ABN: 12 345 678 901</div>
        {LINE}
        <div style={{ fontWeight: 'bold' }}>TAX INVOICE</div>
        <div>6th May 2026 4:22 PM</div>
        <div>Inv No #00008939</div>
      </div>
    )
    case 'products': return (
      <div style={S}>
        {LINE}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
          <span style={{ flex: 1 }}>Product</span>
          <span style={{ width: 25, textAlign: 'center' }}>Qty</span>
          <span style={{ width: 55, textAlign: 'right' }}>Price</span>
        </div>
        {LINE}
        {[['Test Product', '2', '$19.98'], ['Test GST*', '1', '$9.99']].map(([n, q, p]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1 }}>{n}</span>
            <span style={{ width: 25, textAlign: 'center' }}>{q}</span>
            <span style={{ width: 55, textAlign: 'right' }}>{p}</span>
          </div>
        ))}
      </div>
    )
    case 'tax':          return <div style={S}>{LINE}{ROW('GST Included:', '$2.91')}</div>
    case 'totals':       return (
      <div style={S}>
        {LINE}
        {ROW('Subtotal:', '$29.97')}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13 }}>
          <span>TOTAL:</span><span>$29.97</span>
        </div>
      </div>
    )
    case 'payments':     return <div style={S}>{LINE}{ROW('EFTPOS:', '$29.97')}</div>
    case 'loyalty':      return <div style={S}>{LINE}{ROW('Points earned:', '30')}{ROW('Total points:', '150')}</div>
    case 'surcharge':    return <div style={S}>{ROW('Surcharge (2%):', '$0.60')}</div>
    case 'gift_cards':   return <div style={S}>{ROW('Gift Card:', '-$10.00')}</div>
    case 'account':      return <div style={S}>{ROW('Account Balance:', '$50.00')}</div>
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
        <div style={{ width: 60, height: 60, border: '1px dashed #ccc', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa' }}>
          LOGO
        </div>
      </div>
    )
    case 'text': return (
      <div style={{ ...S, textAlign: (comp.config.align as React.CSSProperties['textAlign']) || 'center', fontWeight: comp.config.bold ? 'bold' : 'normal', fontSize: comp.config.size === 'large' ? 14 : comp.config.size === 'small' ? 9 : 11 }}>
        {(comp.config.text as string) || 'Custom text here'}
      </div>
    )
    case 'image': return (
      <div style={{ width: '100%', height: 40, border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa' }}>
        IMAGE
      </div>
    )
    case 'columns': return (
      <div style={{ display: 'flex', gap: 4 }}>
        <div style={{ flex: 1, border: '1px dashed #ccc', padding: 2, fontSize: 9, color: '#aaa', textAlign: 'center' }}>Col 1</div>
        <div style={{ flex: 1, border: '1px dashed #ccc', padding: 2, fontSize: 9, color: '#aaa', textAlign: 'center' }}>Col 2</div>
      </div>
    )
    case 'spacer': return <div style={{ height: (comp.config.height as number) || 12 }} />
    default: return <div style={{ fontSize: 9, color: '#aaa' }}>[{comp.type}]</div>
  }
}

export default function ReceiptBuilderPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [name, setName]       = useState('New Receipt')
  const [rtype, setRtype]     = useState<'normal' | 'email'>('normal')
  const [forType, setForType] = useState<'sale' | 'payment'>('sale')
  const [comps, setComps]     = useState<Comp[]>([
    { type: 'header', config: {} }, { type: 'products', config: {} },
    { type: 'tax', config: {} },    { type: 'totals', config: {} },
    { type: 'payments', config: {} },
  ])
  const [selIdx, setSelIdx]   = useState<number | null>(null)
  const [tab, setTab]         = useState<'components' | 'settings'>('components')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/pos/receipt-templates/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.template) {
          setName(d.template.name)
          setRtype(d.template.type || 'normal')
          setForType(d.template.for_type || 'sale')
          if (d.template.components?.length) setComps(d.template.components)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  async function save() {
    setSaving(true)
    await fetch('/api/pos/receipt-templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, type: rtype, for_type: forType, components: comps }),
    })
    setMsg('Saved ✓')
    setTimeout(() => setMsg(''), 2000)
    setSaving(false)
  }

  function addComp(type: CompType) {
    setComps(p => [...p, { type, config: {} }])
    setSelIdx(comps.length)
    setTab('settings')
  }

  function removeComp(i: number) {
    setComps(p => p.filter((_, j) => j !== i))
    setSelIdx(null)
  }

  function updateCfg(i: number, k: string, v: unknown) {
    setComps(p => p.map((c, j) => j === i ? { ...c, config: { ...c.config, [k]: v } } : c))
  }

  function onDrop(i: number) {
    if (dragIdx === null) return
    const arr = [...comps]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(i, 0, item)
    setComps(arr)
    setDragIdx(null); setDropIdx(null)
  }

  function preview() {
    const rows = comps.map(c => {
      switch (c.type) {
        case 'header':   return `<div style="text-align:center"><strong style="font-size:13px">Business Name Pty Ltd</strong><br><span style="font-size:10px;color:#666">123 Main St, Melbourne VIC 3000</span><br><span style="font-size:10px;color:#666">ABN: 12 345 678 901</span></div><div style="border-top:1px dashed #000;margin:5px 0"></div><div style="text-align:center"><strong>TAX INVOICE</strong></div><div style="text-align:center">6th May 2026 4:22 PM</div><div style="text-align:center">Inv No #00008939</div>`
        case 'products': return `<div style="border-top:1px dashed #000;margin:5px 0"></div><div style="display:flex;justify-content:space-between;font-weight:bold"><span style="flex:1">Product</span><span>Qty</span><span>Price</span></div><div style="border-top:1px dashed #000;margin:3px 0"></div><div style="display:flex;justify-content:space-between"><span style="flex:1">Test Product</span><span>2</span><span>$19.98</span></div>`
        case 'tax':      return `<div style="border-top:1px dashed #000;margin:5px 0"></div><div style="display:flex;justify-content:space-between"><span>GST Included:</span><span>$2.91</span></div>`
        case 'totals':   return `<div style="border-top:1px dashed #000;margin:5px 0"></div><div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>$29.97</span></div>`
        case 'payments': return `<div style="border-top:1px dashed #000;margin:5px 0"></div><div style="display:flex;justify-content:space-between"><span>EFTPOS:</span><span>$29.97</span></div>`
        case 'loyalty':  return `<div style="border-top:1px dashed #000;margin:5px 0"></div><div style="display:flex;justify-content:space-between"><span>Points earned:</span><span>30</span></div>`
        case 'spacer':   return `<div style="height:${(c.config.height as number) || 12}px"></div>`
        case 'text':     return `<div style="text-align:${(c.config.align as string) || 'center'};font-weight:${c.config.bold ? 'bold' : 'normal'}">${(c.config.text as string) || 'Custom text'}</div>`
        default:         return `<div style="font-size:9px;color:#aaa">[${c.type}]</div>`
      }
    }).join('\n')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt Preview</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:11px;width:300px;padding:12px;background:#fff;color:#000}@media print{@page{size:80mm auto;margin:0}body{width:80mm;padding:4mm}}</style></head><body>${rows}</body></html>`
    const w = window.open('', '_blank', 'width=400,height=700')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 400)
  }

  const selComp = selIdx !== null ? comps[selIdx] : null

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#030510', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Manrope,system-ui' }}>Loading…</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif", background: '#1a1a2e', color: 'rgba(220,240,255,0.9)' }}>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #2A2A4A', background: '#12122a', flexShrink: 0 }}>
        <button onClick={() => router.push('/pos/settings/receipts')}
          style={{ background: 'none', border: 'none', color: '#8888AA', cursor: 'pointer', fontSize: 20 }}>←</button>
        <span style={{ color: '#8888AA', fontSize: 14 }}>Receipt —</span>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ background: 'none', border: 'none', outline: 'none', color: 'rgba(220,240,255,0.9)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', minWidth: 120 }} />
        {msg && <span style={{ fontSize: 12, color: '#22C55E', marginLeft: 8 }}>{msg}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button onClick={preview}
            style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #2A2A4A', background: 'transparent', color: 'rgba(220,240,255,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Preview</button>
          <button onClick={() => router.push('/pos/settings/receipts')}
            style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #2A2A4A', background: 'transparent', color: 'rgba(220,240,255,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* BODY: 55% preview / 45% palette+settings */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — RECEIPT PREVIEW */}
        <div style={{ flex: '0 0 55%', overflowY: 'auto', background: '#1a1a2e', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px' }}>
          <div style={{ width: 300, background: '#fff', borderRadius: 4, padding: '16px 14px', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', minHeight: 400 }}>
            {comps.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#ccc', fontSize: 12 }}>
                Click components on the right to add them here
              </div>
            )}
            {comps.map((comp, i) => (
              <div key={i} draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => { e.preventDefault(); setDropIdx(i); }}
                onDrop={() => onDrop(i)}
                onClick={() => { setSelIdx(selIdx === i ? null : i); setTab('settings'); }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 4, padding: '3px 0', borderRadius: 2, cursor: 'pointer', outline: selIdx === i ? '2px solid #2563EB' : 'none', outlineOffset: 2, background: dropIdx === i ? 'rgba(37,99,235,0.1)' : 'transparent' }}>
                <span style={{ fontSize: 14, color: '#ccc', cursor: 'grab', userSelect: 'none', flexShrink: 0, marginTop: 2 }}>⠿</span>
                <div style={{ flex: 1 }}>{renderComp(comp)}</div>
                <button onClick={e => { e.stopPropagation(); removeComp(i); }}
                  style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: '0 2px', lineHeight: 1 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}>×</button>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12, fontSize: 11, color: 'rgba(80,110,150,0.6)' }}>Drag to reorder · Click × to remove · Click row to configure</p>
        </div>

        {/* RIGHT — PALETTE + SETTINGS */}
        <div style={{ flex: '0 0 45%', borderLeft: '1px solid #2A2A4A', background: '#14142a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2A2A4A', flexShrink: 0 }}>
            {[['components', 'Components'], ['settings', 'Settings']].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v as 'components' | 'settings')}
                style={{ flex: 1, padding: '12px', border: 'none', background: tab === v ? 'rgba(139,92,246,0.1)' : 'transparent', color: tab === v ? '#8B5CF6' : 'rgba(130,160,200,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', borderBottom: tab === v ? '2px solid #8B5CF6' : '2px solid transparent' }}>
                {l}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {tab === 'components' ? (
              <>
                <p style={{ fontSize: 11, color: 'rgba(130,160,200,0.6)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Click to add to receipt
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  {PALETTE.map(p => (
                    <button key={p.type} onClick={() => addComp(p.type)}
                      style={{ padding: '12px 8px', borderRadius: 10, border: '1px solid #2A2A4A', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'border-color 150ms,background 150ms' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#8B5CF6'; e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#2A2A4A'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{p.icon}</span>
                      <span style={{ fontSize: 10, color: 'rgba(180,200,240,0.8)', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{p.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Template settings */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Template Name</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    style={{ width: '100%', background: 'rgba(15,25,45,0.8)', border: '1px solid #2A2A4A', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: 'rgba(220,240,255,0.9)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Type</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['normal', 'Normal'], ['email', 'Email']].map(([v, l]) => (
                      <button key={v} onClick={() => setRtype(v as 'normal' | 'email')}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${rtype === v ? '#8B5CF6' : '#2A2A4A'}`, background: rtype === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: rtype === v ? '#8B5CF6' : 'rgba(130,160,200,0.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(130,160,200,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>For</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['sale', 'Sale'], ['payment', 'Payment']].map(([v, l]) => (
                      <button key={v} onClick={() => setForType(v as 'sale' | 'payment')}
                        style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${forType === v ? '#8B5CF6' : '#2A2A4A'}`, background: forType === v ? 'rgba(139,92,246,0.15)' : 'transparent', color: forType === v ? '#8B5CF6' : 'rgba(130,160,200,0.7)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected component settings */}
                {selComp && (
                  <div style={{ padding: 14, borderRadius: 10, border: '1px solid #2A2A4A', background: 'rgba(139,92,246,0.05)' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#8B5CF6', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Selected: {selComp.type}
                    </p>
                    {selComp.type === 'text' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea rows={3} value={(selComp.config.text as string) || ''}
                          onChange={e => updateCfg(selIdx!, 'text', e.target.value)}
                          placeholder="Enter your text…"
                          style={{ width: '100%', background: 'rgba(15,25,45,0.8)', border: '1px solid #2A2A4A', borderRadius: 7, padding: '8px', fontSize: 12, color: 'rgba(220,240,255,0.9)', outline: 'none', fontFamily: "'Courier New',monospace", resize: 'vertical', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          {['left', 'center', 'right'].map(a => (
                            <button key={a} onClick={() => updateCfg(selIdx!, 'align', a)}
                              style={{ flex: 1, padding: '5px', borderRadius: 6, fontSize: 11, border: `1px solid ${selComp.config.align === a ? '#8B5CF6' : '#2A2A4A'}`, background: selComp.config.align === a ? 'rgba(139,92,246,0.15)' : 'transparent', color: selComp.config.align === a ? '#8B5CF6' : 'rgba(130,160,200,0.7)', cursor: 'pointer', fontFamily: 'inherit' }}>{a}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {selComp.type === 'spacer' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[4, 8, 12, 16, 24].map(h => (
                          <button key={h} onClick={() => updateCfg(selIdx!, 'height', h)}
                            style={{ flex: 1, padding: '5px', borderRadius: 6, fontSize: 11, border: `1px solid ${selComp.config.height === h ? '#8B5CF6' : '#2A2A4A'}`, background: selComp.config.height === h ? 'rgba(139,92,246,0.15)' : 'transparent', color: selComp.config.height === h ? '#8B5CF6' : 'rgba(130,160,200,0.7)', cursor: 'pointer', fontFamily: 'inherit' }}>{h}px</button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => removeComp(selIdx!)}
                      style={{ marginTop: 12, width: '100%', padding: '8px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      🗑 Remove component
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

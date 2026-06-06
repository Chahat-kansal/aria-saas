'use client'
import { useState, useEffect } from 'react'

type Align = 'left' | 'center' | 'right'
type Size = 'sm' | 'md' | 'lg'

interface Block {
  id: string
  type: string
  show: boolean
  align: Align
  size: Size
  bold: boolean
  italic: boolean
  text?: string
  lineStyle?: 'solid' | 'dashed'
}

const CATALOG = [
  { type: 'business_name', label: 'Business Name', icon: '🏪' },
  { type: 'address',       label: 'Address',        icon: '📍' },
  { type: 'phone',         label: 'Phone / Website', icon: '📞' },
  { type: 'divider',       label: 'Divider',         icon: '—'  },
  { type: 'items_table',   label: 'Sale Items',      icon: '🛒' },
  { type: 'totals',        label: 'Totals',           icon: '💰' },
  { type: 'payment',       label: 'Payment Method',  icon: '💳' },
  { type: 'cashier',       label: 'Cashier Name',    icon: '👤' },
  { type: 'datetime',      label: 'Date & Time',     icon: '🕐' },
  { type: 'thankyou',      label: 'Thank You',        icon: '🙏' },
  { type: 'custom_text',   label: 'Custom Text',     icon: '✏️' },
  { type: 'barcode',       label: 'Barcode',          icon: '▊'  },
  { type: 'qr_code',       label: 'QR Code',         icon: '⊞'  },
]

const DEFAULT_BLOCKS: Block[] = [
  { id: 'b1',  type: 'business_name', show: true, align: 'center', size: 'lg', bold: true,  italic: false },
  { id: 'b2',  type: 'address',       show: true, align: 'center', size: 'sm', bold: false, italic: false },
  { id: 'b3',  type: 'phone',         show: true, align: 'center', size: 'sm', bold: false, italic: false },
  { id: 'b4',  type: 'divider',       show: true, align: 'center', size: 'sm', bold: false, italic: false, lineStyle: 'solid' },
  { id: 'b5',  type: 'items_table',   show: true, align: 'left',   size: 'sm', bold: false, italic: false },
  { id: 'b6',  type: 'divider',       show: true, align: 'center', size: 'sm', bold: false, italic: false, lineStyle: 'dashed' },
  { id: 'b7',  type: 'totals',        show: true, align: 'right',  size: 'md', bold: false, italic: false },
  { id: 'b8',  type: 'payment',       show: true, align: 'left',   size: 'sm', bold: false, italic: false },
  { id: 'b9',  type: 'divider',       show: true, align: 'center', size: 'sm', bold: false, italic: false, lineStyle: 'solid' },
  { id: 'b10', type: 'thankyou',      show: true, align: 'center', size: 'md', bold: false, italic: true,  text: 'Thank you for shopping with us!' },
  { id: 'b11', type: 'datetime',      show: true, align: 'center', size: 'sm', bold: false, italic: false },
  { id: 'b12', type: 'cashier',       show: true, align: 'center', size: 'sm', bold: false, italic: false },
]

function mkId() { return Math.random().toString(36).slice(2, 9) }
function textSz(s: Size) { return s === 'lg' ? 16 : s === 'md' ? 13 : 11 }

function BlockPreview({ block, selected, onClick }: { block: Block; selected: boolean; onClick: () => void }) {
  const wrap: React.CSSProperties = {
    cursor: 'pointer', padding: '3px 4px', borderRadius: 4,
    border: selected ? '2px dashed #6366f1' : '2px solid transparent',
    background: selected ? 'rgba(99,102,241,0.06)' : 'transparent',
    opacity: block.show ? 1 : 0.35,
  }

  if (block.type === 'divider') return (
    <div style={wrap} onClick={onClick}>
      <hr style={{ border: 'none', borderTop: block.lineStyle === 'dashed' ? '1px dashed #aaa' : '1px solid #333', margin: '2px 0' }} />
    </div>
  )

  if (block.type === 'items_table') return (
    <div style={wrap} onClick={onClick}>
      <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse', color: '#333', fontFamily: 'monospace' }}>
        <thead><tr style={{ borderBottom: '1px solid #ccc' }}>
          <th style={{ textAlign: 'left', paddingBottom: 2 }}>ITEM</th>
          <th style={{ textAlign: 'center' }}>QTY</th>
          <th style={{ textAlign: 'right' }}>PRICE</th>
        </tr></thead>
        <tbody>
          {[['Coopers Pale Ale 6pk', '1', '$21.99'], ['Yellow Tail Shiraz 750mL', '2', '$17.98']].map(([n, q, p]) => (
            <tr key={n}><td style={{ paddingTop: 2 }}>{n}</td><td style={{ textAlign: 'center' }}>{q}</td><td style={{ textAlign: 'right' }}>{p}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (block.type === 'totals') return (
    <div style={wrap} onClick={onClick}>
      {[['Subtotal', '$39.97'], ['GST (10%)', '$3.63'], ['TOTAL', '$39.97']].map(([l, v], i) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: textSz(block.size), color: '#333', fontFamily: 'monospace', fontWeight: i === 2 ? 700 : 400, borderTop: i === 2 ? '1px solid #333' : 'none', marginTop: i === 2 ? 3 : 0, paddingTop: i === 2 ? 3 : 0 }}>
          <span>{l}</span><span>{v}</span>
        </div>
      ))}
    </div>
  )

  if (block.type === 'barcode') return (
    <div style={{ ...wrap, textAlign: 'center' }} onClick={onClick}>
      <div style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: -2, color: '#333', lineHeight: 1 }}>▊▊▊▊▊▊▊▊▊▊▊▊▊▊</div>
      <div style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>0000000000000</div>
    </div>
  )

  if (block.type === 'qr_code') return (
    <div style={{ ...wrap, textAlign: 'center' }} onClick={onClick}>
      <div style={{ width: 48, height: 48, margin: '2px auto', background: 'repeating-linear-gradient(45deg,#333 0,#333 4px,#fff 4px,#fff 8px)', borderRadius: 2, border: '2px solid #333' }} />
    </div>
  )

  const text =
    block.type === 'business_name' ? 'YOUR BUSINESS NAME' :
    block.type === 'address'       ? '123 Main St, Sydney NSW 2000' :
    block.type === 'phone'         ? '(02) 1234 5678 · example.com.au' :
    block.type === 'payment'       ? 'EFTPOS · A$39.97' :
    block.type === 'cashier'       ? 'Cashier: Jane' :
    block.type === 'datetime'      ? new Date().toLocaleDateString('en-AU') + ' · ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) :
    (block.text || 'Your text here')

  return (
    <div style={wrap} onClick={onClick}>
      <div style={{ textAlign: block.align, fontSize: textSz(block.size), fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? 'italic' : 'normal', color: '#222', lineHeight: 1.45, fontFamily: 'monospace' }}>
        {text}
      </div>
    </div>
  )
}

const C = {
  bg: 'var(--bg-base)', surface: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  border: 'var(--border-default)', violet: 'var(--violet)',
}
const btn = (active = false): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: 7, border: `1px solid ${active ? C.violet : C.border}`,
  background: active ? 'var(--violet-dim)' : C.elevated, color: active ? C.violet : C.muted,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})
const label10: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }

export default function ReceiptTemplatesPage() {
  const [blocks, setBlocks]         = useState<Block[]>(DEFAULT_BLOCKS)
  const [selected, setSelected]     = useState<string | null>(null)
  const [name, setName]             = useState('Default Receipt')
  const [paperSize, setPaperSize]   = useState<'80mm' | 'a4'>('80mm')
  const [saving, setSaving]         = useState(false)
  const [savedOk, setSavedOk]       = useState(false)
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      const tpl = d.settings?.receipt_template
      if (Array.isArray(tpl) && tpl.length > 0) setBlocks(tpl)
      else {
        try {
          const ls = localStorage.getItem('aria-receipt-tpl')
          if (ls) { const p = JSON.parse(ls); if (Array.isArray(p.blocks)) { setBlocks(p.blocks); setName(p.name ?? 'Default Receipt') } }
        } catch (e) { console.error('[silent-catch]', e) }
      }
      if (d.settings?.receipt_template_name) setName(d.settings.receipt_template_name)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const r = await fetch('/api/pos/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt_template: blocks, receipt_template_name: name }),
      })
      const d = await r.json()
      if (!d.error) { setSavedOk(true); setTimeout(() => setSavedOk(false), 2000); return }
    } catch (e) { console.error('[silent-catch]', e) }
    localStorage.setItem('aria-receipt-tpl', JSON.stringify({ blocks, name }))
    setSavedOk(true); setTimeout(() => setSavedOk(false), 2000)
    setSaving(false)
  }

  function addBlock(type: string) {
    const b: Block = { id: mkId(), type, show: true, align: 'left', size: 'md', bold: false, italic: false, lineStyle: type === 'divider' ? 'solid' : undefined, text: type === 'thankyou' ? 'Thank you for your business!' : type === 'custom_text' ? 'Add your text here' : undefined }
    setBlocks(p => [...p, b]); setSelected(b.id)
  }
  function removeBlock(id: string) { setBlocks(p => p.filter(b => b.id !== id)); if (selected === id) setSelected(null) }
  function moveUp(id: string)   { setBlocks(p => { const i = p.findIndex(b => b.id === id); if (i <= 0) return p; const n = [...p]; [n[i-1],n[i]] = [n[i],n[i-1]]; return n }) }
  function moveDown(id: string) { setBlocks(p => { const i = p.findIndex(b => b.id === id); if (i >= p.length-1) return p; const n = [...p]; [n[i],n[i+1]] = [n[i+1],n[i]]; return n }) }
  function patch(id: string, changes: Partial<Block>) { setBlocks(p => p.map(b => b.id === id ? { ...b, ...changes } : b)) }

  function printTest() {
    const w = window.open('', '_blank', 'width=380,height=700')
    if (!w) return
    w.document.write(`<style>*{box-sizing:border-box}body{width:${paperSize==='80mm'?'302px':'595px'};margin:0 auto;font-family:monospace;font-size:12px;padding:16px}</style><body>`)
    for (const b of blocks.filter(b => b.show)) {
      if (b.type === 'divider') { w.document.write(b.lineStyle==='dashed'?'<hr style="border:none;border-top:1px dashed #000">':'<hr style="border:none;border-top:1px solid #000">'); continue }
      if (b.type === 'items_table') { w.document.write('<table width="100%"><tr><th align="left">ITEM</th><th align="center">QTY</th><th align="right">PRICE</th></tr><tr><td>Sample Item 1</td><td align="center">2</td><td align="right">$15.00</td></tr></table>'); continue }
      if (b.type === 'totals') { w.document.write('<div style="border-top:1px solid;margin:4px 0;padding-top:4px"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>$15.00</span></div><div style="display:flex;justify-content:space-between"><span>GST</span><span>$1.36</span></div><div style="display:flex;justify-content:space-between;font-weight:bold;border-top:1px solid;margin-top:2px;padding-top:2px"><span>TOTAL</span><span>$15.00</span></div></div>'); continue }
      if (b.type === 'barcode') { w.document.write('<div style="text-align:center;font-size:24px;letter-spacing:-2px">▊▊▊▊▊▊▊▊▊▊▊▊▊<br><small>0000000000000</small></div>'); continue }
      if (b.type === 'qr_code') { w.document.write('<div style="text-align:center"><div style="width:48px;height:48px;background:repeating-linear-gradient(45deg,#000 0,#000 4px,#fff 4px,#fff 8px);display:inline-block"></div></div>'); continue }
      const t = b.type==='business_name'?'[BUSINESS NAME]':b.type==='address'?'[ADDRESS]':b.type==='phone'?'[PHONE]':b.type==='payment'?'EFTPOS':b.type==='cashier'?'Cashier: [NAME]':b.type==='datetime'?new Date().toLocaleString('en-AU'):(b.text||'')
      const fs = b.size==='lg'?18:b.size==='md'?14:11
      w.document.write(`<div style="text-align:${b.align};font-size:${fs}px;font-weight:${b.bold?700:400};font-style:${b.italic?'italic':'normal'};margin:2px 0">${t}</div>`)
    }
    w.document.write('</body>'); w.document.close(); w.print()
  }

  const selBlock = blocks.find(b => b.id === selected) ?? null
  const canvasW = paperSize === '80mm' ? 300 : 480

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: C.surface }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.elevated, color: C.text, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', outline: 'none', width: 200 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['80mm', 'a4'] as const).map(s => <button key={s} style={btn(paperSize === s)} onClick={() => setPaperSize(s)}>{s === '80mm' ? '80mm Thermal' : 'A4 Paper'}</button>)}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => { setBlocks(DEFAULT_BLOCKS); setSelected(null) }} style={{ ...btn(), color: C.dim }}>↺ Reset</button>
          <button onClick={printTest} style={btn()}>🖨 Print Test</button>
          <button onClick={save} disabled={saving} style={{ ...btn(true), background: savedOk ? 'rgba(52,211,153,0.14)' : 'var(--violet-dim)', borderColor: savedOk ? '#34D399' : C.violet, color: savedOk ? '#34D399' : C.violet }}>
            {saving ? 'Saving…' : savedOk ? '✓ Saved' : '💾 Save'}
          </button>
        </div>
      </div>

      {/* Three columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Palette */}
        <div style={{ width: 196, borderRight: `1px solid ${C.border}`, background: C.surface, overflowY: 'auto', padding: '12px 8px', flexShrink: 0 }}>
          <div style={label10}>Add Block</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {CATALOG.map(c => (
              <button key={c.type} onClick={() => addBlock(c.type)}
                style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.elevated, color: C.text, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flexShrink: 0 }}>{c.icon}</span>{c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '28px 16px', background: '#d1d5db' }} onClick={() => setSelected(null)}>
          {loading ? (
            <div style={{ color: '#888', margin: 'auto' }}>Loading template…</div>
          ) : (
            <div style={{ width: canvasW, background: '#fff', boxShadow: '0 6px 28px rgba(0,0,0,0.18)', padding: '16px 12px', minHeight: 480, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {blocks.map(b => (
                <div key={b.id} style={{ position: 'relative' }} onClick={e => { e.stopPropagation(); setSelected(b.id) }}>
                  <BlockPreview block={b} selected={selected === b.id} onClick={() => setSelected(b.id)} />
                  {selected === b.id && (
                    <div style={{ position: 'absolute', right: -26, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, zIndex: 10 }}>
                      {[['↑', () => moveUp(b.id)], ['↓', () => moveDown(b.id)], ['×', () => removeBlock(b.id)]].map(([label, fn], i) => (
                        <button key={String(label)} onClick={e => { e.stopPropagation(); (fn as () => void)() }}
                          style={{ background: i === 2 ? '#fee' : '#fff', border: `1px solid ${i === 2 ? '#fca' : '#ddd'}`, borderRadius: 4, width: 22, height: 22, cursor: 'pointer', fontSize: 11, color: i === 2 ? '#c00' : '#555', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {String(label)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {blocks.length === 0 && <div style={{ color: '#bbb', textAlign: 'center', margin: 'auto', padding: 40, fontSize: 13 }}>Add blocks from the left panel</div>}
            </div>
          )}
        </div>

        {/* Properties */}
        <div style={{ width: 216, borderLeft: `1px solid ${C.border}`, background: C.surface, overflowY: 'auto', padding: '12px', flexShrink: 0 }}>
          {!selBlock ? (
            <div style={{ color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 48, lineHeight: 1.7 }}>Click a block<br />to edit its properties</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{CATALOG.find(c => c.type === selBlock.type)?.label ?? selBlock.type}</div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: C.text }}>
                <input type="checkbox" checked={selBlock.show} onChange={e => patch(selBlock.id, { show: e.target.checked })} />
                Visible
              </label>

              {!['divider', 'items_table', 'barcode', 'qr_code'].includes(selBlock.type) && (<>
                <div>
                  <div style={label10}>Alignment</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['left', 'center', 'right'] as Align[]).map(a => (
                      <button key={a} style={btn(selBlock.align === a)} onClick={() => patch(selBlock.id, { align: a })}>{a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={label10}>Font Size</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['sm', 'md', 'lg'] as Size[]).map(s => (
                      <button key={s} style={btn(selBlock.size === s)} onClick={() => patch(selBlock.id, { size: s })}>{s.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[['Bold', 'bold', selBlock.bold], ['Italic', 'italic', selBlock.italic]].map(([l, k, v]) => (
                    <label key={String(l)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.text }}>
                      <input type="checkbox" checked={v as boolean} onChange={e => patch(selBlock.id, { [k as string]: e.target.checked })} />
                      <span style={{ fontWeight: l === 'Bold' ? 700 : 400, fontStyle: l === 'Italic' ? 'italic' : 'normal' }}>{String(l)}</span>
                    </label>
                  ))}
                </div>
              </>)}

              {selBlock.type === 'divider' && (
                <div>
                  <div style={label10}>Line Style</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['solid', 'dashed'] as const).map(s => (
                      <button key={s} style={btn(selBlock.lineStyle === s)} onClick={() => patch(selBlock.id, { lineStyle: s })}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                    ))}
                  </div>
                </div>
              )}

              {(selBlock.type === 'thankyou' || selBlock.type === 'custom_text') && (
                <div>
                  <div style={label10}>Text</div>
                  <textarea value={selBlock.text ?? ''} onChange={e => patch(selBlock.id, { text: e.target.value })} rows={4}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.elevated, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              )}

              <button onClick={() => removeBlock(selBlock.id)}
                style={{ padding: '7px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                🗑 Remove Block
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

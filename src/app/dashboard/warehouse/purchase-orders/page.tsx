'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface LineItem { item_id: string; item_name: string; current_stock: number; suggested_qty: number; reason: string; estimated_cost_aud: number }
interface PO { id: string; po_number: string; status: string; supplier_name: string | null; supplier_id: string | null; created_at: string; expected_delivery: string | null; total_cost_cents: number; notes: string | null; line_items: LineItem[] | null }
interface DraftLine { item_name: string; suggested_qty: number; estimated_cost_aud: number }

const SC: Record<string, string> = {
  draft: '#6b7280', sent: '#60a5fa', confirmed: '#f59e0b',
  partial: '#f97316', received: '#1D9E75', cancelled: '#ef4444',
}
const inp = 'w-full rounded-xl px-3 py-2 text-sm text-white outline-none'
const inpStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }

export default function PurchaseOrdersPage() {
  const { business } = useBusinessContext()
  const [orders, setOrders] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [aiItems, setAiItems] = useState<LineItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  // Create PO modal
  const [showCreate, setShowCreate] = useState(false)
  const [newSupplier, setNewSupplier] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLines, setNewLines] = useState<DraftLine[]>([{ item_name: '', suggested_qty: 1, estimated_cost_aud: 0 }])
  const [creating, setCreating] = useState(false)
  // Send modal
  const [sendPoId, setSendPoId] = useState<string | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  // Receive modal
  const [receivePoId, setReceivePoId] = useState<string | null>(null)
  const [receiveLines, setReceiveLines] = useState<Record<string, { qty: number; to_backroom: boolean }>>({})
  const [receiving, setReceiving] = useState(false)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const res = await fetch('/api/warehouse/purchase-orders?business_id=' + business.id).then(r => r.json()).catch(() => ({ orders: [] }))
    setOrders(res.orders ?? [])
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function generateAI() {
    if (!business?.id) return
    setGenerating(true); setAiItems([])
    const res = await fetch('/api/aria/generate-purchase-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id }) }).then(r => r.json()).catch(() => ({ orders: [] }))
    setAiItems(res.orders ?? []); setGenerating(false); load()
  }

  async function createPO() {
    if (!business?.id) return
    setCreating(true)
    const validLines = newLines.filter(l => l.item_name.trim() && l.suggested_qty > 0)
    if (!validLines.length) { setCreating(false); return }
    const total_cost_cents = Math.round(validLines.reduce((s, l) => s + l.estimated_cost_aud * l.suggested_qty, 0) * 100)
    await fetch('/api/warehouse/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id, supplier_name: newSupplier || null, expected_delivery: newDate || null, line_items: validLines.map(l => ({ item_id: '', item_name: l.item_name, current_stock: 0, suggested_qty: l.suggested_qty, estimated_cost_aud: l.estimated_cost_aud, reason: 'Manual PO' })), total_cost_cents }),
    })
    setShowCreate(false); setNewSupplier(''); setNewEmail(''); setNewDate(''); setNewLines([{ item_name: '', suggested_qty: 1, estimated_cost_aud: 0 }]); setCreating(false); load()
  }

  async function sendPO() {
    if (!business?.id || !sendPoId) return
    setSending(true)
    await fetch('/api/warehouse/purchase-orders/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id, po_id: sendPoId, supplier_email: sendEmail || null }) })
    setSending(false); setSendPoId(null); setSendEmail(''); load()
  }

  async function receivePO() {
    if (!business?.id || !receivePoId) return
    setReceiving(true)
    const lines = Object.entries(receiveLines).filter(([, v]) => v.qty > 0).map(([item_id, v]) => ({ item_id, received_qty: v.qty, to_backroom: v.to_backroom }))
    await fetch('/api/warehouse/purchase-orders/receive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business.id, po_id: receivePoId, lines }) })
    setReceiving(false); setReceivePoId(null); setReceiveLines({}); load()
  }

  function openReceive(po: PO) {
    const init: Record<string, { qty: number; to_backroom: boolean }> = {}
    for (const li of (po.line_items ?? [])) init[li.item_id || li.item_name] = { qty: li.suggested_qty, to_backroom: false }
    setReceiveLines(init); setReceivePoId(po.id)
  }

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)
  const receivePO_data = receivePoId ? orders.find(o => o.id === receivePoId) : null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Purchase Orders</h1>
          <p style={{ color: '#6b7280' }}>Create, send, and receive supplier POs.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: '#374151' }}>+ Create PO</button>
          <button onClick={generateAI} disabled={generating} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40 flex items-center gap-2" style={{ background: '#1D9E75' }}>
            {generating ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating…</> : '✦ AI Generate'}
          </button>
        </div>
      </div>

      {aiItems.length > 0 && (
        <div className="mb-6 rounded-xl p-4" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
          <p className="text-sm font-medium mb-2" style={{ color: '#1D9E75' }}>✦ Aria generated {aiItems.length} reorder suggestions — saved as draft PO</p>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-xl text-xs capitalize"
            style={statusFilter === s ? { background: '#1D9E75', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>{s}</button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? <p className="text-sm text-center py-8" style={{ color: '#4b5563' }}>Loading…</p>
          : filtered.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-sm" style={{ color: '#6b7280' }}>No purchase orders yet. Click "+ Create PO" or "AI Generate" to get started.</p>
            </div>
          ) : filtered.map(po => (
            <div key={po.id} className="rounded-xl overflow-hidden" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-white">{po.po_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: (SC[po.status] ?? '#6b7280') + '22', color: SC[po.status] ?? '#6b7280' }}>{po.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {po.supplier_name && <span className="text-xs" style={{ color: '#9ca3af' }}>{po.supplier_name}</span>}
                    <span className="text-xs" style={{ color: '#6b7280' }}>{new Date(po.created_at).toLocaleDateString()}</span>
                    {po.expected_delivery && <span className="text-xs" style={{ color: '#6b7280' }}>Due: {po.expected_delivery}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-white">A${((po.total_cost_cents ?? 0) / 100).toFixed(2)}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>{(po.line_items ?? []).length} items</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setExpanded(expanded === po.id ? null : po.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', minHeight: 32 }}>{expanded === po.id ? 'Hide' : 'View'}</button>
                  {po.status === 'draft' && <button onClick={() => { setSendPoId(po.id); setSendEmail('') }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', minHeight: 32 }}>Send</button>}
                  {po.status === 'sent' && <button onClick={() => { const id = po.id; fetch('/api/warehouse/purchase-orders?id=' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: business?.id, status: 'confirmed' }) }).then(() => load()) }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', minHeight: 32 }}>Confirm</button>}
                  {(po.status === 'confirmed' || po.status === 'partial') && <button onClick={() => openReceive(po)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', minHeight: 32 }}>Receive</button>}
                  <button onClick={() => { if (!confirm('Delete?')) return; fetch('/api/warehouse/purchase-orders?id=' + po.id + '&business_id=' + business?.id, { method: 'DELETE' }).then(() => load()) }} className="text-xs px-2 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', minHeight: 32 }}>×</button>
                </div>
              </div>
              {expanded === po.id && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {po.notes && <p className="text-xs mt-3 mb-2" style={{ color: '#9ca3af' }}>{po.notes}</p>}
                  <table className="w-full text-xs mt-2">
                    <thead><tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{['Product', 'Stock', 'Qty', 'Unit Cost'].map(h => <th key={h} className="pb-2 text-left font-medium" style={{ color: '#6b7280' }}>{h}</th>)}</tr></thead>
                    <tbody>{(po.line_items ?? []).map((li, i) => <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}><td className="py-2 text-white">{li.item_name}</td><td className="py-2" style={{ color: '#9ca3af' }}>{li.current_stock}</td><td className="py-2 font-medium text-white">{li.suggested_qty}</td><td className="py-2" style={{ color: '#9ca3af' }}>A${(li.estimated_cost_aud ?? 0).toFixed(2)}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Create PO modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 className="text-lg font-semibold text-white mb-4">Create Purchase Order</h2>
            <div className="space-y-3 mb-4">
              <input className={inp} style={inpStyle} placeholder="Supplier name" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} />
              <input className={inp} style={inpStyle} placeholder="Supplier email (optional)" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <input className={inp} style={inpStyle} type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
            </div>
            <p className="text-xs font-semibold mb-2" style={{ color: '#9ca3af' }}>LINE ITEMS</p>
            <div className="space-y-2 mb-3">
              {newLines.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inp + ' flex-1'} style={inpStyle} placeholder="Product name" value={line.item_name} onChange={e => setNewLines(ls => ls.map((l, j) => j === i ? { ...l, item_name: e.target.value } : l))} />
                  <input className={inp} style={{ ...inpStyle, width: 64 }} type="number" min="1" placeholder="Qty" value={line.suggested_qty || ''} onChange={e => setNewLines(ls => ls.map((l, j) => j === i ? { ...l, suggested_qty: parseInt(e.target.value) || 0 } : l))} />
                  <input className={inp} style={{ ...inpStyle, width: 80 }} type="number" min="0" step="0.01" placeholder="A$/unit" value={line.estimated_cost_aud || ''} onChange={e => setNewLines(ls => ls.map((l, j) => j === i ? { ...l, estimated_cost_aud: parseFloat(e.target.value) || 0 } : l))} />
                  {newLines.length > 1 && <button onClick={() => setNewLines(ls => ls.filter((_, j) => j !== i))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>}
                </div>
              ))}
            </div>
            <button onClick={() => setNewLines(ls => [...ls, { item_name: '', suggested_qty: 1, estimated_cost_aud: 0 }])} className="text-xs mb-4" style={{ color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add line</button>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Cancel</button>
              <button onClick={createPO} disabled={creating} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>{creating ? 'Creating…' : 'Create PO'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send modal */}
      {sendPoId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <h2 className="text-lg font-semibold text-white mb-4">Send PO to Supplier</h2>
            <input className={inp + ' mb-4'} style={inpStyle} type="email" placeholder="Supplier email (optional)" value={sendEmail} onChange={e => setSendEmail(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSendPoId(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Cancel</button>
              <button onClick={sendPO} disabled={sending} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#60a5fa' }}>{sending ? 'Sending…' : 'Send PO'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Receive modal */}
      {receivePoId && receivePO_data && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 className="text-lg font-semibold text-white mb-1">Receive {receivePO_data.po_number}</h2>
            <p className="text-xs mb-4" style={{ color: '#6b7280' }}>Enter received quantities. Leave 0 to skip an item. Toggle "→ Backroom" to receive into backroom instead of floor.</p>
            <div className="space-y-2 mb-4">
              {(receivePO_data.line_items ?? []).map((li, i) => {
                const key = li.item_id || li.item_name
                const rv = receiveLines[key] ?? { qty: li.suggested_qty, to_backroom: false }
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <span className="flex-1 text-sm text-white truncate">{li.item_name}</span>
                    <span className="text-xs shrink-0" style={{ color: '#6b7280' }}>Ordered: {li.suggested_qty}</span>
                    <input type="number" min="0" max={li.suggested_qty} className="text-sm text-white text-center rounded-lg px-2 py-1 outline-none" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', width: 60 }} value={rv.qty} onChange={e => setReceiveLines(prev => ({ ...prev, [key]: { ...rv, qty: parseInt(e.target.value) || 0 } }))} />
                    <button onClick={() => setReceiveLines(prev => ({ ...prev, [key]: { ...rv, to_backroom: !rv.to_backroom } }))} className="text-xs px-2 py-1 rounded-lg shrink-0" style={{ background: rv.to_backroom ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', color: rv.to_backroom ? '#8b5cf6' : '#6b7280' }}>
                      {rv.to_backroom ? '→ Backroom' : '→ Floor'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setReceivePoId(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Cancel</button>
              <button onClick={receivePO} disabled={receiving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>{receiving ? 'Receiving…' : 'Confirm Receive'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

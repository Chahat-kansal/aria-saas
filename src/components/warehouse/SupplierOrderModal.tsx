'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

type ModalTab = 'suggestions' | 'lines' | 'prices' | 'receive' | 'chat' | 'history'

interface AISuggestion {
  product_id: string; product_name: string; current_qty: number; suggested_qty: number
  velocity_per_week: number; stock_days_remaining: number; trend: 'up' | 'down' | 'same'
  price_change_pct: number; urgency_score: number; reason?: string
}
interface OrderLine {
  product_id: string | null; product_name: string; supplier_code: string
  case_qty: number; unit_cost: number; qty: number
}
interface PriceProduct {
  product_id: string | null; product_name: string; supplier_code: string | null
  history: Array<{ date: string; price: number }>; current_price: number; price_change_pct: number
}
interface POItem { product_id: string; product_name: string; qty: number; unit_cost?: number }
interface PORecord {
  id: string; po_number: string; status: string; supplier_id: string
  total_amount: number | null; created_at: string; sent_at: string | null
  expected_delivery_date: string | null; ai_generated?: boolean
  items: POItem[]
}
interface ReceiveLine { product_id: string; product_name: string; ordered_qty: number; received_qty: string }
interface ChatMessage { role: 'user' | 'assistant'; content: string }

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const QUICK_QUESTIONS = [
  'When does this supplier deliver?',
  "What's the next order deadline?",
  'Any price increases lately?',
  'Which products are overstocked?',
  'What should I order this week?',
]

interface Props {
  supplierId: string
  supplierName: string
  shortCode?: string | null
  businessId: string
  deliveryDays?: number[]
  leadTimeDays?: number | null
  po?: PORecord | null
  defaultTab?: ModalTab
  onClose: () => void
  onSaved?: () => void
}

function PriceSparkline({ history }: { history: Array<{ date: string; price: number }> }) {
  if (history.length < 2) return null
  const prices = history.map(h => h.price)
  const min = Math.min(...prices), max = Math.max(...prices)
  const range = max - min || 1
  const W = 60, H = 20
  const pts = prices.map((p, i) => (i / (prices.length - 1)) * W + ',' + (H - ((p - min) / range) * H)).join(' ')
  const color = prices[prices.length - 1] > prices[0] ? '#ef4444' : '#1D9E75'
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SupplierOrderModal({ supplierId, supplierName, shortCode, businessId, deliveryDays, leadTimeDays, po, defaultTab = 'suggestions', onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<ModalTab>(po ? (po.status === 'received' ? 'history' : 'receive') : defaultTab)
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([])
  const [aiSummary, setAiSummary] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())
  const [orderLines, setOrderLines] = useState<OrderLine[]>([])
  const [currentPo, setCurrentPo] = useState<PORecord | null>(po ?? null)
  const [savingPo, setSavingPo] = useState(false)
  const [sendingOrder, setSendingOrder] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [nextDeliveryDate, setNextDeliveryDate] = useState<string | null>(null)
  const [pricesData, setPricesData] = useState<PriceProduct[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [pastOrders, setPastOrders] = useState<PORecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([])
  const [confirmingReceive, setConfirmingReceive] = useState(false)
  const [receiveResult, setReceiveResult] = useState<{ summary: string; discrepancies: any[] } | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [notes, setNotes] = useState('')
  const [expectedDate, setExpectedDate] = useState('')

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white outline-none bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] focus:border-[rgba(29,158,117,0.4)]'

  // Auto-fetch AI suggestions on mount if defaultTab is suggestions
  useEffect(() => {
    if (defaultTab === 'suggestions' && !po) {
      fetchAISuggestions()
    }
  }, [])

  // Populate receive lines from PO
  useEffect(() => {
    if (currentPo?.items?.length) {
      setReceiveLines(currentPo.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        ordered_qty: item.qty,
        received_qty: String(item.qty),
      })))
    }
  }, [currentPo])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Load price history when prices tab is active
  useEffect(() => {
    if (activeTab !== 'prices' || pricesData.length) return
    setLoadingPrices(true)
    fetch('/api/warehouse/suppliers/' + supplierId + '/prices?business_id=' + businessId)
      .then(r => r.json()).then(res => setPricesData(res.prices ?? [])).catch(() => {}).finally(() => setLoadingPrices(false))
  }, [activeTab])

  // Load history when history tab is active
  useEffect(() => {
    if (activeTab !== 'history' || pastOrders.length) return
    setLoadingHistory(true)
    fetch('/api/warehouse/purchase-orders?business_id=' + businessId + '&supplier_id=' + supplierId)
      .then(r => r.json()).then(res => {
        const all: PORecord[] = res.orders ?? []
        setPastOrders(all.filter(o => o.supplier_id === supplierId))
      }).catch(() => {}).finally(() => setLoadingHistory(false))
  }, [activeTab])

  async function fetchAISuggestions() {
    setLoadingAI(true)
    const res = await fetch('/api/warehouse/ai-order-suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, supplier_id: supplierId }),
    }).then(r => r.json()).catch(() => ({ suggestions: [], summary: '' }))
    setSuggestions(res.suggestions ?? [])
    setAiSummary(res.summary ?? '')
    setNextDeliveryDate(res.next_delivery_date ?? null)
    setLoadingAI(false)
  }

  function acceptAll() {
    const ids = new Set(suggestions.map(s => s.product_id))
    setAcceptedIds(ids)
    setRejectedIds(new Set())
    const lines: OrderLine[] = suggestions.filter(s => s.suggested_qty > 0).map(s => ({
      product_id: s.product_id, product_name: s.product_name, supplier_code: '',
      case_qty: 1, unit_cost: 0, qty: s.suggested_qty,
    }))
    setOrderLines(lines)
  }

  function acceptOne(s: AISuggestion) {
    setAcceptedIds(prev => { const n = new Set(prev); n.add(s.product_id); return n })
    setRejectedIds(prev => { const n = new Set(prev); n.delete(s.product_id); return n })
    setOrderLines(prev => {
      if (prev.find(l => l.product_id === s.product_id)) return prev
      return [...prev, { product_id: s.product_id, product_name: s.product_name, supplier_code: '', case_qty: 1, unit_cost: 0, qty: s.suggested_qty }]
    })
  }

  function rejectOne(productId: string) {
    setRejectedIds(prev => { const n = new Set(prev); n.add(productId); return n })
    setAcceptedIds(prev => { const n = new Set(prev); n.delete(productId); return n })
    setOrderLines(prev => prev.filter(l => l.product_id !== productId))
  }

  function updateLine(idx: number, field: keyof OrderLine, value: string | number) {
    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setOrderLines(prev => prev.filter((_, i) => i !== idx))
  }

  function addEmptyLine() {
    setOrderLines(prev => [...prev, { product_id: null, product_name: '', supplier_code: '', case_qty: 1, unit_cost: 0, qty: 1 }])
  }

  async function saveDraft() {
    if (!orderLines.length) return
    setSavingPo(true)
    const totalAmount = orderLines.reduce((s, l) => s + l.unit_cost * l.qty, 0)
    const res = await fetch('/api/warehouse/purchase-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId, supplier_id: supplierId, status: 'draft',
        ai_generated: acceptedIds.size > 0,
        total_amount: totalAmount,
        items: orderLines.map(l => ({ product_id: l.product_id, product_name: l.product_name, qty: l.qty, unit_cost: l.unit_cost || undefined })),
        expected_delivery_date: expectedDate || undefined,
        notes: notes || undefined,
      }),
    }).then(r => r.json()).catch(() => null)
    if (res?.order) setCurrentPo(res.order)
    setSavingPo(false)
    onSaved?.()
  }

  async function sendOrder() {
    if (!currentPo || !orderLines.length) return
    setSendingOrder(true); setSendResult(null)
    const totalEx = orderLines.reduce((s, l) => s + l.unit_cost * l.qty, 0)
    const res = await fetch('/api/warehouse/suppliers/' + supplierId + '/send-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId, po_id: currentPo.id,
        items: orderLines.map(l => ({ product_id: l.product_id, product_name: l.product_name, supplier_code: l.supplier_code, case_qty: l.case_qty, unit_cost: l.unit_cost, qty: l.qty })),
        notes: notes || undefined, expected_delivery_date: expectedDate || undefined,
        total_inc: totalEx * 1.1,
      }),
    }).then(r => r.json()).catch(() => null)
    if (res?.sent) setSendResult('Order sent to ' + (res.email_sent_to ?? supplierName))
    else if (res?.po_number) setSendResult('PO ' + res.po_number + ' marked sent (no email configured)')
    setSendingOrder(false)
  }

  async function confirmReceipt() {
    if (!currentPo) return
    setConfirmingReceive(true)
    const lines = receiveLines.map(l => ({ product_id: l.product_id, received_qty: parseFloat(l.received_qty) || 0 })).filter(l => l.received_qty > 0)
    const res = await fetch('/api/warehouse/purchase-orders/' + currentPo.id + '/receive', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, received_lines: lines }),
    }).then(r => r.json()).catch(() => null)
    if (res?.ok) {
      setReceiveResult({ summary: res.summary ?? '', discrepancies: res.discrepancies ?? [] })
      setCurrentPo(p => p ? { ...p, status: 'received' } : p)
    }
    setConfirmingReceive(false)
    onSaved?.()
  }

  async function sendChat(msg: string) {
    if (!msg.trim() || chatLoading) return
    const userMsg = msg.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    const context = 'Supplier: ' + supplierName + (shortCode ? ' (' + shortCode + ')' : '') +
      (deliveryDays?.length ? '. Delivers: ' + deliveryDays.map(d => DAY_NAMES[d]).join(', ') : '') +
      (leadTimeDays ? '. Lead time: ' + leadTimeDays + ' days.' : '') +
      (nextDeliveryDate ? ' Next delivery: ' + nextDeliveryDate + '.' : '') +
      '. Question: ' + userMsg
    const res = await fetch('/api/aria/business-chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, message: context, conversation_history: chatMessages.map(m => ({ role: m.role, content: m.content })) }),
    }).then(r => r.json()).catch(() => null)
    const answer = res?.answer ?? res?.summary ?? res?.response ?? 'Sorry, I could not get an answer right now.'
    setChatMessages(prev => [...prev, { role: 'assistant', content: answer }])
    setChatLoading(false)
  }

  const totalEx = orderLines.reduce((s, l) => s + l.unit_cost * l.qty, 0)
  const totalInc = totalEx * 1.1
  const totalUnits = orderLines.reduce((s, l) => s + l.qty, 0)
  const priceAlerts = pricesData.filter(p => p.price_change_pct > 3).length

  const TABS: Array<{ id: ModalTab; label: string }> = [
    { id: 'suggestions', label: '✦ AI Suggestions' },
    { id: 'lines', label: 'Order Lines' },
    { id: 'prices', label: 'Price Comparison' },
    { id: 'receive', label: 'Receive Stock' },
    { id: 'chat', label: 'Ask Aria' },
    { id: 'history', label: 'History' },
  ]

  const statusColor = (st: string) => st === 'received' ? '#1D9E75' : st === 'sent' ? '#3b82f6' : '#6b7280'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl flex flex-col h-full" style={{ background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-white">{supplierName}</h2>
              {shortCode && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897' }}>{shortCode}</span>}
              {currentPo && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ background: currentPo.status === 'received' ? 'rgba(29,158,117,0.15)' : currentPo.status === 'sent' ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.15)', color: statusColor(currentPo.status) }}>
                  {currentPo.po_number} · {currentPo.status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#6b7280' }}>
              {orderLines.length > 0 && <span>{totalUnits} units · ${totalEx.toFixed(2)} ex · ${totalInc.toFixed(2)} inc</span>}
              {nextDeliveryDate && <span style={{ color: '#7FB897' }}>Next delivery: {nextDeliveryDate}</span>}
              {deliveryDays?.length ? <span>Delivers: {deliveryDays.map(d => DAY_NAMES[d]).join(', ')}</span> : null}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none shrink-0">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 px-4 shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className="px-3 py-2.5 text-xs font-medium whitespace-nowrap"
              style={{ color: activeTab === t.id ? '#1D9E75' : '#6b7280', borderBottom: activeTab === t.id ? '2px solid #1D9E75' : '2px solid transparent', background: 'transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* AI SUGGESTIONS TAB */}
          {activeTab === 'suggestions' && (
            <div>
              {loadingAI ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="inline-block w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm" style={{ color: '#6b7280' }}>Analysing velocity, trends, and stock levels…</p>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-white mb-2">No suggestions yet</p>
                  <button onClick={fetchAISuggestions} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.3)' }}>
                    Generate AI suggestions
                  </button>
                </div>
              ) : (
                <>
                  {aiSummary && (
                    <div className="mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.15)' }}>
                      <p className="text-xs" style={{ color: '#9ca3af' }}><span style={{ color: '#1D9E75' }}>✦ Aria: </span>{aiSummary}</p>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs" style={{ color: '#6b7280' }}>{suggestions.length} products — {acceptedIds.size} accepted</p>
                    <div className="flex gap-2">
                      <button onClick={acceptAll} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.3)' }}>Accept all</button>
                      <button onClick={() => setActiveTab('lines')} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Edit manually →</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {suggestions.map(s => {
                      const accepted = acceptedIds.has(s.product_id)
                      const rejected = rejectedIds.has(s.product_id)
                      return (
                        <div key={s.product_id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                          style={{ background: accepted ? 'rgba(29,158,117,0.06)' : rejected ? 'rgba(239,68,68,0.04)' : '#13131a', border: '1px solid ' + (accepted ? 'rgba(29,158,117,0.2)' : rejected ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.07)') }}>
                          <span className="w-4 text-sm text-center shrink-0" style={{ color: s.trend === 'up' ? '#1D9E75' : s.trend === 'down' ? '#ef4444' : '#6b7280' }}>
                            {s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="text-sm font-medium text-white truncate">{s.product_name}</p>
                              {s.urgency_score >= 1 && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>Urgent</span>}
                              {s.price_change_pct > 3 && <span className="text-xs px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Price +{s.price_change_pct.toFixed(1)}%</span>}
                            </div>
                            {s.reason && <p className="text-xs truncate" style={{ color: '#6b7280' }}>{s.reason}</p>}
                            <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>
                              {s.velocity_per_week}/wk · {s.stock_days_remaining}d stock · {s.current_qty} on hand
                            </p>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <p className="text-sm font-semibold text-white">{s.suggested_qty} units</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => acceptOne(s)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
                              style={{ background: accepted ? '#1D9E75' : 'rgba(29,158,117,0.1)', color: accepted ? '#fff' : '#1D9E75', border: '1px solid ' + (accepted ? '#1D9E75' : 'rgba(29,158,117,0.25)') }}>
                              ✓
                            </button>
                            <button onClick={() => rejectOne(s.product_id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                              style={{ background: rejected ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)', color: rejected ? '#ef4444' : '#6b7280', border: '1px solid ' + (rejected ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)') }}>
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ORDER LINES TAB */}
          {activeTab === 'lines' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs" style={{ color: '#6b7280' }}>{orderLines.length} lines · ${totalEx.toFixed(2)} ex GST</p>
                <div className="flex gap-2">
                  {suggestions.length > 0 && (
                    <button onClick={acceptAll} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                      Apply AI suggestions
                    </button>
                  )}
                  <button onClick={addEmptyLine} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>+ Add line</button>
                </div>
              </div>
              {orderLines.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm" style={{ color: '#6b7280' }}>No order lines yet.</p>
                  <div className="flex gap-2 justify-center mt-3">
                    <button onClick={() => setActiveTab('suggestions')} className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>Get AI suggestions</button>
                    <button onClick={addEmptyLine} className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>Add line manually</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Product', 'Code', 'Cost', 'Qty', 'Total ex', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: '#6b7280' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map((l, i) => (
                        <tr key={i} style={{ borderBottom: i < orderLines.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: '#13131a' }}>
                          <td className="px-3 py-2">
                            <input value={l.product_name} onChange={e => updateLine(i, 'product_name', e.target.value)}
                              className="w-36 px-2 py-1 rounded text-xs text-white bg-transparent border border-[rgba(255,255,255,0.08)] outline-none focus:border-[rgba(29,158,117,0.4)]" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={l.supplier_code} onChange={e => updateLine(i, 'supplier_code', e.target.value)}
                              className="w-20 px-2 py-1 rounded text-xs text-white bg-transparent border border-[rgba(255,255,255,0.08)] outline-none" placeholder="Code" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={0} step={0.01} value={l.unit_cost || ''} onChange={e => updateLine(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 rounded text-xs text-white bg-transparent border border-[rgba(255,255,255,0.08)] outline-none" placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} value={l.qty} onChange={e => updateLine(i, 'qty', parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 rounded text-xs text-white bg-transparent border border-[rgba(255,255,255,0.08)] outline-none" />
                          </td>
                          <td className="px-3 py-2 font-medium text-white">${(l.unit_cost * l.qty).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => removeLine(i)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Expected delivery date</label>
                  <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>Notes</label>
                  <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Add order notes…" />
                </div>
              </div>
            </div>
          )}

          {/* PRICE COMPARISON TAB */}
          {activeTab === 'prices' && (
            <div>
              {priceAlerts > 0 && (
                <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span style={{ color: '#1D9E75' }}>✦ Aria: </span>
                  <span style={{ color: '#fca5a5' }}>{priceAlerts} item{priceAlerts !== 1 ? 's have' : ' has'} increased more than 3%.</span>
                </div>
              )}
              {loadingPrices ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: '#13131a' }} />)}</div>
              ) : pricesData.length === 0 ? (
                <div className="text-center py-10"><p className="text-sm" style={{ color: '#6b7280' }}>No price history recorded yet.</p></div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Product', 'Code', 'First', 'Current', 'Change', 'Trend'].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: '#6b7280', background: '#13131a' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pricesData.map((p, i) => {
                        const first = p.history[0]?.price ?? p.current_price
                        const chg = p.price_change_pct
                        const chgColor = chg > 3 ? '#ef4444' : chg > 0 ? '#f59e0b' : '#1D9E75'
                        return (
                          <tr key={p.product_id ?? p.product_name} style={{ borderBottom: i < pricesData.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: '#13131a' }}>
                            <td className="px-3 py-2.5 text-white">{p.product_name}</td>
                            <td className="px-3 py-2.5" style={{ color: '#6b7280' }}>{p.supplier_code ?? '—'}</td>
                            <td className="px-3 py-2.5" style={{ color: '#9ca3af' }}>${first.toFixed(2)}</td>
                            <td className="px-3 py-2.5 font-medium text-white">${p.current_price.toFixed(2)}</td>
                            <td className="px-3 py-2.5 font-medium" style={{ color: chgColor }}>{chg > 0 ? '+' : ''}{chg.toFixed(1)}%</td>
                            <td className="px-3 py-2.5"><PriceSparkline history={p.history} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RECEIVE STOCK TAB */}
          {activeTab === 'receive' && (
            <div>
              {receiveResult ? (
                <div className="rounded-xl p-5" style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.2)' }}>
                  <p className="text-sm font-medium mb-2" style={{ color: '#1D9E75' }}>✓ Stock updated</p>
                  <p className="text-sm mb-3" style={{ color: '#9ca3af' }}>{receiveResult.summary}</p>
                  {receiveResult.discrepancies.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2" style={{ color: '#f59e0b' }}>Discrepancies:</p>
                      {receiveResult.discrepancies.map((d: any, i: number) => (
                        <p key={i} className="text-xs" style={{ color: '#9ca3af' }}>{d.product_name}: ordered {d.ordered}, received {d.received} ({d.diff > 0 ? '+' : ''}{d.diff})</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : !currentPo ? (
                <div className="text-center py-10">
                  <p className="text-sm mb-2" style={{ color: '#6b7280' }}>Save a draft order first to receive stock.</p>
                  <button onClick={() => setActiveTab('lines')} className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
                    Go to Order Lines
                  </button>
                </div>
              ) : currentPo.status === 'received' ? (
                <div className="text-center py-10"><p className="text-sm" style={{ color: '#1D9E75' }}>✓ This order has already been received.</p></div>
              ) : (
                <>
                  <p className="text-xs mb-4" style={{ color: '#6b7280' }}>Enter the quantity actually received for each line. Discrepancies will be flagged.</p>
                  <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                          {['Product', 'Ordered', 'Received', 'Discrepancy'].map(h => (
                            <th key={h} className="text-left px-4 py-2.5 font-medium" style={{ color: '#6b7280', background: '#13131a' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {receiveLines.map((l, i) => {
                          const recv = parseFloat(l.received_qty) || 0
                          const diff = recv - l.ordered_qty
                          const diffColor = diff === 0 ? '#1D9E75' : diff > 0 ? '#f59e0b' : '#ef4444'
                          return (
                            <tr key={l.product_id} style={{ borderBottom: i < receiveLines.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: '#13131a' }}>
                              <td className="px-4 py-2.5 text-white">{l.product_name}</td>
                              <td className="px-4 py-2.5" style={{ color: '#9ca3af' }}>{l.ordered_qty}</td>
                              <td className="px-4 py-2.5">
                                <input type="number" min={0} value={l.received_qty}
                                  onChange={e => setReceiveLines(prev => prev.map((x, j) => j === i ? { ...x, received_qty: e.target.value } : x))}
                                  className="w-20 px-2 py-1 rounded text-xs text-white bg-transparent border border-[rgba(255,255,255,0.12)] outline-none focus:border-[rgba(29,158,117,0.4)]" />
                              </td>
                              <td className="px-4 py-2.5 font-medium" style={{ color: diffColor }}>
                                {diff === 0 ? 'OK' : (diff > 0 ? 'Over +' : 'Short ') + Math.abs(diff)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={confirmReceipt} disabled={confirmingReceive} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                    {confirmingReceive ? 'Updating stock…' : 'Confirm receipt + update stock'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ASK ARIA TAB */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full" style={{ minHeight: 400 }}>
              {chatMessages.length === 0 && (
                <div className="mb-4">
                  <p className="text-xs mb-3" style={{ color: '#6b7280' }}>Quick questions:</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_QUESTIONS.map(q => (
                      <button key={q} onClick={() => sendChat(q)} className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: 'rgba(29,158,117,0.08)', color: '#7FB897', border: '1px solid rgba(29,158,117,0.2)' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-3 mb-4 overflow-y-auto" style={{ maxHeight: 340 }}>
                {chatMessages.map((m, i) => (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className="rounded-xl px-4 py-3 max-w-sm text-sm"
                      style={{ background: m.role === 'user' ? '#1D9E75' : '#13131a', color: m.role === 'user' ? '#fff' : '#e5e7eb', border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-xl px-4 py-3" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="inline-block w-4 h-4 border border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2 mt-auto">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
                  className={inputCls} placeholder="Ask about this supplier, stock levels, prices…" />
                <button onClick={() => sendChat(chatInput)} disabled={!chatInput.trim() || chatLoading}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75', shrink: 0 } as any}>
                  Send
                </button>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div>
              {loadingHistory ? (
                <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#13131a' }} />)}</div>
              ) : pastOrders.length === 0 ? (
                <div className="text-center py-10"><p className="text-sm" style={{ color: '#6b7280' }}>No order history for this supplier yet.</p></div>
              ) : (
                <>
                  <div className="mb-4 px-4 py-3 rounded-xl text-xs" style={{ background: 'rgba(29,158,117,0.06)', border: '1px solid rgba(29,158,117,0.15)' }}>
                    <span style={{ color: '#1D9E75' }}>✦ Aria: </span>
                    <span style={{ color: '#9ca3af' }}>{pastOrders.length} orders placed — {pastOrders.filter(o => o.status === 'received').length} received, {pastOrders.filter(o => o.ai_generated).length} AI-generated.</span>
                  </div>
                  <div className="space-y-2">
                    {pastOrders.map(o => (
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
                            {new Date(o.created_at).toLocaleDateString('en-AU')} · {(o.items ?? []).length} lines
                            {o.sent_at ? ' · Sent: ' + new Date(o.sent_at).toLocaleDateString('en-AU') : ''}
                          </p>
                        </div>
                        {o.total_amount !== null && <p className="text-sm font-medium text-white shrink-0">${Number(o.total_amount).toFixed(2)}</p>}
                        {o.status !== 'received' && (
                          <button onClick={() => { setCurrentPo(o); setReceiveLines(o.items.map(item => ({ product_id: item.product_id, product_name: item.product_name, ordered_qty: item.qty, received_qty: String(item.qty) }))); setActiveTab('receive') }}
                            className="text-xs px-2 py-1 rounded-lg shrink-0" style={{ background: 'rgba(29,158,117,0.1)', color: '#1D9E75' }}>Receive</button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            {currentPo && (
              <button onClick={() => window.open('/print/purchase-order/' + currentPo.id, '_blank')}
                className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}>
                Print PDF
              </button>
            )}
            {sendResult && <p className="text-xs" style={{ color: '#1D9E75' }}>✓ {sendResult}</p>}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'receive' && currentPo && currentPo.status !== 'received' && !receiveResult && (
              <button onClick={confirmReceipt} disabled={confirmingReceive} className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                {confirmingReceive ? 'Updating…' : 'Confirm receipt'}
              </button>
            )}
            {activeTab !== 'receive' && (
              <>
                {!currentPo && orderLines.length > 0 && (
                  <button onClick={saveDraft} disabled={savingPo} className="px-4 py-2 rounded-xl text-sm disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {savingPo ? 'Saving…' : 'Save draft'}
                  </button>
                )}
                {orderLines.length > 0 && (
                  <button onClick={currentPo ? sendOrder : async () => { await saveDraft(); sendOrder() }} disabled={sendingOrder}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ background: '#1D9E75' }}>
                    {sendingOrder ? 'Sending…' : 'Send to ' + (shortCode ?? supplierName)}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

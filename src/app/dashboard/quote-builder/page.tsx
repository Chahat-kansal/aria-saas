'use client'
import { useState, useEffect } from 'react'
import { useBusiness } from '@/components/providers/BusinessProvider'

interface LineItem { description: string; qty: number; rate: number; total: number }
interface QuoteData {
  quoteNumber: string; businessName: string; date: string; validUntil: string
  lineItems: LineItem[]; subtotal: number; gst: number; total: number
  notes?: string; terms?: string; customerName?: string; customerEmail?: string
}
interface SavedQuote {
  id: string; job_description: string; quote_amount: number
  quote_breakdown: QuoteData; status: string; customer_name: string | null
  customer_email: string | null; generated_at: string; created_at: string
  win_score: number | null; view_count: number | null; last_viewed_at: string | null
  accepted_by_name: string | null; token: string | null; sent_at: string | null
}
interface Product { id: string; name: string; price: number; description: string | null }

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  draft:    { bg: 'rgba(255,255,255,0.06)',   color: '#9ca3af' },
  sent:     { bg: 'rgba(59,130,246,0.15)',    color: '#60a5fa' },
  viewed:   { bg: 'rgba(139,92,246,0.15)',    color: '#a78bfa' },
  accepted: { bg: 'rgba(29,158,117,0.15)',    color: '#1D9E75' },
  rejected: { bg: 'rgba(239,68,68,0.15)',     color: '#ef4444' },
  declined: { bg: 'rgba(239,68,68,0.15)',     color: '#ef4444' },
  expired:  { bg: 'rgba(245,158,11,0.15)',    color: '#f59e0b' },
}

function wsColor(s: number) { return s >= 70 ? '#1D9E75' : s >= 40 ? '#F59E0B' : '#EF4444' }
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }

function printQuote(q: QuoteData) {
  const html = '<html><head><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#111}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#f5f5f5}tfoot td{font-weight:bold}.total{font-size:18px;color:#2D5240}.note{color:#555;font-size:13px;margin-top:16px}</style></head><body>'
    + '<h1>Quote ' + q.quoteNumber + '</h1><p><b>' + q.businessName + '</b><br>Date: ' + q.date + ' · Valid until: ' + q.validUntil + '</p>'
    + (q.customerName ? '<p>To: <b>' + q.customerName + '</b>' + (q.customerEmail ? ' · ' + q.customerEmail : '') + '</p>' : '')
    + '<table><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>'
    + q.lineItems.map(l => '<tr><td>' + l.description + '</td><td>' + l.qty + '</td><td>A$' + l.rate.toFixed(2) + '</td><td>A$' + l.total.toFixed(2) + '</td></tr>').join('')
    + '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td>A$' + q.subtotal.toFixed(2) + '</td></tr><tr><td colspan="3">GST (10%)</td><td>A$' + q.gst.toFixed(2) + '</td></tr>'
    + '<tr><td colspan="3" class="total">TOTAL</td><td class="total">A$' + q.total.toFixed(2) + '</td></tr></tfoot></table>'
    + (q.notes ? '<p class="note"><b>Notes:</b> ' + q.notes + '</p>' : '') + (q.terms ? '<p class="note"><b>Terms:</b> ' + q.terms + '</p>' : '') + '</body></html>'
  const w = window.open('', '_blank'); if (!w) return
  w.document.write(html); w.document.close(); w.print()
}

export default function QuoteBuilderPage() {
  const business = useBusiness()
  const [prompt, setPrompt] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<SavedQuote[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [selectedQuote, setSelectedQuote] = useState<SavedQuote | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [showCatalogue, setShowCatalogue] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [catalogueSearch, setCatalogueSearch] = useState('')
  const [followUps, setFollowUps] = useState<Record<string, { draft: string; subject: string; loading: boolean; sent: boolean }>>({})
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/aria/generate-quote')
      .then(r => r.json())
      .then(d => { setHistory(d.quotes ?? []); setHistoryLoading(false) })
      .catch(() => setHistoryLoading(false))
  }, [])

  async function generate() {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(''); setQuote(null); setSavedId(null); setSelectedQuote(null); setSendResult(null)
    const res = await fetch('/api/aria/generate-quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: prompt, customerName, customerEmail }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to generate quote') } else {
      setQuote(data.quote)
      if (data.id) {
        setSavedId(data.id)
        setHistory(h => [{ id: data.id, job_description: prompt, quote_amount: data.quote.total, quote_breakdown: data.quote, status: 'draft', customer_name: customerName || null, customer_email: customerEmail || null, generated_at: new Date().toISOString(), created_at: new Date().toISOString(), win_score: null, view_count: null, last_viewed_at: null, accepted_by_name: null, token: null, sent_at: null }, ...h])
      }
    }
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/aria/generate-quote?id=' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setHistory(h => h.map(q => q.id === id ? { ...q, status } : q))
    if (selectedQuote?.id === id) setSelectedQuote(sq => sq ? { ...sq, status } : null)
  }

  async function emailQuote() {
    if (!savedId || !customerEmail) return
    setSending(true)
    try {
      const res = await fetch('/api/pos/email-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: savedId, email: customerEmail, type: 'quote' }) })
      const d = await res.json()
      setSendResult(d.error ? 'Failed: ' + d.error : 'Sent to ' + customerEmail)
      if (!d.error) await updateStatus(savedId, 'sent')
    } catch { setSendResult('Failed to send') }
    setSending(false)
  }

  async function openCatalogue() {
    setShowCatalogue(true)
    if (products.length === 0) {
      const res = await fetch('/api/pos/products').then(r => r.json()).catch(() => ({ products: [] }))
      setProducts(res.products ?? [])
    }
  }

  function addFromCatalogue(p: Product) {
    setPrompt(prev => prev ? prev + '\n- ' + p.name + ' (A$' + p.price.toFixed(2) + ')' : '- ' + p.name + ' (A$' + p.price.toFixed(2) + ')')
    setShowCatalogue(false)
  }

  async function loadFollowUp(quoteId: string) {
    setFollowUps(f => ({ ...f, [quoteId]: { loading: true, expanded: true, draft: '', subject: '', sent: false } as typeof f[string] }))
    const d = await fetch('/api/aria/quote-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: quoteId }) }).then(r => r.json()).catch(() => ({}))
    setFollowUps(f => ({ ...f, [quoteId]: { loading: false, draft: d.draft ?? '', subject: d.subject ?? '', sent: false } }))
    if (d.win_score != null) setHistory(h => h.map(q => q.id === quoteId ? { ...q, win_score: d.win_score } : q))
  }

  async function sendFollowUp(quoteId: string) {
    const fu = followUps[quoteId]; if (!fu?.draft) return
    setFollowUps(f => ({ ...f, [quoteId]: { ...f[quoteId], loading: true } }))
    await fetch('/api/aria/quote-followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote_id: quoteId, send: true, draft: fu.draft, subject: fu.subject }) }).catch(() => {})
    setFollowUps(f => ({ ...f, [quoteId]: { ...f[quoteId], loading: false, sent: true } }))
  }

  function copyLink(token: string, id: string) {
    navigator.clipboard.writeText(window.location.origin + '/quote/' + token)
    setCopied(id); setTimeout(() => setCopied(null), 2000)
  }

  const displayQuote = selectedQuote?.quote_breakdown ?? quote

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sentThisMonth = history.filter(q => q.sent_at && q.sent_at >= monthStart)
  const sentValue = sentThisMonth.reduce((s, q) => s + q.quote_amount, 0)
  const accepted = sentThisMonth.filter(q => q.status === 'accepted')
  const acceptedValue = accepted.reduce((s, q) => s + q.quote_amount, 0)
  const pipeline = history.filter(q => ['sent', 'viewed'].includes(q.status))
  const pipelineValue = pipeline.reduce((s, q) => s + q.quote_amount, 0)

  const C = {
    bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
    muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
    green: '#1D9E75', amber: '#F59E0B', violet: '#8B5CF6', red: '#EF4444',
    border: 'rgba(255,255,255,0.07)',
  }

  const PIPELINE_COLS = [
    { key: 'draft', label: 'Draft', color: '#9ca3af' },
    { key: 'sent', label: 'Sent', color: '#60a5fa' },
    { key: 'viewed', label: 'Viewed', color: '#a78bfa' },
    { key: 'accepted', label: 'Accepted', color: '#1D9E75' },
    { key: 'declined_expired', label: 'Declined/Expired', color: '#ef4444' },
  ]

  function renderHistoryCard(q: SavedQuote) {
    const daysSent = q.sent_at ? daysSince(q.sent_at) : null
    const showFollowUpBanner = q.status === 'sent' && daysSent !== null && daysSent >= 3 && !followUps[q.id]?.sent
    const fu = followUps[q.id]
    return (
      <div key={q.id} onClick={() => setSelectedQuote(q === selectedQuote ? null : q)}
        style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid ' + (selectedQuote?.id === q.id ? 'rgba(139,92,246,0.3)' : C.border), background: selectedQuote?.id === q.id ? 'rgba(139,92,246,0.08)' : 'transparent', cursor: 'pointer', marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{q.customer_name ?? 'Quote'}</span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: STATUS_STYLES[q.status]?.bg, color: STATUS_STYLES[q.status]?.color }}>{q.status}</span>
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{q.job_description.slice(0, 50)}{q.job_description.length > 50 ? '...' : ''}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>A${q.quote_amount.toFixed(2)}</span>
          {q.win_score != null && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: wsColor(q.win_score) + '22', color: wsColor(q.win_score), fontWeight: 700 }}>{q.win_score}% win</span>
          )}
        </div>
        {(q.view_count ?? 0) > 0 && (
          <p style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>👁 Viewed {q.view_count}×{q.last_viewed_at ? ` — last ${daysSince(q.last_viewed_at)}d ago` : ''}</p>
        )}
        {q.status === 'accepted' && q.accepted_by_name && (
          <p style={{ fontSize: 10, color: C.green, marginTop: 2 }}>✅ Accepted by {q.accepted_by_name}</p>
        )}
        {q.token && (
          <button onClick={e => { e.stopPropagation(); copyLink(q.token!, q.id) }}
            style={{ marginTop: 4, fontSize: 10, padding: '2px 7px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: C.dim, cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied === q.id ? '✓ Copied' : '🔗 Copy link'}
          </button>
        )}
        {showFollowUpBanner && (
          <div onClick={e => e.stopPropagation()} style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6 }}>
            <p style={{ fontSize: 10, color: C.amber, fontWeight: 600, marginBottom: 4 }}>📨 Aria suggests following up ({daysSent}d since sent)</p>
            {!fu ? (
              <button onClick={() => loadFollowUp(q.id)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, border: 'none', background: C.amber, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Draft follow-up email</button>
            ) : fu.loading ? (
              <span style={{ fontSize: 10, color: C.muted }}>Drafting...</span>
            ) : (
              <div>
                <textarea value={fu.draft} onChange={e => setFollowUps(f => ({ ...f, [q.id]: { ...f[q.id], draft: e.target.value } }))} rows={3}
                  style={{ width: '100%', fontSize: 10, padding: '4px 6px', borderRadius: 4, border: '1px solid ' + C.border, background: C.bg, color: C.text, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                <button onClick={() => sendFollowUp(q.id)}
                  style={{ marginTop: 4, fontSize: 10, padding: '3px 8px', borderRadius: 5, border: 'none', background: fu.sent ? C.dim : C.green, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {fu.sent ? '✓ Sent' : 'Send follow-up'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      {showCatalogue && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCatalogue(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 400, maxHeight: '80vh', overflow: 'auto', border: '1px solid ' + C.border }}>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.text }}>Product Catalogue</p>
            <input value={catalogueSearch} onChange={e => setCatalogueSearch(e.target.value)} placeholder="Search products..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid ' + C.border, background: C.bg, color: C.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10, outline: 'none' }} />
            {products.filter(p => !catalogueSearch || p.name.toLowerCase().includes(catalogueSearch.toLowerCase())).map(p => (
              <div key={p.id} onClick={() => addFromCatalogue(p)} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid ' + C.border, cursor: 'pointer', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{p.name}</p>
                  {p.description && <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{p.description}</p>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>A${p.price.toFixed(2)}</span>
              </div>
            ))}
            {products.length === 0 && <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '16px 0' }}>No products in catalogue</p>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Quote Builder</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Describe any job and Aria generates a professional GST quote in seconds.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['list', 'pipeline'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid ' + (viewMode === m ? C.violet : C.border), background: viewMode === m ? 'rgba(139,92,246,0.15)' : 'transparent', color: viewMode === m ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {m === 'list' ? '≡ List' : '⬛ Pipeline'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Sent this month', value: `A$${sentValue.toFixed(0)}`, sub: `${sentThisMonth.length} quotes`, col: C.text },
          { label: 'Accepted', value: `A$${acceptedValue.toFixed(0)}`, sub: sentThisMonth.length ? Math.round(accepted.length / sentThisMonth.length * 100) + '% win rate' : '—', col: C.green },
          { label: 'Pipeline', value: `A$${pipelineValue.toFixed(0)}`, sub: `${pipeline.length} outstanding`, col: C.amber },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 16px' }}>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: m.col, margin: '0 0 2px' }}>{m.value}</p>
            <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>{m.sub}</p>
          </div>
        ))}
      </div>

      {viewMode === 'pipeline' ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(180px,1fr))', gap: 12, minWidth: 900 }}>
            {PIPELINE_COLS.map(col => {
              const colQuotes = history.filter(q => col.key === 'declined_expired' ? ['declined','expired','rejected'].includes(q.status) : q.status === col.key)
              return (
                <div key={col.key} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col.color }}>{col.label}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: col.color + '22', color: col.color }}>{colQuotes.length}</span>
                  </div>
                  {colQuotes.map(q => (
                    <div key={q.id} style={{ background: C.bg, borderRadius: 8, padding: '8px 10px', marginBottom: 6, border: '1px solid ' + C.border }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>{q.customer_name ?? 'Quote'}</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.green, margin: '0 0 2px' }}>A${q.quote_amount.toFixed(2)}</p>
                      {q.sent_at && <p style={{ fontSize: 10, color: C.dim, margin: '0 0 2px' }}>{daysSince(q.sent_at)}d ago</p>}
                      {q.win_score != null && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: wsColor(q.win_score) + '22', color: wsColor(q.win_score), fontWeight: 700 }}>{q.win_score}% win</span>}
                    </div>
                  ))}
                  {colQuotes.length === 0 && <p style={{ fontSize: 11, color: C.dim, textAlign: 'center', padding: '8px 0' }}>Empty</p>}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name (optional)"
                style={{ padding: '10px 12px', background: C.card, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Customer email (for sending)"
                style={{ padding: '10px 12px', background: C.card, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
              placeholder="Describe the job... e.g. 'Replace bathroom tiles in a 10m2 space, supply and install, remove existing tiles, waterproofing included'"
              style={{ width: '100%', padding: '12px', background: C.card, border: '1px solid ' + C.border, borderRadius: 10, color: C.text, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={generate} disabled={loading || !prompt.trim()}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: loading ? 'rgba(139,92,246,0.4)' : C.violet, color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? '✨ Generating quote...' : '✨ Generate Quote'}
              </button>
              <button onClick={openCatalogue}
                style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                📦 Catalogue
              </button>
            </div>
            {error && <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 13, color: C.red }}>{error}</div>}

            {displayQuote && (
              <div style={{ marginTop: 20, background: '#fff', borderRadius: 12, padding: '24px', color: '#111' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#2D5240', margin: 0 }}>Quote {displayQuote.quoteNumber}</h2>
                    <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{displayQuote.businessName}</p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: '#555' }}>
                    <p>Date: {displayQuote.date}</p><p>Valid until: {displayQuote.validUntil}</p>
                    {displayQuote.customerName && <p style={{ marginTop: 4 }}>To: <b>{displayQuote.customerName}</b></p>}
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                  <thead><tr style={{ background: '#f5f5f5' }}>{['Description','Qty','Rate','Total'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', border: '1px solid #e5e7eb', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>{displayQuote.lineItems.map((item, i) => (
                    <tr key={i}><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>{item.description}</td><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>{item.qty}</td><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>A${item.rate.toFixed(2)}</td><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>A${item.total.toFixed(2)}</td></tr>
                  ))}</tbody>
                  <tfoot>
                    <tr><td colSpan={3} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', color: '#555' }}>Subtotal</td><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>A${displayQuote.subtotal.toFixed(2)}</td></tr>
                    <tr><td colSpan={3} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', color: '#555' }}>GST (10%)</td><td style={{ padding: '8px 12px', border: '1px solid #e5e7eb' }}>A${displayQuote.gst.toFixed(2)}</td></tr>
                    <tr style={{ background: '#f0fdf4' }}><td colSpan={3} style={{ padding: '10px 12px', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#2D5240' }}>TOTAL</td><td style={{ padding: '10px 12px', border: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#2D5240' }}>A${displayQuote.total.toFixed(2)}</td></tr>
                  </tfoot>
                </table>
                {displayQuote.notes && <p style={{ fontSize: 12, color: '#555' }}><b>Notes:</b> {displayQuote.notes}</p>}
                {displayQuote.terms && <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}><b>Terms:</b> {displayQuote.terms}</p>}
              </div>
            )}
          </div>

          <div>
            {displayQuote && (
              <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '18px', marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Actions</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => printQuote(displayQuote)}
                    style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    🖨️ Print / Save as PDF
                  </button>
                  {customerEmail && savedId && (
                    <button onClick={emailQuote} disabled={sending}
                      style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.1)', color: C.green, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', opacity: sending ? 0.6 : 1 }}>
                      {sending ? '✉️ Sending...' : '✉️ Email to ' + customerEmail}
                    </button>
                  )}
                  {savedId && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['sent','accepted','rejected'].map(s => (
                        <button key={s} onClick={() => updateStatus(savedId, s)}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + (STATUS_STYLES[s]?.color + '40'), background: STATUS_STYLES[s]?.bg, color: STATUS_STYLES[s]?.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                          Mark {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {sendResult && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: sendResult.startsWith('Failed') ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 12, color: sendResult.startsWith('Failed') ? C.red : C.green }}>
                    {sendResult}
                  </div>
                )}
              </div>
            )}

            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '18px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Quote history</p>
              {historyLoading ? (
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Loading...</div>
              ) : history.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>No quotes yet</div>
              ) : history.map(renderHistoryCard)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface StocktakeItem {
  id: string
  product_id: string | null
  product_name: string
  expected_qty: number
  counted_qty: number | null
  variance: number | null
}

interface Stocktake {
  id: string
  name: string | null
  status: string
  created_at: string
  completed_at: string | null
  item_count?: number
  variance_count?: number
}

interface Product {
  id: string
  name: string
  stock_quantity: number
  category: string | null
  sku: string | null
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}

export default function StocktakePage() {
  const { business } = useBusinessContext()
  const [view, setView] = useState<'list' | 'active'>('list')
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<StocktakeItem[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [search, setSearch] = useState('')
  const [filterUncounted, setFilterUncounted] = useState(false)
  const [ariaInsight, setAriaInsight] = useState<{ insight: string; priority: string; classified?: Array<{ name: string; variance: number; classification: string; reason: string; action: string }> } | null>(null)
  const [ariaLoading, setAriaLoading] = useState(false)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/pos/stock-takes')
      const d = await res.json()
      setStocktakes(d.stock_takes ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function createStocktake() {
    if (!business?.id) return
    setCreating(true)
    try {
      // Load all products with tracked stock
      const prodRes = await fetch('/api/pos/products?business_id=' + business.id + '&limit=500&track_inventory=true')
      const prodData = await prodRes.json() as { products?: Product[] }
      const products = prodData.products ?? []

      // Create stocktake session
      const res = await fetch('/api/pos/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          name: sessionName || 'Stocktake ' + new Date().toLocaleDateString('en-AU'),
          items: products.map(p => ({
            product_id: p.id,
            product_name: p.name,
            expected_qty: p.stock_quantity ?? 0,
            counted_qty: null,
          })),
        }),
      })
      const d = await res.json()
      if (d.success || d.stock_take_id) {
        setSessionName('')
        load()
      }
    } catch { /* ignore */ }
    setCreating(false)
  }

  async function openStocktake(id: string) {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/pos/stock-takes/' + id + '?business_id=' + business.id)
      const d = await res.json()
      setActiveId(id)
      setItems(d.items ?? [])
      const initCounts: Record<string, string> = {}
      for (const item of d.items ?? []) {
        initCounts[item.id] = item.counted_qty != null ? String(item.counted_qty) : ''
      }
      setCounts(initCounts)
      setView('active')
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function saveCount(itemId: string, qty: string) {
    if (!activeId || !business?.id) return
    const counted = parseInt(qty)
    if (isNaN(counted)) return
    try {
      await fetch('/api/pos/stock-takes/' + activeId + '/items/' + itemId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counted_qty: counted, business_id: business.id }),
      })
      setItems(prev => prev.map(i => i.id === itemId
        ? { ...i, counted_qty: counted, variance: counted - i.expected_qty }
        : i))
    } catch { /* ignore */ }
  }

  async function completeStocktake() {
    if (!activeId || !business?.id) return
    setSaving(true)
    try {
      // Save all unsaved counts first
      const saveAll = items
        .filter(i => counts[i.id] !== '' && counts[i.id] != null)
        .map(i => saveCount(i.id, counts[i.id]))
      await Promise.all(saveAll)

      await fetch('/api/pos/stock-takes/' + activeId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', business_id: business.id }),
      })
      setView('list')
      setActiveId(null)
      load()
      // Trigger Aria intelligence analysis non-blocking
      setAriaLoading(true)
      fetch('/api/aria/stocktake-intelligence', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.insight) setAriaInsight(d) })
        .catch(() => {})
        .finally(() => setAriaLoading(false))
    } catch { /* ignore */ }
    setSaving(false)
  }

  function downloadCSV() {
    const headers = ['Product', 'Expected', 'Counted', 'Variance', 'Value Impact']
    const rows = items.map(i => [
      i.product_name,
      i.expected_qty,
      i.counted_qty ?? '',
      i.variance ?? '',
      '',
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'stocktake-' + new Date().toISOString().split('T')[0] + '.csv'
    a.click()
  }

  const displayItems = items.filter(i => {
    if (search && !i.product_name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterUncounted && i.counted_qty != null) return false
    return true
  })

  const countedCount = items.filter(i => i.counted_qty != null).length
  const varianceItems = items.filter(i => i.variance != null && i.variance !== 0)
  const progress = items.length > 0 ? Math.round((countedCount / items.length) * 100) : 0

  function printVarianceReport() {
    const bizName = business?.name ?? 'Store'
    const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    const varItems = items.filter(i => i.variance != null && i.variance !== 0)
    const shortItems = varItems.filter(i => (i.variance ?? 0) < 0)
    const overItems  = varItems.filter(i => (i.variance ?? 0) > 0)

    const rows = items.map(i => {
      const v = i.variance ?? 0
      const color = v < 0 ? '#dc2626' : v > 0 ? '#d97706' : '#16a34a'
      return '<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">' + i.product_name + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">' + i.expected_qty + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">' + (i.counted_qty ?? '—') + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:' + color + ';font-weight:700">' + (v === 0 ? '✓' : (v > 0 ? '+' : '') + v) + '</td></tr>'
    }).join('')

    const html = '<!DOCTYPE html><html><head><title>Stocktake Variance Report — ' + bizName + '</title>' +
      '<style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:800px;margin:0 auto}' +
      'h1{font-size:22px;font-weight:700;margin-bottom:4px}' +
      '.meta{color:#6b7280;font-size:13px;margin-bottom:24px}' +
      '.summary{display:flex;gap:24px;margin-bottom:24px;padding:16px;background:#f9fafb;border-radius:8px}' +
      '.kpi{text-align:center}.kpi-val{font-size:24px;font-weight:700}.kpi-lbl{font-size:11px;color:#6b7280;text-transform:uppercase}' +
      'table{width:100%;border-collapse:collapse}th{padding:8px 10px;background:#f3f4f6;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280}' +
      '@media print{body{padding:0}}</style></head><body>' +
      '<h1>Stocktake Variance Report</h1>' +
      '<div class="meta">' + bizName + ' · ' + date + ' · ' + items.length + ' products counted</div>' +
      '<div class="summary">' +
        '<div class="kpi"><div class="kpi-val">' + items.length + '</div><div class="kpi-lbl">Total counted</div></div>' +
        '<div class="kpi"><div class="kpi-val" style="color:#dc2626">' + shortItems.length + '</div><div class="kpi-lbl">Items short</div></div>' +
        '<div class="kpi"><div class="kpi-val" style="color:#d97706">' + overItems.length + '</div><div class="kpi-lbl">Items over</div></div>' +
        '<div class="kpi"><div class="kpi-val" style="color:#16a34a">' + (items.length - varItems.length) + '</div><div class="kpi-lbl">Balanced</div></div>' +
      '</div>' +
      '<table><thead><tr><th>Product</th><th style="text-align:center">Expected</th><th style="text-align:center">Counted</th><th style="text-align:center">Variance</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p style="margin-top:32px;font-size:11px;color:#9ca3af">Generated by Aria OS · ' + new Date().toISOString() + '</p>' +
      '<script>window.onload=function(){window.print()}</script></body></html>'

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      {view === 'list' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Stocktake</h1>
              <p style={{ fontSize: 13, color: C.muted }}>Physical stock count — compare actual vs system quantities.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Session name (optional)"
                value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: 200 }}
              />
              <button onClick={createStocktake} disabled={creating}
                style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating...' : '+ Start stocktake'}
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ color: C.muted }}>Loading...</p>
          ) : stocktakes.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>📦</p>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No stocktakes yet</p>
              <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>Start a stocktake to count all your products and find discrepancies.</p>
              <button onClick={createStocktake} disabled={creating}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Start first stocktake
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stocktakes.map(s => (
                <div key={s.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
                  onClick={() => openStocktake(s.id)}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{s.name ?? 'Stocktake'}</p>
                    <p style={{ fontSize: 12, color: C.dim }}>
                      {new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {s.item_count != null && ' · ' + s.item_count + ' items'}
                      {s.variance_count != null && s.variance_count > 0 && ' · ' + s.variance_count + ' variances'}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: s.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: s.status === 'completed' ? C.green : C.amber }}>
                    {s.status}
                  </span>
                  <span style={{ fontSize: 13, color: C.muted }}>Open →</span>
                </div>
              ))}
            </div>
          )}
          {/* Aria stocktake intelligence */}
          {ariaLoading && (
            <div style={{ padding: '14px 18px', background: 'rgba(29,158,117,0.05)', border: '1px solid rgba(29,158,117,0.15)', borderRadius: 10, marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>⏳</span>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Aria is analysing variances for shrinkage patterns...</p>
            </div>
          )}
          {ariaInsight && (
            <div style={{ background: ariaInsight.priority === 'high' ? 'rgba(239,68,68,0.06)' : 'rgba(29,158,117,0.06)', border: '1px solid ' + (ariaInsight.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(29,158,117,0.2)'), borderRadius: 12, padding: '16px 20px', marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{ariaInsight.priority === 'high' ? '🔴' : '✦'}</span>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Aria Variance Analysis</p>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: ariaInsight.classified?.length ? 12 : 0 }}>{ariaInsight.insight}</p>
              {ariaInsight.classified && ariaInsight.classified.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {ariaInsight.classified.slice(0, 4).map((item, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: '3px solid ' + (item.classification === 'shrinkage' ? '#EF4444' : item.classification === 'counting_error' ? '#F59E0B' : '#6b7280') }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: item.classification === 'shrinkage' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: item.classification === 'shrinkage' ? '#EF4444' : '#F59E0B' }}>
                          {item.classification.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: item.variance < 0 ? '#EF4444' : '#22C55E', marginLeft: 'auto' }}>{item.variance > 0 ? '+' : ''}{item.variance}</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 2 }}>{item.reason}</p>
                      <p style={{ fontSize: 11, color: '#1D9E75', fontWeight: 600 }}>→ {item.action}</p>
                    </div>
                  ))}
                </div>
              )}
              <a href="/dashboard/autopilot" style={{ fontSize: 11, color: '#1D9E75', display: 'block', marginTop: 10 }}>View full analysis in Autopilot →</a>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Active stocktake view */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <button onClick={() => { setView('list'); setActiveId(null) }}
                style={{ fontSize: 12, color: C.muted, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>
                ← Back to stocktakes
              </button>
              <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Counting stock</h1>
              <p style={{ fontSize: 13, color: C.muted }}>{countedCount} of {items.length} products counted · {progress}% complete</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={downloadCSV}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Export CSV
              </button>
              <button onClick={printVarianceReport}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.08)', color: '#8B5CF6', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                📄 PDF report
              </button>
              <button onClick={completeStocktake} disabled={saving}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Completing...' : 'Complete stocktake'}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 16 }}>
            <div style={{ height: 4, width: progress + '%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.3s' }} />
          </div>

          {/* Summary bar */}
          {varianceItems.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', gap: 20, fontSize: 12, color: C.amber }}>
              <span>⚠ {varianceItems.filter(i => (i.variance ?? 0) < 0).length} items short</span>
              <span>📈 {varianceItems.filter(i => (i.variance ?? 0) > 0).length} items over</span>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
            />
            <button onClick={() => setFilterUncounted(!filterUncounted)}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid ' + (filterUncounted ? C.amber : C.border), background: filterUncounted ? 'rgba(245,158,11,0.1)' : 'transparent', color: filterUncounted ? C.amber : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Uncounted only
            </button>
          </div>

          {/* Items table */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.02)' }}>
                  {['Product', 'Expected', 'Counted', 'Variance'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Product' ? 'left' : 'center', color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayItems.map(item => {
                  const counted = counts[item.id]
                  const countedNum = counted !== '' ? parseInt(counted) : null
                  const variance = countedNum != null ? countedNum - item.expected_qty : item.variance
                  const hasDiff = variance != null && variance !== 0
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid ' + C.border, background: hasDiff ? (variance! < 0 ? 'rgba(239,68,68,0.03)' : 'rgba(34,197,94,0.03)') : 'transparent' }}>
                      <td style={{ padding: '10px 16px', color: C.text, fontWeight: 500 }}>{item.product_name}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', color: C.muted }}>{item.expected_qty}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={counted}
                          onChange={e => setCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                          onBlur={e => saveCount(item.id, e.target.value)}
                          placeholder="—"
                          style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: '1px solid ' + (counted !== '' ? (hasDiff ? (variance! < 0 ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)') : 'rgba(34,197,94,0.4)') : C.border), background: 'rgba(255,255,255,0.05)', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: variance == null ? C.dim : variance === 0 ? C.green : variance < 0 ? C.red : C.amber }}>
                        {variance == null ? '—' : variance === 0 ? '✓' : (variance > 0 ? '+' : '') + variance}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

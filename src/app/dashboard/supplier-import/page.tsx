'use client'
import { useState, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface ParsedRow { name: string; sku: string | null; new_cost: number; matched: boolean; product_id: string | null; current_cost: number | null; sell_price: number | null }
interface UploadResult { updated: number; skipped: number; errors: string[] }

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
  border: 'rgba(255,255,255,0.07)',
}

function parseCSV(text: string): Array<{ name: string; sku: string; cost: string }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  // Detect header
  const header = lines[0].toLowerCase()
  const hasHeader = header.includes('name') || header.includes('product') || header.includes('sku') || header.includes('cost') || header.includes('price')
  const dataLines = hasHeader ? lines.slice(1) : lines
  return dataLines.map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    // Try to detect columns: name/sku | cost
    if (cols.length >= 2) {
      const lastCol = cols[cols.length - 1]
      const cost = parseFloat(lastCol.replace(/[$A]/g, ''))
      // Check if second col looks like a cost (numeric)
      const secondNumeric = !isNaN(parseFloat(cols[1].replace(/[$A]/g, '')))
      if (secondNumeric && cols.length === 2) {
        return { name: cols[0], sku: '', cost: cols[1] }
      }
      if (cols.length >= 3) {
        // Assume: name, sku, cost
        return { name: cols[0], sku: cols[1], cost: lastCol }
      }
      return { name: cols[0], sku: '', cost: lastCol }
    }
    return { name: cols[0] ?? '', sku: '', cost: '0' }
  }).filter(r => r.name && !isNaN(parseFloat(r.cost.replace(/[$A]/g, ''))))
}

export default function SupplierImportPage() {
  const { business } = useBusinessContext()
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [result, setResult] = useState<UploadResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  const processFile = useCallback(async (file: File) => {
    if (!business?.id) return
    const text = await file.text()
    const parsed = parseCSV(text)
    if (parsed.length === 0) { alert('No valid rows found. Check your CSV format.'); return }

    // Load products to match against
    const res = await fetch('/api/pos/products?business_id=' + business.id)
    const d = await res.json() as { products?: Array<{ id: string; name: string; sku?: string | null; cost_price?: number | null; price?: number | null }> }
    const products = d.products ?? []

    // Match by SKU first, then name
    const matchedRows: ParsedRow[] = parsed.map(r => {
      const newCost = parseFloat(r.cost.replace(/[$A]/g, ''))
      // Try SKU match first
      let match = r.sku ? products.find(p => p.sku && p.sku.toLowerCase() === r.sku.toLowerCase()) : null
      // Fall back to name match
      if (!match) match = products.find(p => p.name.toLowerCase() === r.name.toLowerCase())
      // Partial name match
      if (!match) match = products.find(p => p.name.toLowerCase().includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(p.name.toLowerCase()))
      return {
        name: r.name,
        sku: r.sku || null,
        new_cost: newCost,
        matched: !!match,
        product_id: match?.id ?? null,
        current_cost: match ? Number(match.cost_price ?? 0) : null,
        sell_price: match ? Number(match.price ?? 0) : null,
      }
    })

    setRows(matchedRows)
    setStep('review')
  }, [business?.id])

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv') || file?.type === 'text/csv') processFile(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  async function applyImport() {
    const toUpdate = rows.filter(r => r.matched && r.product_id)
    if (toUpdate.length === 0) return
    setImporting(true)
    let updated = 0; const errors: string[] = []
    await Promise.all(toUpdate.map(async r => {
      try {
        const res = await fetch('/api/pos/products?id=' + r.product_id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cost_price: r.new_cost }),
        })
        if (res.ok) updated++
        else errors.push(r.name + ': update failed')
      } catch { errors.push(r.name + ': network error') }
    }))
    setResult({ updated, skipped: rows.filter(r => !r.matched).length, errors })
    setStep('done')
    setImporting(false)
  }

  const matched = rows.filter(r => r.matched).length
  const unmatched = rows.filter(r => !r.matched).length

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Supplier Price Import</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Upload a supplier CSV to bulk-update your product cost prices in one click.</p>
      </div>

      {step === 'upload' && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{ border: '2px dashed ' + (dragging ? '#1D9E75' : C.border), borderRadius: 14, padding: '60px 24px', textAlign: 'center', background: dragging ? 'rgba(29,158,117,0.05)' : 'transparent', cursor: 'pointer', transition: 'all 0.2s', marginBottom: 24 }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>📥</p>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Drop your supplier CSV here</p>
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>or click to browse</p>
            <label style={{ padding: '10px 24px', borderRadius: 10, background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-block' }}>
              Browse CSV
              <input type="file" accept=".csv,text/csv" onChange={onFileInput} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '20px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Accepted CSV formats</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: '2 columns', example: 'Product Name, Cost Price' },
                { label: '3 columns', example: 'Product Name, SKU, Cost Price' },
                { label: 'With header', example: 'name, sku, cost_price (header row auto-detected)' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ color: C.dim, width: 80, flexShrink: 0 }}>{f.label}</span>
                  <code style={{ color: '#1D9E75', background: 'rgba(29,158,117,0.08)', padding: '2px 8px', borderRadius: 4 }}>{f.example}</code>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: C.dim, marginTop: 12 }}>Matching is done by SKU first, then product name. Unmatched rows are skipped and shown for review.</p>
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total rows', value: rows.length, color: C.text },
              { label: 'Matched', value: matched, color: C.green },
              { label: 'Unmatched', value: unmatched, color: unmatched > 0 ? C.amber : C.muted },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.02)' }}>
                  {['Status', 'Product', 'SKU', 'Current cost', 'New cost', 'Change', 'Margin before', 'Margin after'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.dim, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const diff = r.current_cost != null ? r.new_cost - r.current_cost : null
                  const diffPct = diff != null && r.current_cost ? Math.round((diff / r.current_cost) * 100) : null
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid ' + C.border, background: r.matched ? 'transparent' : 'rgba(245,158,11,0.02)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: r.matched ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: r.matched ? C.green : C.amber }}>
                          {r.matched ? 'Matched' : 'No match'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: C.text, fontWeight: r.matched ? 500 : 400 }}>{r.name}</td>
                      <td style={{ padding: '10px 14px', color: C.dim, fontSize: 11 }}>{r.sku ?? '—'}</td>
                      <td style={{ padding: '10px 14px', color: C.muted }}>{r.current_cost != null ? 'A$' + r.current_cost.toFixed(2) : '—'}</td>
                      <td style={{ padding: '10px 14px', color: C.text, fontWeight: 600 }}>A${r.new_cost.toFixed(2)}</td>
                      <td style={{ padding: '10px 14px', color: diff == null ? C.dim : diff > 0 ? C.red : diff < 0 ? C.green : C.muted, fontWeight: 600 }}>
                        {diff == null ? '—' : (diff > 0 ? '+' : '') + 'A$' + diff.toFixed(2) + (diffPct != null ? ' (' + (diffPct > 0 ? '+' : '') + diffPct + '%)' : '')}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>
                        {r.sell_price && r.current_cost != null && r.sell_price > 0
                          ? Math.round(((r.sell_price - r.current_cost) / r.sell_price) * 100) + '%'
                          : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700 }}>
                        {(() => {
                          if (!r.sell_price || !r.sell_price || r.sell_price <= 0) return <span style={{ color: C.dim }}>—</span>
                          const newMarginPct = Math.round(((r.sell_price - r.new_cost) / r.sell_price) * 100)
                          const oldMarginPct = r.current_cost != null ? Math.round(((r.sell_price - r.current_cost) / r.sell_price) * 100) : null
                          const dropped = oldMarginPct != null && newMarginPct < oldMarginPct
                          return <span style={{ color: newMarginPct < 20 ? '#EF4444' : newMarginPct < 35 ? '#F59E0B' : '#22C55E' }}>{newMarginPct}%{dropped && oldMarginPct != null ? ' ↓' + (oldMarginPct - newMarginPct) + 'pp' : ''}</span>
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(() => {
            const marginDrops = rows.filter(r => r.matched && r.sell_price && r.sell_price > 0 && r.current_cost != null && r.new_cost > r.current_cost)
            if (marginDrops.length === 0) return null
            const worstDrop = marginDrops.sort((a, b) => (b.new_cost - (b.current_cost ?? 0)) - (a.new_cost - (a.current_cost ?? 0)))[0]
            const oldM = worstDrop.sell_price && worstDrop.current_cost != null ? Math.round(((worstDrop.sell_price - worstDrop.current_cost) / worstDrop.sell_price) * 100) : null
            const newM = worstDrop.sell_price ? Math.round(((worstDrop.sell_price - worstDrop.new_cost) / worstDrop.sell_price) * 100) : null
            return (
              <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600, marginBottom: 3 }}>⚠ Margin impact warning</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {marginDrops.length} products will have lower margins after this import.
                  {oldM != null && newM != null && ' Biggest drop: ' + worstDrop.name + ' from ' + oldM + '% → ' + newM + '% margin.'}
                  {newM != null && newM < 20 && ' Some products will fall below 20% — consider adjusting sell prices.'}
                </p>
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setStep('upload'); setRows([]) }}
              style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back
            </button>
            <button onClick={applyImport} disabled={importing || matched === 0}
              style={{ padding: '10px 24px', borderRadius: 9, border: 'none', background: matched > 0 ? '#1D9E75' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: matched > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: importing ? 0.6 : 1 }}>
              {importing ? 'Updating...' : 'Apply ' + matched + ' price update' + (matched !== 1 ? 's' : '')}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Import complete</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px' }}>
              <p style={{ fontSize: 11, color: C.muted }}>Updated</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: C.green }}>{result.updated}</p>
            </div>
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px' }}>
              <p style={{ fontSize: 11, color: C.muted }}>Skipped</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: C.muted }}>{result.skipped}</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div style={{ padding: '12px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, marginBottom: 16, textAlign: 'left' }}>
              <p style={{ fontSize: 12, color: C.red, marginBottom: 6, fontWeight: 600 }}>Errors:</p>
              {result.errors.map((e, i) => <p key={i} style={{ fontSize: 11, color: C.muted }}>{e}</p>)}
            </div>
          )}
          <button onClick={() => { setStep('upload'); setRows([]); setResult(null) }}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { SuppliersExtensions } from '@/components/dashboard/Prompt55Extensions'

interface SupplierRow {
  product_name: string; category: string | null; brand: string | null
  suppliers: Array<{ name: string; unit_price: number | null; case_price: number | null; case_qty: number | null; uom: string | null; in_stock: boolean }>
  your_price: number | null; best_unit: number | null; best_case_per_unit: number | null; savings_potential: number | null
}
interface PriceList { id: string; supplier_name: string; item_count: number; uploaded_at: string }
interface Summary { total_products: number; suppliers_loaded: number; products_with_savings: number; total_savings_potential_per_unit: number }

export default function SuppliersPage() {
  const { business } = useBusinessContext()
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [lists, setLists] = useState<PriceList[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadForm, setUploadForm] = useState({ supplier_name: '', content: '' })
  const [uploadMsg, setUploadMsg] = useState('')
  const [allSuppliers, setAllSuppliers] = useState<string[]>([])

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const [cmpRes, listsRes] = await Promise.all([
      fetch(`/api/suppliers/compare?business_id=${business.id}&search=${encodeURIComponent(search)}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/suppliers/price-lists?business_id=${business.id}`).then(r => r.json()).catch(() => ({})),
    ])
    setRows(cmpRes.rows ?? [])
    setSummary(cmpRes.summary ?? null)
    setLists(listsRes.lists ?? [])
    const supplierNames = [...new Set((cmpRes.rows ?? []).flatMap((r: SupplierRow) => r.suppliers.map(s => s.name)))] as string[]
    setAllSuppliers(supplierNames)
    setLoading(false)
  }, [business?.id, search])

  useEffect(() => { load() }, [load])

  async function uploadList() {
    if (!business?.id || !uploadForm.supplier_name || !uploadForm.content) return
    setUploading(true); setUploadMsg('')
    try {
      const res = await fetch('/api/suppliers/price-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, ...uploadForm }),
      }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setUploadMsg(`✅ Parsed ${res.items_parsed} products from ${res.supplier_name}`)
      setUploadForm({ supplier_name: '', content: '' })
      setShowUpload(false)
      load()
    } catch (e: unknown) {
      setUploadMsg(`❌ ${e instanceof Error ? e.message : 'Upload failed'}`)
    }
    setUploading(false)
  }

  const filtered = rows.filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase())
  )

  const g = (v: number | null) => v == null ? '-' : `$${v.toFixed(2)}`
  const bestSupplier = (row: SupplierRow) => {
    const candidates = row.suppliers.filter(s => s.in_stock)
    const best = candidates.reduce((acc, s) => {
      const p = s.unit_price ?? (s.case_price && s.case_qty ? s.case_price / s.case_qty : null)
      if (p == null) return acc
      if (acc.price == null || p < acc.price) return { name: s.name, price: p }
      return acc
    }, { name: null as string | null, price: null as number | null })
    return best
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d14', color: '#e5e7eb', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '24px 28px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>Supplier Price Comparison</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>
              Upload price lists from any supplier — Aria compares them against each other automatically
            </p>
          </div>
          <button
            onClick={() => setShowUpload(v => !v)}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#2D5240', border: '1px solid #7FB897', color: '#7FB897', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + Upload Price List
          </button>
        </div>

        {/* Summary bar */}
        {summary && (
          <div style={{ display: 'flex', gap: 24, paddingBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Suppliers loaded', value: summary.suppliers_loaded },
              { label: 'Products compared', value: summary.total_products },
              { label: 'Savings opportunities', value: summary.products_with_savings },
              { label: 'Total savings/unit', value: `$${summary.total_savings_potential_per_unit.toFixed(2)}` },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#7FB897' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{ margin: '16px 28px', padding: 20, borderRadius: 12, background: '#13131a', border: '1px solid rgba(127,184,151,0.2)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 12px' }}>Upload Supplier Price List</h3>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px' }}>
            Paste CSV data, copy/paste from a PDF, or type products manually. Aria will parse any format.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              value={uploadForm.supplier_name}
              onChange={e => setUploadForm(f => ({ ...f, supplier_name: e.target.value }))}
              placeholder="Supplier name (e.g. ALM, ILG, Local Wholsaler)"
              style={{ flex: '0 0 250px', padding: '8px 12px', borderRadius: 8, background: '#0d0d14', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13 }}
            />
          </div>
          <textarea
            value={uploadForm.content}
            onChange={e => setUploadForm(f => ({ ...f, content: e.target.value }))}
            placeholder={"Paste price list here — any format works:\n\nJack Daniel's 700ml, $28.50, case 6\nAbsolut Vodka 1L, $36.00\nCrown Lager 24pk, $58.00, case 4\n\nOr paste CSV columns: name, unit_price, case_price, case_qty"}
            rows={8}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0d0d14', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button
              onClick={uploadList}
              disabled={uploading || !uploadForm.supplier_name || !uploadForm.content}
              style={{ padding: '8px 16px', borderRadius: 8, background: uploading ? 'rgba(127,184,151,0.3)' : '#7FB897', border: 'none', color: '#0d0d14', fontSize: 13, fontWeight: 700, cursor: uploading ? 'default' : 'pointer' }}
            >
              {uploading ? 'Parsing…' : 'Parse & Save'}
            </button>
            <button onClick={() => setShowUpload(false)} style={{ padding: '8px 12px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            {uploadMsg && <span style={{ fontSize: 13, color: uploadMsg.startsWith('✅') ? '#7FB897' : '#f87171' }}>{uploadMsg}</span>}
          </div>
        </div>
      )}

      {/* Loaded price lists */}
      {lists.length > 0 && (
        <div style={{ padding: '12px 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {lists.map(l => (
            <div key={l.id} style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', fontSize: 12, color: '#7FB897' }}>
              {l.supplier_name} · {l.item_count} products
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '12px 28px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products…"
          style={{ width: '100%', maxWidth: 360, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
      ) : lists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>No supplier price lists uploaded yet</p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 8 }}>
            Upload a price list from ALM, ILG, or any supplier and Aria will compare prices instantly
          </p>
          <button
            onClick={() => setShowUpload(true)}
            style={{ marginTop: 16, padding: '10px 20px', borderRadius: 8, background: '#7FB897', border: 'none', color: '#0d0d14', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Upload First Price List
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>No products match &ldquo;{search}&rdquo;</div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '0 28px 40px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Product</th>
                {allSuppliers.map(s => (
                  <th key={s} style={{ textAlign: 'right', padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap' }}>{s}</th>
                ))}
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Best Deal</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Your Cost</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: '#7FB897', fontWeight: 600 }}>Save/Unit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((row, i) => {
                const best = bestSupplier(row)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, color: '#fff' }}>{row.product_name}</div>
                      {row.category && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{row.category}</div>}
                    </td>
                    {allSuppliers.map(s => {
                      const sup = row.suppliers.find(sp => sp.name === s)
                      const price = sup?.unit_price ?? (sup?.case_price && sup?.case_qty ? sup.case_price / sup.case_qty : null)
                      const isBest = best.name === s
                      return (
                        <td key={s} style={{ textAlign: 'right', padding: '10px 12px', color: isBest ? '#7FB897' : '#e5e7eb', fontWeight: isBest ? 700 : 400 }}>
                          {price != null ? `$${price.toFixed(2)}` : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                          {sup?.case_price && sup?.case_qty && (
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>case ${sup.case_price.toFixed(2)}/{sup.case_qty}</div>
                          )}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: '#7FB897', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {best.name ? `${best.name}: $${best.price?.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'rgba(255,255,255,0.5)' }}>
                      {g(row.your_price)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px' }}>
                      {(row.savings_potential ?? 0) > 0.01 ? (
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>+${row.savings_potential!.toFixed(2)}</span>
                      ) : (row.savings_potential ?? 0) < -0.01 ? (
                        <span style={{ color: '#f87171', fontSize: 12 }}>paying extra</span>
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              Showing 100 of {filtered.length} — narrow search to see more
            </p>
          )}
        </div>
      )}
      <SuppliersExtensions suppliers={lists.map(l => ({ id: l.id, name: l.supplier_name }))} />
    </div>
  )
}

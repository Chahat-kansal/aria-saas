'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
  total_rows: number
  duration_ms: number
  mapped_headers?: string[]
}

export default function ImportProductsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File | null) => {
    if (!f) return
    if (!f.name.endsWith('.csv') && !f.type.includes('csv') && !f.type.includes('text')) {
      setError('Please select a CSV file.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File exceeds 10MB limit.')
      return
    }
    setFile(f)
    setError('')
    setResult(null)
  }

  const runImport = async () => {
    if (!file) return
    setImporting(true)
    setProgress('Uploading…')
    setError('')
    setResult(null)

    const fd = new FormData()
    fd.append('file', file)

    try {
      setProgress(`Importing ${file.name}…`)
      const r = await fetch('/api/pos/products/import', { method: 'POST', body: fd })
      const j = await r.json() as ImportResult & { error?: string }

      if (!r.ok) {
        setError(j.error ?? 'Import failed')
      } else {
        setResult(j)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
      setProgress('')
    }
  }

  const reset = () => {
    setFile(null)
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="p-6 max-w-2xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header>
        <Link href="/dashboard/inventory" className="text-xs hover:underline mb-2 block" style={{ color: '#7FB897' }}>
          ← Back to inventory
        </Link>
        <h1 className="text-2xl font-medium">Import Products</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Upload a Shopfront, Lightspeed, Vend, or any standard CSV export. Headers are auto-detected.
        </p>
      </header>

      {/* Format guide */}
      <div className="rounded-xl p-4 text-xs space-y-1"
        style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
        <p className="font-medium mb-2">Supported columns (any order, case-insensitive):</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          {[
            ['Product Name *', 'name'],
            ['RRP / Sell Price / Price *', 'price'],
            ['Cost / Cost Price', 'cost_price'],
            ['SKU / Product Code', 'sku'],
            ['Barcode / EAN / UPC', 'barcode'],
            ['Stock On Hand / Quantity', 'stock_quantity'],
            ['Category / Department', 'category'],
            ['Brand / Supplier Brand', 'brand'],
            ['Supplier / Supplier Name', 'supplier_name'],
            ['Alcohol % / ABV', 'alcohol_percentage'],
            ['Standard Drinks / Std Drinks', 'standard_drinks'],
            ['Volume (ml) / Size', 'volume'],
            ['Country / Country of Origin', 'country_of_origin'],
            ['Vintage / Year', 'vintage'],
            ['Active / Enabled', 'is_active'],
            ['Reorder Point', 'reorder_point'],
          ].map(([label, field]) => (
            <div key={field} className="flex gap-1">
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>* Required. All monetary values in dollars.</p>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div
            className="rounded-xl p-8 text-center cursor-pointer transition-colors"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '2px dashed var(--divider, rgba(232,237,231,0.12))' }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0] ?? null) }}
            onClick={() => fileRef.current?.click()}>
            <p className="text-3xl mb-2">📄</p>
            <p className="font-medium">{file ? file.name : 'Drop your CSV here or click to browse'}</p>
            {file ? (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                {(file.size / 1024).toFixed(0)} KB
              </p>
            ) : (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                CSV files up to 10MB
              </p>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => handleFile(e.target.files?.[0] ?? null)} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          {file && (
            <button onClick={runImport} disabled={importing}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              {importing ? progress || 'Importing…' : `Import "${file.name}"`}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="rounded-xl p-5 space-y-4"
            style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <div className="text-2xl font-semibold text-emerald-400">{result.imported.toLocaleString()}</div>
                <div className="text-xs mt-0.5 text-emerald-400">Imported</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.1)' }}>
                <div className="text-2xl font-semibold" style={{ color: '#f59e0b' }}>{result.skipped.toLocaleString()}</div>
                <div className="text-xs mt-0.5" style={{ color: '#f59e0b' }}>Skipped</div>
              </div>
              <div className="rounded-lg p-3" style={{ background: result.errors.length ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)' }}>
                <div className="text-2xl font-semibold" style={{ color: result.errors.length ? '#ef4444' : 'var(--text-secondary, #A8B5A8)' }}>
                  {result.errors.length}
                </div>
                <div className="text-xs mt-0.5" style={{ color: result.errors.length ? '#ef4444' : 'var(--text-secondary, #A8B5A8)' }}>Errors</div>
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              {result.total_rows.toLocaleString()} rows processed in {(result.duration_ms / 1000).toFixed(1)}s
            </p>

            {result.errors.length > 0 && (
              <div className="rounded-lg p-3 space-y-1" style={{ background: 'rgba(239,68,68,0.08)' }}>
                <p className="text-xs font-medium text-red-400">First {result.errors.length} error{result.errors.length > 1 ? 's' : ''}:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-red-300">{e}</p>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Link href="/pos/products"
              className="flex-1 py-2 rounded-xl text-sm font-medium text-center"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              View products →
            </Link>
            <button onClick={reset}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)' }}>
              Import another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

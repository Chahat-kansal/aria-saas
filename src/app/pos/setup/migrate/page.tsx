'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'

interface MappingItem { source: string; target: string | null; confidence: number; reason?: string }
interface MigrationRecord { id: string; status: string; progress: number; products_imported: number; products_updated: number; error?: string | null; completed_at?: string | null }

const SOURCES = [
  { id: 'shopfront', icon: '🛒', label: 'Shopfront', desc: 'Import from Shopfront CSV exports. Most common for Australian liquor.' },
  { id: 'custom_csv', icon: '📄', label: 'Custom CSV', desc: 'Import from any POS using a CSV export. Map your own columns.' },
  { id: 'square', icon: '◻', label: 'Square', disabled: true, desc: 'OAuth import coming Q3 2026. Export a CSV from Square for now.' },
  { id: 'lightspeed', icon: '⚡', label: 'Lightspeed', disabled: true, desc: 'OAuth import coming Q3 2026. Export a CSV from Lightspeed for now.' },
]

const TARGET_FIELDS = [
  { value: '', label: '(skip)' },
  { value: 'name', label: 'Product Name *' },
  { value: 'sku', label: 'SKU' },
  { value: 'barcode', label: 'Barcode / EAN' },
  { value: 'brand', label: 'Brand' },
  { value: 'category', label: 'Category' },
  { value: 'supplier_name', label: 'Supplier Name' },
  { value: 'unit_price', label: 'Selling Price' },
  { value: 'cost_price', label: 'Cost Price' },
  { value: 'stock_quantity', label: 'Stock Quantity' },
  { value: 'description', label: 'Description' },
  { value: 'tags', label: 'Tags' },
]

const confColor = (c: number) => c >= 0.8 ? '#34D399' : c >= 0.5 ? '#FBBF24' : '#F87171'
const confLabel = (c: number) => c >= 0.8 ? 'High' : c >= 0.5 ? 'Medium' : 'Low'

export default function MigratePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [source, setSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping] = useState<MappingItem[]>([])
  const [migrationId, setMigrationId] = useState<string | null>(null)
  const [migration, setMigration] = useState<MigrationRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (step !== 5 || !migrationId) return
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/pos/migrate?id=${migrationId}`)
      const { migration: m } = await res.json() as { migration: MigrationRecord }
      setMigration(m)
      if (m?.status === 'done' || m?.status === 'failed' || m?.status === 'cancelled') {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, migrationId])

  function parseFile(f: File) {
    setFile(f)
    let headersSet = false
    let previewRows: Record<string, string>[] = []
    let rowCount = 0
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      chunk: (results) => {
        if (!headersSet) {
          setHeaders(results.meta.fields ?? [])
          headersSet = true
        }
        rowCount += results.data.length
        if (previewRows.length < 5) {
          previewRows = [...previewRows, ...results.data].slice(0, 5)
          setPreview(previewRows)
        }
        setTotalRows(rowCount)
      },
      complete: () => setErrMsg(null),
      error: (err) => setErrMsg(err.message),
    })
  }

  async function suggestMapping() {
    setLoading(true); setErrMsg(null)
    const samples: Record<string, string[]> = {}
    for (const h of headers) {
      samples[h] = [...new Set(preview.map(r => r[h]).filter(Boolean))].slice(0, 3)
    }
    const fd = new FormData()
    fd.set('action', 'suggest_mapping')
    fd.set('headers', JSON.stringify(headers))
    fd.set('samples', JSON.stringify(samples))
    try {
      const res = await fetch('/api/pos/migrate', { method: 'POST', body: fd })
      const data = await res.json() as { mappings?: MappingItem[] }
      if (data.mappings?.length) {
        // Only auto-apply high-confidence mappings; clear low-confidence ones for manual review
        setMapping(data.mappings.map((m: MappingItem) => ({
          ...m,
          target: m.confidence < 0.5 ? null : m.target,
        })))
      } else {
        setMapping(headers.map(h => ({ source: h, target: null, confidence: 0 })))
      }
      setStep(3)
    } catch (e) {
      setErrMsg((e as Error).message)
      setMapping(headers.map(h => ({ source: h, target: null, confidence: 0 })))
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  async function startImport() {
    if (!file) return
    setLoading(true); setErrMsg(null)
    const fd = new FormData()
    fd.set('action', 'start_import')
    fd.set('file', file)
    fd.set('source', source)
    fd.set('mapping', JSON.stringify(mapping))
    try {
      const res = await fetch('/api/pos/migrate', { method: 'POST', body: fd })
      const data = await res.json() as { migration_id?: string; error?: string }
      if (data.error) { setErrMsg(data.error); setLoading(false); return }
      setMigrationId(data.migration_id ?? null)
      setMigration({ id: data.migration_id ?? '', status: 'importing', progress: 0, products_imported: 0, products_updated: 0 })
      setStep(5)
    } catch (e) {
      setErrMsg((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function cancelMigration() {
    if (!migrationId) return
    if (pollRef.current) clearInterval(pollRef.current)
    const fd = new FormData()
    fd.set('action', 'cancel')
    fd.set('migration_id', migrationId)
    await fetch('/api/pos/migrate', { method: 'POST', body: fd })
    setMigration(m => m ? { ...m, status: 'cancelled' } : null)
  }

  function updateMapping(source: string, target: string | null) {
    setMapping(prev => prev.map(m => m.source === source ? { ...m, target } : m))
  }

  const mappedPreview = preview.slice(0, 10).map(row => {
    const out: Record<string, string> = {}
    for (const m of mapping) {
      if (m.target && m.target !== '') out[m.target] = row[m.source] ?? ''
    }
    return out
  })
  const mappedCols = [...new Set(mapping.filter(m => m.target).map(m => m.target as string))]

  const STEP_LABELS = ['Source', 'Upload', 'Map Fields', 'Preview', 'Import']
  const progress = ((step - 1) / 4) * 100

  const card: React.CSSProperties = { background: 'var(--bg-surface)', borderRadius: 14, padding: '24px', border: '1px solid var(--border-default)', marginBottom: 12 }
  const btn: React.CSSProperties = { padding: '10px 24px', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const btnSec: React.CSSProperties = { ...btn, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '32px 28px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Import from existing POS</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>Aria maps your columns automatically with AI — you review before anything imports.</p>

        <div style={{ display: 'flex', gap: 0, marginBottom: 28, position: 'relative' }}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1; const done = step > n; const active = step === n
            return (
              <div key={n} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', left: 0, top: 12, width: '50%', height: 2, background: done ? 'var(--violet)' : 'var(--divider)' }} />}
                {i < 4 && <div style={{ position: 'absolute', right: 0, top: 12, width: '50%', height: 2, background: step > n ? 'var(--violet)' : 'var(--divider)' }} />}
                <div style={{ width: 26, height: 26, borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, position: 'relative', zIndex: 1, background: done ? 'var(--violet)' : active ? 'var(--bg-base)' : 'var(--bg-elevated)', border: active ? '2px solid var(--violet)' : done ? 'none' : '2px solid var(--border-default)', color: done ? '#fff' : active ? 'var(--violet)' : 'var(--text-tertiary)' }}>
                  {done ? '✓' : n}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--violet)' : 'var(--text-tertiary)' }}>{label}</div>
              </div>
            )
          })}
        </div>

        {errMsg && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', fontSize: 13, marginBottom: 16 }}>⚠ {errMsg}</div>}

        {/* STEP 1 */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {SOURCES.map(s => (
              <div key={s.id} onClick={() => { if (!s.disabled) { setSource(s.id); setStep(2) } }}
                style={{ ...card, cursor: s.disabled ? 'default' : 'pointer', opacity: s.disabled ? 0.5 : 1, position: 'relative', marginBottom: 0 }}
                onMouseEnter={e => { if (!s.disabled) (e.currentTarget as HTMLElement).style.borderColor = 'var(--violet)' }}
                onMouseLeave={e => { if (!s.disabled) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)' }}>
                {s.disabled && <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', fontWeight: 700 }}>Q3 2026</span>}
                <div style={{ fontSize: 30, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div ref={dropRef}
              onDragOver={e => { e.preventDefault(); (dropRef.current as HTMLElement).style.borderColor = 'var(--violet)' }}
              onDragLeave={() => { (dropRef.current as HTMLElement).style.borderColor = 'var(--border-default)' }}
              onDrop={e => { e.preventDefault(); (dropRef.current as HTMLElement).style.borderColor = 'var(--border-default)'; const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.csv')) { if (f.size > 10 * 1024 * 1024) { setErrMsg('File must be under 10MB'); return } parseFile(f) } else setErrMsg('Please upload a .csv file') }}
              onClick={() => document.getElementById('csvInput')?.click()}
              style={{ border: '2px dashed var(--border-default)', borderRadius: 14, padding: '40px', textAlign: 'center', cursor: 'pointer', marginBottom: 20, transition: 'border-color 150ms' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              {file ? (
                <div><div style={{ fontWeight: 700, color: '#34D399' }}>✓ {file.name}</div><div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{totalRows.toLocaleString()} rows detected</div></div>
              ) : (
                <div><div style={{ fontWeight: 600, marginBottom: 4 }}>Drop your CSV file here</div><div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>or click to browse · Max 10MB</div></div>
              )}
              <input id="csvInput" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 10 * 1024 * 1024) { setErrMsg('File must be under 10MB'); return } parseFile(f) } }} />
            </div>

            {preview.length > 0 && (
              <div style={{ marginBottom: 20, overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-default)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      {headers.map(h => <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--divider)' }}>
                        {headers.map(h => <td key={h} style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h] ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnSec} onClick={() => setStep(1)}>← Back</button>
              <button style={{ ...btn, opacity: (!file || loading) ? 0.6 : 1, cursor: (!file || loading) ? 'not-allowed' : 'pointer' }} onClick={() => { if (file && !loading) suggestMapping() }} disabled={!file || loading}>
                {loading ? 'Analysing…' : 'Map fields →'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
              ✨ Aria suggested these mappings — adjust any that look wrong.
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border-default)', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    {['Your column (sample)', 'Map to', 'Confidence'].map(h => <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m, i) => {
                    const sampleVal = preview.map(r => r[m.source]).filter(Boolean).slice(0, 1)[0] ?? ''
                    const isHigh = m.confidence >= 0.8
                    const isMed = m.confidence >= 0.5 && m.confidence < 0.8
                    return (
                      <tr key={m.source} style={{ borderTop: i > 0 ? '1px solid var(--divider)' : 'none', background: isHigh && m.target ? 'rgba(52,211,153,0.04)' : 'transparent' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.source}</div>
                          {sampleVal && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{sampleVal.slice(0, 30)}</div>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select value={m.target ?? ''} onChange={e => updateMapping(m.source, e.target.value || null)}
                              style={{ background: 'var(--bg-elevated)', border: `1px solid ${isHigh && m.target ? 'rgba(52,211,153,0.4)' : isMed && m.target ? 'rgba(251,191,36,0.4)' : 'var(--border-default)'}`, borderRadius: 7, padding: '5px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit', cursor: 'pointer' }}>
                              {TARGET_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                            {isHigh && m.target && <span style={{ color: '#34D399', fontSize: 14 }}>✓</span>}
                            {isMed && m.target && <span style={{ color: '#FBBF24', fontSize: 11, fontWeight: 600 }}>confirm?</span>}
                            {!m.target && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>select →</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: confColor(m.confidence) + '22', color: confColor(m.confidence), fontWeight: 700 }}>{confLabel(m.confidence)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnSec} onClick={() => setStep(2)}>← Back</button>
              <button style={btn} onClick={() => setStep(4)}>Preview import →</button>
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div>
            <div style={{ ...card }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Ready to import</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {totalRows.toLocaleString()} products from {source === 'shopfront' ? 'Shopfront' : 'CSV'} · Matched on barcode → SKU → name
              </div>
              {mappedPreview.length > 0 && (
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--divider)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        {mappedCols.map(c => <th key={c} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {mappedPreview.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--divider)' }}>
                          {mappedCols.map(c => <td key={c} style={{ padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[c] ?? ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button style={btnSec} onClick={() => setStep(3)}>← Back</button>
              <button style={{ ...btn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }} onClick={startImport} disabled={loading}>
                {loading ? 'Starting…' : `Import ${totalRows.toLocaleString()} products →`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && migration && (
          <div style={{ textAlign: 'center' }}>
            {migration.status === 'done' ? (
              <>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Import complete</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>Your products are now in Aria.</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
                  <div style={{ ...card, textAlign: 'center', minWidth: 120, marginBottom: 0, padding: '16px 20px' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#34D399' }}>{migration.products_imported}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Imported</div>
                  </div>
                  <div style={{ ...card, textAlign: 'center', minWidth: 120, marginBottom: 0, padding: '16px 20px' }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#60A5FA' }}>{migration.products_updated}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Updated</div>
                  </div>
                </div>
                {migration.error && <p style={{ fontSize: 12, color: '#F87171', marginBottom: 16 }}>⚠ Some rows had errors: {migration.error}</p>}
                <button style={btn} onClick={() => router.push('/pos/products')}>View products →</button>
              </>
            ) : migration.status === 'failed' || migration.status === 'cancelled' ? (
              <>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{migration.status === 'cancelled' ? '⏹' : '❌'}</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{migration.status === 'cancelled' ? 'Import cancelled' : 'Import failed'}</h2>
                {migration.error && <p style={{ fontSize: 13, color: '#F87171', marginBottom: 20 }}>{migration.error}</p>}
                <button style={btnSec} onClick={() => { setStep(1); setFile(null); setHeaders([]); setPreview([]); setMigrationId(null); setMigration(null) }}>Start over</button>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px' }}>Importing…</h2>
                <div style={{ background: 'var(--bg-surface)', borderRadius: 99, height: 10, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--violet)', borderRadius: 99, width: `${migration.progress}%`, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ fontWeight: 700, color: '#34D399' }}>{migration.products_imported}</span> imported</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}><span style={{ fontWeight: 700, color: '#60A5FA' }}>{migration.products_updated}</span> updated</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{migration.progress}%</div>
                </div>
                <button style={{ ...btnSec, fontSize: 13, padding: '8px 18px' }} onClick={cancelMigration}>Cancel</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

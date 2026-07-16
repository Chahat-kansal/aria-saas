'use client'
import { useState } from 'react'

interface BasResult {
  period: { starts_at: string; ends_at: string }
  sales_count: number
  total_sales: number
  total_gst_collected: number
  total_wet_collected: number
  total_lct_collected: number
  total_other_tax: number
  gst_free_sales: number
  bas_g1: number
  bas_1a: number
  bas_g3: number
  no_breakdown_sales_count: number
  no_breakdown_sales_value: number
}

function defaultQuarterRange() {
  const now = new Date()
  const month = now.getMonth()
  const startMonth = Math.floor(month / 3) * 3
  const start = new Date(now.getFullYear(), startMonth, 1)
  const end = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59)
  return { starts: start.toISOString().slice(0, 10), ends: end.toISOString().slice(0, 10) }
}

export default function BasPage() {
  const def = defaultQuarterRange()
  const [startsAt, setStartsAt] = useState(def.starts)
  const [endsAt, setEndsAt] = useState(def.ends)
  const [result, setResult] = useState<BasResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    const r = await fetch(`/api/pos/bas-export?starts_at=${encodeURIComponent(new Date(startsAt).toISOString())}&ends_at=${encodeURIComponent(new Date(endsAt + 'T23:59:59').toISOString())}`)
    const d = await r.json()
    setResult(d)
    setLoading(false)
  }

  async function save() {
    if (!result) return
    const body = {
      period_starts_at: new Date(startsAt).toISOString(),
      period_ends_at: new Date(endsAt + 'T23:59:59').toISOString(),
      ...result,
      breakdown_jsonb: { sales_count: result.sales_count },
    }
    await fetch('/api/pos/bas-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    alert('BAS run saved to log')
  }

  function downloadCsv() {
    if (!result) return
    const rows = [
      ['Field', 'Description', 'Amount AUD'],
      ['G1', 'Total sales', result.bas_g1.toFixed(2)],
      ['1A', 'GST on sales', result.bas_1a.toFixed(2)],
      ['G3', 'Other GST-free sales', result.bas_g3.toFixed(2)],
      ['', 'GST collected', result.total_gst_collected.toFixed(2)],
      ['', 'WET collected', result.total_wet_collected.toFixed(2)],
      ['', 'LCT collected', result.total_lct_collected.toFixed(2)],
      ['', 'Other tax', result.total_other_tax.toFixed(2)],
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `BAS-${startsAt}-to-${endsAt}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">BAS export</h1>
      <p className="text-xs text-[var(--text-secondary)] mb-6">Generate an ATO-aligned BAS summary from completed sales. Default range is the current quarter.</p>
      <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] p-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs mb-1 text-[var(--text-secondary)]">Period starts</label>
            <input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="w-full border border-[var(--divider)] rounded-xl px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="block text-xs mb-1 text-[var(--text-secondary)]">Period ends</label>
            <input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full border border-[var(--divider)] rounded-xl px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)]" />
          </div>
        </div>
        <button onClick={generate} disabled={loading} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--violet-700)] text-[var(--text-primary)] disabled:opacity-50">{loading ? 'Generating…' : 'Generate'}</button>
      </div>
      {result && (
        <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[var(--text-primary)]">Quarterly summary</h2>
            <div className="flex gap-2">
              <button onClick={downloadCsv} className="px-3 py-1.5 rounded-lg text-xs border border-[var(--divider)] text-[var(--text-secondary)]">Download CSV</button>
              <button onClick={save} className="px-3 py-1.5 rounded-lg text-xs bg-[var(--violet-700)] text-[var(--text-primary)]">Save run</button>
            </div>
          </div>
          <table className="w-full text-sm text-[var(--text-primary)]">
            <tbody>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 text-[var(--text-secondary)]">Sales count</td><td className="text-right py-2">{result.sales_count}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 font-medium text-[var(--violet)]">G1 — Total sales</td><td className="text-right py-2 font-semibold">A${(Number(result.bas_g1) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 font-medium text-[var(--violet)]">1A — GST on sales</td><td className="text-right py-2 font-semibold">A${(Number(result.bas_1a) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 font-medium text-[var(--violet)]">G3 — GST-free sales</td><td className="text-right py-2 font-semibold">A${(Number(result.bas_g3) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 text-[var(--text-secondary)]">  ↳ GST collected</td><td className="text-right py-2">A${(Number(result.total_gst_collected) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 text-[var(--text-secondary)]">  ↳ WET collected</td><td className="text-right py-2">A${(Number(result.total_wet_collected) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 text-[var(--text-secondary)]">  ↳ LCT collected</td><td className="text-right py-2">A${(Number(result.total_lct_collected) || 0).toFixed(2)}</td></tr>
              <tr className="border-t border-[var(--divider)]"><td className="py-2 text-[var(--text-secondary)]">  ↳ Other tax</td><td className="text-right py-2">A${(Number(result.total_other_tax) || 0).toFixed(2)}</td></tr>
            </tbody>
          </table>
          {result.no_breakdown_sales_count > 0 && (
            <p className="text-xs text-[var(--amber,#b45309)] mt-3">
              ⚠ {result.no_breakdown_sales_count} sale{result.no_breakdown_sales_count === 1 ? '' : 's'}
              (A${result.no_breakdown_sales_value.toFixed(2)} tax) had no per-item tax-code
              breakdown recorded and were counted as standard GST — verify these weren&apos;t
              actually GST-free/WET/LCT before lodging.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

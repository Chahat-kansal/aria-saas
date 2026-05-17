'use client'
import { useState, useEffect, useCallback } from 'react'

interface Outlet { id: string; name: string; tax_jurisdiction: string | null; state_code: string | null }
interface TaxCode { id: string; code: string; name: string; rate: number }
interface Override { id: string; outlet_id: string; tax_code_id: string; rate_override: number | null; is_active: boolean }

export default function OutletTaxPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])

  const load = useCallback(async () => {
    const [o, c, ov] = await Promise.all([
      fetch('/api/pos/outlets').then(r => r.json()),
      fetch('/api/pos/tax-codes').then(r => r.json()),
      fetch('/api/pos/outlet-tax-overrides').then(r => r.json()),
    ])
    setOutlets(o.outlets ?? [])
    setCodes(c.tax_codes ?? [])
    setOverrides(ov.overrides ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function setOverride(outletId: string, codeId: string, rateOverride: number | null) {
    await fetch('/api/pos/outlet-tax-overrides', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outlet_id: outletId, tax_code_id: codeId, rate_override: rateOverride }),
    })
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Per-outlet tax overrides</h1>
      <p className="text-xs text-[var(--text-secondary)] mb-6">Override the base tax rate for specific outlets. Useful for multi-state retailers (NSW vs VIC) or international (AU vs NZ).</p>
      <div className="space-y-6">
        {outlets.map(o => (
          <div key={o.id} className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-[var(--text-primary)]">{o.name}</h2>
              <span className="text-xs text-[var(--text-secondary)]">{o.state_code ?? o.tax_jurisdiction ?? 'AU'}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left py-2">Code</th>
                  <th className="text-right py-2">Base rate</th>
                  <th className="text-right py-2">Override %</th>
                </tr>
              </thead>
              <tbody>
                {codes.map(c => {
                  const ov = overrides.find(o2 => o2.outlet_id === o.id && o2.tax_code_id === c.id)
                  return (
                    <tr key={c.id} className="border-t border-[var(--divider)] text-[var(--text-primary)]">
                      <td className="py-2 font-mono text-xs">{c.code} — {c.name}</td>
                      <td className="text-right py-2">{(Number(c.rate) || 0).toFixed(1)}%</td>
                      <td className="text-right py-2">
                        <input
                          type="number" step={0.5} min={0} max={100}
                          defaultValue={ov?.rate_override ?? ''}
                          placeholder="—"
                          onBlur={e => setOverride(o.id, c.id, e.target.value === '' ? null : parseFloat(e.target.value))}
                          className="w-20 border border-[var(--divider)] rounded px-2 py-1 text-sm text-right bg-[var(--bg-input)] text-[var(--text-primary)]"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
        {outlets.length === 0 && (
          <div className="bg-[var(--bg-elevated)] rounded-2xl border border-[var(--divider)] p-8 text-center text-sm text-[var(--text-secondary)]">No outlets found. Create outlets first at Settings → Registers &amp; Outlets.</div>
        )}
      </div>
    </div>
  )
}

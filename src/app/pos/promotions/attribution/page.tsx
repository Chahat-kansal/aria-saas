'use client'
import { useState, useEffect, useCallback } from 'react'

interface AttributionRow {
  promotion_id: string
  promotion_name: string
  total_redemptions: number
  total_amount_off: number
  total_sales_amount: number
}

export default function PromoAttributionPage() {
  const [rows, setRows] = useState<AttributionRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch('/api/pos/promotions/attribution')
    const d = await r.json()
    setRows(d.rows ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-6">Loading…</div>

  const totalRedemptions = rows.reduce((s, r) => s + r.total_redemptions, 0)
  const totalDiscounted = rows.reduce((s, r) => s + (Number(r.total_amount_off) || 0), 0)
  const totalSales = rows.reduce((s, r) => s + (Number(r.total_sales_amount) || 0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">Promotion Attribution</h1>
      <p className="text-xs text-[rgba(26,26,22,.5)] mb-6">Which promos drove which sales. Compares discount given vs revenue captured.</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border p-4">
          <div className="text-xs text-[rgba(26,26,22,.5)]">Total redemptions</div>
          <div className="text-2xl font-semibold">{totalRedemptions}</div>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <div className="text-xs text-[rgba(26,26,22,.5)]">Total discounted</div>
          <div className="text-2xl font-semibold">A${totalDiscounted.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-2xl border p-4">
          <div className="text-xs text-[rgba(26,26,22,.5)]">Sales attributed</div>
          <div className="text-2xl font-semibold">A${totalSales.toFixed(2)}</div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(0,0,0,.02)] text-xs font-medium text-[rgba(26,26,22,.5)]">
            <tr>
              <th className="text-left px-4 py-3">Promo</th>
              <th className="text-right px-4 py-3">Redemptions</th>
              <th className="text-right px-4 py-3">Discount</th>
              <th className="text-right px-4 py-3">Sales</th>
              <th className="text-right px-4 py-3">ROI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.promotion_id} className="border-t border-[rgba(0,0,0,.04)]">
                <td className="px-4 py-3">{r.promotion_name}</td>
                <td className="px-4 py-3 text-right">{r.total_redemptions}</td>
                <td className="px-4 py-3 text-right">A${(Number(r.total_amount_off) || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">A${(Number(r.total_sales_amount) || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  {(Number(r.total_amount_off) || 0) > 0
                    ? `${(((Number(r.total_sales_amount) || 0) / (Number(r.total_amount_off) || 1)) * 100).toFixed(0)}%`
                    : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.4)]">No promo redemptions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

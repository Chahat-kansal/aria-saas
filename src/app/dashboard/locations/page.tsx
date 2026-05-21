'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface LocationData {
  id: string
  name: string
  city: string | null
  address: string | null
  plan: string
  revenue_30d: number
  transactions_30d: number
  avg_basket: number
  low_stock_count: number
  is_current: boolean
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}

function fmt(n: number) {
  return 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function LocationsPage() {
  const { business } = useBusinessContext()
  const [locations, setLocations] = useState<LocationData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState(30)

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    setError('')
    try {
      // Fetch all locations from the businesses API — returns sibling businesses
      // sharing the same parent_account_id, or just the current business if solo
      const res = await fetch('/api/pos/business?include_locations=true')
      const d = await res.json() as {
        business?: { id: string; name: string; city: string | null; address: string | null; plan: string; parent_account_id: string | null }
        locations?: Array<{ id: string; name: string; city: string | null; address: string | null; plan: string }>
      }

      // Use locations array if available, otherwise just current business
      const allLocations = d.locations ?? (d.business ? [d.business] : [])
      if (allLocations.length === 0) {
        // Fallback: just show current business
        const bizRes = await fetch('/api/settings/business')
        const bizData = await bizRes.json()
        const biz = bizData.business
        if (biz) {
          allLocations.push({ id: biz.id, name: biz.name, city: biz.city, address: biz.address, plan: biz.plan })
        }
      }

      // For each location fetch 30d sales
      const since = new Date(Date.now() - selectedPeriod * 86400000).toISOString()
      const enriched: LocationData[] = await Promise.all(allLocations.map(async loc => {
        try {
          const salesRes = await fetch('/api/pos/sales?business_id=' + loc.id + '&limit=2000&since=' + since)
          const salesData = await salesRes.json() as { sales?: Array<{ total_amount: number; status: string }> }
          const sales = (salesData.sales ?? []).filter(s => s.status !== 'voided')
          const revenue = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
          const txCount = sales.length
          const avgBasket = txCount > 0 ? revenue / txCount : 0

          const stockRes = await fetch('/api/pos/products?business_id=' + loc.id)
          const stockData = await stockRes.json() as { products?: Array<{ stock_quantity?: number; low_stock_threshold?: number; track_stock?: boolean }> }
          const lowStock = (stockData.products ?? []).filter(p =>
            p.track_stock !== false && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5)
          ).length

          return {
            id: loc.id,
            name: loc.name,
            city: loc.city,
            address: loc.address,
            plan: loc.plan,
            revenue_30d: revenue,
            transactions_30d: txCount,
            avg_basket: avgBasket,
            low_stock_count: lowStock,
            is_current: loc.id === business?.id,
          }
        } catch {
          return {
            id: loc.id, name: loc.name, city: loc.city, address: loc.address, plan: loc.plan,
            revenue_30d: 0, transactions_30d: 0, avg_basket: 0, low_stock_count: 0,
            is_current: loc.id === business?.id,
          }
        }
      }))

      setLocations(enriched.sort((a, b) => b.revenue_30d - a.revenue_30d))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [business?.id, selectedPeriod])

  useEffect(() => { load() }, [load])

  const totalRevenue = locations.reduce((s, l) => s + l.revenue_30d, 0)
  const totalTx = locations.reduce((s, l) => s + l.transactions_30d, 0)
  const isSingleLocation = locations.length <= 1

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Locations</h1>
          <p style={{ fontSize: 13, color: C.muted }}>
            {isSingleLocation
              ? 'All your stores in one view. Upgrade to the Enterprise plan to manage multiple locations.'
              : locations.length + ' locations tracked · ' + selectedPeriod + '-day comparison'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[7, 30, 90].map(p => (
            <button key={p} onClick={() => setSelectedPeriod(p)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (selectedPeriod === p ? C.violet : C.border), background: selectedPeriod === p ? 'rgba(139,92,246,0.1)' : 'transparent', color: selectedPeriod === p ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: C.red, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Network totals */}
      {!isSingleLocation && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Network revenue ' + selectedPeriod + 'd', value: fmt(totalRevenue), color: C.green },
            { label: 'Total transactions', value: String(totalTx), color: C.text },
            { label: 'Locations', value: String(locations.length), color: C.violet },
          ].map(s => (
            <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '24px', height: 140 }} />
          ))}
        </div>
      ) : isSingleLocation ? (
        <>
          {/* Single location — show current store data + upgrade prompt */}
          {locations.length === 1 && (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '24px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{locations[0].name}</h2>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(29,158,117,0.15)', color: C.green }}>This store</span>
                  </div>
                  {locations[0].city && <p style={{ fontSize: 13, color: C.muted }}>{locations[0].city}</p>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                {[
                  { label: 'Revenue ' + selectedPeriod + 'd', value: fmt(locations[0].revenue_30d), color: C.green },
                  { label: 'Transactions', value: String(locations[0].transactions_30d), color: C.text },
                  { label: 'Avg basket', value: fmt(locations[0].avg_basket), color: C.violet },
                  { label: 'Low stock items', value: String(locations[0].low_stock_count), color: locations[0].low_stock_count > 0 ? C.amber : C.green },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 16px' }}>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upgrade prompt */}
          <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(29,158,117,0.08))', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 14, padding: '28px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🏪</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Multi-location dashboard</h3>
            <p style={{ fontSize: 14, color: C.muted, maxWidth: 480, margin: '0 auto 20px' }}>
              Opening a second store? Aria gives you a single pane of glass — compare revenue, stock, and staff performance across all locations in real time.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
              {['Side-by-side revenue comparison', 'Per-location stock alerts', 'Staff performance by store', 'Network-wide customer loyalty'].map(f => (
                <span key={f} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, background: 'rgba(139,92,246,0.1)', color: C.violet, border: '1px solid rgba(139,92,246,0.2)' }}>
                  ✓ {f}
                </span>
              ))}
            </div>
            <a href="/dashboard/settings/plan"
              style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 10, background: C.violet, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Upgrade to Enterprise — A$997/mo
            </a>
          </div>
        </>
      ) : (
        /* Multiple locations — comparison grid */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Revenue bar chart */}
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px 24px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Revenue by location — last {selectedPeriod} days</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {locations.map(loc => {
                const pct = totalRevenue > 0 ? (loc.revenue_30d / totalRevenue) * 100 : 0
                return (
                  <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: loc.is_current ? C.green : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loc.name}
                        {loc.is_current && <span style={{ fontSize: 9, color: C.green, marginLeft: 4 }}>●</span>}
                      </p>
                      {loc.city && <p style={{ fontSize: 10, color: C.dim }}>{loc.city}</p>}
                    </div>
                    <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: pct + '%', background: loc.is_current ? '#1D9E75' : C.violet, borderRadius: 6, transition: 'width 0.5s', display: 'flex', alignItems: 'center', paddingLeft: 8, minWidth: pct > 5 ? 0 : 'auto' }}>
                        {pct > 15 && <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{fmt(loc.revenue_30d)}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, width: 80, textAlign: 'right', flexShrink: 0 }}>
                      {pct > 5 ? '' : fmt(loc.revenue_30d)}
                    </span>
                    <span style={{ fontSize: 11, color: C.dim, width: 36, textAlign: 'right', flexShrink: 0 }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Per-location detail cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
            {locations.map(loc => (
              <div key={loc.id} style={{ background: C.card, border: '1px solid ' + (loc.is_current ? 'rgba(29,158,117,0.3)' : C.border), borderRadius: 14, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{loc.name}</h3>
                      {loc.is_current && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(29,158,117,0.15)', color: C.green }}>current</span>}
                    </div>
                    {loc.city && <p style={{ fontSize: 12, color: C.dim }}>{loc.city}</p>}
                  </div>
                  {loc.low_stock_count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: C.amber }}>
                      {loc.low_stock_count} low stock
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Revenue ' + selectedPeriod + 'd', value: fmt(loc.revenue_30d), color: C.green },
                    { label: 'Transactions', value: String(loc.transactions_30d), color: C.text },
                    { label: 'Avg basket', value: fmt(loc.avg_basket), color: C.violet },
                    { label: 'Low stock', value: String(loc.low_stock_count), color: loc.low_stock_count > 0 ? C.amber : C.green },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, color: C.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                      <p style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <a href={'/dashboard?business_id=' + loc.id}
                  style={{ display: 'block', marginTop: 14, padding: '8px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, textAlign: 'center', textDecoration: 'none' }}>
                  Switch to this store →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

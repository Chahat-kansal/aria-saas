'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Loc {
  id: string; name: string; city: string | null; address: string | null; plan: string
  rev30: number; rev7: number; tx30: number; avgBasket: number
  lowStock: number; topProduct: string | null; cashVariance: number | null
  isCurrent: boolean
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6',
  border: 'rgba(255,255,255,0.07)',
}
const fmt = (n: number) => 'A$' + Math.abs(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })
const fmtD = (n: number) => 'A$' + Math.abs(n).toFixed(2)
const delta = (a: number, b: number) => b > 0 ? Math.round(((a - b) / b) * 100) : null

export default function LocationsPage() {
  const { business } = useBusinessContext()
  const [locs, setLocs] = useState<Loc[]>([])
  const [tips, setTips] = useState<Array<{ icon: string; text: string; color: string }>>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)
  const [view, setView] = useState<'overview' | 'add'>('overview')
  const [addName, setAddName] = useState('')
  const [addCity, setAddCity] = useState('')
  const [addAddr, setAddAddr] = useState('')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      // 1. Get current biz with parent_account_id
      const bizRes = await fetch('/api/settings/business')
      const bizData = await bizRes.json()
      const biz = bizData.business
      if (!biz) { setLoading(false); return }

      // 2. Start with current biz; add siblings if parent exists
      let bizList: Array<{ id: string; name: string; city: string | null; address: string | null; plan: string }> = [
        { id: biz.id, name: biz.name, city: biz.city, address: biz.address, plan: biz.plan ?? 'starter' }
      ]
      if (biz.parent_account_id) {
        try {
          const sibRes = await fetch('/api/settings/locations?parent_id=' + biz.parent_account_id)
          const sibData = await sibRes.json()
          if (Array.isArray(sibData.locations) && sibData.locations.length > 1) {
            bizList = sibData.locations
          }
        } catch { /* solo fallback */ }
      }

      const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
      const today = new Date().toISOString().split('T')[0]

      const enriched: Loc[] = await Promise.all(bizList.map(async loc => {
        try {
          const [r30, r7, rProd, rCash] = await Promise.all([
            fetch('/api/pos/sales?business_id=' + loc.id + '&limit=3000&since=' + since30).then(r => r.json()).catch(() => ({})),
            fetch('/api/pos/sales?business_id=' + loc.id + '&limit=500&since=' + since7).then(r => r.json()).catch(() => ({})),
            fetch('/api/pos/products?business_id=' + loc.id).then(r => r.json()).catch(() => ({})),
            loc.id === business?.id
              ? fetch('/api/pos/sessions?history=true').then(r => r.json()).catch(() => ({}))
              : Promise.resolve({}),
          ])

          const sales30 = (r30.sales ?? []).filter((s: { status?: string }) => s.status !== 'voided')
          const sales7  = (r7.sales ?? []).filter((s: { status?: string }) => s.status !== 'voided')
          const rev30 = sales30.reduce((s: number, x: { total_amount?: number }) => s + Number(x.total_amount ?? 0), 0)
          const rev7  = sales7.reduce((s: number, x: { total_amount?: number }) => s + Number(x.total_amount ?? 0), 0)
          const tx30 = sales30.length
          const avgBasket = tx30 > 0 ? rev30 / tx30 : 0

          // Top product by line-item count
          const itemCounts: Record<string, number> = {}
          for (const sale of sales30 as Array<{ product_name?: string; items?: Array<{ product_name?: string }> }>) {
            const name = sale.product_name ?? 'Unknown'
            itemCounts[name] = (itemCounts[name] ?? 0) + 1
          }
          const topProduct = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

          const products = rProd.products ?? []
          const lowStock = products.filter((p: { track_stock?: boolean; stock_quantity?: number; low_stock_threshold?: number }) =>
            p.track_stock !== false && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5)
          ).length

          const closed = (rCash.sessions ?? []).filter((s: { status?: string }) => s.status === 'closed')
          const cashVariance = closed.length > 0 ? (closed[0].variance_cents ?? null) : null

          return { id: loc.id, name: loc.name, city: loc.city, address: loc.address, plan: loc.plan,
            rev30, rev7, tx30, avgBasket, lowStock, topProduct, cashVariance, isCurrent: loc.id === business?.id }
        } catch {
          return { id: loc.id, name: loc.name, city: loc.city, address: loc.address, plan: loc.plan,
            rev30: 0, rev7: 0, tx30: 0, avgBasket: 0, lowStock: 0, topProduct: null, cashVariance: null, isCurrent: loc.id === business?.id }
        }
      }))

      const sorted = enriched.sort((a, b) => b.rev30 - a.rev30)
      setLocs(sorted)

      // Aria tips from cross-location comparison
      if (sorted.length > 1) {
        const newTips: Array<{ icon: string; text: string; color: string }> = []
        const best = sorted[0]
        const worst = sorted[sorted.length - 1]
        if (best.avgBasket > worst.avgBasket * 1.15) {
          newTips.push({ icon: '💡', color: '#7FB897', text: worst.name + ' avg basket (A$' + worst.avgBasket.toFixed(0) + ') is ' + Math.round(((best.avgBasket - worst.avgBasket) / best.avgBasket) * 100) + '% below ' + best.name + ' (A$' + best.avgBasket.toFixed(0) + '). Check if upsell prompts are enabled at the till.' })
        }
        sorted.filter(l => l.lowStock > 4).forEach(l => {
          newTips.push({ icon: '⚠️', color: C.amber, text: l.name + ' has ' + l.lowStock + ' products below reorder threshold — act before weekend.' })
        })
        sorted.filter(l => l.cashVariance != null && Math.abs(l.cashVariance) > 1000).forEach(l => {
          newTips.push({ icon: '🔴', color: C.red, text: l.name + ' last till variance was ' + (l.cashVariance! > 0 ? '+' : '') + fmtD(l.cashVariance! / 100) + ' — investigate with staff.' })
        })
        const d = sorted.map(l => delta(l.rev7, l.rev30 / 4))
        if (d.some(x => x != null && x < -15)) {
          const dropping = sorted[d.findIndex(x => x != null && x < -15)]
          newTips.push({ icon: '📉', color: C.amber, text: dropping.name + ' revenue is tracking ' + Math.abs(d[sorted.indexOf(dropping)]!) + '% below its 30-day weekly average. Check for staffing or stock issues.' })
        }
        setTips(newTips.slice(0, 4))
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id, period])

  useEffect(() => { load() }, [load])

  async function addLocation() {
    if (!addName.trim()) return
    setAdding(true); setAddErr('')
    try {
      const res = await fetch('/api/settings/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), city: addCity.trim() || null, address: addAddr.trim() || null }),
      })
      const d = await res.json()
      if (d.ok || d.business) { setAddName(''); setAddCity(''); setAddAddr(''); setView('overview'); load() }
      else setAddErr(d.error ?? 'Failed to create location')
    } catch { setAddErr('Network error') }
    setAdding(false)
  }

  const totalRev = locs.reduce((s, l) => s + l.rev30, 0)
  const totalTx  = locs.reduce((s, l) => s + l.tx30, 0)
  const isSolo   = locs.length <= 1

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Locations</h1>
          <p style={{ fontSize: 13, color: C.muted }}>
            {isSolo ? 'Your current store. Add a second location to unlock multi-store management.' : locs.length + ' locations · ' + period + '-day network view'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[7, 30, 90].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (period === p ? C.violet : C.border), background: period === p ? 'rgba(139,92,246,0.1)' : 'transparent', color: period === p ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p}d
            </button>
          ))}
          <button onClick={() => setView(view === 'add' ? 'overview' : 'add')}
            style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: view === 'add' ? 'rgba(255,255,255,0.06)' : '#1D9E75', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {view === 'add' ? '← Cancel' : '+ Add location'}
          </button>
        </div>
      </div>

      {/* ── Add location form ──────────────────────────────── */}
      {view === 'add' && (
        <div style={{ background: C.card, border: '1px solid rgba(29,158,117,0.3)', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Add new location</h2>
          <p style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Creates a new Aria OS account linked to your network. You can switch between stores from the sidebar.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {([['Store name *', addName, setAddName, 'e.g. Fitzroy Store'], ['City', addCity, setAddCity, 'e.g. Melbourne'], ['Address', addAddr, setAddAddr, 'e.g. 123 Smith St']] as const).map(([label, val, set, ph]) => (
              <div key={label}>
                <label style={{ fontSize: 11, color: C.dim, fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
                <input value={val} onChange={e => (set as (v: string) => void)(e.target.value)} placeholder={ph}
                  style={{ width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          {addErr && <p style={{ fontSize: 12, color: C.red, marginBottom: 10 }}>{addErr}</p>}
          <button onClick={addLocation} disabled={adding || !addName.trim()}
            style={{ padding: '9px 24px', borderRadius: 9, border: 'none', background: addName.trim() ? '#1D9E75' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: addName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: adding ? 0.6 : 1 }}>
            {adding ? 'Creating...' : 'Create location'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, height: 160 }} />)}
        </div>
      ) : (
        <>
          {/* ── Network KPI bar (multi only) ─────────────────── */}
          {!isSolo && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Network revenue 30d', value: fmt(totalRev), color: C.green },
                { label: 'Total transactions', value: String(totalTx), color: C.text },
                { label: 'Locations', value: String(locs.length), color: C.violet },
                { label: 'Network avg basket', value: totalTx > 0 ? fmt(totalRev / totalTx) : '—', color: C.amber },
              ].map(s => (
                <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Aria tips ──────────────────────────────────────── */}
          {tips.length > 0 && (
            <div style={{ background: 'rgba(29,158,117,0.05)', border: '1px solid rgba(29,158,117,0.18)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>✦ Aria network insights</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {tips.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
                    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, margin: 0 }}>{t.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Revenue bar chart (multi only) ───────────────── */}
          {!isSolo && (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: '20px 24px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Revenue by location — last {period} days</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {locs.map(loc => {
                  const share = totalRev > 0 ? (loc.rev30 / totalRev) * 100 : 0
                  const d7 = delta(loc.rev7, loc.rev30 / 4)
                  return (
                    <div key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 130, flexShrink: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: loc.isCurrent ? C.green : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {loc.isCurrent && <span style={{ marginRight: 4 }}>●</span>}{loc.name}
                        </p>
                        {loc.city && <p style={{ fontSize: 10, color: C.dim, margin: 0 }}>{loc.city}</p>}
                      </div>
                      <div style={{ flex: 1, height: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: share + '%', background: loc.isCurrent ? '#1D9E75' : C.violet, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                          {share > 20 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{fmt(loc.rev30)}</span>}
                        </div>
                      </div>
                      <div style={{ width: 120, textAlign: 'right', flexShrink: 0 }}>
                        {share <= 20 && <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt(loc.rev30)}</div>}
                        <div style={{ fontSize: 10, color: C.dim }}>{share.toFixed(0)}% of network</div>
                        {d7 != null && (
                          <div style={{ fontSize: 10, color: d7 >= 0 ? C.green : C.red }}>
                            {d7 >= 0 ? '↑' : '↓'}{Math.abs(d7)}% this week
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Location cards ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: isSolo ? '1fr' : 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
            {locs.map(loc => (
              <div key={loc.id} style={{ background: C.card, border: '1px solid ' + (loc.isCurrent ? 'rgba(29,158,117,0.35)' : C.border), borderRadius: 14, padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{loc.name}</h3>
                      {loc.isCurrent && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(29,158,117,0.15)', color: C.green }}>current</span>}
                    </div>
                    {loc.address && <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>{loc.address}{loc.city ? ', ' + loc.city : ''}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                    {loc.lowStock > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: C.amber }}>{loc.lowStock} low stock</span>}
                    {loc.cashVariance != null && Math.abs(loc.cashVariance) > 500 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: C.red }}>
                        till {loc.cashVariance > 0 ? 'over' : 'short'} {fmtD(Math.abs(loc.cashVariance) / 100)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 9, marginBottom: 14 }}>
                  {[
                    { label: 'Revenue 30d', value: fmt(loc.rev30), color: C.green },
                    { label: 'Transactions', value: String(loc.tx30), color: C.text },
                    { label: 'Avg basket', value: fmt(loc.avgBasket), color: C.violet },
                    { label: 'Low stock', value: String(loc.lowStock), color: loc.lowStock > 3 ? C.amber : C.green },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                      <p style={{ fontSize: 10, color: C.muted, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {loc.topProduct && (
                  <p style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>
                    Top seller: <span style={{ color: C.text, fontWeight: 600 }}>{loc.topProduct}</span>
                  </p>
                )}

                <div style={{ display: 'flex', gap: 7 }}>
                  {!loc.isCurrent && (
                    <a href={'/dashboard?switch_to=' + loc.id}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid ' + C.border, color: C.muted, fontSize: 12, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                      Switch to store
                    </a>
                  )}
                  {loc.isCurrent && (
                    <a href="/dashboard"
                      style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid rgba(29,158,117,0.3)', background: 'rgba(29,158,117,0.06)', color: C.green, fontSize: 12, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                      View dashboard →
                    </a>
                  )}
                  <a href="/dashboard/stocktake"
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, color: C.dim, fontSize: 11, textDecoration: 'none', display: 'block' }}>
                    Stocktake
                  </a>
                  <a href="/dashboard/cash-up"
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + C.border, color: C.dim, fontSize: 11, textDecoration: 'none', display: 'block' }}>
                    Cash-up
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* ── Upgrade prompt for solo stores ──────────────── */}
          {isSolo && (
            <div style={{ marginTop: 20, background: 'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(29,158,117,0.06))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '28px 32px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ fontSize: 40, flexShrink: 0 }}>🏪</div>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 }}>Opening a second store?</h3>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
                    Aria gives you one view across all locations — revenue comparison, stock alerts, till variance, and staff performance. No other tool at this price does this.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7, marginBottom: 20, maxWidth: 520 }}>
                    {['Revenue bar chart with week-on-week delta', 'Per-store low stock alerts', 'Till variance tracking per location', 'Aria intelligence across your network', 'Top product by store', 'One-click stocktake & cash-up per store'].map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                        <span style={{ color: C.green, fontWeight: 700 }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setView('add')}
                      style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Add your second store
                    </button>
                    <a href="/dashboard/settings/plan"
                      style={{ padding: '10px 22px', borderRadius: 9, border: '1px solid ' + C.violet, color: C.violet, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                      Enterprise — A$997/mo
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

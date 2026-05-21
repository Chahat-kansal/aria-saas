'use client'
import { useState, useEffect } from 'react'

const C = { bg: 'rgba(5,4,15,1)', card: 'var(--bg-surface)', border: '#D9D9D9', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', violet: '#006AFF', green: '#00B140', red: '#EF4444', amber: '#F59E0B', cyan: '#006AFF' }

interface Competitor { id?: string; competitor_name: string; competitor_address: string | null; distance_m: number | null; google_rating: number | null; website: string | null; }
interface PriceResult { competitor_name: string; price_cents: number; confidence: string; source_url?: string; }
interface PriceData { product_name: string; own_price_cents: number; own_margin_pct: number; competitors: PriceResult[]; avg_competitor_price_cents: number; positioning: string; searched_at: string; from_cache: boolean; }
interface CacheEntry { id: string; product_name: string; competitor_name: string; competitor_price_cents: number; confidence: string; searched_at: string; }

const RADII = [1000, 2000, 5000, 10000]
const fmtKm = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`
const fmtPrice = (c: number) => `A$${(c / 100).toFixed(2)}`

export default function CompetitorPricesPage() {
  const [bid, setBid]                   = useState<string | null>(null)
  const [radius, setRadius]             = useState(5000)
  const [competitors, setCompetitors]   = useState<Competitor[]>([])
  const [loadingComps, setLoadingComps] = useState(false)
  const [products, setProducts]         = useState<{ id: string; name: string; price: number }[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [priceData, setPriceData]       = useState<PriceData | null>(null)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [history, setHistory]           = useState<CacheEntry[]>([])

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) {
        setBid(d.business_id)
        loadCompetitors(d.business_id, 5000)
        loadHistory(d.business_id)
      }
    })
    fetch('/api/pos/products?limit=100').then(r => r.json()).then(d => {
      setProducts((d.products || []).map((p: any) => ({ id: p.id, name: p.name, price: p.price })))
    })
  }, [])

  async function loadCompetitors(businessId: string, r: number) {
    setLoadingComps(true)
    const res = await fetch(`/api/aria/competitors?business_id=${businessId}&radius_m=${r}`).catch(() => null)
    if (res?.ok) { const d = await res.json(); setCompetitors(d.competitors || []) }
    setLoadingComps(false)
  }

  async function loadHistory(businessId: string) {
    const res = await fetch(`/api/aria/competitor-prices/history?business_id=${businessId}`).catch(() => null)
    if (res?.ok) { const d = await res.json(); setHistory(d.entries || []) }
  }

  async function searchPrice(productName: string) {
    if (!bid || !productName) return
    setLoadingPrices(true)
    setPriceData(null)
    const res = await fetch('/api/aria/competitor-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, product_name: productName }),
    }).catch(() => null)
    if (res?.ok) { const d = await res.json(); setPriceData(d) }
    setLoadingPrices(false)
    if (bid) loadHistory(bid)
  }

  function handleRadiusChange(r: number) {
    setRadius(r)
    if (bid) loadCompetitors(bid, r)
  }

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8)

  const iS: React.CSSProperties = { background: '#FAFAFA', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", padding: '24px 28px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🔍 Competitor Intelligence</h1>
        <p style={{ fontSize: 13, color: C.muted }}>See how your prices compare to nearby businesses</p>
      </div>

      {/* Radius selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Radius:</span>
        {RADII.map(r => (
          <button key={r} onClick={() => handleRadiusChange(r)}
            style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${r === radius ? C.violet : C.border}`, background: r === radius ? 'rgba(139,92,246,0.15)' : 'transparent', color: r === radius ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {fmtKm(r)}
          </button>
        ))}
        <button onClick={() => bid && loadCompetitors(bid, radius)} disabled={loadingComps}
          style={{ marginLeft: 'auto', padding: '6px 16px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loadingComps ? 0.6 : 1 }}>
          {loadingComps ? '⏳ Scanning…' : '↻ Scan competitors'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Nearby competitors */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Nearby Competitors ({competitors.length})</p>
          {loadingComps ? (
            <p style={{ fontSize: 12, color: C.muted }}>Searching…</p>
          ) : competitors.length === 0 ? (
            <p style={{ fontSize: 12, color: C.dim }}>No competitors found. Try expanding radius.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {competitors.slice(0, 8).map((comp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < competitors.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{comp.competitor_name}</p>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{comp.competitor_address || '—'}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      {comp.distance_m != null && <span style={{ fontSize: 10, color: C.dim }}>{fmtKm(comp.distance_m)}</span>}
                      {comp.google_rating && <span style={{ fontSize: 10, color: C.amber }}>★ {comp.google_rating}</span>}
                    </div>
                  </div>
                  {comp.website && (
                    <a href={comp.website} target="_blank" rel="noreferrer" style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, color: C.cyan, textDecoration: 'none' }}>Visit</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product price search */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Price Comparison</p>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder="Search your products…"
              style={iS}
            />
            {productSearch && filteredProducts.length > 0 && !selectedProduct && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, zIndex: 10, marginTop: 2, overflow: 'hidden' }}>
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => { setSelectedProduct(p.name); setProductSearch(p.name); searchPrice(p.name) }}
                    style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ color: C.text }}>{p.name}</span>
                    <span style={{ float: 'right', color: C.muted, fontSize: 11 }}>A${p.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {loadingPrices && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite', margin: '0 auto 8px' }} />
              Aria is searching competitor prices…
            </div>
          )}

          {priceData && !loadingPrices && (
            <div>
              {/* Own price row */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['', 'Price', 'Source', 'vs You'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.dim }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: 'rgba(139,92,246,0.08)', borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '8px', fontSize: 12, fontWeight: 700, color: C.violet }}>YOUR PRICE</td>
                    <td style={{ padding: '8px', fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>{fmtPrice(priceData.own_price_cents)}</td>
                    <td style={{ padding: '8px', fontSize: 11, color: C.muted }}>Margin: {priceData.own_margin_pct.toFixed(1)}%</td>
                    <td style={{ padding: '8px', fontSize: 11, color: C.dim }}>—</td>
                  </tr>
                  {priceData.competitors.map((comp, i) => {
                    const diff = comp.price_cents - priceData.own_price_cents
                    const diffPct = priceData.own_price_cents > 0 ? (diff / priceData.own_price_cents * 100) : 0
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px', fontSize: 12, color: C.text }}>{comp.competitor_name}</td>
                        <td style={{ padding: '8px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: diff < 0 ? C.red : C.green }}>{fmtPrice(comp.price_cents)}</td>
                        <td style={{ padding: '8px', fontSize: 11, color: C.muted }}>{comp.confidence === 'high' ? '✓ Confirmed' : '~ Estimated'}</td>
                        <td style={{ padding: '8px', fontSize: 11, color: diff > 0 ? C.green : C.red }}>
                          {diff > 0 ? `🟢 +${diffPct.toFixed(1)}%` : `🔴 ${diffPct.toFixed(1)}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Summary */}
              {priceData.avg_competitor_price_cents > 0 && (() => {
                const diff = priceData.own_price_cents - priceData.avg_competitor_price_cents
                const diffPct = (diff / priceData.avg_competitor_price_cents * 100)
                const isAbove = priceData.positioning === 'above_market'
                const isBelow = priceData.positioning === 'below_market'
                const bg = isAbove ? 'rgba(245,158,11,0.08)' : isBelow ? 'rgba(34,197,94,0.06)' : 'rgba(59,130,246,0.08)'
                const border = isAbove ? 'rgba(245,158,11,0.25)' : isBelow ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)'
                const col = isAbove ? C.amber : isBelow ? C.green : '#3B82F6'
                return (
                  <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 14px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: col, marginBottom: 4 }}>
                      {isAbove ? `⚠️ You are ${Math.abs(diffPct).toFixed(1)}% above the market average`
                        : isBelow ? `✓ You are ${Math.abs(diffPct).toFixed(1)}% below market — you're the cheapest`
                        : '✓ Your pricing is competitive'}
                    </p>
                    <p style={{ fontSize: 12, color: C.muted }}>
                      {isAbove ? `Consider reducing to ~${fmtPrice(priceData.avg_competitor_price_cents)} to match market`
                        : isBelow ? `You have room to increase price — market average is ${fmtPrice(priceData.avg_competitor_price_cents)}`
                        : `Market average: ${fmtPrice(priceData.avg_competitor_price_cents)}`}
                    </p>
                    {priceData.from_cache && <p style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>From cache · {new Date(priceData.searched_at).toLocaleString('en-AU')}</p>}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Scan history */}
      {history.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 18px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Recent Price Checks</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Product', 'Competitor', 'Their Price', 'Confidence', 'Checked'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.dim }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((e, i) => (
                <tr key={e.id} style={{ borderBottom: i < history.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: C.text }}>{e.product_name}</td>
                  <td style={{ padding: '8px 10px', fontSize: 12, color: C.muted }}>{e.competitor_name}</td>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: C.text }}>{fmtPrice(e.competitor_price_cents)}</td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: e.confidence === 'high' ? C.green : C.muted }}>{e.confidence === 'high' ? '✓ Confirmed' : '~ Estimated'}</td>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: C.dim }}>{new Date(e.searched_at).toLocaleDateString('en-AU')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

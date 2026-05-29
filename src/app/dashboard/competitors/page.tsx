'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Alert { id: string; competitor_name: string; alert_text: string; source_url: string | null; detected_at: string; alert_type: string }
interface Competitor { name: string; alerts: Alert[]; lastSeen: string; alertCount: number; rating?: number | null; distance?: number | null; address?: string | null }

interface MarketScan { id: string; status: string; products_scanned: number; prices_found: number; overpriced_count: number; underpriced_count: number; potential_revenue_gain_cents: number; started_at: string; finished_at: string | null }
interface MarketResult { product_id: string; product_name: string; your_price_dollars: number; market_low_dollars: number; market_avg_dollars: number; price_gap_cents: number; price_gap_pct: number; is_overpriced: boolean; is_underpriced: boolean; retailers: Array<{ name: string; price: number; url: string }> }

function formatDollars(n: number) { return `A$${n.toFixed(2)}` }
function formatGap(cents: number) {
  const d = cents / 100
  const sign = d > 0 ? '+' : ''
  return `${sign}A$${Math.abs(d).toFixed(2)}`
}

function MarketPricesTab({ businessId }: { businessId: string }) {
  const [scan, setScan] = useState<MarketScan | null>(null)
  const [results, setResults] = useState<MarketResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')
  const [dailyLimitMsg, setDailyLimitMsg] = useState('')
  const [confirmMatch, setConfirmMatch] = useState<{ product: MarketResult; newPrice: number } | null>(null)
  const [matchingId, setMatchingId] = useState<string | null>(null)

  const loadResults = useCallback(async () => {
    const d = await fetch(`/api/market-prices/results?business_id=${businessId}`).then(r => r.json()).catch(() => ({}))
    if (d.scan) setScan(d.scan as MarketScan)
    if (d.results) setResults(d.results as MarketResult[])
  }, [businessId])

  useEffect(() => { loadResults() }, [loadResults])

  async function pollScan(scanId: string) {
    setPolling(true)
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000))
      try {
        const d = await fetch(`/api/market-prices/scan/${scanId}`).then(r => r.json())
        const s = d.scan as MarketScan
        setScan(s)
        if (s.status === 'complete' || s.status === 'failed') { await loadResults(); break }
      } catch { /* keep polling */ }
    }
    setPolling(false)
    setScanning(false)
  }

  async function startScan() {
    setScanning(true); setError(''); setDailyLimitMsg('')
    try {
      const res = await fetch('/api/market-prices/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const d = await res.json()
      if (res.status === 429) {
        setDailyLimitMsg(d.message ?? 'Scan already ran today.')
        setScanning(false)
        if (d.last_scan_id) await loadResults()
        return
      }
      if (!res.ok || !d.scan_id) { setError(d.error ?? 'Could not start scan'); setScanning(false); return }
      setScan({ id: d.scan_id, status: 'running', products_scanned: 0, prices_found: 0, overpriced_count: 0, underpriced_count: 0, potential_revenue_gain_cents: 0, started_at: new Date().toISOString(), finished_at: null })
      void pollScan(d.scan_id)
    } catch (e: unknown) { setError((e as Error).message); setScanning(false) }
  }

  async function matchPrice(product: MarketResult, newPrice: number) {
    setMatchingId(product.product_id)
    try {
      await fetch(`/api/pos/products`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.product_id, price: newPrice }),
      })
      setResults(prev => prev.map(r => r.product_id === product.product_id ? { ...r, your_price_dollars: newPrice, is_overpriced: false, price_gap_cents: Math.round((newPrice - r.market_avg_dollars) * 100) } : r))
    } catch { /* ignore */ }
    setMatchingId(null)
    setConfirmMatch(null)
  }

  const overpriced = results.filter(r => r.is_overpriced)
  const underpriced = results.filter(r => r.is_underpriced)
  const inRange = results.filter(r => !r.is_overpriced && !r.is_underpriced && r.retailers.length > 0)

  const statCard = (label: string, count: number, sub: string, accent: string) => (
    <div style={{ flex: 1, minWidth: 120, padding: '16px 18px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}33`, borderRadius: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{sub}</div>
    </div>
  )

  const lastScanned = scan?.finished_at
    ? `Last scanned ${Math.round((Date.now() - new Date(scan.finished_at).getTime()) / 3600000)}h ago`
    : scan?.started_at ? 'Scan in progress…' : 'Never scanned'

  return (
    <div>
      {/* Trigger row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={startScan} disabled={scanning || polling}
          style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: scanning || polling ? 'rgba(127,184,151,0.3)' : '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: scanning || polling ? 0.7 : 1 }}>
          {scanning || polling ? '🔍 Scanning…' : '🔍 Run market price scan'}
        </button>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{lastScanned}</span>
        {scan?.status === 'running' && <span style={{ fontSize: 12, color: '#7FB897' }}>Scanned {scan.products_scanned} products so far…</span>}
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
        Scans your top 20 active products against major Australian retailers. Takes 2–4 minutes.
      </p>

      {dailyLimitMsg && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 10, fontSize: 13, color: '#7FB897' }}>
          ✓ {dailyLimitMsg}
          <button onClick={() => document.getElementById('market-table')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ marginLeft: 12, fontSize: 12, color: '#7FB897', background: 'none', border: '1px solid rgba(127,184,151,0.4)', borderRadius: 6, padding: '2px 10px', cursor: 'pointer' }}>
            View today&apos;s results ↓
          </button>
        </div>
      )}

      {error && <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: '#EF4444' }}>{error}</div>}

      {results.length > 0 && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {statCard('Overpriced', overpriced.length, `A$${(scan?.potential_revenue_gain_cents ?? 0) / 100 > 0 ? ((scan?.potential_revenue_gain_cents ?? 0) / 100).toFixed(0) + ' potential gain/unit' : 'review pricing'}`, '#EF4444')}
            {statCard('Underpriced', underpriced.length, 'room to raise prices', '#7FB897')}
            {statCard('In range', inRange.length, 'competitively priced', 'rgba(255,255,255,0.4)')}
          </div>

          {/* Product table */}
          <div id="market-table" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Product', 'Your price', 'Market low', 'Market avg', 'Gap', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.product_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 14px', color: '#fff', fontWeight: 500 }}>{r.product_name}</td>
                      <td style={{ padding: '12px 14px', color: '#fff', fontFamily: 'monospace' }}>{formatDollars(r.your_price_dollars)}</td>
                      <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{formatDollars(r.market_low_dollars)}</td>
                      <td style={{ padding: '12px 14px', color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>{formatDollars(r.market_avg_dollars)}</td>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: r.price_gap_cents > 0 ? '#EF4444' : r.price_gap_cents < 0 ? '#7FB897' : 'rgba(255,255,255,0.4)' }}>
                        {formatGap(r.price_gap_cents)}
                        {r.price_gap_pct !== 0 && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>({r.price_gap_pct > 0 ? '+' : ''}{Number(r.price_gap_pct).toFixed(1)}%)</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {r.is_overpriced ? <span style={{ fontSize: 12, fontWeight: 700, color: '#EF4444' }}>🔴 Overpriced</span>
                          : r.is_underpriced ? <span style={{ fontSize: 12, fontWeight: 700, color: '#7FB897' }}>🟢 Underpriced</span>
                          : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>⚪ In range</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.is_overpriced && (
                            <button onClick={() => setConfirmMatch({ product: r, newPrice: r.market_low_dollars })}
                              disabled={matchingId === r.product_id}
                              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Match price
                            </button>
                          )}
                          {r.retailers[0]?.url && (
                            <a href={r.retailers[0].url} target="_blank" rel="noopener noreferrer"
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontSize: 11, textDecoration: 'none', fontFamily: 'inherit', lineHeight: '22px' }}>
                              View source ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Retailer breakdown */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Retailer breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.filter(r => r.retailers.length > 0).map(r => (
                <div key={r.product_id} style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{r.product_name}:</span>{' '}
                  {r.retailers.map((ret, i) => (
                    <span key={i}>
                      <a href={ret.url} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>{ret.name}</a>
                      {' '}<span style={{ fontFamily: 'monospace', color: '#7FB897' }}>{formatDollars(ret.price)}</span>
                      {i < r.retailers.length - 1 && ' / '}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!scanning && !polling && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <p style={{ marginBottom: 6 }}>No market price data yet.</p>
          <p style={{ fontSize: 12 }}>Run a scan to compare your prices against Australian retailers.</p>
        </div>
      )}

      {/* Confirm match dialog */}
      {confirmMatch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1f1c', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '24px 28px', maxWidth: 360, width: '90%' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Match price?</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 20, lineHeight: 1.6 }}>
              Set <strong>{confirmMatch.product.product_name}</strong> to <strong style={{ color: '#7FB897' }}>{formatDollars(confirmMatch.newPrice)}</strong>?
              Current price: {formatDollars(confirmMatch.product.your_price_dollars)}.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => matchPrice(confirmMatch.product, confirmMatch.newPrice)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Confirm
              </button>
              <button onClick={() => setConfirmMatch(null)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TYPE_ICONS: Record<string, string> = { pricing: '💰', promotion: '🎁', review: '⭐', new_service: '✨', web: '🌐', general: '📡' }
const TYPE_COLORS: Record<string, string> = { pricing: '#F59E0B', promotion: '#8B5CF6', review: '#22C55E', new_service: '#3B82F6', web: '#6B7280', general: '#6B7280' }

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

// Note: PriceComparisonTable does NOT call itself recursively
function PriceComparisonTable({ competitorNames }: { competitorNames: string[] }) {
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [product, setProduct] = useState('')
  const [searching, setSearching] = useState(false)

  async function searchPrices() {
    if (!product.trim()) return
    setSearching(true)
    try {
      const res = await fetch('/api/aria/competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'price_check', product, competitors: competitorNames }),
      })
      const d = await res.json()
      if (d.prices) setPrices(d.prices)
    } catch { /* ignore */ }
    setSearching(false)
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '20px', marginTop: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Price comparison</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Enter a product name to compare prices..."
          value={product}
          onChange={e => setProduct(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchPrices()}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button onClick={searchPrices} disabled={searching || !product.trim()}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: searching ? 0.6 : 1 }}>
          {searching ? 'Searching...' : 'Compare'}
        </button>
      </div>
      {Object.keys(prices).length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Competitor</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Price</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(prices).map(([name, price]) => (
              <tr key={name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 12px', color: '#fff', fontWeight: 500 }}>{name}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22C55E', fontWeight: 700 }}>{price}</td>
                <td style={{ padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface Watch { id: string; competitor_name: string; competitor_url: string | null; is_active: boolean }
interface AlertRow { id: string; competitor_name: string | null; alert_type: string | null; message: string; data: unknown; is_read: boolean | null; read: boolean | null; created_at: string }
interface Opportunity { competitor: string; complaint_theme: string; advantage: string; message: string }
interface Snapshot { competitor_name: string; rating: number | null; review_count: number | null; snapshot_date: string }
interface Discovered { id: string; competitor_name: string; competitor_address: string | null; distance_m: number | null; google_rating: number | null; website: string | null; phone: string | null; last_checked: string | null }

function alertIcon(type: string | null) {
  if (type === 'rating_change') return { icon: '⭐', color: '#F59E0B' }
  if (type === 'review_spike') return { icon: '📈', color: '#3B82F6' }
  if (type === 'promotion') return { icon: '📢', color: '#A855F7' }
  return { icon: '📡', color: '#6B7280' }
}

export default function CompetitorsPage() {
  const { business } = useBusinessContext()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [watches, setWatches] = useState<Watch[]>([])
  const [newCompetitor, setNewCompetitor] = useState('')
  const [addingWatch, setAddingWatch] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'prices' | 'alerts' | 'watches' | 'market'>('overview')
  const [brief, setBrief] = useState<string>('')
  const [briefLoading, setBriefLoading] = useState(true)
  const [opps, setOpps] = useState<Opportunity[]>([])
  const [oppsLoading, setOppsLoading] = useState(false)
  const [alertRows, setAlertRows] = useState<AlertRow[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [discovered, setDiscovered] = useState<Discovered[]>([])

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    const res = await fetch('/api/competitor-alerts?business_id=' + business.id).then(r => r.json()).catch(() => ({ alerts: [] }))
    const data: Alert[] = res.alerts ?? res.data ?? []
    setAlerts(data)
    if (data.length > 0) {
      setLastScanned(data[0].detected_at)
      setSelectedComp(data[0].competitor_name)
    }
    setLoading(false)
  }, [business?.id])

  useEffect(() => {
    if (!business?.id) return
    fetch(`/api/aria/competitor-watches?business_id=${business.id}`)
      .then(r => r.json()).then(d => setWatches(d.watches ?? [])).catch(() => {})
    setBriefLoading(true)
    fetch(`/api/aria/competitive-brief?business_id=${business.id}`)
      .then(r => r.json()).then(d => { setBrief(d.brief ?? ''); setBriefLoading(false) }).catch(() => setBriefLoading(false))
    fetch(`/api/aria/competitor-alerts?business_id=${business.id}`)
      .then(r => r.json()).then(d => setAlertRows(d.alerts ?? [])).catch(() => {})
    fetch(`/api/competitor-snapshots?business_id=${business.id}`)
      .then(r => r.json()).then(d => setSnapshots(d.snapshots ?? [])).catch(() => {})
    fetch(`/api/aria/competitor-businesses?business_id=${business.id}`)
      .then(r => r.json()).then(d => setDiscovered(d.competitors ?? [])).catch(() => {})
  }, [business?.id])

  async function loadOpportunities() {
    if (!business?.id) return
    setOppsLoading(true)
    const res = await fetch('/api/aria/competitor-opportunities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    }).then(r => r.json()).catch(() => ({ opportunities: [] }))
    setOpps(res.opportunities ?? [])
    setOppsLoading(false)
  }

  async function markAlertRead(id: string) {
    await fetch(`/api/aria/competitor-alerts?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_read: true }) })
    setAlertRows(rows => rows.map(r => r.id === id ? { ...r, is_read: true, read: true } : r))
  }

  async function addWatch() {
    if (!newCompetitor.trim() || !business?.id) return
    setAddingWatch(true)
    try {
      await fetch('/api/aria/competitor-watches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, competitor_name: newCompetitor.trim() }),
      })
      setWatches(w => [...w, { id: Date.now().toString(), competitor_name: newCompetitor.trim(), competitor_url: null, is_active: true }])
      setNewCompetitor('')
    } catch { /* ignore */ }
    setAddingWatch(false)
  }

  async function removeWatch(id: string) {
    await fetch(`/api/aria/competitor-watches?id=${id}`, { method: 'DELETE' })
    setWatches(w => w.filter(x => x.id !== id))
  }

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selectedComp) return
    const first = alerts[0]?.competitor_name ?? discovered[0]?.competitor_name
    if (first) setSelectedComp(first)
  }, [alerts, discovered, selectedComp])

  async function scan() {
    if (!business?.id) return
    setScanning(true); setError('')
    try {
      const params = new URLSearchParams({ business_id: business.id, radius_m: '5000' })
      const res = await fetch('/api/aria/competitors?' + params.toString()).then(r => r.json())
      if (res.error) throw new Error(res.error)
      const found: Discovered[] = res.competitors ?? []
      setDiscovered(found)
      setLastScanned(new Date().toISOString())
      if (res.no_api_key) setError(res.message ?? 'Competitor scanning is not enabled yet.')
      else if (found.length === 0) setError('No competitors found within 5km — try again later or add competitors manually under "Manage watches".')
      load()
    } catch (e: unknown) { setError((e as Error).message) }
    setScanning(false)
  }

  const competitorMap: Record<string, Competitor> = {}
  // Seed with businesses the scan discovered so they appear even before any alerts fire.
  for (const d of discovered) {
    const name = d.competitor_name ?? 'Unknown'
    if (!competitorMap[name]) competitorMap[name] = { name, alerts: [], lastSeen: d.last_checked ?? new Date().toISOString(), alertCount: 0, rating: d.google_rating, distance: d.distance_m, address: d.competitor_address }
  }
  for (const a of alerts) {
    const name = a.competitor_name ?? 'Unknown'
    if (!competitorMap[name]) competitorMap[name] = { name, alerts: [], lastSeen: a.detected_at, alertCount: 0 }
    competitorMap[name].alerts.push(a)
    competitorMap[name].alertCount++
    if (a.detected_at > competitorMap[name].lastSeen) competitorMap[name].lastSeen = a.detected_at
  }
  const competitors = Object.values(competitorMap).sort((a, b) => b.alertCount - a.alertCount || (a.distance ?? 1e9) - (b.distance ?? 1e9))
  const currentAlerts = selectedComp ? (competitorMap[selectedComp]?.alerts ?? []) : []
  const typeBreakdown = currentAlerts.reduce((acc: Record<string, number>, a) => {
    acc[a.alert_type] = (acc[a.alert_type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Competitor Intelligence</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            What your competitors are doing in {business?.city ?? 'your area'}
            {lastScanned && ' · Last scanned ' + timeAgo(lastScanned)}
          </p>
        </div>
        <button onClick={scan} disabled={scanning}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: scanning ? 'rgba(139,92,246,0.3)' : '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: scanning ? 0.7 : 1 }}>
          {scanning ? '🔍 Scanning...' : '🔍 Scan Area'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
        {(['overview','prices','alerts','watches','market'] as const).map(t => {
          const active = activeTab === t
          const unread = t === 'alerts' ? alertRows.filter(a => !(a.is_read ?? a.read)).length : 0
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.5)', borderBottom: active ? '2px solid #8B5CF6' : '2px solid transparent', marginBottom: -1, textTransform: 'capitalize' }}>
              {t === 'watches' ? 'Manage watches' : t === 'market' ? '💰 Market Prices' : t}
              {unread > 0 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#EF4444', color: '#fff', fontWeight: 700 }}>{unread}</span>}
            </button>
          )
        })}
      </div>

      {/* Daily competitive brief — always visible at top */}
      <div style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 12, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>✦ Yesterday's competitive landscape</p>
        {briefLoading ? <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Aria is thinking…</p>
          : <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>{brief || 'No data yet — Aria starts monitoring once you add competitor watches.'}</p>}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: '#EF4444' }}>
          {error}
        </div>
      )}

      {activeTab === 'overview' && (loading ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '60px 0' }}>Loading competitor data...</div>
      ) : competitors.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No competitor data yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Click "Scan Area" to detect competitors within 5km and monitor their activity.
          </p>
          <button onClick={scan} disabled={scanning}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            {scanning ? '🔍 Scanning...' : '🔍 Scan Now'}
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            {/* Competitor list */}
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                {competitors.length} competitors tracked
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {competitors.map(c => {
                  const isSelected = selectedComp === c.name
                  return (
                    <button key={c.name} onClick={() => setSelectedComp(c.name)}
                      style={{ background: isSelected ? 'rgba(139,92,246,0.12)' : 'var(--bg-surface)', border: '1px solid ' + (isSelected ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'), borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#8B5CF6' : 'var(--text-primary)' }}>{c.name}</span>
                        {c.alertCount > 0 ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: isSelected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', color: isSelected ? '#8B5CF6' : 'var(--text-secondary)' }}>
                            {c.alertCount}
                          </span>
                        ) : c.rating != null ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B' }}>★ {Number(c.rating).toFixed(1)}</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        {c.alertCount > 0 ? timeAgo(c.lastSeen) : c.distance != null ? `${(c.distance / 1000).toFixed(1)}km away` : 'Monitoring'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Alert details */}
            <div>
              {selectedComp && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {Object.entries(typeBreakdown).map(([type, count]) => (
                      <span key={type} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, background: (TYPE_COLORS[type] ?? '#6B7280') + '20', color: TYPE_COLORS[type] ?? '#6B7280', fontWeight: 600 }}>
                        {TYPE_ICONS[type] ?? '📡'} {type} ({count})
                      </span>
                    ))}
                  </div>
                  {currentAlerts.length === 0 && (
                    <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '20px 18px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Found nearby{competitorMap[selectedComp]?.distance != null ? ` — ${(competitorMap[selectedComp]!.distance! / 1000).toFixed(1)}km away` : ''}{competitorMap[selectedComp]?.rating != null ? ` · ${Number(competitorMap[selectedComp]!.rating).toFixed(1)}★ on Google` : ''}. No activity detected yet — Aria monitors this competitor daily and will surface price changes, promotions and review shifts here.
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {currentAlerts.map(a => (
                      <div key={a.id} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '4px solid ' + (TYPE_COLORS[a.alert_type] ?? '#6B7280'), borderRadius: '0 12px 12px 0', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>{TYPE_ICONS[a.alert_type] ?? '📡'}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: (TYPE_COLORS[a.alert_type] ?? '#6B7280') + '20', color: TYPE_COLORS[a.alert_type] ?? '#6B7280' }}>
                              {a.alert_type}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{timeAgo(a.detected_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{a.alert_text}</p>
                        {a.source_url && (
                          <a href={a.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'underline' }}>
                            View source →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Price comparison table — uses competitor names, NOT the full Alert objects */}
          {competitors.length > 0 && (
            <PriceComparisonTable competitorNames={competitors.map(c => c.name)} />
          )}

          {/* Opportunities (AI) */}
          <div style={{ marginTop: 28, background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 }}>✦ Win-back opportunities</h2>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Aria reads competitor complaints and tells you how to win those customers.</p>
              </div>
              <button onClick={loadOpportunities} disabled={oppsLoading}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: oppsLoading ? 0.6 : 1 }}>
                {oppsLoading ? 'Analysing…' : opps.length > 0 ? 'Refresh' : '✦ Analyse'}
              </button>
            </div>
            {opps.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {opps.map((o, i) => (
                  <div key={i} style={{ background: 'rgba(127,184,151,0.05)', borderLeft: '3px solid #7FB897', borderRadius: '0 12px 12px 0', padding: '12px 14px' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{o.competitor}</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{o.complaint_theme}</p>
                    <p style={{ fontSize: 13, color: '#fff', fontWeight: 600, lineHeight: 1.5 }}>{o.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ))}

      {activeTab === 'prices' && (
        <PriceComparisonTable competitorNames={watches.map(w => w.competitor_name)} />
      )}

      {activeTab === 'market' && business?.id && (
        <MarketPricesTab businessId={business.id} />
      )}

      {activeTab === 'alerts' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 18px' }}>
          {alertRows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '24px 0' }}>No competitor alerts yet — Aria will surface them as it detects changes.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alertRows.map(a => {
                const meta = alertIcon(a.alert_type)
                const isRead = a.is_read ?? a.read
                return (
                  <div key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, background: isRead ? 'rgba(255,255,255,0.02)' : 'rgba(139,92,246,0.05)', border: '1px solid ' + (isRead ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.2)') }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginBottom: 2 }}>{meta.icon} {a.message}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{timeAgo(a.created_at)}{a.competitor_name ? ` · ${a.competitor_name}` : ''}</p>
                    </div>
                    {!isRead && (
                      <button onClick={() => markAlertRead(a.id)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Mark read
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Rating trend snapshot summary */}
      {activeTab === 'overview' && snapshots.length > 0 && (
        <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Rating trend (last 30 days)</h3>
          {Array.from(new Set(snapshots.map(s => s.competitor_name))).slice(0, 6).map(name => {
            const series = snapshots.filter(s => s.competitor_name === name).filter(s => s.rating != null)
            if (series.length === 0) return null
            const max = Math.max(...series.map(s => Number(s.rating)))
            const min = Math.min(...series.map(s => Number(s.rating)))
            const first = Number(series[0].rating)
            const last = Number(series[series.length - 1].rating)
            const delta = last - first
            return (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 }}>{name}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{min.toFixed(1)} → {max.toFixed(1)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? '#7FB897' : delta < 0 ? '#F87171' : 'rgba(255,255,255,0.4)', fontFamily: 'monospace', minWidth: 50, textAlign: 'right' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}★</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Competitor Watch Setup */}
      {activeTab === 'watches' && (
      <div style={{ marginTop: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Competitor watches</h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Aria monitors these competitors daily and alerts you to price changes.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newCompetitor} onChange={e => setNewCompetitor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addWatch()}
            placeholder="e.g. Dan Murphy's, BWS, Cellars East"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, outline: 'none' }}
          />
          <button onClick={addWatch} disabled={addingWatch || !newCompetitor.trim()}
            style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: addingWatch ? 0.6 : 1 }}>
            {addingWatch ? 'Adding…' : '+ Add'}
          </button>
        </div>
        {watches.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {watches.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 99, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.25)' }}>
                <span style={{ fontSize: 12, color: '#7FB897' }}>👁 {w.competitor_name}</span>
                <button onClick={() => removeWatch(w.id)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
        {watches.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No competitors being watched yet. Add one above.</p>}
      </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Alert { id: string; competitor_name: string; alert_text: string; source_url: string | null; detected_at: string; alert_type: string }
interface Competitor { name: string; alerts: Alert[]; lastSeen: string; alertCount: number }

const TYPE_ICONS: Record<string,string> = { pricing: '💰', promotion: '🎁', review: '⭐', new_service: '✨', web: '🌐', general: '📡' }
const TYPE_COLORS: Record<string,string> = { pricing: '#F59E0B', promotion: '#8B5CF6', review: '#22C55E', new_service: '#3B82F6', web: '#6B7280', general: '#6B7280' }

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function PriceComparisonTable({ competitors }: { competitors: { name: string; url?: string | null; price_notes?: string | null }[] }) {
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
        body: JSON.stringify({ action: 'price_check', product, competitors: competitors.map(c => c.name) })
      })
      const d = await res.json()
      if (d.prices) setPrices(d.prices)
    } catch { /* ignore */ }
    setSearching(false)
  }

  return (
    <div style={{background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', padding: '20px', marginTop: 20}}>
      <h3 style={{fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12}}>Price comparison</h3>
      <div style={{display: 'flex', gap: 8, marginBottom: 16}}>
        <input
          type="text"
          placeholder="Enter a product name to compare prices..."
          value={product}
          onChange={e => setProduct(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchPrices()}
          style={{flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none'}}
        />
        <button onClick={searchPrices} disabled={searching || !product.trim()}
          style={{padding: '8px 18px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: searching ? 0.6 : 1}}>
          {searching ? 'Searching...' : 'Compare'}
        </button>
      </div>
      {Object.keys(prices).length > 0 && (
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 13}}>
          <thead>
            <tr style={{borderBottom: '1px solid rgba(255,255,255,0.07)'}}>
              <th style={{padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em'}}>Competitor</th>
              <th style={{padding: '8px 12px', textAlign: 'right', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em'}}>Price</th>
              <th style={{padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em'}}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(prices).map(([name, price]) => (
              <tr key={name} style={{borderBottom: '1px solid rgba(255,255,255,0.04)'}}>
                <td style={{padding: '10px 12px', color: '#fff', fontWeight: 500}}>{name}</td>
                <td style={{padding: '10px 12px', textAlign: 'right', color: '#22C55E', fontWeight: 700}}>{price}</td>
                <td style={{padding: '10px 12px', color: 'rgba(255,255,255,0.4)', fontSize: 11}}>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {competitors.length > 0 && <PriceComparisonTable competitors={competitors} />}
    </div>
  )
}

export default function CompetitorsPage() {
  const { business } = useBusinessContext()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [selectedComp, setSelectedComp] = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<string | null>(null)

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

  useEffect(() => { load() }, [load])

  async function scan() {
    if (!business?.id) return
    setScanning(true); setError('')
    try {
      const params = new URLSearchParams({ business_id: business.id, radius_m: '5000' })
      const res = await fetch('/api/aria/competitors?' + params.toString()).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setLastScanned(new Date().toISOString())
      load()
    } catch (e: unknown) { setError((e as Error).message) }
    setScanning(false)
  }

  // Group by competitor
  const competitorMap: Record<string, Competitor> = {}
  for (const a of alerts) {
    const name = a.competitor_name ?? 'Unknown'
    if (!competitorMap[name]) competitorMap[name] = { name, alerts: [], lastSeen: a.detected_at, alertCount: 0 }
    competitorMap[name].alerts.push(a)
    competitorMap[name].alertCount++
    if (a.detected_at > competitorMap[name].lastSeen) competitorMap[name].lastSeen = a.detected_at
  }
  const competitors = Object.values(competitorMap).sort((a,b) => b.alertCount - a.alertCount)
  const currentAlerts = selectedComp ? (competitorMap[selectedComp]?.alerts ?? []) : []

  // Alert type breakdown for selected competitor
  const typeBreakdown = currentAlerts.reduce((acc: Record<string,number>, a) => {
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

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, fontSize: 13, color: '#EF4444' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '60px 0' }}>Loading competitor data...</div>
      ) : alerts.length === 0 ? (
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
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: isSelected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', color: isSelected ? '#8B5CF6' : 'var(--text-secondary)' }}>
                        {c.alertCount}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{timeAgo(c.lastSeen)}</div>
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
                    <span key={type} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, background: TYPE_COLORS[type] + '20', color: TYPE_COLORS[type], fontWeight: 600 }}>
                      {TYPE_ICONS[type] ?? '📡'} {type} ({count})
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentAlerts.map(a => (
                    <div key={a.id} style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '4px solid ' + (TYPE_COLORS[a.alert_type] ?? '#6B7280'), borderRadius: '0 12px 12px 0', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{TYPE_ICONS[a.alert_type] ?? '📡'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: TYPE_COLORS[a.alert_type] + '20', color: TYPE_COLORS[a.alert_type] }}>
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
      )}
    </div>
  )
}

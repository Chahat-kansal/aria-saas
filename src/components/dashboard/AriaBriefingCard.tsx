'use client'
import { useState, useEffect } from 'react'

interface CouncilContested {
  topic: string
  optimist_view: string
  critic_view: string
  strategist_view: string
}

interface BriefingResponse {
  briefing: string
  council_mode: boolean
  consensus?: string[]
  contested?: CouncilContested[]
  confidence_map?: Record<string, 'high' | 'medium' | 'low'>
}

function ConfidenceBadge({ level }: { level: string }) {
  if (level === 'high') return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.25)' }}>{level}</span>
  )
  if (level === 'medium') return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>{level}</span>
  )
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }}>{level}</span>
  )
}

export function AriaBriefingCard({ businessId }: { businessId: string }) {
  const [data, setData] = useState<BriefingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!businessId) return
    fetch('/api/aria/briefing?businessId=' + businessId)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [businessId])

  if (loading) {
    return (
      <div style={{ borderRadius: 12, padding: '16px 20px', background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16 }}>
        <div className="animate-pulse" style={{ height: 11, width: 120, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 10 }} />
        <div className="animate-pulse" style={{ height: 13, width: '85%', background: 'rgba(255,255,255,0.05)', borderRadius: 6, marginBottom: 6 }} />
        <div className="animate-pulse" style={{ height: 13, width: '70%', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }} />
      </div>
    )
  }

  if (!data?.briefing) return null

  const hasCouncil = data.council_mode && (
    (data.consensus && data.consensus.length > 0) ||
    (data.contested && data.contested.length > 0)
  )

  return (
    <div style={{ borderRadius: 12, background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>A</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aria Briefing</span>
        {data.council_mode && (
          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', color: 'rgba(167,139,250,0.9)', border: '1px solid rgba(139,92,246,0.2)', marginLeft: 'auto' }}>
            Council Mode
          </span>
        )}
      </div>

      <div style={{ padding: '14px 20px', fontSize: 13, lineHeight: 1.75, color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-wrap', fontFamily: "'Manrope',sans-serif" }}>
        {data.briefing}
      </div>

      {hasCouncil && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ width: '100%', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Manrope',sans-serif" }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>How Aria reached this</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {expanded && (
            <div style={{ padding: '0 20px 16px' }}>
              {data.consensus && data.consensus.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>All brains agreed</p>
                  {data.consensus.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#1D9E75', flexShrink: 0, marginTop: 1 }}>✓</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              {data.contested && data.contested.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Points of difference</p>
                  {data.contested.map((item, i) => (
                    <div key={i} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 12 }}>⚡</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>{item.topic}</span>
                      </div>
                      {item.optimist_view && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#1D9E75', flexShrink: 0, width: 52 }}>Growth</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.optimist_view}</span>
                        </div>
                      )}
                      {item.critic_view && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#F87171', flexShrink: 0, width: 52 }}>Risk</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.critic_view}</span>
                        </div>
                      )}
                      {item.strategist_view && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#A78BFA', flexShrink: 0, width: 52 }}>Strategy</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{item.strategist_view}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {data.confidence_map && Object.keys(data.confidence_map).length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Confidence</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(data.confidence_map).map(([key, level]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{key}:</span>
                        <ConfidenceBadge level={level} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

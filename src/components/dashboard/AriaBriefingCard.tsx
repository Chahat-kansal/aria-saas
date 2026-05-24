'use client'
import { useState, useEffect, useRef } from 'react'

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

// Extract key metrics from the briefing text as highlight chips
function extractMetrics(text: string): string[] {
  const patterns = [
    /\$[\d,]+(?:\.\d{2})?/g,
    /\d+%/g,
    /\d+\s+(?:customers?|transactions?|units?|products?)/gi,
  ]
  const found: string[] = []
  for (const p of patterns) {
    const m = text.match(p)
    if (m) found.push(...m.slice(0, 3))
  }
  return [...new Set(found)].slice(0, 6)
}

// Parse briefing text: split on **...**  for bold sections
function parseBriefing(text: string) {
  const parts: { type: 'text' | 'bold' | 'heading', content: string }[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    if (!line.trim()) { parts.push({ type: 'text', content: '' }); continue }
    // Check if line starts with bold (heading style)
    if (line.startsWith('**') && line.includes(':**')) {
      const match = line.match(/^\*\*(.+?)\*\*(.*)$/)
      if (match) {
        parts.push({ type: 'heading', content: match[1] })
        if (match[2].trim()) parts.push({ type: 'text', content: match[2].trim() })
        continue
      }
    }
    // Inline bold
    const segments = line.split(/(\*\*[^*]+\*\*)/)
    if (segments.length > 1) {
      for (const seg of segments) {
        if (seg.startsWith('**') && seg.endsWith('**')) {
          parts.push({ type: 'bold', content: seg.slice(2, -2) })
        } else if (seg) {
          parts.push({ type: 'text', content: seg })
        }
      }
      parts.push({ type: 'text', content: '\n' })
    } else {
      parts.push({ type: 'text', content: line })
      parts.push({ type: 'text', content: '\n' })
    }
  }
  return parts
}

const TEMPLATES = [
  { accent: '#7FB897', accentDim: 'rgba(127,184,151,0.12)', accentBorder: 'rgba(127,184,151,0.25)', label: 'forest' },
  { accent: '#60A5FA', accentDim: 'rgba(96,165,250,0.12)', accentBorder: 'rgba(96,165,250,0.25)', label: 'blue' },
  { accent: '#F59E0B', accentDim: 'rgba(245,158,11,0.12)', accentBorder: 'rgba(245,158,11,0.25)', label: 'amber' },
  { accent: '#A78BFA', accentDim: 'rgba(167,139,250,0.12)', accentBorder: 'rgba(167,139,250,0.25)', label: 'violet' },
]

function ConfidenceDot({ level }: { level: string }) {
  const c = level === 'high' ? '#7FB897' : level === 'medium' ? '#F59E0B' : '#6B7280'
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c, marginRight: 5, flexShrink: 0, marginTop: 2 }} />
}

function MiniBarChart({ items }: { items: { label: string; level: string }[] }) {
  const levelVal = (l: string) => l === 'high' ? 1 : l === 'medium' ? 0.6 : 0.25
  const levelColor = (l: string) => l === 'high' ? '#7FB897' : l === 'medium' ? '#F59E0B' : '#4B5563'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.slice(0, 5).map(({ label, level }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 120, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label.replace(/_/g, ' ')}</span>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${levelVal(level) * 100}%`, height: '100%', borderRadius: 3, background: levelColor(level), transition: 'width 0.8s ease' }} />
          </div>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{level}</span>
        </div>
      ))}
    </div>
  )
}

function BrainCard({ brain, color, label, icon }: { brain: string; color: string; label: string; icon: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}30` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55, margin: 0 }}>{brain}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ borderRadius: 16, background: 'rgba(15,23,17,0.9)', border: '1px solid rgba(127,184,151,0.15)', padding: '20px 24px', marginBottom: 20, overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12 }}>🧠</span>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(127,184,151,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aria Council</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>3 brains analysing your business...</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['Growth', 'Risk', 'Strategy'].map((b, i) => (
          <div key={b} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: ['#7FB897','#F87171','#A78BFA'][i], marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b}</div>
            <div className="animate-pulse" style={{ height: 8, width: '80%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 4 }} />
            <div className="animate-pulse" style={{ height: 8, width: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      {[90, 75, 85, 55].map((w, i) => (
        <div key={i} className="animate-pulse" style={{ height: 12, width: `${w}%`, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 8 }} />
      ))}
    </div>
  )
}

export function AriaBriefingCard({ businessId }: { businessId: string }) {
  const [data, setData] = useState<BriefingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [showBrains, setShowBrains] = useState(false)
  const templateRef = useRef(TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)])
  const T = templateRef.current

  useEffect(() => {
    if (!businessId) return
    fetch('/api/aria/briefing?businessId=' + businessId)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [businessId])

  if (loading) return <LoadingSkeleton />
  if (!data?.briefing) return null

  const metrics = extractMetrics(data.briefing)
  const parsed = parseBriefing(data.briefing)
  const confidenceItems = data.confidence_map ? Object.entries(data.confidence_map).map(([label, level]) => ({ label, level })) : []
  const hasCouncil = data.council_mode && ((data.consensus && data.consensus.length > 0) || (data.contested && data.contested.length > 0))

  return (
    <div style={{ borderRadius: 16, background: 'rgba(13,20,15,0.95)', border: `1px solid ${T.accentBorder}`, marginBottom: 20, overflow: 'hidden', position: 'relative' }}>
      {/* Subtle gradient top bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.accent}00, ${T.accent}, ${T.accent}00)`, flexShrink: 0 }} />

      {/* Header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.accentDim, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: T.accent, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>A</span>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Aria Briefing</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
            {data.council_mode ? '3-brain council · ' : ''}{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
          </div>
        </div>
        {data.council_mode && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {['🌱','⚠️','🎯'].map((e, i) => (
              <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }} title={['Growth','Risk','Strategy'][i]}>{e}</div>
            ))}
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 2 }}>Council</span>
          </div>
        )}
      </div>

      {/* Metric highlight chips */}
      {metrics.length > 0 && (
        <div style={{ padding: '10px 20px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {metrics.map((m, i) => (
            <div key={i} style={{ padding: '3px 10px', borderRadius: 20, background: T.accentDim, border: `1px solid ${T.accentBorder}`, fontSize: 11, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums' }}>
              {m}
            </div>
          ))}
        </div>
      )}

      {/* Briefing text — parsed with headings */}
      <div style={{ padding: '14px 20px 4px', fontSize: 13, lineHeight: 1.78, color: 'rgba(255,255,255,0.82)' }}>
        {parsed.map((part, i) => {
          if (part.content === '\n' || part.content === '') return <br key={i} />
          if (part.type === 'heading') return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 4 }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: T.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{part.content}</span>
            </div>
          )
          if (part.type === 'bold') return <strong key={i} style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 700 }}>{part.content}</strong>
          return <span key={i}>{part.content}</span>
        })}
      </div>

      {/* Confidence bar chart */}
      {confidenceItems.length > 0 && (
        <div style={{ margin: '12px 20px 0', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Signal Confidence</div>
          <MiniBarChart items={confidenceItems} />
        </div>
      )}

      {/* Consensus items */}
      {data.consensus && data.consensus.length > 0 && (
        <div style={{ margin: '12px 20px 0', padding: '12px 14px', borderRadius: 10, background: 'rgba(127,184,151,0.04)', border: '1px solid rgba(127,184,151,0.12)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(127,184,151,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>All 3 Brains Agree</div>
          {data.consensus.slice(0, 3).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < 2 ? 7 : 0 }}>
              <span style={{ color: '#7FB897', fontSize: 11, flexShrink: 0, marginTop: 2 }}>✓</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contested items */}
      {data.contested && data.contested.length > 0 && (
        <div style={{ margin: '10px 20px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>⚡ Split Decision</div>
          {data.contested.slice(0, 2).map((item, i) => (
            <div key={i} style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 10 }}>{item.topic}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {item.optimist_view && <BrainCard brain={item.optimist_view} color="#7FB897" label="Growth" icon="🌱" />}
                {item.critic_view && <BrainCard brain={item.critic_view} color="#F87171" label="Risk" icon="⚠️" />}
              </div>
              {item.strategist_view && (
                <div style={{ marginTop: 8 }}>
                  <BrainCard brain={item.strategist_view} color="#A78BFA" label="Strategy" icon="🎯" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* How Aria reached this — toggle */}
      {hasCouncil && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 14 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ width: '100%', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
              {expanded ? 'Hide' : 'See'} how Aria reached this
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {expanded && data.contested && data.contested.length > 1 && (
            <div style={{ padding: '0 20px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>More contested points</div>
              {data.contested.slice(2).map((item, i) => (
                <div key={i} style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{item.topic}</div>
                  {item.strategist_view && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, margin: 0 }}>{item.strategist_view}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ height: 4 }} />
    </div>
  )
}

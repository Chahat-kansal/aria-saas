'use client'
import { useState, useEffect, useRef } from 'react'

/* ─── Types ─────────────────────────────────────────────────── */
interface BriefingLayout {
  mood: 'urgent' | 'positive' | 'strategic' | 'split' | 'external'
  lead_type: 'metric' | 'alert' | 'question' | 'debate' | 'context'
  lead_value: string
  lead_label: string
  accent: 'red' | 'green' | 'amber' | 'violet' | 'blue'
  show_debate_first: boolean
  highlight_metrics: string[]
  section_order: string[]
}
interface Contested { topic: string; optimist_view: string; critic_view: string; strategist_view: string }
interface BriefingResponse {
  briefing: string; council_mode: boolean
  consensus?: string[]; contested?: Contested[]
  confidence_map?: Record<string, string>
  layout?: BriefingLayout
}

/* ─── Accent palette (council decides which) ─────────────────── */
const ACCENTS: Record<string, { main: string; dim: string; border: string; glow: string }> = {
  red:    { main: '#F87171', dim: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.25)',  glow: 'rgba(248,113,113,0.15)' },
  green:  { main: '#7FB897', dim: 'rgba(127,184,151,0.1)',  border: 'rgba(127,184,151,0.25)',  glow: 'rgba(127,184,151,0.12)' },
  amber:  { main: '#F59E0B', dim: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)',   glow: 'rgba(245,158,11,0.12)'  },
  violet: { main: '#A78BFA', dim: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.25)',  glow: 'rgba(167,139,250,0.12)' },
  blue:   { main: '#60A5FA', dim: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)',   glow: 'rgba(96,165,250,0.12)'  },
}
const FALLBACK_LAYOUT: BriefingLayout = {
  mood: 'strategic', lead_type: 'metric', lead_value: '', lead_label: 'Today',
  accent: 'green', show_debate_first: false, highlight_metrics: [],
  section_order: ['lead', 'briefing', 'consensus', 'debate', 'confidence'],
}

/* ─── Helpers ────────────────────────────────────────────────── */
function parseBriefing(text: string) {
  const result: { type: 'heading' | 'bold' | 'text' | 'br'; content: string }[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) { result.push({ type: 'br', content: '' }); continue }
    const hm = line.match(/^\*\*(.+?):\*\*(.*)$/)
    if (hm) {
      result.push({ type: 'heading', content: hm[1] })
      if (hm[2].trim()) result.push({ type: 'text', content: hm[2].trim() })
      continue
    }
    const segs = line.split(/(\*\*[^*]+\*\*)/)
    for (const s of segs) {
      if (s.startsWith('**') && s.endsWith('**'))
        result.push({ type: 'bold', content: s.slice(2, -2) })
      else if (s) result.push({ type: 'text', content: s })
    }
    result.push({ type: 'br', content: '' })
  }
  return result
}

/* ─── Sub-components ─────────────────────────────────────────── */
function LeadBlock({ layout, accent }: { layout: BriefingLayout; accent: typeof ACCENTS[string] }) {
  if (!layout.lead_value) return null
  if (layout.lead_type === 'alert') return (
    <div style={{ margin: '0 0 16px', padding: '14px 18px', borderRadius: 12, background: accent.dim, border: `1px solid ${accent.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 22 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: accent.main, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{layout.lead_label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{layout.lead_value}</div>
      </div>
    </div>
  )
  if (layout.lead_type === 'question') return (
    <div style={{ margin: '0 0 16px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${accent.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: accent.main, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Key Decision</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>❓ {layout.lead_value}</div>
    </div>
  )
  if (layout.lead_type === 'context') return (
    <div style={{ margin: '0 0 16px', padding: '12px 16px', borderRadius: 12, background: accent.dim, border: `1px solid ${accent.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 18 }}>🌐</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: accent.main, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>External · {layout.lead_label}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{layout.lead_value}</div>
      </div>
    </div>
  )
  // Default: big metric
  return (
    <div style={{ margin: '0 0 16px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <div style={{ fontSize: 36, fontWeight: 800, color: accent.main, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em' }}>{layout.lead_value}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{layout.lead_label}</div>
    </div>
  )
}

function MetricChips({ metrics, accent }: { metrics: string[]; accent: typeof ACCENTS[string] }) {
  if (!metrics.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {metrics.map((m, i) => (
        <span key={i} style={{ padding: '3px 10px', borderRadius: 20, background: accent.dim, border: `1px solid ${accent.border}`, fontSize: 11, fontWeight: 700, color: accent.main }}>
          {m}
        </span>
      ))}
    </div>
  )
}

function BriefingText({ text, accent }: { text: string; accent: typeof ACCENTS[string] }) {
  const parts = parseBriefing(text)
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.78, color: 'rgba(255,255,255,0.82)', marginBottom: 14 }}>
      {parts.map((p, i) => {
        if (p.type === 'br') return <br key={i} />
        if (p.type === 'heading') return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 4 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: accent.main, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: accent.main }}>{p.content}</span>
          </div>
        )
        if (p.type === 'bold') return <strong key={i} style={{ color: 'rgba(255,255,255,0.95)' }}>{p.content}</strong>
        return <span key={i}>{p.content}</span>
      })}
    </div>
  )
}

function ConsensusBlock({ items, accent }: { items: string[]; accent: typeof ACCENTS[string] }) {
  if (!items.length) return null
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(127,184,151,0.04)', border: '1px solid rgba(127,184,151,0.12)', marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(127,184,151,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>All 3 Brains Agree</div>
      {items.slice(0, 4).map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < items.length - 1 ? 7 : 0 }}>
          <span style={{ color: '#7FB897', fontSize: 11, flexShrink: 0, marginTop: 2 }}>✓</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function DebateBlock({ items, prominent }: { items: Contested[]; prominent: boolean }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        ⚡ {prominent ? 'The Big Split — Brains Disagree' : 'Split Decisions'}
      </div>
      {items.slice(0, prominent ? 2 : 1).map((item, i) => (
        <div key={i} style={{ marginBottom: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 10 }}>{item.topic}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { view: item.optimist_view, color: '#7FB897', icon: '🌱', label: 'Growth' },
              { view: item.critic_view,   color: '#F87171', icon: '⚠️', label: 'Risk'   },
              { view: item.strategist_view, color: '#A78BFA', icon: '🎯', label: 'Strategy' },
            ].filter(b => b.view).map(brain => (
              <div key={brain.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${brain.color}20` }}>
                <span style={{ fontSize: 10 }}>{brain.icon}</span>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: brain.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 6 }}>{brain.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>{brain.view}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConfidenceBlock({ map }: { map: Record<string, string> }) {
  const items = Object.entries(map)
  if (!items.length) return null
  const val = (l: string) => l === 'high' ? 1 : l === 'medium' ? 0.6 : 0.25
  const col = (l: string) => l === 'high' ? '#7FB897' : l === 'medium' ? '#F59E0B' : '#4B5563'
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Signal Confidence</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.slice(0, 5).map(([key, level]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key.replace(/_/g, ' ')}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ width: `${val(level) * 100}%`, height: '100%', borderRadius: 2, background: col(level), transition: 'width 0.8s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ borderRadius: 16, background: 'rgba(13,20,15,0.95)', border: '1px solid rgba(127,184,151,0.15)', padding: '20px', marginBottom: 20 }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,rgba(127,184,151,0.4),transparent)', borderRadius: 2, marginBottom: 18 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['Growth 🌱','Risk ⚠️','Strategy 🎯'].map((b, i) => (
          <div key={b} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: ['#7FB897','#F87171','#A78BFA'][i], marginBottom: 6, textTransform: 'uppercase' }}>{b}</div>
            <div className="animate-pulse" style={{ height: 7, width: '80%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginBottom: 4 }} />
            <div className="animate-pulse" style={{ height: 7, width: '55%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginBottom: 12 }}>Council is deliberating...</div>
      {[90,75,85,60,70].map((w, i) => (
        <div key={i} className="animate-pulse" style={{ height: 11, width: `${w}%`, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 7 }} />
      ))}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────── */
export function AriaBriefingCard({ businessId }: { businessId: string }) {
  const [data, setData]       = useState<BriefingResponse | null>(null)
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

  if (loading) return <LoadingSkeleton />
  if (!data?.briefing) return null

  // Use council's layout decision — fall back gracefully
  const layout = data.layout ?? FALLBACK_LAYOUT
  const A = ACCENTS[layout.accent] ?? ACCENTS.green
  const order = layout.section_order?.length ? layout.section_order
    : ['lead', 'briefing', 'consensus', 'debate', 'confidence']
  const moodEmoji: Record<string, string> = {
    urgent: '🚨', positive: '📈', strategic: '♟️', split: '⚡', external: '🌐'
  }

  const sections: Record<string, React.ReactNode> = {
    lead:       <LeadBlock key="lead" layout={layout} accent={A} />,
    metrics:    <MetricChips key="metrics" metrics={layout.highlight_metrics ?? []} accent={A} />,
    briefing:   <BriefingText key="briefing" text={data.briefing} accent={A} />,
    consensus:  data.consensus?.length ? <ConsensusBlock key="consensus" items={data.consensus} accent={A} /> : null,
    debate:     data.contested?.length ? <DebateBlock key="debate" items={data.contested} prominent={layout.show_debate_first} /> : null,
    confidence: data.confidence_map && Object.keys(data.confidence_map).length ? <ConfidenceBlock key="confidence" map={data.confidence_map} /> : null,
  }

  return (
    <div style={{ borderRadius: 16, background: 'rgba(13,20,15,0.97)', border: `1px solid ${A.border}`, marginBottom: 20, overflow: 'hidden', position: 'relative' }}>
      {/* Council-designed accent bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${A.main}00, ${A.main}, ${A.main}00)` }} />

      {/* Header — council decided the mood */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: A.dim, border: `1px solid ${A.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12 }}>
          {moodEmoji[layout.mood] ?? '🧠'}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: A.main, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Aria Briefing</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
            Council · {layout.mood} · {new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['🌱','⚠️','🎯'].map((e, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{e}</div>
          ))}
        </div>
      </div>

      {/* Body — sections rendered in council's chosen order */}
      <div style={{ padding: '16px 20px 4px' }}>
        {/* Always show metrics chips first if available */}
        {(layout.highlight_metrics?.length ?? 0) > 0 && sections.metrics}

        {/* Render sections in council's order */}
        {order.map(key => sections[key] ?? null)}
      </div>

      {/* Expand for more contested points */}
      {data.contested && data.contested.length > 1 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ width: '100%', padding: '9px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{expanded ? 'Hide' : 'See all split decisions'}</span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
          </button>
          {expanded && (
            <div style={{ padding: '0 20px 16px' }}>
              <DebateBlock items={data.contested.slice(1)} prominent={false} />
            </div>
          )}
        </div>
      )}
      <div style={{ height: 6 }} />
    </div>
  )
}

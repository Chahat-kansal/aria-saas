'use client'
import type { AskBlock } from '@/lib/aria/ask-types'

interface Props {
  block: AskBlock
  onChoice?: (prompt: string) => void
}

const G = '#7FB897', R = '#F87171', A = '#F59E0B', V = '#A78BFA', B = '#60A5FA'
const trendIcon = (t?: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '—'
const trendColor = (t?: string, c?: string) => c ?? (t === 'up' ? G : t === 'down' ? R : 'rgba(255,255,255,0.35)')

export function BlockRenderer({ block, onChoice }: Props) {

  if (block.type === 'lead') return (
    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.94)', lineHeight: 1.65, marginBottom: 10 }}>
      {block.content}
    </div>
  )

  if (block.type === 'text') return (
    <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.78)', marginBottom: 10 }}>
      {block.content.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
    </div>
  )

  if (block.type === 'chart') {
    const max = Math.max(...block.values, 1)
    const u = block.unit ?? ''
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', background: 'rgba(96,165,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: B, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {block.title ?? 'Chart'}
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 6 }}>
            {block.values.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 8, color: v === max ? G : 'rgba(255,255,255,0.2)' }}>
                  {u}{v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                </span>
                <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(3, (v/max)*100)}%`, background: v === max ? G : 'rgba(127,184,151,0.2)' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, marginBottom: block.metrics.length ? 12 : 0 }}>
            {block.labels.map((l, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.22)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          {block.metrics.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {block.metrics.map((m, i) => (
                <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '7px 10px' }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: m.color ?? G }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'metric_row') return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
      {block.items.map((item, i) => (
        <div key={i} style={{ flex: '1 1 100px', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: trendColor(item.trend, item.color), lineHeight: 1 }}>{item.value}</div>
          {item.sub && (
            <div style={{ fontSize: 9, marginTop: 5, color: 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ color: trendColor(item.trend) }}>{trendIcon(item.trend)}</span>{item.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  if (block.type === 'brain_readouts') return (
    <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', background: 'rgba(167,139,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: V, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Council read
      </div>
      <div style={{ padding: 12 }}>
        {block.items.map((item, i) => {
          const c = item.role === 'growth' ? G : item.role === 'risk' ? R : item.role === 'context' ? B : V
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < block.items.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width: 24, height: 24, borderRadius: 7, background: `${c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: c, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.role}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item.text}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'council_split') return (
    <div style={{ borderRadius: 12, border: '0.5px solid rgba(245,158,11,0.25)', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', background: 'rgba(245,158,11,0.07)', borderBottom: '0.5px solid rgba(245,158,11,0.15)', fontSize: 9, fontWeight: 600, color: A, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Council split — your call
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)', marginBottom: 10 }}>{block.question}</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {[{label:'Growth',text:block.growth,color:G},{label:'Risk',text:block.risk,color:R}].map((b,i) => (
            <div key={i} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: `${b.color}08`, border: `0.5px solid ${b.color}28` }}>
              <div style={{ fontSize: 8, fontWeight: 600, color: b.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{b.label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '0.5px solid rgba(167,139,250,0.18)', marginBottom: 10 }}>
          <div style={{ fontSize: 8, fontWeight: 600, color: V, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Strategy</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{block.strategy}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {block.choices.map((c, i) => (
            <button key={i} onClick={() => onChoice?.(c.prompt)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', flex: 1 }}>{c.title}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{c.sub}</div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>↗</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (block.type === 'action_list') return (
    <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '7px 12px', background: 'rgba(127,184,151,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: G, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Priority actions
      </div>
      <div style={{ padding: 12 }}>
        {block.items.map((item, i) => {
          const c = item.colorVariant === 'danger' ? R : item.colorVariant === 'warning' ? A : G
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < block.items.length-1 ? 10 : 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c, fontSize: 14, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{item.title}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{item.sub}</div>
              </div>
              <button onClick={() => onChoice?.(item.prompt)}
                style={{ padding: '5px 12px', borderRadius: 7, background: G, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Do it ↗
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'action_single') return (
    <div style={{ borderRadius: 12, border: '0.5px solid rgba(127,184,151,0.2)', overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ padding: '7px 12px', background: 'rgba(127,184,151,0.07)', borderBottom: '0.5px solid rgba(127,184,151,0.15)', fontSize: 9, fontWeight: 600, color: G, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Aria suggests
      </div>
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(127,184,151,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: G, fontSize: 14, flexShrink: 0 }}>{block.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{block.title}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{block.sub}</div>
        </div>
        <button onClick={() => onChoice?.(block.prompt)}
          style={{ padding: '5px 12px', borderRadius: 7, background: G, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Do it ↗
        </button>
      </div>
    </div>
  )

  if (block.type === 'html') return (
    <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
      {block.title && (
        <div style={{ padding: '7px 12px', background: 'rgba(96,165,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: B, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {block.title}
        </div>
      )}
      <div style={{ padding: 14 }} dangerouslySetInnerHTML={{ __html: block.content }} />
    </div>
  )

  return null
}

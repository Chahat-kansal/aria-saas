'use client'
import type { AskBlock } from '@/lib/aria/ask-types'

interface Props {
  block: AskBlock
  onChoice?: (prompt: string) => void
}

export function BlockRenderer({ block, onChoice }: Props) {
  const accent = '#7FB897'
  const accentDim = 'rgba(127,184,151,0.1)'
  const accentBorder = 'rgba(127,184,151,0.2)'

  if (block.type === 'lead') return (
    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.94)', lineHeight: 1.6, marginBottom: 10 }}>
      {block.content}
    </div>
  )

  if (block.type === 'text') return (
    <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.82)', marginBottom: 10 }}>
      {block.content.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
    </div>
  )

  if (block.type === 'chart') {
    const max = Math.max(...block.values, 1)
    return (
      <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ padding: '6px 10px', background: 'rgba(55,138,221,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Revenue chart
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 56, marginBottom: 5 }}>
            {block.values.map((v, i) => (
              <div key={i} style={{ flex: 1, borderRadius: '2px 2px 0 0', height: `${(v / max) * 100}%`, background: v === max ? accent : 'rgba(127,184,151,0.25)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {block.labels.map((l, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{l}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {block.metrics.map((m, i) => (
              <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 7, padding: '6px 8px' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: m.color ?? accent }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (block.type === 'brain_readouts') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'rgba(167,139,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        What the 3 brains see
      </div>
      <div style={{ padding: 10 }}>
        {block.items.map((item, i) => {
          const color = item.role === 'growth' ? '#7FB897' : item.role === 'risk' ? '#F87171' : '#A78BFA'
          return (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '7px 0', borderBottom: i < block.items.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.role}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item.text}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'council_split') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(245,158,11,0.25)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'rgba(245,158,11,0.07)', borderBottom: '0.5px solid rgba(245,158,11,0.15)', fontSize: 9, fontWeight: 500, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Council split — your call
      </div>
      <div style={{ padding: 11 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.9)', marginBottom: 9 }}>{block.question}</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          {[
            { label: 'Growth', text: block.growth, color: '#7FB897' },
            { label: 'Risk', text: block.risk, color: '#F87171' },
          ].map((b, i) => (
            <div key={i} style={{ flex: 1, padding: '7px 9px', borderRadius: 7, background: `${b.color}08`, border: `0.5px solid ${b.color}28` }}>
              <div style={{ fontSize: 8, fontWeight: 500, color: b.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{b.label}</div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{b.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '7px 9px', borderRadius: 7, background: 'rgba(167,139,250,0.06)', border: '0.5px solid rgba(167,139,250,0.18)', marginBottom: 9 }}>
          <div style={{ fontSize: 8, fontWeight: 500, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Strategy</div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{block.strategy}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {block.choices.map((c, i) => (
            <button key={i} onClick={() => onChoice?.(c.prompt)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', flex: 1 }}>{c.title}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>{c.sub}</div>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>↗</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  if (block.type === 'action_list') return (
    <div style={{ borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: accentDim, borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 500, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Priority list
      </div>
      <div style={{ padding: 10 }}>
        {block.items.map((item, i) => {
          const iconBg = item.colorVariant === 'danger' ? 'rgba(248,113,113,0.12)' : item.colorVariant === 'warning' ? 'rgba(245,158,11,0.12)' : accentDim
          const iconColor = item.colorVariant === 'danger' ? '#F87171' : item.colorVariant === 'warning' ? '#F59E0B' : accent
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: i < block.items.length - 1 ? 8 : 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, fontSize: 13, flexShrink: 0 }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{item.title}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{item.sub}</div>
              </div>
              <button onClick={() => onChoice?.(item.prompt)}
                style={{ padding: '5px 11px', borderRadius: 7, background: accent, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Do it ↗
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (block.type === 'action_single') return (
    <div style={{ borderRadius: 10, border: `0.5px solid ${accentBorder}`, overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ padding: '6px 10px', background: accentDim, borderBottom: `0.5px solid ${accentBorder}`, fontSize: 9, fontWeight: 500, color: accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        Aria suggests
      </div>
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontSize: 13, flexShrink: 0 }}>{block.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>{block.title}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>{block.sub}</div>
        </div>
        <button onClick={() => onChoice?.(block.prompt)}
          style={{ padding: '5px 11px', borderRadius: 7, background: accent, color: '#0b100d', border: 'none', fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Do it ↗
        </button>
      </div>
    </div>
  )

  return null
}

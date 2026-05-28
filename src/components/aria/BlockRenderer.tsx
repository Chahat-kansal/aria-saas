'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { AskBlock } from '@/lib/aria/ask-types'

// Renders Aria's rich reply blocks below the text bubble. Matches the Financial
// Trust palette (CSS vars) used across /pos/ask — no new look introduced.

const ROLE_COLOR: Record<string, string> = {
  growth: '#00B140', risk: '#F87171', strategy: 'var(--violet)', context: 'var(--text-tertiary)',
}
const VARIANT_ACCENT: Record<string, string> = {
  danger: '#F87171', warning: '#F59E0B', default: 'var(--violet)',
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '')
}

function ActionCard({ icon, title, sub, prompt, accent, onAction }: {
  icon: string; title: string; sub: string; prompt: string; accent: string; onAction?: (prompt: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onAction?.(prompt)}
      aria-label={`Ask Aria: ${title}`}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
        padding: '12px 14px', borderRadius: 10, border: '1px solid var(--divider)',
        borderLeft: `3px solid ${accent}`, background: 'var(--bg-surface)', cursor: 'pointer',
        fontFamily: 'inherit', color: 'var(--text-primary)',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--violet)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--divider)')}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }} aria-hidden>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
    </button>
  )
}

function OneBlock({ block, onAction }: { block: AskBlock; onAction?: (prompt: string) => void }) {
  switch (block.type) {
    case 'lead':
      return <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{block.content}</p>

    case 'text':
      return <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{block.content}</p>

    case 'chart': {
      const data = block.labels.map((label, i) => ({ label, value: block.values[i] ?? 0 }))
      const unit = block.unit ?? ''
      return (
        <figure style={{ margin: 0, background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }} role="img" aria-label={block.title ? `Bar chart: ${block.title}` : 'Bar chart'}>
          {block.title && <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>{block.title}</figcaption>}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={44} />
              <Tooltip
                formatter={(v) => [`${unit === '$' ? '$' : ''}${Number(v ?? 0).toLocaleString()}${unit && unit !== '$' ? ' ' + unit : ''}`, '']}
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => <Cell key={i} fill={block.metrics[i]?.color ?? 'var(--violet)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {block.metrics.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
              {block.metrics.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color ?? 'var(--violet)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.label}: <strong style={{ color: 'var(--text-primary)' }}>{m.value}</strong></span>
                </div>
              ))}
            </div>
          )}
        </figure>
      )
    }

    case 'metric_row':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(120px, 1fr))`, gap: 10 }}>
          {block.items.map((m, i) => {
            const trendCol = m.trend === 'up' ? '#00B140' : m.trend === 'down' ? '#F87171' : 'var(--text-tertiary)'
            const trendArrow = m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : ''
            return (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color ?? 'var(--text-primary)', lineHeight: 1 }}>{m.value}</div>
                {(m.sub || trendArrow) && (
                  <div style={{ fontSize: 12, marginTop: 4, color: trendArrow ? trendCol : 'var(--text-secondary)' }}>
                    {trendArrow && <span style={{ marginRight: 4 }}>{trendArrow}</span>}{m.sub}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )

    case 'brain_readouts':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {block.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderLeft: `3px solid ${ROLE_COLOR[it.role] ?? 'var(--violet)'}` }}>
              <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden>{it.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: ROLE_COLOR[it.role] ?? 'var(--violet)', marginBottom: 2 }}>{it.role}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{it.text}</div>
              </div>
            </div>
          ))}
        </div>
      )

    case 'council_split':
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '16px', border: '1px solid var(--divider)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>{block.question}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            {([['Growth', block.growth, '#00B140'], ['Risk', block.risk, '#F87171'], ['Strategy', block.strategy, 'var(--violet)']] as [string, string, string][]).map(([label, text, col]) => (
              <div key={label} style={{ borderRadius: 10, padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: col, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</div>
              </div>
            ))}
          </div>
          {block.choices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {block.choices.map((c, i) => (
                <ActionCard key={i} icon={c.icon} title={c.title} sub={c.sub} prompt={c.prompt} accent="var(--violet)" onAction={onAction} />
              ))}
            </div>
          )}
        </div>
      )

    case 'action_list':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {block.items.map((it, i) => (
            <ActionCard key={i} icon={it.icon} title={it.title} sub={it.sub} prompt={it.prompt} accent={VARIANT_ACCENT[it.colorVariant ?? 'default']} onAction={onAction} />
          ))}
        </div>
      )

    case 'action_single':
      return <ActionCard icon={block.icon} title={block.title} sub={block.sub} prompt={block.prompt} accent="var(--violet)" onAction={onAction} />

    case 'html':
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }}>
          {block.title && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{block.title}</div>}
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: stripScripts(block.content) }} />
        </div>
      )

    default:
      return (
        <span style={{ display: 'inline-block', fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', fontFamily: 'monospace' }}>
          Unsupported block: {(block as { type?: string }).type ?? 'unknown'}
        </span>
      )
  }
}

export function BlockRenderer({ blocks, onAction }: { blocks: AskBlock[]; onAction?: (prompt: string) => void }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {blocks.map((block, i) => <OneBlock key={i} block={block} onAction={onAction} />)}
    </div>
  )
}

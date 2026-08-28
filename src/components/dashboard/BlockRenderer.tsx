'use client'
import { isContentFreeBlock } from '@/lib/aria/block-content'
import type { AskBlock } from '@/lib/aria/ask-types'
import { sanitizeHtml } from '@/lib/security/sanitize-html'

interface Props {
  block: AskBlock
  onChoice?: (prompt: string) => void
}

const G = '#7FB897', R = '#F87171', A = '#F59E0B', V = '#A78BFA', B = '#60A5FA'
const trendIcon = (t?: string) => t === 'up' ? '↑' : t === 'down' ? '↓' : '—'
const trendColor = (t?: string, c?: string) => c ?? (t === 'up' ? G : t === 'down' ? R : 'rgba(255,255,255,0.35)')

export function BlockRenderer({ block, onChoice }: Props) {
  // S6 PHASE 1 — never draw a panel whose body is empty. The council header and its four role
  // labels used to render over nothing whenever the model returned prose instead of sections.
  // Shared with the route and the other renderer so "empty" cannot mean three different things.
  if (isContentFreeBlock(block)) return null

  if (!block || !block.type) return null
  try {


  if (block.type === 'lead') return (
    <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.94)', lineHeight: 1.65, marginBottom: 10 }}>
      {block.content}
    </div>
  )

  if (block.type === 'text') return (
    <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.78)', marginBottom: 10 }}>
      {(block.content ?? '').split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
    </div>
  )

  if (block.type === 'chart') {
    const max = Math.max(...(block.values ?? []), 1)
    const u = block.unit ?? ''
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', background: 'rgba(96,165,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: B, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {block.title ?? 'Chart'}
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 6 }}>
            {(block.values ?? []).map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 8, color: v === max ? G : 'rgba(255,255,255,0.2)' }}>
                  {u}{v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                </span>
                <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(3, (v/max)*100)}%`, background: v === max ? G : 'rgba(127,184,151,0.2)' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 3, marginBottom: (block.metrics ?? []).length ? 12 : 0 }}>
            {(block.labels ?? []).map((l, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.22)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
            ))}
          </div>
          {(block.metrics ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(block.metrics ?? []).map((m, i) => (
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
      {(block.items ?? []).map((item, i) => (
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
        {(block.items ?? []).map((item, i) => {
          const c = item.role === 'growth' ? G : item.role === 'risk' ? R : item.role === 'context' ? B : V
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < block.items?.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
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
          {(block.choices ?? []).map((c, i) => (
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
        {(block.items ?? []).map((item, i) => {
          const c = item.colorVariant === 'danger' ? R : item.colorVariant === 'warning' ? A : G
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < block.items?.length-1 ? 10 : 0 }}>
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
      {/* SEC-HTML-1 — raw model-authored HTML went straight into the DOM here with NO guard at
          all, on three owner-facing surfaces (ask-aria, pos/ask, AriaBriefingCard). Its twin at
          src/components/aria/BlockRenderer.tsx did guard its equivalent line — same component name,
          same prop, one protected. Both now use the same allowlist sanitiser. */}
      <div style={{ padding: 14 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content) }} />
    </div>
  )

  if (block.type === 'live_render') {
    const sanitized = block.html
      .replace(/<script[^>]+src=["'][^"']*["'][^>]*>/gi, '')
      .replace(/fetch\s*\(\s*["']https?:\/\/(?!ariaos\.site)/gi, 'void(')
    const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,-apple-system,sans-serif;background:transparent}</style></head><body>${sanitized}</body></html>`
    return (
      <div style={{ marginBottom: 12 }}>
        {block.title && (
          <div style={{ fontSize: 9, fontWeight: 600, color: B, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            {block.title}
          </div>
        )}
        <iframe
          srcDoc={srcDoc}
          style={{ width: '100%', height: block.height ?? 400, border: '1.5px solid #0a0a0a', borderRadius: 14, background: '#fafafa' }}
          sandbox="allow-scripts allow-same-origin"
          title={block.title ?? 'Aria output'}
        />
        {block.downloadable && (
          <button
            onClick={() => {
              const blob = new Blob([block.html], { type: 'text/html' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = block.download_filename ?? 'aria-output.html'; a.click()
              URL.revokeObjectURL(url)
            }}
            style={{ marginTop: 8, padding: '6px 14px', borderRadius: 10, border: '1.5px solid #0a0a0a', background: '#d9f54e', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#0a0a0a' }}
          >
            Download
          </button>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {['Change the colour', 'Download this', 'Show me a different time period', 'Explain what this means', 'Show me as a table instead'].map((chip) => (
            <button
              key={chip}
              onClick={() => onChoice?.(chip)}
              style={{ padding: '4px 11px', borderRadius: 99, fontSize: 10, fontWeight: 500, border: '0.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit' }}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'pushback') {
    const sev = block.severity ?? 'medium'
    const borderC = sev === 'high' ? 'rgba(248,113,113,0.3)' : 'rgba(245,158,11,0.3)'
    const bgC     = sev === 'high' ? 'rgba(248,113,113,0.06)' : 'rgba(245,158,11,0.06)'
    const textC   = sev === 'high' ? R : A
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid ' + borderC, background: bgC, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', background: sev === 'high' ? 'rgba(248,113,113,0.1)' : 'rgba(245,158,11,0.1)', borderBottom: '0.5px solid ' + borderC, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 12 }}>{sev === 'high' ? '🚨' : '⚠️'}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: textC, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Aria is pushing back
          </span>
        </div>
        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 5 }}>
            <span style={{ color: textC }}>Past decision:</span> {block.decision}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: 8 }}>
            {block.tension}
          </div>
          {block.question && (
            <div style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
              {block.question}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'kpi_card') {
    const color = block.color ?? G
    const tv = block.trend
    const trendColor = tv == null ? 'rgba(255,255,255,0.35)' : tv >= 0 ? G : Math.abs(tv) <= 20 ? A : R
    const trendArrow = tv == null ? '' : tv >= 0 ? '↑' : '↓'
    const fmtVal = (v: string | number) => {
      if (typeof v === 'string') return v
      if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (block.format === 'percent') return Number(v).toFixed(1) + '%'
      return Number(v).toLocaleString()
    }
    return (
      <div style={{ borderRadius: 14, border: `0.5px solid ${color}38`, background: `${color}0A`, marginBottom: 12, padding: '18px 20px' }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          {block.label}
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, color, fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'italic', lineHeight: 1, letterSpacing: '-0.01em' }}>
          {fmtVal(block.value)}
        </div>
        {(tv != null || block.trend_label) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            {tv != null && (
              <span style={{ fontSize: 12, fontWeight: 600, color: trendColor }}>
                {trendArrow}{Math.abs(tv).toFixed(1)}%
              </span>
            )}
            {block.trend_label && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)' }}>{block.trend_label}</span>
            )}
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'comparison_table') {
    const fmt = (v: number, f?: string) => {
      if (f === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (f === 'percent') return Number(v).toFixed(1) + '%'
      return Number(v).toLocaleString()
    }
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 14px', background: 'rgba(96,165,250,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: B, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {block.title}
        </div>
        <div style={{ padding: '10px 14px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, paddingBottom: 6, borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
            <div style={{ fontSize: 9, fontWeight: 600, color: G, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{block.left_label}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>{block.right_label}</div>
          </div>
          {(block.rows ?? []).map((row, ri) => {
            const delta = row.right > 0 ? ((row.left - row.right) / row.right) * 100 : null
            const deltaColor = delta == null ? 'rgba(255,255,255,0.3)' : delta >= 0 ? G : Math.abs(delta) <= 20 ? A : R
            return (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: ri < (block.rows?.length ?? 0) - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none', alignItems: 'baseline' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{row.metric}</div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.95)', fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'italic' }}>
                    {fmt(row.left, row.format)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{fmt(row.right, row.format)}</div>
                  {block.show_delta && delta != null && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: deltaColor, marginTop: 2 }}>
                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (block.type === 'data_table') {
    const fmtCell = (v: unknown, format?: string) => {
      if (v == null || v === '') return '—'
      if (format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (format === 'percent') return Number(v).toFixed(1) + '%'
      if (format === 'number') return Number(v).toLocaleString()
      return String(v)
    }
    const cols = block.columns ?? []
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 14px', background: 'rgba(127,184,151,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: G, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {block.title}
        </div>
        <div style={{ padding: '0 14px 10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 240 }}>
            <thead>
              <tr>
                {cols.map((col, ci) => (
                  <th key={ci} style={{ padding: '8px 0 6px', paddingRight: ci < cols.length - 1 ? 12 : 0, textAlign: ci === 0 ? 'left' : 'right', fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.rows ?? []).map((row, ri) => (
                <tr key={ri} style={{ borderTop: '0.5px solid rgba(255,255,255,0.05)' }}>
                  {cols.map((col, ci) => (
                    <td key={ci} style={{ padding: '7px 0', paddingRight: ci < cols.length - 1 ? 12 : 0, textAlign: ci === 0 ? 'left' : 'right', fontSize: 13, color: ci === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.72)', fontFamily: (ci > 0 && col.format === 'currency') ? 'var(--font-display), Georgia, serif' : 'inherit', fontStyle: (ci > 0 && col.format === 'currency') ? 'italic' : 'normal', fontWeight: (ci > 0 && col.format === 'currency') ? 600 : 400 }}>
                      {fmtCell(row[col.key], col.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (block.type === 'animated_kpi') {
    const acc = block.variant === 'b' ? '#2D5240' : block.variant === 'c' ? '#A78BFA' : '#7FB897'
    const fmtV = (v: string | number) => {
      if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
      if (block.format === 'percent') return Number(v).toFixed(1) + '%'
      return String(v)
    }
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', border: `1.5px solid ${acc}`, borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: acc }} />
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>{block.label}</p>
        <p style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: '#fff', margin: 0 }}>{fmtV(block.value)}</p>
        {block.delta !== undefined && (
          <p style={{ fontSize: 12, fontWeight: 500, color: block.delta >= 0 ? '#7FB897' : '#F87171', margin: '5px 0 0' }}>
            {block.delta >= 0 ? '↑' : '↓'} {Math.abs(block.delta)}% {block.delta_label ?? ''}
          </p>
        )}
      </div>
    )
  }

  if (block.type === 'bold_metric') {
    const fmtB = (v: string | number) => {
      if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
      if (block.format === 'percent') return Number(v).toFixed(1) + '%'
      return String(v)
    }
    return (
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '16px' }}>
        <p style={{ fontSize: 48, fontWeight: 600, lineHeight: 1, color: '#7FB897', margin: 0 }}>{fmtB(block.value)}</p>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '5px 0 0' }}>{block.label}</p>
      </div>
    )
  }

  if (block.type === 'bento_grid') {
    return (
      <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {block.items.map((item, i) => (
          <div key={i} style={{
            background: i === 0 ? '#2D5240' : i % 3 === 1 ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.06)',
            borderRadius: 9, padding: '9px 11px',
            gridColumn: item.span === 'full' ? '1 / 3' : 'auto',
          }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', margin: '0 0 2px' }}>{item.label}</p>
            <p style={{ fontSize: 20, fontWeight: 500, lineHeight: 1, color: '#fff', margin: 0 }}>{item.value}</p>
            {item.sub && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>{item.sub}</p>}
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'progress_bars') {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
        {block.title && <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 10px' }}>{block.title}</p>}
        {block.items.map((item, i) => {
          const pct = Math.min(100, Math.round((item.value / (item.max ?? 100)) * 100))
          const col = item.color ?? (pct >= 80 ? '#7FB897' : pct >= 50 ? '#F59E0B' : '#F87171')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < block.items.length - 1 ? 8 : 0 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 72 }}>{item.label}</span>
              <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#fff', minWidth: 28 }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    )
  }

  if (block.type === 'activity_stream') {
    return (
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
        {block.title && <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: '0 0 10px' }}>{block.title}</p>}
        {block.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < block.items.length - 1 ? 7 : 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.dot_color ?? '#7FB897', marginTop: 4, flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: 0 }}>{item.text}</p>
              {item.time && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>{item.time}</p>}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (block.type === 'alert_card') {
    const sevColor = block.severity === 'critical' ? '#F87171' : block.severity === 'warning' ? '#F59E0B' : '#60A5FA'
    return (
      <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${sevColor}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: sevColor, marginTop: 4, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: '0 0 3px' }}>{block.title}</p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{block.body}</p>
        </div>
      </div>
    )
  }

  if (block.type === 'kinetic_text') {
    const cols = block.colors ?? ['#7FB897', '#ffffff', '#FAC775']
    return (
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8, minHeight: 56 }}>
        {block.words.map((w, i) => (
          <span key={i} style={{ fontSize: 16, fontWeight: 500, color: cols[i % cols.length], display: 'inline-block', animation: `ariaKb 1s ease-in-out ${i * 0.15}s infinite alternate` }}>{w}</span>
        ))}
        <style>{`@keyframes ariaKb { from { transform: translateY(0) } to { transform: translateY(-5px) } }`}</style>
      </div>
    )
  }

  if (block.type === 'aurora_summary') {
    const fmtA = (v: string | number) => {
      if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
      if (block.format === 'percent') return Number(v).toFixed(1) + '%'
      return String(v)
    }
    return (
      <div style={{ background: '#1a0a2e', borderRadius: 10, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 50%, rgba(127,184,151,0.4), transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(83,74,183,0.3), transparent 60%)', borderRadius: 10 }} />
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(180,240,210,0.65)', margin: '0 0 4px', position: 'relative' }}>{block.title}</p>
        <p style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, color: '#e0f8ee', margin: 0, position: 'relative' }}>{fmtA(block.value)}</p>
        {block.sub && <p style={{ fontSize: 11, color: 'rgba(180,240,210,0.55)', margin: '4px 0 0', position: 'relative' }}>{block.sub}</p>}
      </div>
    )
  }

  // COUNCIL-FIX-1: ai_reasoning — was silently dropped by the fallback (no content/title fields)
  if (block.type === 'ai_reasoning') {
    const confC = block.confidence === 'high' ? G : block.confidence === 'low' ? R : A
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(167,139,250,0.25)', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '7px 12px', background: 'rgba(167,139,250,0.08)', borderBottom: '0.5px solid rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: V, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Aria&apos;s reasoning</span>
          {block.confidence && (
            <span style={{ fontSize: 9, fontWeight: 600, color: confC, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{block.confidence} confidence</span>
          )}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: '0 0 8px' }}>{block.question}</p>
          {block.reasoning.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} style={{ fontSize: 12.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.62)', margin: '0 0 5px', paddingLeft: 12, borderLeft: '2px solid rgba(167,139,250,0.25)' }}>{line}</p>
          ))}
        </div>
      </div>
    )
  }

  // COUNCIL-FIX-1: clay_chart — was rendering as bare title text via the fallback
  if (block.type === 'clay_chart') {
    const data = block.data ?? []
    const maxV = Math.max(...data.map(d => d.value), 1)
    const barC = block.color ?? G
    return (
      <div style={{ borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.09)', marginBottom: 12, overflow: 'hidden' }}>
        {block.title && (
          <div style={{ padding: '7px 12px', background: 'rgba(127,184,151,0.07)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: barC, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {block.title}
          </div>
        )}
        <div style={{ padding: 14 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < data.length - 1 ? 8 : 0 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{d.name}</span>
              <div style={{ flex: 1, height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, (d.value / maxV) * 100)}%`, height: '100%', borderRadius: 7, background: d.value === maxV ? barC : barC + '55' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: d.value === maxV ? barC : 'rgba(255,255,255,0.4)', width: 52, textAlign: 'right', flexShrink: 0 }}>
                {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Graceful fallback: any block type without a dedicated renderer renders as text
  const fallbackText = (block as { content?: string; title?: string; description?: string }).content
    ?? (block as { content?: string; title?: string; description?: string }).title
    ?? (block as { content?: string; title?: string; description?: string }).description
    ?? ''
  if (!fallbackText) return null
  return (
    <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.78)', marginBottom: 10 }}>
      {fallbackText.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
    </div>
  )
  } catch (e) {
    console.error('[BlockRenderer] render error:', block?.type, e)
    const fb = (block as { content?: string; title?: string }).content ?? (block as { content?: string; title?: string }).title ?? ''
    if (!fb) return null
    return (
      <div style={{ fontSize: 13, lineHeight: 1.72, color: 'rgba(255,255,255,0.78)', marginBottom: 10 }}>
        {fb.split('\n').map((line, i) => <p key={i} style={{ margin: '0 0 6px' }}>{line}</p>)}
      </div>
    )
  }
}

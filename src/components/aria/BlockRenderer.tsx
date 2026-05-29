'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, AreaChart, Area, PieChart, Pie, Legend } from 'recharts'
import { useEffect, useRef, useState } from 'react'
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

function fmtCell(val: unknown, fmt?: string): string {
  if (val == null) return '—'
  if (fmt === 'currency') return `$${Number(val).toFixed(2)}`
  if (fmt === 'percent') return `${Number(val).toFixed(1)}%`
  if (fmt === 'number') return Number(val).toLocaleString()
  if (fmt === 'date') return new Date(String(val)).toLocaleDateString('en-AU')
  return String(val)
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

type DataTableBlock = Extract<AskBlock, { type: 'data_table' }>
type SpreadsheetBlock = Extract<AskBlock, { type: 'spreadsheet' }>

function DataTableBlock({ block }: { block: DataTableBlock }) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const sorted = sortKey
    ? [...block.rows].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey]
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''))
        return sortAsc ? cmp : -cmp
      })
    : block.rows
  const csvRows = block.rows.map(row => block.columns.map(c => String(row[c.key] ?? '')))
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--divider)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.title}</span>
        {block.downloadable && <button onClick={() => downloadCSV(`${block.title.toLowerCase().replace(/\s+/g, '-')}.csv`, block.columns.map(c => c.label), csvRows)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {block.columns.map(c => (
                <th key={c.key} onClick={block.sortable ? () => { setSortKey(c.key); setSortAsc(sortKey === c.key ? !sortAsc : true) } : undefined} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--divider)', cursor: block.sortable ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                  {c.label}{block.sortable && sortKey === c.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {block.columns.map(c => <td key={c.key} style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{fmtCell(row[c.key], c.format)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SpreadsheetBlock({ block }: { block: SpreadsheetBlock }) {
  const triggered = useRef(false)
  useEffect(() => {
    if (block.auto_download && !triggered.current) {
      triggered.current = true
      downloadCSV(block.filename, block.headers, block.rows)
    }
  }, [block.auto_download, block.filename, block.headers, block.rows])
  const preview = block.rows.slice(0, 5)
  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--divider)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.filename}</span>
        <button onClick={() => downloadCSV(block.filename, block.headers, block.rows)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--divider)', background: '#d9f54e', color: '#0a0a0a', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>Download spreadsheet</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>{block.headers.map(h => <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--divider)' }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {row.map((cell, j) => <td key={j} style={{ padding: '6px 12px', color: 'var(--text-secondary)' }}>{cell}</td>)}
              </tr>
            ))}
            {block.rows.length > 5 && <tr><td colSpan={block.headers.length} style={{ padding: '6px 12px', color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 11 }}>+{block.rows.length - 5} more rows in download</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
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

    case 'live_render': {
      const sanitized = block.html
        .replace(/<script[^>]+src=["'][^"']*["'][^>]*>/gi, '')
        .replace(/fetch\s*\(\s*["']https?:\/\/(?!ariaos\.site)/gi, 'void(')
      const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,-apple-system,sans-serif;background:transparent}</style></head><body>${sanitized}</body></html>`
      return (
        <div style={{ margin: '12px 0' }}>
          {block.title && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {block.title}
            </div>
          )}
          <iframe
            srcDoc={srcDoc}
            style={{ width: '100%', height: block.height ?? 400, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, background: '#fafafa' }}
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
              style={{ marginTop: 8, padding: '5px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: '#d9f54e', fontWeight: 700, fontSize: 11, cursor: 'pointer', color: '#0a0a0a' }}
            >
              Download
            </button>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {['Change the colour', 'Download this', 'Show me a different time period', 'Explain what this means', 'Show me as a table instead'].map((chip) => (
              <button
                key={chip}
                onClick={() => onAction?.(chip)}
                style={{ padding: '4px 11px', borderRadius: 99, fontSize: 11, fontWeight: 500, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontFamily: 'inherit' }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )
    }

    case 'styled_chart': {
      const color = block.color ?? 'var(--violet)'
      const data = block.data
      return (
        <figure style={{ margin: 0, background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }}>
          {block.title && <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>{block.title}</figcaption>}
          <ResponsiveContainer width="100%" height={200}>
            {block.chart_type === 'line' ? (
              <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {block.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />}
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={44} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }} />
                {block.show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            ) : block.chart_type === 'area' ? (
              <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {block.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />}
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={44} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }} />
                {block.show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.15} />
              </AreaChart>
            ) : block.chart_type === 'pie' ? (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill={color} label={(e) => e.name}>
                  {data.map((_, i) => <Cell key={i} fill={i === 0 ? color : `${color}88`} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                {block.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />}
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={44} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }} />
                {block.show_legend && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </figure>
      )
    }

    case 'data_table':
      return <DataTableBlock block={block} />

    case 'spreadsheet':
      return <SpreadsheetBlock block={block} />

    case 'kpi_card': {
      const acc = block.color ?? 'var(--violet)'
      const trendUp = block.trend != null && block.trend > 0
      const trendDown = block.trend != null && block.trend < 0
      const trendColor = trendUp ? '#00B140' : trendDown ? '#F87171' : 'var(--text-tertiary)'
      const kpiFmt = block.format
      function fmtKpi(v: string | number): string {
        if (typeof v === 'string') return v
        if (kpiFmt === 'currency') return `$${v.toFixed(2)}`
        if (kpiFmt === 'percent') return `${v.toFixed(1)}%`
        return v.toLocaleString()
      }
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '20px 22px', border: `1px solid var(--divider)`, borderLeft: `3px solid ${acc}` }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{block.label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: acc, lineHeight: 1 }}>{fmtKpi(block.value)}</div>
          {block.trend != null && (
            <div style={{ fontSize: 12, color: trendColor, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{trendUp ? '▲' : trendDown ? '▼' : '—'}</span>
              <span>{Math.abs(block.trend).toFixed(1)}%{block.trend_label ? ` ${block.trend_label}` : ''}</span>
            </div>
          )}
        </div>
      )
    }

    case 'comparison_table': {
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
          {block.title && <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--divider)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.title}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                <th style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Metric</th>
                <th style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{block.left_label}</th>
                <th style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{block.right_label}</th>
                {block.show_delta && <th style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Change</th>}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => {
                const delta = row.right !== 0 ? ((row.left - row.right) / Math.abs(row.right)) * 100 : 0
                const fmt = (v: number) => row.format === 'currency' ? `$${v.toFixed(2)}` : row.format === 'percent' ? `${v.toFixed(1)}%` : v.toLocaleString()
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                    <td style={{ padding: '7px 12px', color: 'var(--text-secondary)' }}>{row.metric}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(row.left)}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(row.right)}</td>
                    {block.show_delta && <td style={{ padding: '7px 12px', textAlign: 'right', color: delta > 0 ? '#00B140' : delta < 0 ? '#F87171' : 'var(--text-tertiary)', fontWeight: 600 }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
    }

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

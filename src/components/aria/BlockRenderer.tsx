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

const navBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 500,
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
      aria-label={'Ask Aria: ' + title}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left',
        padding: '12px 14px', borderRadius: 10, border: '1px solid var(--divider)',
        borderLeft: '3px solid ' + accent, background: 'var(--bg-surface)', cursor: 'pointer',
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
  if (fmt === 'currency') return '$' + Number(val).toFixed(2)
  if (fmt === 'percent') return Number(val).toFixed(1) + '%'
  if (fmt === 'number') return Number(val).toLocaleString()
  if (fmt === 'date') return new Date(String(val)).toLocaleDateString('en-AU')
  return String(val)
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(','))].join('\n')
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

  if (block.rows.length === 0) {
    return (
      <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--divider)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.title}</span>
        </div>
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            No data recorded for this period yet — once you start ringing up sales, your breakdown will appear here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--divider)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.title}</span>
        {block.downloadable && <button onClick={() => downloadCSV(block.title.toLowerCase().replace(/\s+/g, '-') + '.csv', block.columns.map(c => c.label), csvRows)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>}
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
  const [expanded, setExpanded] = useState(false)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  useEffect(() => {
    if (block.auto_download && !triggered.current) {
      triggered.current = true
      downloadCSV(block.filename, block.headers, block.rows)
    }
  }, [block.auto_download, block.filename, block.headers, block.rows])

  const sorted = sortCol !== null
    ? [...block.rows].sort((a, b) => {
        const va = a[sortCol] ?? '', vb = b[sortCol] ?? ''
        const numA = parseFloat(String(va).replace(/[$,%]/g, ''))
        const numB = parseFloat(String(vb).replace(/[$,%]/g, ''))
        const cmp = !isNaN(numA) && !isNaN(numB) ? numA - numB : String(va).localeCompare(String(vb))
        return sortAsc ? cmp : -cmp
      })
    : block.rows

  const preview = expanded ? sorted : sorted.slice(0, 6)

  return (
    <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--divider)', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{block.filename}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{block.rows.length} rows × {block.headers.length} cols</span>
        </div>
        <button
          onClick={() => downloadCSV(block.filename, block.headers, block.rows)}
          style={{ fontSize: 11, padding: '5px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: '#7FB897', color: '#04120a', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}
        >
          ⬇ Download CSV
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th
                  key={h}
                  onClick={() => { setSortCol(i); setSortAsc(sortCol === i ? !sortAsc : true) }}
                  style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--divider)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                >
                  {h}{sortCol === i ? (sortAsc ? ' ↑' : ' ↓') : ' ↕'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '7px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.rows.length > 6 && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ width: '100%', padding: '8px', fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', borderTop: '1px solid var(--divider)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? 'Show less ↑' : 'Show all ' + block.rows.length + ' rows ↓'}
        </button>
      )}
    </div>
  )
}

function LiveRenderBlock({ block, onAction }: { block: Extract<AskBlock, { type: 'live_render' }>; onAction?: (prompt: string) => void }) {
  const [editMode, setEditMode] = useState(false)
  const [editHtml, setEditHtml] = useState(block.html)
  const [displayHtml, setDisplayHtml] = useState(block.html)
  const [shareStatus, setShareStatus] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'aria_share') {
        onAction?.('Share this output')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onAction])

  const sanitized = displayHtml
    .replace(/<script[^>]+src=["'][^"']*["'][^>]*>/gi, '')
    .replace(/fetch\s*\(\s*["']https?:\/\/(?!ariaos\.site)/gi, 'void(')
  const srcDoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,-apple-system,sans-serif;background:transparent}</style></head><body>' + sanitized + '</body></html>'

  async function handleShare() {
    if (!block.outputId) {
      onAction?.('Share this output')
      return
    }
    try {
      setShareStatus('Generating link...')
      const res = await fetch('/api/aria/task-outputs/' + block.outputId + '/share', { method: 'POST' })
      const { share_url } = await res.json() as { share_url: string }
      await navigator.clipboard.writeText(share_url)
      setShareStatus('Link copied!')
      setTimeout(() => setShareStatus(''), 3000)
    } catch {
      setShareStatus('Failed to generate link')
      setTimeout(() => setShareStatus(''), 3000)
    }
  }

  return (
    <div style={{ margin: '12px 0' }}>
      {block.title && (
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {block.title}
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        style={{ width: '100%', height: block.height ?? 400, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, background: '#fafafa' }}
        sandbox="allow-scripts allow-same-origin"
        title={block.title ?? 'Aria output'}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {block.downloadable && (
          <button
            onClick={() => {
              const blob = new Blob([displayHtml], { type: 'text/html' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = block.download_filename ?? 'aria-output.html'; a.click()
              URL.revokeObjectURL(url)
            }}
            style={{ ...navBtn, background: '#d9f54e', color: '#0a0a0a', fontWeight: 700, border: 'none' }}
          >
            Download
          </button>
        )}
        <button onClick={handleShare} style={navBtn}>
          🔗 Share link
        </button>
        <button onClick={() => setEditMode(e => !e)} style={navBtn}>
          {editMode ? 'Done editing' : '✏ Edit'}
        </button>
        {shareStatus && <span style={{ fontSize: 11, color: '#7FB897' }}>{shareStatus}</span>}
      </div>
      {editMode && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={editHtml}
            onChange={e => setEditHtml(e.target.value)}
            style={{ width: '100%', height: 200, background: 'rgba(0,0,0,0.3)', color: '#f0f0f4', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 10, fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
          />
          <button
            onClick={() => { setDisplayHtml(editHtml); setEditMode(false) }}
            style={{ marginTop: 6, padding: '5px 14px', borderRadius: 8, background: '#7FB897', color: '#04120a', fontWeight: 700, fontSize: 11, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
          >
            Apply changes
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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

function SlidesBlock({ block }: { block: Extract<AskBlock, { type: 'slides' }> }) {
  const [current, setCurrent] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editBodies, setEditBodies] = useState<string[]>(block.slides.map(s => s.body))

  const slide = block.slides[current]
  const accent = slide.accent_color ?? '#7FB897'
  const bg = block.theme === 'light' ? '#fff' : '#0d1117'
  const text = block.theme === 'light' ? '#111' : '#f0f0f4'
  const sub = block.theme === 'light' ? '#555' : '#9da3aa'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCurrent(c => Math.min(c + 1, block.slides.length - 1))
      if (e.key === 'ArrowLeft') setCurrent(c => Math.max(c - 1, 0))
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [block.slides.length])

  function downloadSlides() {
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + block.title + '</title>'
      + '<style>*{box-sizing:border-box;margin:0;padding:0;font-family:Inter,sans-serif}'
      + '.slide{width:960px;height:540px;background:' + bg + ';color:' + text + ';display:flex;flex-direction:column;justify-content:center;padding:64px;page-break-after:always}'
      + '.heading{font-size:36px;font-weight:800;margin-bottom:12px}'
      + '.body{font-size:18px;color:' + sub + ';line-height:1.7}'
      + '@media print{.slide{page-break-after:always}}'
      + '</style></head><body>'
      + block.slides.map((s, i) => '<div class="slide"><div class="heading">' + s.heading + '</div><div class="body">' + editBodies[i].replace(/\n/g, '<br>') + '</div></div>').join('')
      + '</body></html>'
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = block.title.toLowerCase().replace(/\s+/g, '-') + '-slides.html'
    a.click()
  }

  const SlideContent = ({ fscreen }: { fscreen: boolean }) => (
    <div style={{ background: bg, borderRadius: fscreen ? 0 : 12, aspectRatio: '16/9', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8%', position: 'relative', border: fscreen ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: accent, borderRadius: '12px 12px 0 0' }} />
      <div style={{ position: 'absolute', top: 16, right: 20, fontSize: 11, color: sub }}>{current + 1} / {block.slides.length}</div>
      {slide.layout === 'title' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(24px,4vw,42px)', fontWeight: 800, color: text, lineHeight: 1.2, marginBottom: 16 }}>{slide.heading}</div>
          {slide.subheading && <div style={{ fontSize: 'clamp(14px,2vw,20px)', color: sub }}>{slide.subheading}</div>}
        </div>
      ) : slide.layout === 'metric' && slide.metrics ? (
        <>
          <div style={{ fontSize: 'clamp(16px,2.5vw,24px)', fontWeight: 700, color: text, marginBottom: 24 }}>{slide.heading}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + Math.min(slide.metrics.length, 3) + ', 1fr)', gap: 16 }}>
            {slide.metrics.map((m, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '20px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: 'clamp(20px,3vw,32px)', fontWeight: 800, color: m.color ?? accent }}>{m.value}</div>
                <div style={{ fontSize: 11, color: sub, marginTop: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 'clamp(16px,2.5vw,26px)', fontWeight: 700, color: text, marginBottom: 16, lineHeight: 1.3 }}>{slide.heading}</div>
          {slide.subheading && <div style={{ fontSize: 'clamp(12px,1.5vw,16px)', color: accent, marginBottom: 12, fontWeight: 500 }}>{slide.subheading}</div>}
          <div style={{ fontSize: 'clamp(12px,1.8vw,16px)', color: sub, lineHeight: 1.8 }}>
            {editIdx === current ? (
              <textarea
                value={editBodies[current]}
                onChange={e => setEditBodies(prev => { const n = [...prev]; n[current] = e.target.value; return n })}
                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', color: text, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '6px 8px', fontSize: 'inherit', fontFamily: 'inherit', resize: 'none', minHeight: 80 }}
              />
            ) : (
              editBodies[current].split('\n').map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: accent, flexShrink: 0 }}>•</span>
                  <span>{line}</span>
                </div>
              ))
            )}
          </div>
          <button
            onClick={e => { e.stopPropagation(); setEditIdx(editIdx === current ? null : current) }}
            style={{ position: 'absolute', bottom: 14, right: 60, fontSize: 9, color: sub, background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.6 }}
          >
            {editIdx === current ? 'Done' : '✏ Edit'}
          </button>
        </>
      )}
      <div style={{ position: 'absolute', bottom: 14, left: 20, fontSize: 9, color: sub, opacity: .5 }}>Aria OS for {block.title}</div>
    </div>
  )

  return (
    <>
      {fullscreen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setFullscreen(false)}>
          <div style={{ width: '100%', maxWidth: 960 }} onClick={e => e.stopPropagation()}>
            <SlideContent fscreen={true} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
              <button onClick={() => setCurrent(c => Math.max(c - 1, 0))} disabled={current === 0} style={navBtn}>← Prev</button>
              <button onClick={() => setCurrent(c => Math.min(c + 1, block.slides.length - 1))} disabled={current === block.slides.length - 1} style={navBtn}>Next →</button>
              <button onClick={() => setFullscreen(false)} style={{ ...navBtn, background: 'rgba(255,255,255,0.1)' }}>✕ Close</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ margin: '8px 0' }}>
        {block.title && <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{block.title} · {block.slides.length} slides</div>}
        <SlideContent fscreen={false} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setCurrent(c => Math.max(c - 1, 0))} disabled={current === 0} style={navBtn}>← Prev</button>
          <button onClick={() => setCurrent(c => Math.min(c + 1, block.slides.length - 1))} disabled={current === block.slides.length - 1} style={navBtn}>Next →</button>
          <button onClick={() => setFullscreen(true)} style={navBtn}>⛶ Fullscreen</button>
          {block.downloadable !== false && <button onClick={downloadSlides} style={{ ...navBtn, background: '#7FB897', color: '#04120a', fontWeight: 700 }}>⬇ Download</button>}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 8, justifyContent: 'center' }}>
          {block.slides.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)} style={{ width: i === current ? 20 : 7, height: 7, borderRadius: 99, background: i === current ? '#7FB897' : 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', padding: 0, transition: 'all .2s' }} />
          ))}
        </div>
      </div>
    </>
  )
}

function OneBlock({ block, onAction, theme = 'dark' }: { block: AskBlock; onAction?: (prompt: string) => void; theme?: 'light' | 'dark' }) {
  switch (block.type) {
    case 'lead':
      return <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>{block.content}</p>

    case 'text':
      return <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{block.content}</p>

    case 'chart': {
      const data = block.labels.map((label, i) => ({ label, value: block.values[i] ?? 0 }))
      const unit = block.unit ?? ''
      return (
        <figure style={{ margin: 0, background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }} role="img" aria-label={block.title ? 'Bar chart: ' + block.title : 'Bar chart'}>
          {block.title && <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>{block.title}</figcaption>}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={44} />
              <Tooltip
                formatter={(v) => [(unit === '$' ? '$' : '') + Number(v ?? 0).toLocaleString() + (unit && unit !== '$' ? ' ' + unit : ''), '']}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
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
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderLeft: '3px solid ' + (ROLE_COLOR[it.role] ?? 'var(--violet)') }}>
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

    case 'live_render':
      return <LiveRenderBlock block={block} onAction={onAction} />

    case 'styled_chart': {
      const color = block.color ?? 'var(--violet)'
      const data = block.data
      if (!data || data.length === 0) {
        return (
          <figure style={{ margin: 0, background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--divider)' }}>
            {block.title && <figcaption style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>{block.title}</figcaption>}
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No chart data available for this period.</span>
            </div>
          </figure>
        )
      }
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
                  {data.map((_, i) => <Cell key={i} fill={i === 0 ? color : color + '88'} />)}
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
        if (kpiFmt === 'currency') return '$' + v.toFixed(2)
        if (kpiFmt === 'percent') return v.toFixed(1) + '%'
        return v.toLocaleString()
      }
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 14, padding: '20px 22px', border: '1px solid var(--divider)', borderLeft: '3px solid ' + acc }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{block.label}</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: acc, lineHeight: 1 }}>{fmtKpi(block.value)}</div>
          {block.trend != null && (
            <div style={{ fontSize: 12, color: trendColor, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{trendUp ? '▲' : trendDown ? '▼' : '—'}</span>
              <span>{Math.abs(block.trend).toFixed(1) + '%' + (block.trend_label ? ' ' + block.trend_label : '')}</span>
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
                const fmt = (v: number) => row.format === 'currency' ? '$' + v.toFixed(2) : row.format === 'percent' ? v.toFixed(1) + '%' : v.toLocaleString()
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

    case 'menu_list': {
      const dividerColor = theme === 'light' ? 'rgba(0,0,0,0.08)' : 'var(--divider)'
      const nameColor = theme === 'light' ? '#111' : 'var(--text-primary)'
      const priceColor = theme === 'light' ? '#2D5240' : '#7FB897'
      const descColor = theme === 'light' ? '#555' : 'var(--text-tertiary)'
      return (
        <div style={{ background: theme === 'light' ? '#fff' : 'var(--bg-elevated)', borderRadius: 12, border: '1px solid ' + dividerColor, overflow: 'hidden' }}>
          {block.title && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid ' + dividerColor, fontSize: 12, fontWeight: 700, color: priceColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {block.title}
            </div>
          )}
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: i < block.items.length - 1 ? '1px solid ' + dividerColor : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: nameColor }}>{item.name}</div>
                {item.description && <div style={{ fontSize: 12, color: descColor, marginTop: 2, lineHeight: 1.4 }}>{item.description}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: priceColor, flexShrink: 0 }}>{item.price}</div>
            </div>
          ))}
        </div>
      )
    }

    case 'recommendation_card': {
      const cardBg = theme === 'light' ? '#f9fafb' : 'var(--bg-elevated)'
      const cardBorder = theme === 'light' ? 'rgba(45,82,64,0.2)' : 'rgba(127,184,151,0.3)'
      const nameColor = theme === 'light' ? '#111' : 'var(--text-primary)'
      const priceColor = theme === 'light' ? '#2D5240' : '#7FB897'
      const reasonColor = theme === 'light' ? '#555' : 'var(--text-secondary)'
      return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: cardBg, borderRadius: 12, border: '1px solid ' + cardBorder, padding: '14px 16px' }}>
          {block.image_url && (
            <img src={block.image_url} alt={block.name} width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 15, fontWeight: 700, color: nameColor, lineHeight: 1.3, marginBottom: 2 }}>{block.name}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: priceColor, marginBottom: 6 }}>{block.price}</div>
            <div style={{ fontSize: 12, color: reasonColor, lineHeight: 1.5 }}>{block.reason}</div>
          </div>
        </div>
      )
    }

    case 'action_card': {
      const cardBg = theme === 'light' ? '#fff' : 'var(--bg-elevated)'
      const cardBorder = theme === 'light' ? 'rgba(0,0,0,0.1)' : 'var(--divider)'
      const titleColor = theme === 'light' ? '#111' : 'var(--text-primary)'
      const bodyColor = theme === 'light' ? '#444' : 'var(--text-secondary)'
      return (
        <div style={{ background: cardBg, borderRadius: 12, border: '1px solid ' + cardBorder, padding: '16px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: titleColor, marginBottom: 6 }}>{block.title}</div>
          <div style={{ fontSize: 13, color: bodyColor, lineHeight: 1.6, marginBottom: 12 }}>{block.body}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {block.buttons.map((btn, i) => (
              <a key={i} href={btn.href} style={{ display: 'inline-block', padding: '7px 16px', borderRadius: 8, background: '#2D5240', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit' }}>
                {btn.label}
              </a>
            ))}
          </div>
        </div>
      )
    }

    case 'slides':
      return <SlidesBlock block={block} />

    case 'infographic': {
      return (
        <div style={{ background: 'linear-gradient(135deg, #0d1117 0%, #111820 100%)', borderRadius: 14, border: '0.5px solid rgba(127,184,151,0.25)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 22px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f0f0f4', lineHeight: 1.2 }}>{block.title}</div>
            {block.subtitle && <div style={{ fontSize: 13, color: '#8fd3ab', marginTop: 4 }}>{block.subtitle}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: block.sections.length > 2 ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr 1fr', gap: 0 }}>
            {block.sections.map((s, i) => (
              <div key={i} style={{ padding: '18px 22px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', borderRight: (i + 1) % 2 === 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: s.color ?? '#7FB897', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.heading}</span>
                </div>
                {s.stat && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color ?? '#7FB897', lineHeight: 1 }}>{s.stat}</div>
                    {s.stat_label && <div style={{ fontSize: 11, color: '#7a8290', marginTop: 2 }}>{s.stat_label}</div>}
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#9da3aa', lineHeight: 1.6 }}>{s.body}</div>
              </div>
            ))}
          </div>
          {block.footer && (
            <div style={{ padding: '10px 22px', borderTop: '0.5px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#4a5568', textAlign: 'right' }}>
              {block.footer}
            </div>
          )}
        </div>
      )
    }

    case 'task_plan': {
      const STATUS_ICON = { pending: '○', running: '⟳', done: '✓', failed: '✗' }
      const STATUS_COLOR = { pending: '#4a5568', running: '#7FB897', done: '#7FB897', failed: '#F87171' }
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid rgba(127,184,151,0.2)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 14 }}>🔄</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{block.title}</span>
            {block.estimated_seconds && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>~{block.estimated_seconds}s</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {block.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 13, color: STATUS_COLOR[step.status], flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
                  {STATUS_ICON[step.status]}
                </span>
                <div>
                  <span style={{ fontSize: 13, color: step.status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)', fontWeight: step.status === 'running' ? 600 : 400 }}>{step.label}</span>
                  {step.detail && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{step.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    case 'pushback': {
      const sevColor = block.severity === 'high' ? '#F87171' : block.severity === 'medium' ? '#F59E0B' : 'var(--violet)'
      return (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--divider)', borderLeft: '3px solid ' + sevColor, padding: '14px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: sevColor, marginBottom: 6 }}>{block.decision}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>{block.tension}</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{block.question}</div>
        </div>
      )
    }

    case 'animated_kpi': {
      const acc = block.variant === 'b' ? '#2D5240' : block.variant === 'c' ? '#534AB7' : '#7FB897'
      const fmtVal = (v: string | number) => {
        if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
        if (block.format === 'percent') return Number(v).toFixed(1) + '%'
        return String(v)
      }
      return (
        <div style={{ background: 'var(--color-background-primary, #fff)', border: `1.5px solid ${acc}`, borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: acc }} />
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary, #888)', margin: '0 0 6px' }}>{block.label}</p>
          <p style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, color: 'var(--text-primary, #111)', margin: 0 }}>{fmtVal(block.value)}</p>
          {block.delta !== undefined && (
            <p style={{ fontSize: 12, fontWeight: 500, color: block.delta >= 0 ? '#3B6D11' : '#A32D2D', margin: '6px 0 0' }}>
              {block.delta >= 0 ? '↑' : '↓'} {Math.abs(block.delta)}% {block.delta_label ?? ''}
            </p>
          )}
        </div>
      )
    }

    case 'bold_metric': {
      const fmtBold = (v: string | number) => {
        if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
        if (block.format === 'percent') return Number(v).toFixed(1) + '%'
        return String(v)
      }
      return (
        <div style={{ background: block.dark ? '#1a1a1a' : '#F5F0E8', borderRadius: 10, padding: '20px 20px' }}>
          <p style={{ fontSize: 56, fontWeight: 600, lineHeight: 1, color: block.dark ? '#7FB897' : '#1a1a1a', margin: 0 }}>{fmtBold(block.value)}</p>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: block.dark ? '#5a8a6a' : '#7a7060', margin: '6px 0 0' }}>{block.label}</p>
        </div>
      )
    }

    case 'bento_grid': {
      return (
        <div style={{ background: 'var(--color-background-secondary, #f5f5f5)', borderRadius: 14, padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {block.items.map((item, i) => (
            <div key={i} style={{
              background: i === 0 ? '#2D5240' : i % 3 === 1 ? '#7FB897' : 'var(--color-background-primary, #fff)',
              border: i % 3 === 2 ? '0.5px solid var(--color-border-tertiary, #ddd)' : 'none',
              borderRadius: 10, padding: '10px 12px',
              gridColumn: item.span === 'full' ? '1 / 3' : 'auto',
            }}>
              <p style={{ fontSize: 11, color: i === 0 ? 'rgba(232,245,238,0.7)' : i % 3 === 1 ? '#1a3a28' : 'var(--text-secondary, #666)', margin: '0 0 3px' }}>{item.label}</p>
              <p style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, color: i === 0 ? '#e8f5ee' : i % 3 === 1 ? '#1a3a28' : 'var(--text-primary, #111)', margin: 0 }}>{item.value}</p>
              {item.sub && <p style={{ fontSize: 10, color: i === 0 ? 'rgba(232,245,238,0.6)' : 'var(--text-tertiary, #999)', margin: '3px 0 0' }}>{item.sub}</p>}
            </div>
          ))}
        </div>
      )
    }

    case 'progress_bars': {
      return (
        <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #ddd)', borderRadius: 12, padding: '14px 16px' }}>
          {block.title && <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary, #888)', margin: '0 0 12px' }}>{block.title}</p>}
          {block.items.map((item, i) => {
            const pct = Math.min(100, Math.round((item.value / (item.max ?? 100)) * 100))
            const col = item.color ?? (pct >= 80 ? '#3B6D11' : pct >= 50 ? '#7FB897' : '#BA7517')
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < block.items.length - 1 ? 10 : 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary, #666)', minWidth: 80 }}>{item.label}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--color-background-secondary, #f0f0f0)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 4, transition: 'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary, #111)', minWidth: 32 }}>{pct}%</span>
              </div>
            )
          })}
        </div>
      )
    }

    case 'activity_stream': {
      return (
        <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #ddd)', borderRadius: 12, padding: '14px 16px' }}>
          {block.title && <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary, #888)', margin: '0 0 12px' }}>{block.title}</p>}
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < block.items.length - 1 ? 8 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot_color ?? '#7FB897', marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, color: 'var(--text-primary, #111)', margin: 0 }}>{item.text}</p>
                {item.time && <p style={{ fontSize: 11, color: 'var(--text-tertiary, #999)', margin: '2px 0 0' }}>{item.time}</p>}
              </div>
            </div>
          ))}
        </div>
      )
    }

    case 'alert_card': {
      const sevColor = block.severity === 'critical' ? '#A32D2D' : block.severity === 'warning' ? '#854F0B' : '#185FA5'
      const sevBg = block.severity === 'critical' ? '#0f1117' : block.severity === 'warning' ? '#1a1205' : '#0a1020'
      return (
        <div style={{ background: sevBg, border: `1px solid ${sevColor}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor, marginTop: 5, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf2', margin: '0 0 4px' }}>{block.title}</p>
            <p style={{ fontSize: 12, color: '#a0a8c0', margin: 0 }}>{block.body}</p>
          </div>
        </div>
      )
    }

    case 'ai_reasoning': {
      const confColor = block.confidence === 'high' ? '#3B6D11' : block.confidence === 'low' ? '#854F0B' : '#185FA5'
      return (
        <div style={{ background: 'var(--color-background-primary, #fff)', border: '0.5px solid var(--color-border-tertiary, #ddd)', borderRadius: 12, padding: '14px 16px' }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary, #888)', margin: '0 0 8px' }}>Aria's reasoning</p>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #111)', margin: '0 0 8px' }}>{block.question}</p>
          <div style={{ background: 'var(--color-background-secondary, #f5f5f5)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #666)', margin: 0, lineHeight: 1.6 }}>{block.reasoning}</p>
          </div>
          {block.confidence && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: confColor }} />
              <span style={{ fontSize: 11, color: confColor, fontWeight: 500 }}>{block.confidence} confidence</span>
            </div>
          )}
        </div>
      )
    }

    case 'clay_chart': {
      const maxVal = Math.max(...block.data.map(d => d.value), 1)
      const col = block.color ?? '#7FB897'
      return (
        <div style={{ background: col, borderRadius: 20, padding: 14, boxShadow: `0 6px 16px ${col}40, inset 0 -3px 6px rgba(0,0,0,0.08), inset 0 3px 6px rgba(255,255,255,0.4)` }}>
          {block.title && <p style={{ fontSize: 11, fontWeight: 500, color: '#1a3a28', margin: '0 0 8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{block.title}</p>}
          <div style={{ background: 'rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 10px 6px' }}>
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={block.data} barCategoryGap="20%">
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {block.data.map((_, i) => (
                    <Cell key={i} fill={block.data[i].value === maxVal ? '#2D5240' : 'rgba(45,82,64,0.6)'} />
                  ))}
                </Bar>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#1a3a28' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: 'none', borderRadius: 8, fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )
    }

    case 'kinetic_text': {
      const cols = block.colors ?? ['#7FB897', '#ffffff', '#FAC775']
      return (
        <div style={{ background: '#1a1a1a', borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 8, minHeight: 64 }}>
          {block.words.map((w, i) => (
            <span key={i} style={{
              fontSize: 18, fontWeight: 500,
              color: cols[i % cols.length],
              display: 'inline-block',
              animation: `ariaKb 1s ease-in-out ${i * 0.15}s infinite alternate`,
            }}>{w}</span>
          ))}
          <style>{`@keyframes ariaKb { from { transform: translateY(0) } to { transform: translateY(-6px) } }`}</style>
        </div>
      )
    }

    case 'aurora_summary': {
      const fmtAurora = (v: string | number) => {
        if (block.format === 'currency') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0 })
        if (block.format === 'percent') return Number(v).toFixed(1) + '%'
        return String(v)
      }
      return (
        <div style={{ borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#1a0a2e', padding: '18px 20px', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 50%, rgba(127,184,151,0.45), transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(83,74,183,0.35), transparent 60%)', borderRadius: 10 }} />
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(180,240,210,0.7)', margin: '0 0 6px', position: 'relative' }}>{block.title}</p>
            <p style={{ fontSize: 38, fontWeight: 600, lineHeight: 1, color: '#e0f8ee', margin: 0, position: 'relative' }}>{fmtAurora(block.value)}</p>
            {block.sub && <p style={{ fontSize: 12, color: 'rgba(180,240,210,0.6)', margin: '6px 0 0', position: 'relative' }}>{block.sub}</p>}
          </div>
        </div>
      )
    }

    // RICH-3: interactive proposal card — title + claim + ONE action button → onAction(prompt).
    case 'proposal_card': {
      const accent = block.accent ?? 'var(--violet)'
      return (
        <div style={{ borderRadius: 10, border: '1px solid var(--divider)', borderLeft: '3px solid ' + accent, background: 'var(--bg-surface)', padding: '14px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{block.title}</p>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 12px' }}>{block.claim}</p>
          <button type="button" onClick={() => onAction?.(block.prompt)} aria-label={'Ask Aria: ' + (block.action_label ?? block.title)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {block.action_label ?? 'Explore this'}
          </button>
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

export function BlockRenderer({ blocks, onAction, theme = 'dark' }: { blocks: AskBlock[]; onAction?: (prompt: string) => void; theme?: 'light' | 'dark' }) {
  if (!blocks || blocks.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {blocks.map((block, i) => <OneBlock key={i} block={block} onAction={onAction} theme={theme} />)}
    </div>
  )
}

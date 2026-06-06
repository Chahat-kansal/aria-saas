'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { AriaArtifact } from '@/components/aria/AriaArtifact'
import { BlockRenderer } from '@/components/aria/BlockRenderer'
import type { AskBlock } from '@/lib/aria/ask-types'

const COLORS = ['#006AFF', '#60A5FA', '#00B140', '#F59E0B', '#F87171']
const MAX_INPUT = 1000

const TOOL_LABELS: Record<string, { running: string; done: string }> = {
  query_sales:     { running: '🔍 Looking at your sales data...', done: 'Checked sales data' },
  query_inventory: { running: '📦 Checking inventory...',          done: 'Checked inventory' },
  query_customers: { running: '👥 Finding your customers...',       done: 'Found customers' },
  query_pricing:   { running: '💰 Checking pricing data...',        done: 'Checked pricing' },
  query_staff:     { running: '👤 Checking staff performance...',   done: 'Checked staff data' },
}

const SUGGESTED = [
  'How much did we sell last Friday vs the Friday before?',
  'Who are my top 10 customers this month?',
  'What products are running low on stock?',
  'Show me staff performance this week',
  'Which products have the lowest margins?',
  'Compare this month\'s revenue to last month',
]

interface ConvMeta { id: string; title: string; last_message_at: string }
interface DocumentReadResult { description: string; name: string; previewUrl: string | null }
type DisplayMsg =
  | { type: 'user'; text: string }
  | { type: 'aria'; text: string; streaming: boolean; mode?: string; blocks?: AskBlock[]; downloads?: Array<{ filename: string; download_url: string; format: string; rows: number }> }
  | { type: 'tool'; toolName: string; status: 'running' | 'done'; count?: number }
  | { type: 'error'; text: string }

interface ParsedChart { type: string; title: string; data: { label: string; value: number }[]; compare_data?: { label: string; value: number }[] }
interface ParsedAction { label: string; href: string; style: string }

function parseChartHint(raw: string): ParsedChart | null {
  const lines = raw.trim().split('\n').map(l => l.trim())
  let type = 'bar', title = '', data: ParsedChart['data'] = [], compare_data: ParsedChart['compare_data']
  for (const line of lines) {
    if (line.startsWith('type=')) type = line.slice(5).split('|')[0].trim()
    else if (line.startsWith('title=')) title = line.slice(6).trim()
    else if (line.startsWith('data=')) { try { data = JSON.parse(line.slice(5)) } catch (e) { console.error('[silent-catch]', e) } }
    else if (line.startsWith('compare_data=')) { try { compare_data = JSON.parse(line.slice(13)) } catch (e) { console.error('[silent-catch]', e) } }
  }
  return data.length > 0 ? { type, title, data, compare_data } : null
}

function parseActionHint(raw: string): ParsedAction | null {
  const lines = raw.trim().split('\n').map(l => l.trim())
  let label = '', href = '', style = 'primary'
  for (const line of lines) {
    if (line.startsWith('label=')) label = line.slice(6).trim()
    else if (line.startsWith('href=')) href = line.slice(5).trim()
    else if (line.startsWith('style=')) style = line.slice(6).trim()
  }
  return label && href ? { label, href, style } : null
}

function InlineChart({ spec }: { spec: ParsedChart }) {
  const merged = spec.data.map((d, i) => ({ label: d.label, value: d.value, prev: spec.compare_data?.[i]?.value }))
  const hasPrev = merged.some(d => d.prev !== undefined)
  const yFmt = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`

  if (spec.type === 'pie') {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{spec.title}</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart><Pie data={merged} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
            {merged.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie><Tooltip formatter={(v) => `$${Number(v ?? 0).toFixed(2)}`} /></PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const commonAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} />
      <YAxis tickFormatter={yFmt} tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} width={48} />
      <Tooltip formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, '']} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }} />
    </>
  )

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{spec.title}</div>
      <ResponsiveContainer width="100%" height={220}>
        {spec.type === 'line' || spec.type === 'area' ? (
          spec.type === 'area' ? (
            <AreaChart data={merged}>{commonAxes}
              <Area type="monotone" dataKey="value" fill={COLORS[0] + '33'} stroke={COLORS[0]} name="This period" strokeWidth={2} />
              {hasPrev && <Area type="monotone" dataKey="prev" fill={COLORS[1] + '22'} stroke={COLORS[1]} name="Previous" strokeWidth={2} strokeDasharray="4 4" />}
            </AreaChart>
          ) : (
            <LineChart data={merged}>{commonAxes}
              <Line type="monotone" dataKey="value" stroke={COLORS[0]} name="This period" strokeWidth={2} dot={false} />
              {hasPrev && <Line type="monotone" dataKey="prev" stroke={COLORS[1]} name="Previous" strokeWidth={2} strokeDasharray="4 4" dot={false} />}
            </LineChart>
          )
        ) : (
          <BarChart data={merged}>{commonAxes}
            <Bar dataKey="value" fill={COLORS[0]} name="This period" radius={[3, 3, 0, 0]} />
            {hasPrev && <Bar dataKey="prev" fill={COLORS[1]} name="Previous" radius={[3, 3, 0, 0]} />}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function renderText(text: string) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part.split('`').map((s, j) => j % 2 === 1 ? <code key={j} style={{ background: 'var(--bg-elevated)', borderRadius: 3, padding: '1px 5px', fontSize: '0.9em', fontFamily: 'monospace' }}>{s}</code> : s))
}

type ArtifactSegment = { kind: 'artifact'; type: string; title?: string; data: Record<string, unknown> }
type TextSegment    = { kind: 'text'; content: string }
type AriaSegment = TextSegment | ArtifactSegment

function tolerantJSONParse(raw: string): Record<string, unknown> | null {
  const cleanups: Array<(s: string) => string> = [
    s => s,
    s => s.replace(/,(\s*[}\]])/g, '$1'),
    s => s.replace(/,(\s*[}\]])/g, '$1').replace(/'/g, '"'),
    s => s.replace(/,(\s*[}\]])/g, '$1').replace(/\r?\n/g, '\\n'),
  ]
  for (const fix of cleanups) {
    try { return JSON.parse(fix(raw).trim()) } catch { /* try next */ }
  }
  return null
}

function parseAriaResponse(text: string): AriaSegment[] {
  const segments: AriaSegment[] = []
  const regex = /<aria_artifact\s+type="([^"]+)"(?:\s+title="([^"]+)")?\s*>([\s\S]*?)<\/aria_artifact>/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      const t = text.slice(lastIdx, match.index).trim()
      if (t) segments.push({ kind: 'text', content: t })
    }
    const parsed = tolerantJSONParse(match[3])
    if (parsed) {
      segments.push({ kind: 'artifact', type: match[1], title: match[2], data: parsed })
    } else {
      segments.push({ kind: 'text', content: 'I tried to show a chart here but the data was malformed. Please ask again.' })
      fetch('/api/aria/artifact-parse-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: match[0].slice(0, 500), type: match[1] ?? 'unknown' }),
      }).catch(() => {})
    }
    lastIdx = regex.lastIndex
  }
  if (lastIdx < text.length) {
    const tail = text.slice(lastIdx).trim()
    if (tail) segments.push({ kind: 'text', content: tail })
  }
  return segments.filter(s => s.kind !== 'text' || (s.content && s.content.length > 0))
}

function renderAriaContent(text: string) {
  const nodes: React.ReactNode[] = []
  const blockRe = /\[(chart|action):([\s\S]*?)\n\]/g
  let last = 0; let key = 0; let m
  while ((m = blockRe.exec(text)) !== null) {
    const before = text.slice(last, m.index)
    if (before) nodes.push(<span key={key++}>{before.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{renderText(l)}</span>)}</span>)
    if (m[1] === 'chart') {
      const spec = parseChartHint(m[2])
      if (spec) nodes.push(<div key={key++} style={{ margin: '12px 0', background: 'var(--bg-elevated)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--divider)' }}><InlineChart spec={spec} /></div>)
    } else if (m[1] === 'action') {
      const act = parseActionHint(m[2])
      if (act) nodes.push(
        <div key={key++} style={{ marginTop: 12 }}>
          <a href={act.href} style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 9, background: act.style === 'primary' ? 'var(--violet)' : 'var(--bg-elevated)', color: act.style === 'primary' ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 600, textDecoration: 'none', border: act.style === 'primary' ? 'none' : '1px solid var(--border-default)' }}>
            {act.label} →
          </a>
        </div>
      )
    }
    last = m.index + m[0].length
  }
  const rest = text.slice(last)
  if (rest) nodes.push(<span key={key++}>{rest.split('\n').map((l, i) => <span key={i}>{i > 0 && <br />}{renderText(l)}</span>)}</span>)
  return nodes
}

function getResultCount(result: unknown): number | undefined {
  if (!result || typeof result !== 'object') return undefined
  const r = result as Record<string, unknown>
  if (typeof r.rows === 'number') return r.rows
  if (Array.isArray(r.staff)) return r.staff.length
  if (Array.isArray(r.customers)) return r.customers.length
  if (typeof r.transactions === 'number') return r.transactions
  return undefined
}

export default function AskAriaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<ConvMeta[]>([])
  const [messages, setMessages] = useState<DisplayMsg[]>([])
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<DocumentReadResult | null>(null)
  const [aiMode, setAiMode] = useState<string | null>(null)
  const [sonnetPct, setSonnetPct] = useState(0)
  const [warnDismissed, setWarnDismissed] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const ariaIdxRef = useRef(-1)
  const toolIdxRef = useRef<Record<string, number>>({})
  const urlConvLoaded = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = useCallback(async (file: File) => {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!ALLOWED.includes(file.type)) {
      setInputError('Only JPEG, PNG, GIF, and WEBP images are supported.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setInputError('Image must be under 4 MB.')
      return
    }
    setUploading(true)
    setInputError(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      try {
        const res = await fetch('/api/aria/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mime: file.type, name: file.name }),
        })
        const data = await res.json() as { description?: string; error?: string }
        if (!res.ok || !data.description) {
          setInputError(data.error ?? 'Failed to read image.')
        } else {
          setPendingAttachment({ description: data.description, name: file.name, previewUrl: dataUrl })
        }
      } catch {
        setInputError('Failed to upload image.')
      }
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }, [])

  const fetchConvs = useCallback(() => {
    fetch('/api/aria/ask/history').then(r => r.json()).then((d: { conversations?: ConvMeta[] }) => setConversations(d.conversations ?? [])).catch(() => {})
  }, [])

  useEffect(() => { document.title = 'Ask Aria | Aria POS'; }, [])
  useEffect(() => { fetchConvs() }, [fetchConvs])

  useEffect(() => {
    if (urlConvLoaded.current) return
    const urlId = searchParams.get('conversation_id')
    if (urlId) { urlConvLoaded.current = true; loadConversation(urlId) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages])

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/aria/ask/history?id=${id}&messages=true`)
    const data = await res.json() as { conversation?: { messages?: Array<{ role: string; content: string }> } }
    const stored = data.conversation?.messages ?? []
    setConvId(id)
    setMessages(
      stored
        .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
        .map((m: { role: string; content: string; downloads?: Array<{ filename: string; download_url: string; format: string; rows: number }> }) => ({
          type: m.role === 'user' ? 'user' : 'aria',
          text: m.content,
          streaming: false,
          downloads: m.downloads?.length ? m.downloads : undefined,
        } as DisplayMsg))
    )
    setHistory([])
  }, [])

  const newChat = useCallback(() => {
    setMessages([]); setHistory([]); setConvId(null); ariaIdxRef.current = -1
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || streaming) return
    if (content.length > MAX_INPUT) {
      setInputError(`Your message is too long. Aria works best with specific questions under ${MAX_INPUT} characters. Try asking one question at a time.`)
      return
    }
    setInputError(null)
    setStreaming(true); setInput('')
    ariaIdxRef.current = -1; toolIdxRef.current = {}

    const attachment = pendingAttachment
    setPendingAttachment(null)
    const fullContent = attachment
      ? `[Image: ${attachment.name}]\n${attachment.description}\n\nUser question: ${content}`
      : content

    setMessages(prev => [...prev, { type: 'user', text: content + (attachment ? ` 📎 ${attachment.name}` : '') }])
    const nextHistory = [...history, { role: 'user' as const, content: fullContent }]

    try {
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullContent, conversation_id: convId ?? null }),
      })

      const data = await res.json() as {
        response?: string; conversation_id?: string; intent?: string
        action?: Record<string, unknown>
        downloads?: Array<{ filename: string; download_url: string; format: string; rows: number }>
        blocks?: AskBlock[]
        ai_mode?: string
        sonnet_percent_used?: number
      }
      const reply = data.response ?? 'No response'
      if (data.ai_mode) setAiMode(data.ai_mode)
      if (typeof data.sonnet_percent_used === 'number') setSonnetPct(data.sonnet_percent_used)

      if (data.conversation_id) {
        setConvId(data.conversation_id)
        router.replace(`/pos/ask?conversation_id=${data.conversation_id}`, { scroll: false })
      }

      // Handle export action — fetch download URL
      if (data.action?.action === 'export') {
        const exportRes = await fetch('/api/aria/ask/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: data.action.format ?? 'csv',
            subject: data.action.subject ?? 'sales',
            period: data.action.period ?? 'month',
          }),
        })
        const exportData = await exportRes.json() as { url?: string; filename?: string; row_count?: number }
        if (exportData.url) {
          setMessages(prev => [...prev, {
            type: 'aria',
            text: `${reply}\n\n[Download ${exportData.filename}](${exportData.url}) — ${exportData.row_count} rows, expires in 1 hour.`,
            streaming: false,
            blocks: data.blocks,
            mode: data.ai_mode,
          }])
          setHistory(h => [...h, { role: 'user', content: fullContent }, { role: 'assistant', content: reply }])
          setStreaming(false)
          if (!convId) fetchConvs()
          return
        }
      }

      // Handle image/file downloads
      if (data.downloads && data.downloads.length > 0) {
        const dl = data.downloads[0]
        const isImage = ['png','jpg','jpeg','svg','webp'].includes(dl.format)
        setMessages(prev => [...prev, {
          type: 'aria',
          text: reply,
          streaming: false,
          downloads: data.downloads,
          blocks: data.blocks,
          mode: data.ai_mode,
        }])
        setHistory(h => [...h, { role: 'user', content: fullContent }, { role: 'assistant', content: reply }])
        setStreaming(false)
        if (!convId) fetchConvs()
        return
      }

      setMessages(prev => [...prev, { type: 'aria', text: reply, streaming: false, blocks: data.blocks, mode: data.ai_mode }])
      setHistory(h => [...h, { role: 'user', content: fullContent }, { role: 'assistant', content: reply }])
      if (!convId) fetchConvs()
    } catch (err) {
      setMessages(prev => [...prev, { type: 'error', text: err instanceof Error ? err.message : 'Request failed' }])
    }
    setStreaming(false)
  }, [streaming, history, convId, fetchConvs, router])

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', fontFamily: "'Manrope',sans-serif", background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Left rail */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--divider)', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
        <div style={{ padding: '16px 12px', borderBottom: '1px solid var(--divider)' }}>
          <button onClick={newChat} style={{ width: '100%', padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <span style={{ fontSize: 16 }}>+</span> New chat
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
          {conversations.map(c => (
            <div key={c.id} style={{ position: 'relative', marginBottom: 2 }}
              onMouseEnter={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.del-btn') as HTMLElement; if (btn) btn.style.opacity = '1'; }}
              onMouseLeave={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.del-btn') as HTMLElement; if (btn) btn.style.opacity = '0'; }}>
              <div onClick={() => loadConversation(c.id)} style={{ padding: '9px 28px 9px 10px', borderRadius: 8, cursor: 'pointer', background: convId === c.id ? 'var(--violet-soft)' : 'transparent', borderLeft: convId === c.id ? '2px solid var(--violet)' : '2px solid transparent' }}
                onMouseEnter={e => { if (convId !== c.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                onMouseLeave={e => { if (convId !== c.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: convId === c.id ? 'var(--text-violet)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || 'Untitled'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{(() => { const raw = c.last_message_at ?? (c as any).created_at; if (!raw) return ''; const d = new Date(raw); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); })()}</div>
              </div>
              <button
                className="del-btn"
                onClick={async (e) => {
                  e.stopPropagation()
                  if (!confirm('Delete this chat?')) return
                  await fetch('/api/aria/ask/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
                  if (convId === c.id) { setMessages([]); setConvId(null) }
                  fetchConvs()
                }}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', opacity: 0, transition: 'opacity 150ms', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Delete chat"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Lite mode — premium AI budget exhausted for the month */}
        {aiMode === 'haiku' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--divider)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span aria-hidden>⚡</span>
            <span style={{ flex: 1 }}>Lite mode — premium AI budget reached for this month.</span>
            <a href="/dashboard/billing" style={{ color: 'var(--text-violet)', fontWeight: 600, textDecoration: 'none' }}>Upgrade</a>
            <span>for unlimited.</span>
          </div>
        )}

        {/* 80% warning — softer, dismissible, once per session */}
        {aiMode !== 'haiku' && sonnetPct >= 80 && sonnetPct < 100 && !warnDismissed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span style={{ flex: 1 }}>You&apos;ve used {sonnetPct}% of this month&apos;s premium AI. Aria stays available on lite mode after that.</span>
            <button onClick={() => setWarnDismissed(true)} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, padding: 2, fontFamily: 'inherit' }}>×</button>
          </div>
        )}

        {isEmpty ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '48px 48px 24px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>Ask Aria anything.</div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 36, lineHeight: 1.6 }}>She has access to every sale, every product, every customer. Ask in plain English.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
              {SUGGESTED.map((p, i) => (
                <button key={i} onClick={() => sendMessage(p)} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.4 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--violet)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--divider)')}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 48px', maxWidth: 760, margin: '0 auto', width: '100%' }}>
            {messages.map((msg, i) => {
              if (msg.type === 'user') return (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <div style={{ background: 'var(--violet)', color: '#fff', borderRadius: '14px 14px 3px 14px', padding: '10px 16px', fontSize: 14, maxWidth: '70%', lineHeight: 1.5 }}>{msg.text}</div>
                </div>
              )
              if (msg.type === 'tool') return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, background: msg.status === 'running' ? 'rgba(139,92,246,0.1)' : 'rgba(52,211,153,0.1)', color: msg.status === 'running' ? 'var(--violet)' : '#00B140', border: `1px solid ${msg.status === 'running' ? 'rgba(0,106,255,0.12)' : 'rgba(52,211,153,0.2)'}`, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {msg.status === 'running' ? (
                      <><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--violet)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />{TOOL_LABELS[msg.toolName]?.running ?? `Looking at ${msg.toolName.replace(/_/g, ' ')}…`}</>
                    ) : (
                      <><span style={{ color: '#00B140' }}>✓</span> {TOOL_LABELS[msg.toolName]?.done ?? msg.toolName.replace(/_/g, ' ')}{msg.count !== undefined ? ` (${msg.count} rows)` : ''}</>
                    )}
                  </div>
                </div>
              )
              if (msg.type === 'error') return (
                <div key={i} style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: 13, color: '#F87171' }}>⚠ {msg.text}</div>
              )
              return (
                <div key={i} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gradient-aria)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800, flexShrink: 0, marginTop: 2 }}>✦</div>
                    <div style={{ flex: 1, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>
                      {msg.mode === 'haiku' && (
                        <span title="Answered in lite mode" style={{ float: 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', border: '1px solid var(--divider)', borderRadius: 99, padding: '1px 7px', marginLeft: 8 }}>⚡ lite</span>
                      )}
                      {msg.streaming
                        ? msg.text
                        : parseAriaResponse(msg.text).map((seg, si) =>
                            seg.kind === 'text'
                              ? <span key={si}>{renderAriaContent(seg.content)}</span>
                              : <AriaArtifact key={si} type={seg.type} title={seg.title ?? undefined} data={seg.data} />
                          )
                      }
                      {msg.streaming && <span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--violet)', marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'middle' }} />}
                      {/* Download cards for images/files */}
                      {msg.downloads && msg.downloads.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {msg.downloads.map((dl, di) => {
                            const isImage = ['png','jpg','jpeg','svg','webp'].includes(dl.format)
                            return isImage ? (
                              <div key={di} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.3)', maxWidth: 400 }}>
                                <img src={dl.download_url} alt={dl.filename} style={{ width: '100%', display: 'block' }} />
                                <a href={dl.download_url} download={dl.filename} target="_blank" rel="noopener"
                                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,106,255,0.06)', color: '#006AFF', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                                  <span>🖼 {dl.filename}</span>
                                  <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(0,106,255,0.10)', fontSize: 11 }}>↓ Download</span>
                                </a>
                              </div>
                            ) : (
                              <a key={di} href={dl.download_url} download={dl.filename} target="_blank" rel="noopener"
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.06)', color: '#006AFF', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                                <span style={{ fontSize: 18 }}>📄</span>
                                <span style={{ flex: 1 }}>{dl.filename}</span>
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(0,106,255,0.10)' }}>↓</span>
                              </a>
                            )
                          })}
                        </div>
                      )}
                      {/* Rich blocks below the text bubble, full message-column width */}
                      {!msg.streaming && msg.blocks && msg.blocks.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <BlockRenderer blocks={msg.blocks} onAction={(p) => sendMessage(p)} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            {streaming && messages.at(-1)?.type !== 'aria' && messages.at(-1)?.type !== 'tool' && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--gradient-aria)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 800, flexShrink: 0 }}>✦</div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  Aria is thinking
                  <span className="thinking-dot" style={{ animationDelay: '0ms' }} />
                  <span className="thinking-dot" style={{ animationDelay: '160ms' }} />
                  <span className="thinking-dot" style={{ animationDelay: '320ms' }} />
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--divider)', padding: '14px 48px', background: 'var(--bg-surface)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            {inputError && (
              <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', fontSize: 12, color: '#F87171', lineHeight: 1.4 }}>{inputError}</div>
            )}
            {pendingAttachment && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--divider)' }}>
                {pendingAttachment.previewUrl && (
                  <img src={pendingAttachment.previewUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingAttachment.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingAttachment.description}</div>
                </div>
                <button onClick={() => setPendingAttachment(null)} style={{ fontSize: 14, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>✕</button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => fileInputRef.current?.click()} disabled={streaming || uploading}
                title="Attach image" aria-label="Attach image"
                style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid var(--divider)', background: uploading ? 'var(--bg-elevated)' : 'var(--bg-elevated)', color: uploading ? 'var(--violet)' : 'var(--text-secondary)', fontSize: 18, cursor: streaming || uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 0.15s' }}>
                {uploading ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid var(--violet)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : '📎'}
              </button>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={input} onChange={e => { setInput(e.target.value); if (inputError) setInputError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
                  placeholder="Ask about sales, inventory, customers, staff…"
                  disabled={streaming} rows={1}
                  style={{ width: '100%', resize: 'none', background: 'var(--bg-elevated)', border: `1px solid ${input.length > MAX_INPUT ? 'rgba(248,113,113,0.5)' : 'var(--divider)'}`, borderRadius: 12, padding: '10px 14px', paddingBottom: '22px', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', lineHeight: 1.5, minHeight: 44, maxHeight: 120, boxSizing: 'border-box' }}
                />
                {input.length > 800 && (
                  <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: input.length > MAX_INPUT ? '#F87171' : 'var(--text-tertiary)', pointerEvents: 'none' }}>{input.length}/{MAX_INPUT}</div>
                )}
              </div>
              <button onClick={() => sendMessage(input)} disabled={streaming || !input.trim()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: streaming || !input.trim() ? 'var(--bg-elevated)' : 'var(--violet)', color: streaming || !input.trim() ? 'var(--text-tertiary)' : '#fff', fontSize: 13, fontWeight: 600, cursor: streaming || !input.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', flexShrink: 0, height: 44 }}>
                {streaming ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes blink { 50% { opacity: 0 } }
        @keyframes thinking-pulse { 0%,80%,100% { opacity: 0.2; transform: scale(0.8) } 40% { opacity: 1; transform: scale(1) } }
        .thinking-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--violet); animation: thinking-pulse 1.2s ease-in-out infinite; }
      `}</style>
    </div>
  )
}


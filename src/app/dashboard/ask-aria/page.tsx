'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import VoiceInput from '@/components/aria/VoiceInput'
import ChatSuggestions from '@/components/aria/ChatSuggestions'
import { SkillPicker } from '@/components/aria/SkillPicker'
import ActionPreviewCard from '@/components/aria/ActionPreviewCard'
import AuditLogCard from '@/components/aria/AuditLogCard'
import { AriaArtifact } from '@/components/aria/AriaArtifact'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'
import type { DocumentReadResult } from '@/lib/aria/intelligence/document-vision'
import { BlockRenderer } from '@/components/dashboard/BlockRenderer'
import type { AskBlock } from '@/lib/aria/ask-types'

const AriaTalkingHead = dynamic(() => import('@/components/aria/AriaTalkingHead'), { ssr: false })
const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false })

interface ExportAction { type: 'export'; url: string; filename: string; format: string; row_count: number }
interface EscalateAction { type: 'escalate'; ticket_id: string }
interface ErrorAction { type: 'export_error' | 'escalate_error'; message: string }
interface PreviewAction { type: 'action_preview'; planned: PlannedAction }
interface ExecutionResultAction { type: 'execution_result'; ok: boolean; affected_count: number; error?: string; rollback_available?: boolean; rollback_expires_at?: string; action_log_id?: string }
interface DocumentAction { type: 'document'; document: DocumentReadResult }
type MessageAction = ExportAction | EscalateAction | ErrorAction | PreviewAction | ExecutionResultAction | DocumentAction | null

interface DeliverableInfo {
  id: string
  kind: string
  title: string
  html: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  action?: MessageAction
  intent?: string
  timestamp: Date
  downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }>
  tool_calls?: Array<{ name: string; ms: number }>
  blocks?: AskBlock[]
  followups?: string[]
  used_council?: boolean
  model_used?: string
  deliverable?: DeliverableInfo
}

interface ConvSummary {
  id: string
  title: string | null
  message_count: number
  last_message_at: string
  last_intent: string | null
  has_escalated: boolean
}

interface DeliverableRecord {
  id: string
  title: string
  output_kind: string
  created_at: string
  render_html: string | null
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] flex items-center gap-1 mt-1"
      style={{ color: 'rgba(255,255,255,0.3)' }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function DocumentResultCard({ doc }: { doc: DocumentReadResult }) {
  const TYPE_LABEL: Record<string, string> = { invoice: 'Invoice', receipt: 'Receipt', product_list: 'Product List', unknown: 'Document' }
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(127,184,151,0.3)', background: 'rgba(127,184,151,0.05)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(127,184,151,0.15)' }}>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(127,184,151,0.2)', color: '#7FB897' }}>
          {TYPE_LABEL[doc.type] ?? 'Document'}
        </span>
        {doc.supplier && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{doc.supplier}</span>}
        {doc.date && <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{doc.date}</span>}
        {doc.total != null && <span className="text-xs ml-auto font-medium text-white">${doc.total.toFixed(2)}</span>}
      </div>
      {doc.line_items.length > 0 && (
        <div className="px-4 py-2">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                <th className="text-left pb-1.5 font-normal">Item</th>
                <th className="text-right pb-1.5 font-normal">Qty</th>
                <th className="text-right pb-1.5 font-normal">Unit</th>
                <th className="text-right pb-1.5 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.line_items.slice(0, 10).map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: '#e5e7eb' }}>
                  <td className="py-1 pr-2">{item.name}</td>
                  <td className="py-1 text-right">{item.quantity ?? '—'}</td>
                  <td className="py-1 text-right">{item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : '—'}</td>
                  <td className="py-1 text-right">{item.total != null ? `$${item.total.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 pb-3 pt-1">
        <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.4)' }}>{doc.suggested_action}</p>
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: MessageAction }) {
  if (!action) return null
  if (action.type === 'export') {
    return (
      <a href={action.url} download={action.filename}
        className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-opacity hover:opacity-80"
        style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897', textDecoration: 'none' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Download {action.filename} <span className="opacity-60">({action.row_count} rows)</span></span>
      </a>
    )
  }
  if (action.type === 'escalate') {
    return (
      <div className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Support ticket created (#{action.ticket_id.slice(0,8)})
      </div>
    )
  }
  if (action.type === 'execution_result') {
    return (
      <div className="mt-2 px-4 py-2.5 rounded-xl text-xs"
        style={{
          background: action.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${action.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: action.ok ? '#86efac' : '#fca5a5',
        }}>
        {action.ok
          ? `✓ ${action.affected_count} item${action.affected_count !== 1 ? 's' : ''} updated${action.rollback_available ? ' · Undo available for 1 hour' : ''}`
          : `✗ Failed: ${action.error}`}
      </div>
    )
  }
  if (action.type === 'document') {
    return <DocumentResultCard doc={action.document} />
  }
  return null
}

type ArtifactSegment = { kind: 'artifact'; type: string; title?: string; data: Record<string, unknown> }
type TextSegment    = { kind: 'text'; content: string }
type Segment = TextSegment | ArtifactSegment

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

function parseAriaResponse(text: string): Segment[] {
  const segments: Segment[] = []
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
    const t = text.slice(lastIdx).trim()
    if (t) segments.push({ kind: 'text', content: t })
  }
  return segments
}

function AriaSpeechBubble({ business, show }: { business: { name?: string; trading_name?: string } | null; show: boolean }) {
  const [visible, setVisible] = useState(false)
  const name = business?.trading_name ?? business?.name ?? null

  // Only become visible once show=true (after avatar wave completes)
  useEffect(() => {
    if (!show) return
    setVisible(true)
    // Auto-hide after 30 seconds
    const t = setTimeout(() => setVisible(false), 30000)
    return () => clearTimeout(t)
  }, [show])

  return (
    <div style={{
      maxWidth: 180, background: 'rgba(20,20,30,0.96)',
      border: '1px solid rgba(127,184,151,0.35)', borderRadius: '14px 14px 4px 14px',
      padding: '10px 13px', fontSize: 12, color: 'rgba(255,255,255,0.9)',
      lineHeight: 1.5, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.96)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <span style={{ color: '#7FB897', fontWeight: 700 }}>Hi{name ? `, ${name}` : ''}! 👋</span>
      {' '}I&apos;m Aria — your AI business co-operator. What can I help you with today?
    </div>
  )
}

// Aria's voice before the first message — personalised by time and business
function AriaGreeting({ business }: { business: { name?: string; trading_name?: string; industry?: string | null } | null }) {
  const hour = new Date().getHours()
  const name = business?.trading_name ?? business?.name ?? 'your business'
  const industry = business?.industry ?? ''
  const greeting = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
  const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
  const openers = [
    `${greeting}. I've been through the overnight numbers for ${name}. What do you want to look at?`,
    `${greeting}. ${day} — I've checked everything. What's on your mind?`,
    `${greeting}. The data's in. Ask me anything about ${name}.`,
    industry === 'liquor'
      ? `${greeting}. I've checked stock, sales, and the week ahead for ${name}. What do you need?`
      : industry === 'cafe'
      ? `${greeting}. I've been through covers, revenue, and your top sellers for ${name}. What first?`
      : `${greeting}. I know what happened yesterday at ${name}. What do you want to tackle first?`,
  ]
  const opener = openers[new Date().getDay() % openers.length]
  return (
    <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, margin: 0, maxWidth: 500 }}>
      {opener}
    </p>
  )
}

// Renders Aria's plain-text responses — handles bold/italic/lists cleanly
function AriaMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <span className="whitespace-pre-wrap">
      {lines.map((line, li) => {
        // Render inline: **bold** and *italic* — strip the markers, apply styling
        const parts: React.ReactNode[] = []
        let remaining = line
        let key = 0

        while (remaining.length > 0) {
          const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*/)
          const italicMatch = remaining.match(/^(.*?)\*(.+?)\*/)

          const bIdx = boldMatch ? boldMatch[0].indexOf('**') : Infinity
          const iIdx = italicMatch ? italicMatch[0].indexOf('*') : Infinity

          if (boldMatch && bIdx <= iIdx) {
            if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>)
            parts.push(<strong key={key++} style={{ fontWeight: 600, color: '#fff' }}>{boldMatch[2]}</strong>)
            remaining = remaining.slice(boldMatch[0].length)
          } else if (italicMatch && iIdx < Infinity) {
            if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>)
            parts.push(<em key={key++} style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.8)' }}>{italicMatch[2]}</em>)
            remaining = remaining.slice(italicMatch[0].length)
          } else {
            parts.push(<span key={key++}>{remaining}</span>)
            remaining = ''
          }
        }

        return (
          <span key={li}>
            {parts}
            {li < lines.length - 1 && '\n'}
          </span>
        )
      })}
    </span>
  )
}

function DeliverableToolbar({ deliverable }: { deliverable: DeliverableInfo }) {
  const [view, setView] = useState<'chart' | 'summary'>('chart')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly'>('weekly')
  const [schedEmail, setSchedEmail] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)
  const [status, setStatus] = useState('')

  async function downloadPdf() {
    setPdfLoading(true)
    setStatus('')
    try {
      const res = await fetch('/api/aria/deliverable-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId: deliverable.id }),
      })
      const data = await res.json() as { pdf_url?: string; error?: string }
      if (data.pdf_url) {
        window.open(data.pdf_url, '_blank')
        setStatus('PDF ready')
      } else {
        setStatus(data.error ?? 'PDF export failed')
      }
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setPdfLoading(false)
    }
  }

  async function sendEmail() {
    setEmailLoading(true)
    setStatus('')
    try {
      const res = await fetch('/api/aria/deliverable-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputId: deliverable.id }),
      })
      const data = await res.json() as { sent?: boolean; error?: string }
      setStatus(data.sent ? 'Email sent' : (data.error ?? 'Failed'))
    } catch (e) {
      setStatus((e as Error).message)
    } finally {
      setEmailLoading(false)
    }
  }

  async function saveSchedule() {
    if (!schedEmail.trim()) return
    setSchedSaving(true)
    try {
      const res = await fetch('/api/aria/intelligence/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: deliverable.title,
          report_type: 'deliverable',
          frequency: schedFreq,
          recipients: [schedEmail.trim()],
          deliverable_spec: { task_prompt: deliverable.title, output_kind: deliverable.kind },
        }),
      })
      if (res.ok) {
        setStatus('Scheduled')
        setScheduleOpen(false)
      } else {
        setStatus('Schedule failed')
      }
    } catch {
      setStatus('Schedule failed')
    } finally {
      setSchedSaving(false)
    }
  }

  const btnBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors'
  const btnStyle = { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }
  const btnActiveStyle = { background: 'rgba(127,184,151,0.12)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.25)' }

  return (
    <div className="mt-3">
      {/* Inline chart view */}
      {view === 'chart' && deliverable.html && (
        <div className="rounded-xl overflow-hidden mb-2" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <iframe
            srcDoc={deliverable.html}
            sandbox="allow-scripts"
            className="w-full"
            style={{ height: 340, border: 'none', display: 'block' }}
            title={deliverable.title}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <button className={btnBase} style={view === 'chart' ? btnActiveStyle : btnStyle} onClick={() => setView('chart')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M7 16l4-4 4 4"/></svg>
          Chart
        </button>
        <button className={btnBase} style={view === 'summary' ? btnActiveStyle : btnStyle} onClick={() => setView('summary')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><path strokeLinecap="round" d="M4 6h16M4 10h16M4 14h10"/></svg>
          Summary
        </button>
        <button className={btnBase} style={pdfLoading ? btnActiveStyle : btnStyle} onClick={downloadPdf} disabled={pdfLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><path strokeLinecap="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          {pdfLoading ? 'Exporting…' : 'Download PDF'}
        </button>
        <button className={btnBase} style={emailLoading ? btnActiveStyle : btnStyle} onClick={sendEmail} disabled={emailLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          {emailLoading ? 'Sending…' : 'Email'}
        </button>
        <button className={btnBase} style={scheduleOpen ? btnActiveStyle : btnStyle} onClick={() => setScheduleOpen(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>
          Schedule
        </button>
      </div>

      {/* Schedule modal */}
      {scheduleOpen && (
        <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs font-medium text-white mb-2">Schedule recurring delivery</p>
          <div className="flex gap-2 mb-2">
            {(['daily', 'weekly'] as const).map(f => (
              <button key={f} onClick={() => setSchedFreq(f)}
                className="px-3 py-1.5 rounded-lg text-xs capitalize"
                style={schedFreq === f ? btnActiveStyle : btnStyle}>
                {f}
              </button>
            ))}
          </div>
          <input
            type="email"
            placeholder="Recipient email"
            value={schedEmail}
            onChange={e => setSchedEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs mb-2 outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button onClick={saveSchedule} disabled={schedSaving || !schedEmail.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: '#2D5240', color: '#fff' }}>
            {schedSaving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      )}

      {status && <p className="mt-1.5 text-xs" style={{ color: status.includes('fail') || status.includes('error') ? '#fca5a5' : '#7FB897' }}>{status}</p>}
    </div>
  )
}

export default function AskAriaPage() {
  const { business, loading } = useBusinessContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<ConvSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [pendingAction, setPendingAction] = useState<PlannedAction | null>(null)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [councilThinking, setCouncilThinking] = useState(false)
  const [greetingReady, setGreetingReady] = useState(false)
  const [briefingCollapsed, setBriefingCollapsed] = useState(false)
  const [avatarMounted, setAvatarMounted] = useState(false)
  const [ariaResponseText, setAriaResponseText] = useState<string>('')
  const [deliverables, setDeliverables] = useState<DeliverableRecord[]>([])
  const [selectedDeliverable, setSelectedDeliverable] = useState<DeliverableRecord | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Delay greeting text until avatar finishes waving (7.27s greeting animation)
  useEffect(() => {
    const t = setTimeout(() => setGreetingReady(true), 7500)
    return () => clearTimeout(t)
  }, [])

  // Tiny delay to avoid 1-frame flash on dynamic import
  useEffect(() => {
    const t = setTimeout(() => setAvatarMounted(true), 150)
    return () => clearTimeout(t)
  }, [])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ariaVideoUrl] = useState<string>(process.env.NEXT_PUBLIC_ARIA_VIDEO_URL ?? 'https://tcowd5vdie4rwa2o.public.blob.vercel-storage.com/50071.mp4')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Video avatar: ONLY active when streaming message has actual content (not during brain thinking)
  const isAriaActive = messages.some(m => m.streaming && m.content && m.content.length > 0)
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !ariaVideoUrl) return
    if (isAriaActive) {
      vid.loop = true
      vid.currentTime = 0
      vid.play().catch(() => {})
    } else {
      vid.loop = false
      vid.pause()
      vid.currentTime = 0
    }
  }, [isAriaActive, ariaVideoUrl])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (!q) return
    const t = setTimeout(() => {
      const fn = (window as unknown as Record<string, unknown>).ariaSendPrompt as ((p: string) => void) | undefined
      if (fn) fn(q)
    }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/ask/history')
      if (res.ok) {
        const data = await res.json() as { conversations?: ConvSummary[] }
        setHistory(data.conversations ?? [])
      }
    } catch { /* non-fatal */ }
  }, [])

  const loadDeliverables = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/deliverables')
      if (res.ok) {
        const data = await res.json() as { deliverables?: DeliverableRecord[] }
        setDeliverables(data.deliverables ?? [])
      }
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])
  useEffect(() => { loadDeliverables() }, [loadDeliverables])


  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/aria/ask/history?id=${id}&messages=true`)
      if (!res.ok) return
      const data = await res.json() as { conversation: { id: string; title: string; messages: Array<{ role: string; content: string; downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }> }> } | null }
      if (!data.conversation) return
      const msgs = (data.conversation.messages ?? []).map((m, i) => {
        // Use stored downloads if available, otherwise extract from markdown
        let downloads: Array<{ filename: string; download_url: string; rows: number; format: string }> = m.downloads ?? []
        if (downloads.length === 0 && m.role === 'assistant') {
          // Fallback: extract supabase image URLs from markdown
          const imgMatches = m.content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+supabase[^)]+\.(?:png|jpg|jpeg|webp))\)/g)
          for (const match of imgMatches) {
            const url = match[1]
            const filename = url.split('/').pop()?.split('?')[0] ?? 'image.png'
            const ext = filename.split('.').pop() ?? 'png'
            downloads.push({ filename, download_url: url, rows: 0, format: ext })
          }
        }
        const cleanContent = m.role === 'assistant'
          ? m.content
            .replace(/\n\n\[Context from data lookup:[\s\S]*?\]$/g, '')
            .replace(/\s*\[DELIVERABLE:[^\]]+\]\s*/g, '')
            .replace(/!\[[^\]]*\]\(https?:\/\/[^)]*supabase[^)]+\)/g, '')
            .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*supabase[^)]+\)/g, '')
            .replace(/https?:\/\/[^\s]*supabase[^\s]*/g, '')
            .replace(/\n\s*\n\s*\n/g, '\n\n').trim()
          : m.content
        return {
          id: `hist-${i}`,
          role: m.role as 'user' | 'assistant',
          content: cleanContent,
          downloads: downloads.length > 0 ? downloads : undefined,
          ts: new Date().toISOString(),
          timestamp: new Date(),
        }
      })
      setMessages(msgs)
      setConversationId(data.conversation.id)
      setShowHistory(false)
      setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, 100)
    } catch { /* non-fatal */ }
  }, [])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if ((!msg && attachedFiles.length === 0) || sending) return

    setInput('')
    const filesToSend = [...attachedFiles]
    setAttachedFiles([])
    const userContent = filesToSend.length > 0
      ? `${msg}${msg ? '\n\n' : ''}📎 ${filesToSend.map(f => f.name).join(', ')}`
      : msg
    const userMsg: Message = { role: 'user', content: userContent, timestamp: new Date() }
    setMessages(prev => [...prev.slice(-20), userMsg, { role: 'assistant', content: '', streaming: true, timestamp: new Date() }])
    setSending(true)
    const isStrategicMsg = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|analyse|analyze|compare|forecast|plan|opportunity|risk|growth|optimise|optimize|revenue|crisis|urgent|help|fix|problem|doing|perform|week|today/i.test(msg)
    setCouncilThinking(isStrategicMsg)

    try {
      let res: Response
      if (filesToSend.length > 0) {
        const fd = new FormData()
        fd.append('message', msg || 'Please analyse the attached file(s).')
        if (conversationId) fd.append('conversation_id', conversationId)
        for (const f of filesToSend) fd.append('files', f)
        res = await fetch('/api/aria/ask', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/aria/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, conversation_id: conversationId }),
        })
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error ?? 'Request failed')
      }

      const data = await res.json() as {
        response?: string; conversation_id?: string; intent?: string
        action?: { action?: string; planned?: PlannedAction; type?: string; [k: string]: unknown }
        cost_usd_cents?: number
        downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }>
        tool_calls?: Array<{ name: string; ms: number }>
        blocks?: AskBlock[] | null
        followups?: string[]
        used_council?: boolean
        model_used?: string
        deliverable?: DeliverableInfo
      }

      if (data.conversation_id) setConversationId(data.conversation_id)

      // Detect action preview — show ActionPreviewCard
      if (data.action?.action === 'preview' && data.action.planned) {
        setPendingAction(data.action.planned as PlannedAction)
      }

      // Detect execution result
      const msgAction: MessageAction = (() => {
        const a = data.action
        if (!a) return null
        if (a.action === 'preview') return { type: 'action_preview', planned: a.planned as PlannedAction }
        if (a.type === 'execution_result') return a as unknown as ExecutionResultAction
        if (a.type === 'export') return a as unknown as ExportAction
        if (a.type === 'escalate') return a as unknown as EscalateAction
        if (a.type === 'export_error' || a.type === 'escalate_error') return a as unknown as ErrorAction
        return null
      })()

      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            // Strip the [DELIVERABLE:id] sentinel — the deliverable renders via its
            // own field/toolbar below, so the raw token must never show as text.
            content: (data.response ?? '').replace(/\s*\[DELIVERABLE:[^\]]+\]\s*/g, '').trim(),
            streaming: false,
            action: msgAction,
            intent: data.intent,
            downloads: data.downloads ?? undefined,
            tool_calls: data.tool_calls ?? undefined,
            blocks: data.blocks ?? undefined,
            followups: data.followups ?? undefined,
            used_council: data.used_council ?? false,
            model_used: data.model_used,
            deliverable: data.deliverable ?? undefined,
          }
        }
        return updated
      })

      loadHistory()
      if (data.intent === 'deliverable') loadDeliverables()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Sorry, something went wrong: ${errMsg}`, streaming: false }
        }
        return updated
      })
    } finally {
      setSending(false)
      setCouncilThinking(false)
      inputRef.current?.focus()
    }
  }, [input, sending, conversationId, loadHistory, loadDeliverables])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).ariaSendPrompt = (prompt: string) => { send(prompt) }
    return () => { delete (window as unknown as Record<string, unknown>).ariaSendPrompt }
  }, [send])

  const uploadFile = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    setMessages(prev => [...prev.slice(-20),
      { role: 'user', content: `📎 ${file.name}`, timestamp: new Date() },
      { role: 'assistant', content: '', streaming: true, timestamp: new Date() },
    ])
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/aria/ask/upload', { method: 'POST', body: fd })
      const data = await res.json() as { document?: DocumentReadResult; error?: string }
      if (data.error) throw new Error(data.error)
      const doc = data.document!
      const summary = `Document read: ${doc.type}${doc.supplier ? ` from ${doc.supplier}` : ''}${doc.date ? ` (${doc.date})` : ''}. Found ${doc.line_items.length} line item${doc.line_items.length !== 1 ? 's' : ''}. ${doc.suggested_action}`
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: summary, streaming: false, action: { type: 'document', document: doc } }
        }
        return updated
      })
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Upload failed: ${(e as Error).message}`, streaming: false }
        }
        return updated
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [uploading])

  const confirmAction = useCallback(async () => {
    if (!pendingAction || !conversationId) return
    setConfirmingAction(true)
    // Add user "yes" message immediately
    setMessages(prev => [...prev, { role: 'user', content: 'Yes, go ahead.', timestamp: new Date() }])
    try {
      // Send "yes" through the main ask route — it handles isConfirmation() and executes
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Yes, go ahead.', conversation_id: conversationId }),
      })
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json() as {
        response?: string
        intent?: string
        action?: { type?: string; ok?: boolean; affected_count?: number; error?: string; rollback_available?: boolean; [k: string]: unknown }
        conversation_id?: string
      }
      if (data.conversation_id) setConversationId(data.conversation_id)
      const result = data.action
      const content = data.response ?? (
        result?.ok
          ? `Done — ${result.affected_count ?? 0} item${(result.affected_count ?? 0) !== 1 ? 's' : ''} updated.${result.rollback_available ? ' You can undo within 1 hour.' : ''}`
          : `Action failed: ${result?.error ?? 'Unknown error'}`
      )
      setMessages(prev => [...prev, {
        role: 'assistant',
        content,
        action: result?.type === 'execution_result' ? result as unknown as ExecutionResultAction : undefined,
        timestamp: new Date(),
      }])
      setPendingAction(null)
      loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => [...prev, { role: 'assistant', content: `Action failed: ${msg}`, timestamp: new Date() }])
      setPendingAction(null)
    } finally {
      setConfirmingAction(false)
    }
  }, [pendingAction, conversationId, loadHistory])

  const cancelAction = useCallback(() => {
    if (conversationId) {
      fetch('/api/aria/ask/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'cancel', conversation_id: conversationId }),
      }).catch(() => { /* non-fatal */ })
    }
    setPendingAction(null)
    setMessages(prev => [...prev, { role: 'assistant', content: 'Action cancelled.', timestamp: new Date() }])
  }, [conversationId])

  function newConversation() {
    setMessages([])
    setConversationId(null)
    setInput('')
    setPendingAction(null)
    inputRef.current?.focus()
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', background: '#0d0d14' }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#7FB897] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#0d0d14', overflow: 'hidden' }}>
      {/* Avatar keyframes only — avatar is inside chat col below */}
      <style>{`
        @keyframes ariaBar0 { from { height: 4px; opacity: 0.4; } to { height: 9px; opacity: 1; } }
        @keyframes ariaBar1 { from { height: 9px; opacity: 1; } to { height: 3px; opacity: 0.3; } }
        @keyframes ariaBar2 { from { height: 5px; opacity: 0.5; } to { height: 8px; opacity: 0.9; } }
        @keyframes ariaBar3 { from { height: 7px; opacity: 0.6; } to { height: 4px; opacity: 0.4; } }
      `}</style>
      {/* Mobile backdrop */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/60 z-10 md:hidden" onClick={() => setShowHistory(false)} />
      )}
      {/* History sidebar */}
      {showHistory && (
        <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a', position: 'relative', zIndex: 20 }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Recent chats</p>
            <button onClick={() => setShowHistory(false)} className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={newConversation}
              className="w-full text-left px-4 py-3 text-sm border-b transition-colors hover:bg-white/5"
              style={{ borderColor: 'rgba(255,255,255,0.04)', color: '#7FB897' }}
            >
              + New conversation
            </button>
            {history.length === 0 && (
              <p className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>No conversations yet</p>
            )}
            {history.map(c => (
              <div
                key={c.id}
                className="group relative border-b"
                style={{ borderColor: 'rgba(255,255,255,0.04)', background: conversationId === c.id ? 'rgba(127,184,151,0.08)' : 'transparent' }}
              >
                <button
                  onClick={() => loadConversation(c.id)}
                  className="w-full text-left px-4 py-3 pr-8 transition-colors hover:bg-white/5"
                >
                  <p className="text-xs font-medium text-white truncate">{c.title ?? 'Untitled'}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(c.last_message_at).toLocaleDateString()} · {c.message_count} msgs
                    {c.has_escalated && <span className="ml-1 text-red-400">↗</span>}
                  </p>
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (!confirm('Delete this chat?')) return
                    await fetch('/api/aria/ask/delete', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
                    if (conversationId === c.id) { setMessages([]); setConversationId(null) }
                    loadHistory()
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                  title="Delete chat"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          {/* Recent deliverables section */}
          {deliverables.length > 0 && (
            <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Recent Deliverables</p>
              {deliverables.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDeliverable(d)}
                  className="w-full text-left px-4 py-2.5 border-b transition-colors hover:bg-white/5"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>
                      {d.output_kind.replace('_', ' ')}
                    </span>
                    <p className="text-xs text-white truncate flex-1">{d.title}</p>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(d.created_at).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Deliverable viewer modal */}
      {selectedDeliverable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setSelectedDeliverable(null)}>
          <div className="w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>
                  {selectedDeliverable.output_kind.replace('_', ' ')}
                </span>
                <p className="text-sm font-medium text-white">{selectedDeliverable.title}</p>
              </div>
              <button onClick={() => setSelectedDeliverable(null)} className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>✕</button>
            </div>
            {selectedDeliverable.render_html ? (
              <iframe
                srcDoc={selectedDeliverable.render_html}
                sandbox="allow-scripts"
                className="w-full"
                style={{ height: 480, border: 'none', display: 'block' }}
                title={selectedDeliverable.title}
              />
            ) : (
              <div className="px-5 py-8 text-center text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No preview available</div>
            )}
          </div>
        </div>
      )}

      {/* Main chat — subtle mood tint based on time of day */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ position: 'relative', background: (() => { const h = new Date().getHours(); if (h < 6) return '#0a0a12'; if (h < 12) return '#0d0f14'; if (h < 17) return '#0d0d14'; if (h < 20) return '#0e0c13'; return '#0b0b14'; })() }}>
        {/* Aria floating avatar — absolute inside chat col, bottom-right corner
            Opposite side from Briefing button (top-right in header).
            Hidden when idle (opacity 0), visible + looping only while text streams. */}
        {ariaVideoUrl && (
          <div style={{
            position: 'absolute',
            bottom: 80,
            right: 20,
            width: 96,
            height: 130,
            zIndex: 20,
            pointerEvents: 'none',
            opacity: isAriaActive ? 1 : 0.35,
            transition: 'opacity 0.25s ease',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 78% at 50% 42%, black 20%, transparent 68%)',
            maskImage: 'radial-gradient(ellipse 75% 78% at 50% 42%, black 20%, transparent 68%)',
          }}>
            <video
              ref={videoRef}
              src={ariaVideoUrl}
              muted
              playsInline
              loop
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
            />
          </div>
        )}
        {/* Sound bars above avatar, only while speaking */}
        {ariaVideoUrl && isAriaActive && (
          <div style={{
            position: 'absolute',
            bottom: 68,
            right: 36,
            zIndex: 21,
            display: 'flex',
            gap: 2,
            alignItems: 'flex-end',
            height: 10,
            pointerEvents: 'none',
          }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 2,
                borderRadius: 2,
                background: '#7FB897',
                height: [5,9,7,8][i],
                animation: `ariaBar${i} 0.5s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.12}s`,
              }} />
            ))}
          </div>
        )}
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(v => !v)}
              title="Chat history"
              aria-label="Toggle chat history"
            className="w-11 h-11 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: showHistory ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', color: showHistory ? '#7FB897' : 'rgba(255,255,255,0.5)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <div>
              <h1 className="font-semibold text-lg leading-tight" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(127,184,151,0.13)', border: '1px solid rgba(127,184,151,0.28)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 15, color: '#7FB897', flexShrink: 0 }}>A</span>
            Aria
          </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, rgba(255,255,255,0.55))' }}>
                AI advisor for {business?.name ?? 'your business'}
                {' · '}
                <span className="text-[#7FB897]">{business?.data_source === 'square' ? 'Square data' : 'Aria POS data'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/ask-aria/intelligence"
              className="text-xs px-3 rounded-lg transition-colors inline-flex items-center"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', minHeight: 36 }}
              title="Intelligence settings">
              ✦ Intel
            </Link>
            {messages.length > 0 && (
              <button onClick={newConversation}
                className="text-xs px-3 rounded-lg transition-colors inline-flex items-center"
                style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', minHeight: 36 }}>
                New chat
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && input.length === 0 && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-12 h-12 rounded-full bg-[rgba(127,184,151,0.15)] flex items-center justify-center mx-auto mb-3">
                  <span className="text-[#7FB897] font-bold text-lg">A</span>
                </div>
                <div style={{ opacity: greetingReady ? 1 : 0, transition: 'opacity 0.8s ease', transform: greetingReady ? 'translateY(0)' : 'translateY(8px)', transitionProperty: 'opacity, transform' }}>
                <p className="text-white font-medium mb-1">
                  Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with?
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  I use connected business data when it exists, and I will say exactly what is missing when it does not.
                </p>
                </div>
              </div>
              {messages.length === 0 && (
            <div style={{ paddingBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 22, color: '#7FB897', flexShrink: 0 }}>A</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Aria</div>
                  <div style={{ fontSize: 11, color: 'rgba(127,184,151,0.75)', marginTop: 1 }}>Your business co-operator · always on</div>
                </div>
              </div>
              <div style={{ opacity: greetingReady ? 1 : 0, transition: 'opacity 0.8s ease', transform: greetingReady ? 'translateY(0)' : 'translateY(8px)', transitionProperty: 'opacity, transform' }}>
                <AriaGreeting business={business} />
              </div>
            </div>
          )}
          <ChatSuggestions onSelect={send} disabled={sending} />
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
              <div className="w-full md:max-w-3xl">
                <div className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                  style={m.role === 'user'
                    ? { background: '#2D5240', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px' }}>
                  {m.streaming && !m.content
                    ? councilThinking
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '4px 0' }}>
                          {['Growth brain reading...', 'Risk brain checking...', 'Strategy brain weighing...', 'Synthesising...'].map((step, si) => (
                            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'rgba(255,255,255,0.4)' }}>
                              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #7FB897', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                              {step}
                            </div>
                          ))}
                        </div>
                      )
                      : <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#7FB897] animate-pulse" /><span className="opacity-60">Thinking…</span></span>
                    : m.blocks && m.blocks.length > 0
                      ? (
                        <div>
                          {m.blocks.map((block, bi) => (
                            <BlockRenderer key={bi} block={block} onChoice={(prompt) => { send(prompt) }} />
                          ))}
                          {(m.followups ?? []).length > 0 && (
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
                              {(m.followups ?? []).map((fup, fi) => (
                                <button key={fi} onClick={() => { send(fup) }}
                                  style={{ padding: '6px 10px', minHeight: 32, borderRadius: 14, border: '0.5px solid rgba(127,184,151,0.2)', background: 'rgba(127,184,151,0.05)', color: '#7FB897', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  {fup}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    : m.role === 'assistant' && m.content
                      ? parseAriaResponse(
                          // Always strip raw supabase storage URLs and markdown links pointing to them
                          // They show as download cards instead
                          m.content
                            .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*supabase[^)]+\)/g, '')
                            .replace(/https?:\/\/[^\s]*supabase[^\s]*/g, '')
                            .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, (_, txt) =>
                              // Keep non-storage links as clickable text
                              txt.includes('Download') || txt.includes('download') ? '' : txt
                            )
                            .replace(/\n\s*\n\s*\n/g, '\n\n').trim()
                        ).map((seg, si) =>
                          seg.kind === 'text'
                            ? <AriaMarkdown key={si} text={seg.content} />
                            : <AriaArtifact key={si} type={seg.type} title={seg.title} data={seg.data} />
                        )
                      : m.content}
                </div>
                {m.role === 'assistant' && m.action && <ActionCard action={m.action} />}
                {m.role === 'assistant' && !m.streaming && m.deliverable && (
                  <DeliverableToolbar deliverable={m.deliverable} />
                )}
                {m.role === 'assistant' && m.downloads && m.downloads.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.downloads.map((dl, di) => (
                      dl.format === 'png' || dl.format === 'jpg' || dl.format === 'jpeg' ? (
                        // Image preview
                        <div key={di} className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(127,184,151,0.3)' }}>
                          <img src={dl.download_url} alt={dl.filename} className="w-full max-w-md" />
                          <a href={dl.download_url} download={dl.filename} className="block px-3 py-2 text-xs flex justify-between items-center"
                            style={{ background: 'rgba(127,184,151,0.08)', color: '#7FB897', textDecoration: 'none' }}>
                            <span>🖼 {dl.filename}</span>
                            <span className="px-2 py-1 rounded text-[10px]" style={{ background: 'rgba(127,184,151,0.15)' }}>↓ Download</span>
                          </a>
                        </div>
                      ) : (
                        <a key={di} href={dl.download_url} download={dl.filename} target="_blank" rel="noopener"
                          className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:scale-[1.01]"
                          style={{ background: 'rgba(127,184,151,0.08)', borderColor: 'rgba(127,184,151,0.3)', color: '#7FB897', textDecoration: 'none' }}>
                          <span className="text-xl">{dl.format === 'csv' ? '📄' : dl.format === 'html' || dl.format === 'pdf' ? '📑' : '📊'}</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold">{dl.filename}</p>
                            <p className="text-xs opacity-70">{dl.rows > 0 ? `${dl.rows} rows · ` : ''}click to {dl.format === 'html' ? 'open' : 'download'}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(127,184,151,0.15)' }}>↓</span>
                        </a>
                      )
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && !m.streaming && (
                  <p className="text-[10px] mt-1 px-1 opacity-40">
                    🔧 {m.tool_calls.map(t => t.name).join(', ')}
                  </p>
                )}
                {m.role === 'assistant' && !m.streaming && m.model_used && (
                  <p className="text-[9px] mt-1 px-1 opacity-50">
                    {m.model_used === 'haiku' ? '⚡ Fast response' : m.model_used === 'sonnet' ? '🧠 Deep analysis' : '🔬 Expert analysis'}
                  </p>
                )}
                {m.role === 'assistant' && !m.streaming && m.content && <CopyButton text={m.content} />}
                <p className="text-[9px] mt-1 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {m.intent && m.role === 'assistant' && <span className="ml-2 opacity-50">{m.intent}</span>}
                </p>
              </div>
            </div>
          ))}
          {/* Pending action confirmation card */}
          {pendingAction && (
            <div className="max-w-2xl w-full mx-auto">
              <ActionPreviewCard
                action={pendingAction}
                onConfirm={confirmAction}
                onCancel={cancelAction}
                loading={confirmingAction}
              />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Audit log collapsible */}
        {messages.length > 0 && (
          <div className="px-6 border-t flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setShowAudit(v => !v)}
              className="w-full flex items-center justify-between py-2 text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              <span>Recent actions</span>
              <span>{showAudit ? '▲' : '▼'}</span>
            </button>
            {showAudit && (
              <div className="pb-3">
                <AuditLogCard />
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-4 border-t flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.xlsx,.xls,.csv,.txt,.md,.json"
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? []).slice(0, 5)
              if (files.length > 0) setAttachedFiles(prev => [...prev, ...files].slice(0, 5))
              if (e.target) e.target.value = ''
            }}
          />

        {/* Aria avatar */}
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: 120, zIndex: 50, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, overflow: 'visible' }}>
          <AriaSpeechBubble business={business} show={greetingReady} />
          <div style={{ width: 120, height: 160, opacity: avatarMounted ? 1 : 0, transition: 'opacity 0.4s ease', overflow: 'visible' }}>
            <AriaTalkingHead mode={isAriaActive ? 'talking' : 'idle'} replyText={ariaResponseText ?? ''} />
          </div>
        </div>
          {attachedFiles.length > 0 && (
            <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
              {attachedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.25)', color: '#7FB897' }}>
                  <span>{f.type.startsWith('image/') ? '🖼' : f.type === 'application/pdf' ? '📄' : f.name.match(/\.(xlsx|xls|csv)$/i) ? '📊' : '📎'}</span>
                  <span className="truncate max-w-[200px]">{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="opacity-60 hover:opacity-100">✕</button>
                </div>
              ))}
            </div>
          )}
          {/* Skill picker — chip strip + modal. Active skills stack into Aria's system prompt. */}
          <div className="w-full md:max-w-3xl md:mx-auto mb-2">
            <SkillPicker />
          </div>
          <div className="flex gap-2 w-full md:max-w-3xl md:mx-auto items-end">
            <VoiceInput onTranscript={t => { setInput(p => p ? `${p} ${t}` : t) }} disabled={sending} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach files (images, PDFs, spreadsheets) — Aria will analyse them"
              aria-label="Attach files"
            className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 relative"
              style={{ background: attachedFiles.length > 0 ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${attachedFiles.length > 0 ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)'}`, color: attachedFiles.length > 0 ? '#7FB897' : 'rgba(255,255,255,0.5)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {attachedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ background: '#7FB897', color: '#13131a' }}>
                  {attachedFiles.length}
                </span>
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', maxHeight: '120px' }}
            />
            <button
              onClick={() => send()}
              disabled={sending || (!input.trim() && attachedFiles.length === 0)}
              className="px-5 py-3 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40 flex-shrink-0"
              style={{ background: '#2D5240', color: '#fff' }}
            >
              {sending
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : 'Send'}
            </button>
          </div>
          <p className="text-center text-[10px] mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Aria uses connected records only. It will not invent missing sales, stock, customer, supplier or margin data.
          </p>
        </div>
      </div>
    </div>
  )
}

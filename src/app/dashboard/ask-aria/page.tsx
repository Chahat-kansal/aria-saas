'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { showAriaBriefing } from '@/components/dashboard/DailyBriefingModal'
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
import { SaveToFilesButton } from '@/components/dashboard/SaveToFilesButton'

import { readAriaSse, isEventStream } from '@/lib/aria/ask-sse'
import { STREAM_STALL_MS, classifyChatError } from '@/lib/aria/chat-errors'

const AriaTalkingHead = dynamic(() => import('@/components/aria/AriaTalkingHead'), { ssr: false })
const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false })

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:         '#0a0f0d',
  surface:    '#0c1411',
  surfaceEl:  '#111916',
  sidebarBg:  '#0b100e',
  border:     'rgba(127,184,151,0.12)',
  borderMd:   'rgba(127,184,151,0.22)',
  sage:       '#7FB897',
  forest:     '#2D5240',
  textPri:    '#f0f0f5',
  textSec:    'rgba(255,255,255,0.55)',
  textMut:    'rgba(255,255,255,0.3)',
  textDim:    'rgba(255,255,255,0.15)',
  red:        '#E24B4A',
  amber:      '#BA7517',
  display:    'var(--font-display), Cormorant, Georgia, serif',
  body:       'var(--font-body), Outfit, Inter, sans-serif',
} as const

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

interface Vitals { revenue_today: number | null; tx_count_today: number | null }

// ── Helper components ─────────────────────────────────────────────────────────

function MessageActions({
  msg,
  onRegenerate,
}: {
  msg: Message
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-2">
      <button
        onClick={() => {
          navigator.clipboard.writeText(msg.content)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border, fontSize: 11, color: T.textMut, cursor: 'pointer', fontFamily: T.body }}
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          style={{ padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border, fontSize: 11, color: T.textMut, cursor: 'pointer', fontFamily: T.body }}
        >
          Regenerate
        </button>
      )}
    </div>
  )
}

function DocumentResultCard({ doc }: { doc: DocumentReadResult }) {
  const TYPE_LABEL: Record<string, string> = { invoice: 'Invoice', receipt: 'Receipt', product_list: 'Product List', unknown: 'Document' }
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid ' + T.borderMd, background: 'rgba(127,184,151,0.04)' }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '1px solid ' + T.border }}>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(127,184,151,0.15)', color: T.sage }}>
          {TYPE_LABEL[doc.type] ?? 'Document'}
        </span>
        {doc.supplier && <span className="text-xs" style={{ color: T.textSec }}>{doc.supplier}</span>}
        {doc.date && <span className="text-xs" style={{ color: T.textMut }}>{doc.date}</span>}
        {doc.total != null && <span className="text-xs ml-auto font-medium" style={{ color: T.textPri, fontFamily: T.display, fontStyle: 'italic', fontSize: 14 }}>${doc.total.toFixed(2)}</span>}
      </div>
      {doc.line_items.length > 0 && (
        <div className="px-4 py-2">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ color: T.textMut }}>
                <th className="text-left pb-2 font-normal">Item</th>
                <th className="text-right pb-2 font-normal">Qty</th>
                <th className="text-right pb-2 font-normal">Unit</th>
                <th className="text-right pb-2 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.line_items.slice(0, 10).map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', color: T.textPri }}>
                  <td className="py-1.5 pr-2">{item.name}</td>
                  <td className="py-1.5 text-right">{item.quantity ?? '—'}</td>
                  <td className="py-1.5 text-right">{item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : '—'}</td>
                  <td className="py-1.5 text-right">{item.total != null ? `$${item.total.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 pb-3 pt-1">
        <p className="text-xs italic" style={{ color: T.textMut }}>{doc.suggested_action}</p>
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: MessageAction }) {
  if (!action) return null
  if (action.type === 'export') {
    return (
      <a href={action.url} download={action.filename}
        className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-opacity hover:opacity-80"
        style={{ background: 'rgba(45,82,64,0.2)', border: '1px solid rgba(45,82,64,0.4)', color: T.sage, textDecoration: 'none' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Download {action.filename} <span style={{ opacity: 0.5 }}>({action.row_count} rows)</span></span>
      </a>
    )
  }
  if (action.type === 'escalate') {
    return (
      <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
        style={{ background: 'rgba(226,75,74,0.07)', border: '1px solid rgba(226,75,74,0.18)', color: '#fca5a5' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Support ticket created (#{action.ticket_id.slice(0, 8)})
      </div>
    )
  }
  if (action.type === 'execution_result') {
    return (
      <div className="mt-3 px-4 py-2.5 rounded-xl text-xs"
        style={{
          background: action.ok ? 'rgba(34,197,94,0.06)' : 'rgba(226,75,74,0.06)',
          border: '1px solid ' + (action.ok ? 'rgba(34,197,94,0.18)' : 'rgba(226,75,74,0.18)'),
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

  useEffect(() => {
    if (!show) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 30000)
    return () => clearTimeout(t)
  }, [show])

  return (
    <div style={{
      maxWidth: 180,
      background: 'rgba(12,20,17,0.97)',
      border: '1px solid ' + T.borderMd,
      borderRadius: '14px 14px 4px 14px',
      padding: '10px 13px',
      fontSize: 12,
      color: T.textPri,
      lineHeight: 1.55,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.96)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
      pointerEvents: visible ? 'auto' : 'none',
      fontFamily: T.body,
    }}>
      <span style={{ color: T.sage, fontWeight: 600 }}>Hi{name ? `, ${name}` : ''}!</span>
      {' '}I&apos;m Aria — your AI business co-operator. What can I help you with today?
    </div>
  )
}

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
    <p style={{ fontSize: 16, color: T.textSec, lineHeight: 1.65, margin: 0, maxWidth: 500, fontFamily: T.body }}>
      {opener}
    </p>
  )
}

function AriaMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <span className="whitespace-pre-wrap">
      {lines.map((line, li) => {
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
            parts.push(<em key={key++} style={{ fontStyle: 'italic', color: T.textSec }}>{italicMatch[2]}</em>)
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

function DeliverableToolbar({ deliverable, summaryText }: { deliverable: DeliverableInfo; summaryText?: string }) {
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
      if (data.pdf_url) { window.open(data.pdf_url, '_blank'); setStatus('PDF ready') }
      else setStatus(data.error ?? 'PDF export failed')
    } catch (e) { setStatus((e as Error).message) }
    finally { setPdfLoading(false) }
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
    } catch (e) { setStatus((e as Error).message) }
    finally { setEmailLoading(false) }
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
      if (res.ok) { setStatus('Scheduled'); setScheduleOpen(false) }
      else setStatus('Schedule failed')
    } catch { setStatus('Schedule failed') }
    finally { setSchedSaving(false) }
  }

  const btnBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors'
  const btnStyle = { background: 'rgba(255,255,255,0.04)', color: T.textMut, border: '1px solid ' + T.border }
  const btnActiveStyle = { background: 'rgba(127,184,151,0.1)', color: T.sage, border: '1px solid ' + T.borderMd }

  return (
    <div className="mt-3">
      {view === 'chart' && deliverable.html && (
        <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid ' + T.border }}>
          <iframe
            srcDoc={deliverable.html}
            sandbox="allow-scripts"
            className="w-full"
            style={{ height: 360, border: 'none', display: 'block' }}
            title={deliverable.title}
          />
        </div>
      )}
      {view === 'summary' && (
        <div className="rounded-xl p-4 mb-3 text-sm leading-relaxed" style={{ border: '1px solid ' + T.border, color: T.textSec, background: 'rgba(255,255,255,0.02)', whiteSpace: 'pre-wrap' }}>
          {summaryText
            ? summaryText
            : <span style={{ color: T.textMut, fontStyle: 'italic' }}>No written summary — switch to Chart view to see the visual.</span>}
        </div>
      )}
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
          {pdfLoading ? 'Exporting…' : 'PDF'}
        </button>
        <button className={btnBase} style={emailLoading ? btnActiveStyle : btnStyle} onClick={sendEmail} disabled={emailLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><path strokeLinecap="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          {emailLoading ? 'Sending…' : 'Email'}
        </button>
        {/* CANOPY-REPORTS-AS-FILES-1 — grounded 'verified': this deliverable's numbers were pulled
            directly from live pos_sales/pos_sale_items/pos_customers queries (see
            src/lib/aria/deliverables.ts's fetch*Data functions), not an AI estimate. */}
        <SaveToFilesButton className={btnBase} style={btnStyle}
          sourceKind="ask_aria_deliverable" sourceId={deliverable.id} title={deliverable.title} grounding="verified" />
        <button className={btnBase} style={scheduleOpen ? btnActiveStyle : btnStyle} onClick={() => setScheduleOpen(v => !v)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3"><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M16 2v4M8 2v4M3 10h18"/></svg>
          Schedule
        </button>
      </div>
      {scheduleOpen && (
        <div className="mt-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + T.border }}>
          <p className="text-xs font-medium mb-2" style={{ color: T.textPri }}>Schedule recurring delivery</p>
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
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid ' + T.border, color: T.textPri, fontFamily: T.body }}
          />
          <button onClick={saveSchedule} disabled={schedSaving || !schedEmail.trim()}
            className="px-4 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
            style={{ background: T.forest, color: '#fff' }}>
            {schedSaving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      )}
      {status && (
        <p className="mt-1.5 text-xs" style={{ color: status.includes('fail') || status.includes('error') ? T.red : T.sage }}>
          {status}
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
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
  const [pendingActionProposeOnly, setPendingActionProposeOnly] = useState(false)
  const [showForkCard, setShowForkCard] = useState(false)
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
  const [vitals, setVitals] = useState<Vitals | null>(null)
  const [degradedNote, setDegradedNote] = useState<string | null>(null)
  const [degradedOutage, setDegradedOutage] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setGreetingReady(true), 7500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setAvatarMounted(true), 150)
    return () => clearTimeout(t)
  }, [])

  // Load today's live vitals for context strip
  useEffect(() => {
    fetch('/api/aria/vitals').then(r => r.json()).then((d: Vitals) => setVitals(d)).catch(() => {})
  }, [])

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ariaVideoUrl] = useState<string>(process.env.NEXT_PUBLIC_ARIA_VIDEO_URL ?? 'https://tcowd5vdie4rwa2o.public.blob.vercel-storage.com/50071.mp4')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

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
    } catch (e) { console.error('[non-fatal]', e) }
  }, [])

  const loadDeliverables = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/deliverables')
      if (res.ok) {
        const data = await res.json() as { deliverables?: DeliverableRecord[] }
        setDeliverables(data.deliverables ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
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
        let downloads: Array<{ filename: string; download_url: string; rows: number; format: string }> = m.downloads ?? []
        if (downloads.length === 0 && m.role === 'assistant') {
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
    } catch (e) { console.error('[non-fatal]', e) }
  }, [])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if ((!msg && attachedFiles.length === 0) || sending) return

    setInput('')
    setAriaResponseText('') // stop any active avatar speech when user sends
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

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let res: Response
      if (filesToSend.length > 0) {
        const fd = new FormData()
        fd.append('message', msg || 'Please analyse the attached file(s).')
        if (conversationId) fd.append('conversation_id', conversationId)
        for (const f of filesToSend) fd.append('files', f)
        res = await fetch('/api/aria/ask', { method: 'POST', body: fd, signal: controller.signal })
      } else {
        res = await fetch('/api/aria/ask', {
          method: 'POST',
          // MS16 PHASE 4 — ask for tokens as they are produced. The route falls back to the
          // buffered JSON body for any client that does not send this header, so nothing that
          // called this endpoint before behaves differently.
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ message: msg, conversation_id: conversationId }),
          signal: controller.signal,
        })
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error ?? `Request failed (${res.status})`)
      }

      type AskPayload = {
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
        degraded_provider?: boolean
        note?: string
        total_outage?: boolean
        cached?: boolean
      }

      // MS16 PHASE 4 — STREAMING IS THE HEADLINE. Aria used to buffer the entire answer and dump it
      // in one go; her words now land as she produces them. The `done` frame carries the same
      // payload the buffered response always did, so every branch below is untouched — blocks,
      // downloads, actions, deliverables and the council flag all still arrive exactly as before.
      let data: AskPayload
      if (isEventStream(res)) {
        // ── S4 PHASE 1 — THE WATCHDOG. THIS IS WHY SEND STOPPED SENDING. ──────────────────────
        //
        // This `await` had no timer. If the stream opened and then went silent — which is exactly
        // what a provider failure looks like from here, and Anthropic has been rejecting this
        // deployment's key for 24h — the promise NEVER SETTLED. So:
        //
        //   · the `finally` below never ran, so `sending` stayed true FOREVER;
        //   · the assistant bubble stayed `streaming: true`, cursor blinking, Stop button live;
        //   · and every subsequent send hit `if (... || sending) return` at the top of send()
        //     and returned WITHOUT FETCHING.
        //
        // That is the reported symptom exactly: a streaming UI with no request in flight, and no
        // POST to /api/aria/ask in the logs — because after the first hung send there genuinely
        // were none. One stuck boolean silenced the whole product.
        //
        // S1 phase 7 built this watchdog for the /ax surface (useAriaStream). It was never given
        // to THIS surface, which is the one the owner actually loads. Same mechanism, same shared
        // STREAM_STALL_MS — extended, not reimplemented.
        let stallTimer: ReturnType<typeof setTimeout> | undefined
        let stalled = false
        const kick = () => {
          if (stallTimer) clearTimeout(stallTimer)
          stallTimer = setTimeout(() => { stalled = true; controller.abort() }, STREAM_STALL_MS)
        }
        kick()
        try {
          data = await readAriaSse<AskPayload>(res, {
            onText: (full) => {
              kick()
              setMessages(prev => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last?.role === 'assistant' && last.streaming) {
                  updated[updated.length - 1] = { ...last, content: full }
                }
                return updated
              })
            },
          })
        } finally {
          if (stallTimer) clearTimeout(stallTimer)
        }
        // A watchdog abort is NOT the owner pressing Stop. Thrown so the catch below reports a
        // real, retryable error instead of a silent "— stopped —" the owner never asked for.
        if (stalled) throw new Error('Aria stopped responding. Nothing was lost — try again.')
      } else {
        // Older deploy, a proxy that strips the content type, or the file-upload path.
        data = await res.json() as AskPayload
      }

      if (data.conversation_id) setConversationId(data.conversation_id)

      // API-RESILIENCE-1 / 1B — Anthropic (or all providers) down. Backup = amber, total outage = red.
      if (data.total_outage) {
        setDegradedOutage(true)
        setDegradedNote('All AI providers briefly offline — your business data and POS are safe and working. Aria\'s chat will return shortly.')
      } else if (data.degraded_provider) {
        setDegradedOutage(false)
        setDegradedNote(data.note ?? 'Aria is running on backup intelligence — answers use your latest saved data. Full live lookups back shortly.')
      }

      if ((data.action?.action === 'preview' || data.action?.action === 'fork') && data.action.planned) {
        setPendingAction(data.action.planned as PlannedAction)
        setPendingActionProposeOnly(Boolean((data.action as Record<string, unknown>).propose_only))
        setShowForkCard(true)
      }

      const msgAction: MessageAction = (() => {
        const a = data.action
        if (!a) return null
        if (a.action === 'preview' || a.action === 'fork') return { type: 'action_preview', planned: a.planned as PlannedAction }
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

      // Trigger avatar speech — first sentence or up to 150 words
      const rawResponse = (data.response ?? '').replace(/\s*\[DELIVERABLE:[^\]]+\]\s*/g, '').trim()
      if (rawResponse) {
        const firstSentence = rawResponse.match(/^[^.!?]+[.!?]/)?.[0] ?? rawResponse.slice(0, 300)
        setAriaResponseText(firstSentence.trim())
      }

      loadHistory()
      if (data.intent === 'deliverable') loadDeliverables()
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('abort'))) {
        setMessages(prev => {
          const updated = [...prev]
          const last = updated[updated.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            updated[updated.length - 1] = { ...last, content: last.content || '— stopped —', streaming: false }
          }
          return updated
        })
        return
      }
      // S4 PHASE 2 — A FAILED TURN MUST READ AS FAILED, AND SAY WHETHER TRYING AGAIN IS WORTH IT.
      //
      // This rendered `Something went wrong: <raw provider error>` — the model vendor's words,
      // shown to a cafe owner, with no indication of what to do. classifyChatError is S1's
      // existing classifier (chat-errors.ts) and is REUSED here rather than a second set of
      // messages being written for this surface: a credit failure reads as a credit failure and
      // does NOT invite a pointless retry, while a rate limit or a timeout says to try again.
      //
      // `streaming: false` is set in every terminal path. A bubble left streaming is
      // indistinguishable from Aria thinking — which is exactly why a hung request went unnoticed
      // for a day. Nothing on screen ever said it had stopped.
      const classified = classifyChatError(err)
      console.error('[ask-aria] turn failed:', classified.kind, classified.detail ?? classified.message)
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: classified.message, streaming: false }
        }
        return updated
      })
    } finally {
      setSending(false)
      setCouncilThinking(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }, [input, sending, conversationId, loadHistory, loadDeliverables])

  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).ariaSendPrompt = (prompt: string) => { send(prompt) }
    return () => { delete (window as unknown as Record<string, unknown>).ariaSendPrompt }
  }, [send])

  const regenerate = useCallback(() => {
    const msgs = messages
    let lastUserIdx = -1
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break }
    }
    if (lastUserIdx === -1) return
    const userText = msgs[lastUserIdx].content
    setMessages(msgs.slice(0, lastUserIdx + 1))
    send(userText)
  }, [messages, send])

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
    setMessages(prev => [...prev, { role: 'user', content: 'Yes, go ahead.', timestamp: new Date() }])
    try {
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'confirm', conversation_id: conversationId }),
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
      setPendingActionProposeOnly(false)
      setShowForkCard(false)
      loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => [...prev, { role: 'assistant', content: `Action failed: ${msg}`, timestamp: new Date() }])
      setPendingAction(null)
      setPendingActionProposeOnly(false)
      setShowForkCard(false)
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
    setPendingActionProposeOnly(false)
    setShowForkCard(false)
    setMessages(prev => [...prev, { role: 'assistant', content: 'Action cancelled.', timestamp: new Date() }])
  }, [conversationId])

  const savePlanAction = useCallback(async () => {
    if (!conversationId) return
    setConfirmingAction(true)
    try {
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '[ARIA_SAVE_PLAN]', conversation_id: conversationId }),
      })
      const data = await res.json() as { response?: string; conversation_id?: string }
      if (data.conversation_id) setConversationId(data.conversation_id)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response ?? 'Plan saved.', timestamp: new Date() }])
    } catch (_e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Could not save plan — please try again.', timestamp: new Date() }])
    } finally {
      setPendingAction(null)
      setPendingActionProposeOnly(false)
      setShowForkCard(false)
      setConfirmingAction(false)
    }
  }, [conversationId])

  function newConversation() {
    setMessages([])
    setConversationId(null)
    setInput('')
    setPendingAction(null)
    inputRef.current?.focus()
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      if (e.shiftKey) return
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); send(); return }
      e.preventDefault()
      send()
    }
  }

  void briefingCollapsed
  void setBriefingCollapsed
  void ChartBlock

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: T.sage + ' transparent transparent transparent' }} />
      </div>
    )
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div style={{ height: '100%', overflow: 'hidden', position: 'relative', fontFamily: T.body }}>
      {/* API-RESILIENCE-1/1B — resilience banner (dismissable). Amber = on backup providers;
          red = total outage (all providers down). Both reassure that POS/data are unaffected. */}
      {degradedNote && (() => {
        const c = degradedOutage ? '#E24B4A' : '#BA7517'
        const bg = degradedOutage ? 'rgba(226,75,74,0.12)' : 'rgba(186,117,23,0.12)'
        const bd = degradedOutage ? 'rgba(226,75,74,0.35)' : 'rgba(186,117,23,0.35)'
        return (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: bg, borderBottom: '1px solid ' + bd, color: c, fontSize: 12.5, fontWeight: 600, fontFamily: T.body }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{degradedOutage ? '◉' : '⚡'}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{degradedNote}</span>
            <button onClick={() => setDegradedNote(null)} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: c, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}>×</button>
          </div>
        )
      })()}
      <style>{`
        @keyframes ariaBar0 { from { height: 4px; opacity: 0.4; } to { height: 9px; opacity: 1; } }
        @keyframes ariaBar1 { from { height: 9px; opacity: 1; } to { height: 3px; opacity: 0.3; } }
        @keyframes ariaBar2 { from { height: 5px; opacity: 0.5; } to { height: 8px; opacity: 0.9; } }
        @keyframes ariaBar3 { from { height: 7px; opacity: 0.6; } to { height: 4px; opacity: 0.4; } }
        @keyframes blinkCaret { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes msgIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes haloSpin { to { transform: rotate(360deg); } }
        /* AN-B spell 3 modal-spring: panel entrance pop-spring */
        @keyframes anModalSpring { 0% { opacity: 0; transform: scale(.94) } 60% { opacity: 1; transform: scale(1.02) } 100% { transform: scale(1) } }
        .an-modal-spring { animation: anModalSpring .55s cubic-bezier(.34,1.56,.64,1) both }
        /* AN-B spell 2 listening-ring: expanding ring around orb only in listening state */
        @keyframes anListeningRing { 0% { transform: scale(.85); opacity: .55 } 100% { transform: scale(1.25); opacity: 0 } }
        .an-listening-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid rgba(127,184,151,.55); pointer-events: none; animation: anListeningRing 1.6s ease-out infinite }
        .an-listening-ring.delay { animation-delay: .8s }
        /* AN-E spell 19 bottom-sheet: composer slides up from below on mobile only */
        @keyframes anBottomSheetIn { 0% { transform: translateY(100%); opacity: 0 } 70% { transform: translateY(-4px); opacity: 1 } 100% { transform: translateY(0) } }
        @media (max-width: 767px) {
          .an-bottom-sheet { animation: anBottomSheetIn .55s cubic-bezier(.34,1.56,.64,1) both; will-change: transform }
        }
        @media (prefers-reduced-motion: reduce) {
          .msg-reveal { animation: none !important; }
          .an-modal-spring { animation: none !important; }
          .an-listening-ring { animation: none !important; opacity: 0 !important; }
          .an-bottom-sheet { animation: none !important; }
        }
        @media (max-width: 1023px) {
          .aria-split-grid { grid-template-columns: 1fr !important; grid-template-rows: auto 1fr !important; }
          .aria-left-panel { flex-direction: row !important; padding: 10px 14px !important; gap: 10px !important; min-height: 60px !important; overflow: hidden !important; flex-shrink: 0 !important; }
          .aria-left-speech, .aria-left-avatar, .aria-left-kpi { display: none !important; }
          .aria-left-topbar { flex: 1; min-width: 0; }
        }
        @media (max-width: 767px) {
          .aria-avatar-float { bottom: 160px !important; z-index: 10 !important; }
          .aria-avatar-float * { pointer-events: none !important; }
        }
        @media (min-width: 1024px) {
          .aria-avatar-float { display: none !important; }
        }
      `}</style>

      {/* ── Split-screen grid ── */}
      <div className="aria-split-grid an-modal-spring" style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 420px) 1fr', height: '100%', overflow: 'hidden' }}>

        {/* ══ LEFT PANEL — clay-glass-bento ══ */}
        <div className="aria-left-panel" style={{
          background: '#f3eee5',
          backgroundImage: 'radial-gradient(ellipse at 15% 20%, rgba(127,184,151,0.14), transparent 50%), radial-gradient(ellipse at 85% 80%, rgba(180,160,220,0.12), transparent 50%)',
          display: 'flex', flexDirection: 'column', gap: 16, padding: 24, overflowY: 'auto',
        }}>
          {/* Top bar */}
          <div className="aria-left-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: 50, padding: '6px 14px 6px 8px', boxShadow: '0 3px 8px rgba(45,82,64,0.08), inset 0 1px 2px rgba(255,255,255,0.9)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', boxShadow: '0 0 6px #1D9E75', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2D5240' }}>{business?.name ?? 'Business'}</span>
              <span style={{ fontSize: 11, color: '#7FB897' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => showAriaBriefing()} style={{ fontSize: 12, fontWeight: 500, color: '#2D5240', background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 10, padding: '6px 14px', backdropFilter: 'blur(8px)', cursor: 'pointer' }}>Briefing</button>
              <Link href="/dashboard/autopilot" style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#2D5240', border: '1px solid rgba(45,82,64,0.5)', borderRadius: 10, padding: '6px 14px', textDecoration: 'none' }}>+ New action</Link>
            </div>
          </div>

          {/* Speech card */}
          {(() => {
            const lastA = [...messages].reverse().find(m => m.role === 'assistant' && m.content && !m.streaming)
            const raw = lastA ? lastA.content.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/#+\s/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') : `${greeting}, ${business?.owner_name?.split(' ')[0] ?? 'there'}. I have your business data ready.`
            const snippet = (raw.match(/^[^.!?]+[.!?]/)?.[0] ?? raw.slice(0, 160)).trim()
            // SEC-HTML-2 — ESCAPE FIRST, then add our own markup, so the <span> below is the only
            // markup in the string. `snippet` is Aria's own output, and this is where the #12 chain
            // lands: attacker text reaches aria_actions, Aria reads it, and it renders in the
            // owner's dashboard. Previously nothing escaped it before the wrap. Same order as
            // Canvas.tsx's markdownToHtml, which is why that one was never a finding.
            const escaped = snippet
              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            const html = escaped.replace(/(\$[\d,.]+)/g, '<span style="color:#2D5240;font-weight:500">$1</span>')
            return (
              <div className="aria-left-speech" style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: '6px 26px 26px 26px', padding: '14px 18px', boxShadow: '0 10px 30px rgba(45,82,64,0.10), 0 3px 8px rgba(45,82,64,0.06), inset 0 2px 4px rgba(255,255,255,0.9), inset 0 -2px 6px rgba(45,82,64,0.04)', fontSize: 14, lineHeight: 1.65, color: '#2D5240', flexShrink: 0 }}>
                <span dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            )
          })()}

          {/* Avatar zone */}
          <div className="aria-left-avatar" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 0 }}>
            <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* AN-B spell 2 listening-ring — only while Aria is in the existing "listening" state */}
              {!isAriaActive && !sending && <span className="an-listening-ring" aria-hidden />}
              {!isAriaActive && !sending && <span className="an-listening-ring delay" aria-hidden />}
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '1.5px dashed rgba(90,138,110,0.3)', animation: 'haloSpin 24s linear infinite' }} />
              <div style={{ width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 10px 40px rgba(45,82,64,0.15), inset 0 2px 4px rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{ width: 120, height: 160, marginTop: -20 }}>
                  {avatarMounted && <AriaTalkingHead mode={isAriaActive ? 'talking' : 'idle'} replyText={ariaResponseText ?? ''} />}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', gap: 2.5, alignItems: 'flex-end', height: 12 }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ width: 2.5, borderRadius: 2, background: '#5a8a6e', height: [5,9,7,10,6][i], animation: isAriaActive ? `ariaBar${i % 4} 0.5s ease-in-out infinite alternate` : 'none', animationDelay: (i * 0.1) + 's', opacity: isAriaActive ? 1 : 0.35 }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: '#7FB897', fontWeight: 500 }}>{sending ? 'Aria is thinking' : isAriaActive ? 'Aria is speaking' : 'Aria is listening'}</span>
            </div>
          </div>

          {/* KPI bento row */}
          <div className="aria-left-kpi" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flexShrink: 0 }}>
            {[
              { label: "Today's Revenue", value: vitals?.revenue_today != null ? `$${Math.round(vitals.revenue_today).toLocaleString()}` : '—' },
              { label: 'Orders Today', value: vitals?.tx_count_today != null ? String(vitals.tx_count_today) : '—' },
              { label: 'Avg Basket', value: vitals?.revenue_today != null && vitals.tx_count_today ? `$${Math.round(vitals.revenue_today / vitals.tx_count_today)}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 4px 16px rgba(45,82,64,0.08), inset 0 2px 4px rgba(255,255,255,0.9)' }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#7FB897', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 500, color: '#2D5240', lineHeight: 1, fontFamily: T.display }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ RIGHT PANEL — dark conversation ══ */}
        <div style={{ background: '#16181a', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* ── History sidebar ───────────────────────────────────────────────── */}
      {showHistory && (
        <div className="absolute inset-y-0 left-0 w-72 flex flex-col border-r z-20" style={{ borderColor: T.border, background: T.sidebarBg }}>
          {/* Wordmark */}
          <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid ' + T.border }}>
            <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 26, color: T.sage, letterSpacing: '-0.02em', lineHeight: 1 }}>aria</div>
            <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>AI business co-operator</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={newConversation}
              className="w-full text-left px-5 py-3.5 border-b transition-colors hover:bg-white/5 flex items-center gap-2"
              style={{ borderColor: T.border, color: T.sage, fontSize: 13 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New conversation
            </button>
            {history.length === 0 && (
              <p className="px-5 py-4" style={{ fontSize: 12, color: T.textDim }}>No conversations yet</p>
            )}
            {history.map(c => (
              <div
                key={c.id}
                className="group relative border-b"
                style={{ borderColor: T.border, background: conversationId === c.id ? 'rgba(127,184,151,0.06)' : 'transparent' }}
              >
                <button
                  onClick={() => loadConversation(c.id)}
                  className="w-full text-left px-5 py-3 pr-10 transition-colors hover:bg-white/5"
                >
                  <p style={{ fontSize: 13, fontWeight: 500, color: T.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.title ?? 'Untitled'}
                  </p>
                  <p style={{ fontSize: 11, marginTop: 2, color: T.textMut }}>
                    {new Date(c.last_message_at).toLocaleDateString()} · {c.message_count} msgs
                    {c.has_escalated && <span style={{ marginLeft: 4, color: T.red }}>↗</span>}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
                  style={{ color: T.textMut }}
                  title="Delete chat"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            {deliverables.length > 0 && (
              <div style={{ borderTop: '1px solid ' + T.border }}>
                <p style={{ padding: '12px 20px 6px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.textMut }}>
                  Recent outputs
                </p>
                {deliverables.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDeliverable(d)}
                    className="w-full text-left px-5 py-2.5 border-b transition-colors hover:bg-white/5"
                    style={{ borderColor: T.border }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(127,184,151,0.12)', color: T.sage, fontWeight: 500 }}>
                        {d.output_kind.replace('_', ' ')}
                      </span>
                      <p style={{ fontSize: 12, color: T.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.title}</p>
                    </div>
                    <p style={{ fontSize: 10, marginTop: 2, color: T.textMut }}>
                      {new Date(d.created_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Deliverable viewer modal ──────────────────────────────────────── */}
      {selectedDeliverable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.88)' }} onClick={() => setSelectedDeliverable(null)}>
          <div className="w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl" style={{ background: T.surfaceEl, border: '1px solid ' + T.border }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid ' + T.border }}>
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: 'rgba(127,184,151,0.12)', color: T.sage, fontWeight: 500 }}>
                  {selectedDeliverable.output_kind.replace('_', ' ')}
                </span>
                <p style={{ fontSize: 14, fontWeight: 500, color: T.textPri }}>{selectedDeliverable.title}</p>
              </div>
              <button onClick={() => setSelectedDeliverable(null)} style={{ fontSize: 13, color: T.textMut, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>
            {selectedDeliverable.render_html ? (
              <iframe
                srcDoc={selectedDeliverable.render_html}
                sandbox="allow-scripts"
                className="w-full"
                style={{ height: 500, border: 'none', display: 'block' }}
                title={selectedDeliverable.title}
              />
            ) : (
              <div className="px-5 py-8 text-center" style={{ fontSize: 13, color: T.textMut }}>No preview available</div>
            )}
          </div>
        </div>
      )}

      {/* ── Conversation panel ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ position: 'relative' }}>
        {/* Floating avatar video */}
        {ariaVideoUrl && (
          <div style={{
            position: 'absolute', bottom: 84, right: 20, width: 96, height: 130, zIndex: 20,
            pointerEvents: 'none',
            opacity: isAriaActive ? 1 : 0.3,
            transition: 'opacity 0.3s ease',
            WebkitMaskImage: 'radial-gradient(ellipse 75% 78% at 50% 42%, black 20%, transparent 68%)',
            maskImage: 'radial-gradient(ellipse 75% 78% at 50% 42%, black 20%, transparent 68%)',
          }}>
            <video ref={videoRef} src={ariaVideoUrl} muted playsInline loop
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          </div>
        )}
        {/* Sound bars */}
        {ariaVideoUrl && isAriaActive && (
          <div style={{ position: 'absolute', bottom: 72, right: 36, zIndex: 21, display: 'flex', gap: 2, alignItems: 'flex-end', height: 10, pointerEvents: 'none' }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 2, borderRadius: 2, background: T.sage, height: [5,9,7,8][i],
                animation: 'ariaBar' + i + ' 0.5s ease-in-out infinite alternate',
                animationDelay: (i * 0.12) + 's',
              }} />
            ))}
          </div>
        )}

        {/* ── Header ─ */}
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(22,24,26,0.98)', flexShrink: 0, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setShowHistory(v => !v)}
              title="Chat history"
              aria-label="Toggle chat history"
              style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: showHistory ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)', color: showHistory ? T.sage : 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', flexShrink: 0 }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 14, height: 14 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>Conversation</span>
            {vitals?.revenue_today != null && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>
                · <span style={{ color: T.sage }}>${vitals.revenue_today.toFixed(0)}</span> today
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Link href="/dashboard/ask-aria/intelligence"
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, color: 'rgba(255,255,255,0.38)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', textDecoration: 'none', fontFamily: T.body }}>
              ✦ Intel
            </Link>
            <button onClick={newConversation}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, color: 'rgba(255,255,255,0.38)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', fontFamily: T.body }}>
              New
            </button>
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Empty state */}
          {messages.length === 0 && input.length === 0 && (
            <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}>
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(127,184,151,0.1)', border: '1px solid ' + T.borderMd, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: 24, color: T.sage, flexShrink: 0 }}>A</div>
                  <div>
                    <div style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 22, color: T.textPri, lineHeight: 1 }}>Aria</div>
                    <div style={{ fontSize: 11, color: T.textMut, marginTop: 3 }}>Your business co-operator · always on</div>
                  </div>
                </div>
                <div style={{ opacity: greetingReady ? 1 : 0, transform: greetingReady ? 'translateY(0)' : 'translateY(8px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>
                  <p style={{ fontSize: 16, fontWeight: 500, color: T.textPri, marginBottom: 6, fontFamily: T.body }}>
                    {greeting}, {business?.owner_name?.split(' ')[0] ?? 'there'}.
                  </p>
                  <AriaGreeting business={business} />
                </div>
              </div>
              <ChatSuggestions onSelect={send} disabled={sending} />
            </div>
          )}

          {/* Message list */}
          {messages.map((m, i) => {
            const isUser = m.role === 'user'
            const isLastMsg = i === messages.length - 1

            return (
              <div
                key={i}
                className="msg-reveal group"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  animation: 'msgIn 0.22s ease forwards',
                  maxWidth: 720,
                  width: '100%',
                  margin: isUser ? '0 0 0 auto' : '0',
                }}
              >
                {/* Aria avatar label */}
                {!isUser && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 7, background: 'rgba(127,184,151,0.1)', border: '1px solid ' + T.borderMd, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.display, fontStyle: 'italic', fontSize: 12, color: T.sage, flexShrink: 0 }}>A</div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: T.textSec, fontFamily: T.body }}>Aria</span>
                  </div>
                )}

                {/* Message bubble */}
                <div style={{
                  padding: isUser ? '11px 16px' : '14px 18px',
                  background: isUser ? '#262a2d' : 'rgba(255,255,255,0.04)',
                  border: '1px solid ' + (isUser ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.05)'),
                  borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: T.textPri,
                  width: '100%',
                  fontFamily: T.body,
                }}>
                  {m.streaming && !m.content
                    ? councilThinking
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0' }}>
                          {['Growth brain reading…', 'Risk brain checking…', 'Strategy brain weighing…', 'Synthesising…'].map((step, si) => (
                            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.textMut }}>
                              <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid ' + T.sage, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                              {step}
                            </div>
                          ))}
                        </div>
                      )
                      : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textMut }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.sage, animation: 'blinkCaret 1s step-end infinite', display: 'inline-block' }} />
                          <span style={{ fontSize: 14 }}>Thinking…</span>
                        </span>
                      )
                    : m.blocks && m.blocks.length > 0
                      ? (
                        <div>
                          {/* Narrative first — final_briefing / stripped response before visual blocks */}
                          {m.content && m.content.trim() && (
                            <div style={{ marginBottom: 10 }}>
                              <AriaMarkdown text={m.content} />
                            </div>
                          )}
                          {m.blocks.map((block, bi) => (
                            <div key={bi} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '1px 0', marginTop: 6 }}>
                              <BlockRenderer block={block} onChoice={(prompt) => { send(prompt) }} />
                            </div>
                          ))}
                          {(m.followups ?? []).length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                              {(m.followups ?? []).map((fup, fi) => (
                                <button key={fi} onClick={() => { send(fup) }}
                                  style={{ padding: '6px 12px', minHeight: 32, borderRadius: 16, border: '1px solid ' + T.borderMd, background: 'rgba(127,184,151,0.05)', color: T.sage, fontSize: 12, cursor: 'pointer', fontFamily: T.body }}>
                                  {fup}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    : m.role === 'assistant' && m.content
                      ? (
                        <>
                          {parseAriaResponse(
                            m.content
                              .replace(/\[([^\]]+)\]\(https?:\/\/[^)]*supabase[^)]+\)/g, '')
                              .replace(/https?:\/\/[^\s]*supabase[^\s]*/g, '')
                              .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, (_, txt) =>
                                txt.includes('Download') || txt.includes('download') ? '' : txt
                              )
                              .replace(/\n\s*\n\s*\n/g, '\n\n').trim()
                          ).map((seg, si) =>
                            seg.kind === 'text'
                              ? <AriaMarkdown key={si} text={seg.content} />
                              : <AriaArtifact key={si} type={seg.type} title={seg.title} data={seg.data} />
                          )}
                          {/* Streaming caret while still streaming */}
                          {m.streaming && (
                            <span style={{ display: 'inline-block', width: 7, height: 14, background: T.sage, marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blinkCaret 1s step-end infinite' }} />
                          )}
                        </>
                      )
                    : m.content}
                </div>

                {/* Per-message actions */}
                {!isUser && !m.streaming && m.content && (
                  <MessageActions msg={m} onRegenerate={isLastMsg ? regenerate : undefined} />
                )}

                {/* ActionCard, deliverable toolbar, downloads, tool calls */}
                {m.role === 'assistant' && m.action && <ActionCard action={m.action} />}
                {m.role === 'assistant' && !m.streaming && m.deliverable && (
                  <DeliverableToolbar deliverable={m.deliverable} summaryText={m.content || undefined} />
                )}
                {m.role === 'assistant' && m.downloads && m.downloads.length > 0 && (
                  <div className="mt-2 space-y-2 w-full">
                    {m.downloads.map((dl, di) => (
                      dl.format === 'png' || dl.format === 'jpg' || dl.format === 'jpeg' ? (
                        <div key={di} className="rounded-xl overflow-hidden" style={{ border: '1px solid ' + T.borderMd }}>
                          <img src={dl.download_url} alt={dl.filename} className="w-full max-w-md" />
                          <a href={dl.download_url} download={dl.filename}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(127,184,151,0.06)', color: T.sage, textDecoration: 'none', fontSize: 12 }}>
                            <span>🖼 {dl.filename}</span>
                            <span style={{ padding: '2px 8px', borderRadius: 5, background: 'rgba(127,184,151,0.12)', fontSize: 11 }}>↓ Download</span>
                          </a>
                        </div>
                      ) : (
                        <a key={di} href={dl.download_url} download={dl.filename} target="_blank" rel="noopener"
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: '1px solid ' + T.borderMd, background: 'rgba(127,184,151,0.06)', color: T.sage, textDecoration: 'none', fontSize: 13 }}>
                          <span style={{ fontSize: 18 }}>{dl.format === 'csv' ? '📄' : dl.format === 'html' || dl.format === 'pdf' ? '📑' : '📊'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{dl.filename}</div>
                            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1 }}>{dl.rows > 0 ? `${dl.rows} rows · ` : ''}{dl.format === 'html' ? 'open' : 'download'}</div>
                          </div>
                          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 5, background: 'rgba(127,184,151,0.12)' }}>↓</span>
                        </a>
                      )
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0 && !m.streaming && (
                  <p style={{ fontSize: 10, marginTop: 4, color: T.textDim }}>
                    🔧 {m.tool_calls.map(t => t.name).join(', ')}
                  </p>
                )}
                <p style={{ fontSize: 10, marginTop: 4, color: T.textDim }}>
                  {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {m.intent && m.role === 'assistant' && <span style={{ marginLeft: 6, opacity: 0.5 }}>{m.intent}</span>}
                </p>
              </div>
            )
          })}

          {/* Action fork card — first tap: choose path */}
          {pendingAction && showForkCard && (
            <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', marginTop: 8 }}>
              <div className="rounded-xl p-4 space-y-3"
                style={{ border: '1px solid rgba(127,184,151,0.25)', background: 'rgba(45,82,64,0.08)' }}>
                <div>
                  <p className="font-medium text-sm" style={{ color: T.textPri }}>{pendingAction.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: T.textSec }}>{pendingAction.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={savePlanAction}
                    disabled={confirmingAction}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
                    style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(127,184,151,0.3)', color: T.sage }}
                  >
                    Save as plan
                  </button>
                  {!pendingActionProposeOnly && (
                    <button
                      onClick={() => setShowForkCard(false)}
                      disabled={confirmingAction}
                      className="flex-1 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-50"
                      style={{ background: '#2D5240', color: '#fff' }}
                    >
                      Act on it
                    </button>
                  )}
                  <button
                    onClick={cancelAction}
                    disabled={confirmingAction}
                    className="px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    Cancel
                  </button>
                </div>
                {pendingActionProposeOnly && (
                  <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Price and roster changes require manual review before execution
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Action confirm card — second tap: confirm execution */}
          {pendingAction && !showForkCard && (
            <div style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
              <ActionPreviewCard
                action={pendingAction}
                onConfirm={confirmAction}
                onCancel={cancelAction}
                loading={confirmingAction}
                proposePlan={false}
                onSavePlan={savePlanAction}
              />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Audit log */}
        {messages.length > 0 && (
          <div style={{ padding: '0 24px', borderTop: '1px solid ' + T.border, flexShrink: 0 }}>
            <button
              onClick={() => setShowAudit(v => !v)}
              className="w-full flex items-center justify-between py-2 transition-colors"
              style={{ fontSize: 11, color: T.textDim, fontFamily: T.body }}
            >
              <span>Recent actions</span>
              <span>{showAudit ? '▲' : '▼'}</span>
            </button>
            {showAudit && (
              <div style={{ paddingBottom: 12 }}>
                <AuditLogCard />
              </div>
            )}
          </div>
        )}

        {/* ── Composer ──────────────────────────────────────────────────── */}
        <div className="an-bottom-sheet" style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(22,24,26,0.98)', flexShrink: 0, position: 'relative' }}>
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

          {/* Talking head — on mobile lifted above composer via .aria-avatar-float media query */}
          <div className="aria-avatar-float" style={{ position: 'fixed', bottom: 0, right: 0, width: 120, zIndex: 50, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, overflow: 'visible' }}>
            <AriaSpeechBubble business={business} show={greetingReady} />
            <div style={{ width: 120, height: 160, opacity: avatarMounted ? 1 : 0, transition: 'opacity 0.4s ease', overflow: 'visible' }}>
              <AriaTalkingHead mode={isAriaActive ? 'talking' : 'idle'} replyText={ariaResponseText ?? ''} />
            </div>
          </div>

          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="max-w-3xl mx-auto mb-2 flex flex-wrap gap-2">
              {attachedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid ' + T.borderMd, color: T.sage, fontSize: 12 }}>
                  <span>{f.type.startsWith('image/') ? '🖼' : f.type === 'application/pdf' ? '📄' : f.name.match(/\.(xlsx|xls|csv)$/i) ? '📊' : '📎'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Skill picker */}
          <div className="w-full md:max-w-3xl md:mx-auto mb-2">
            <SkillPicker />
          </div>

          {/* Input row */}
          <div className="flex gap-2 w-full md:max-w-3xl md:mx-auto items-end">
            <VoiceInput onTranscript={t => { setInput(p => p ? p + ' ' + t : t) }} disabled={sending} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach files (images, PDFs, spreadsheets)"
              aria-label="Attach files"
              className="flex-shrink-0 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 relative"
              style={{ width: 42, height: 42, background: attachedFiles.length > 0 ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (attachedFiles.length > 0 ? T.borderMd : T.border), color: attachedFiles.length > 0 ? T.sage : T.textMut }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {attachedFiles.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: T.sage, color: T.surface, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {attachedFiles.length}
                </span>
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything… (⌘↵ to send)"
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#eef0f2', maxHeight: '120px', fontSize: 15, lineHeight: 1.55, fontFamily: T.body }}
            />
            {/* Stop button — visible only while streaming */}
            {sending && (
              <button
                onClick={() => { abortRef.current?.abort() }}
                className="flex-shrink-0 px-4 rounded-xl flex items-center justify-center transition-colors"
                style={{ height: 42, background: 'rgba(226,75,74,0.1)', border: '1px solid rgba(226,75,74,0.25)', color: T.red, fontSize: 13, fontFamily: T.body, position: 'relative', zIndex: 60 }}
              >
                Stop
              </button>
            )}
            {/* Send button */}
            <button
              onClick={() => send()}
              disabled={sending || (!input.trim() && attachedFiles.length === 0)}
              className="flex-shrink-0 px-5 rounded-xl font-medium transition-opacity disabled:opacity-40"
              style={{ height: 42, background: T.forest, color: '#fff', fontSize: 14, fontFamily: T.body, position: 'relative', zIndex: 60 }}
            >
              {sending
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : 'Send'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 10, marginTop: 8, color: T.textDim, fontFamily: T.body }}>
            Aria uses connected records only — it will not invent missing data
          </p>
        </div>
      </div>
    </div>
      </div>
    </div>
  )
}

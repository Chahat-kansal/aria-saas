'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import VoiceInput from '@/components/aria/VoiceInput'
import ChatSuggestions from '@/components/aria/ChatSuggestions'
import ActionPreviewCard from '@/components/aria/ActionPreviewCard'
import AuditLogCard from '@/components/aria/AuditLogCard'
import { AriaArtifact } from '@/components/aria/AriaArtifact'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'
import type { DocumentReadResult } from '@/lib/aria/intelligence/document-vision'

const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false })

interface ExportAction { type: 'export'; url: string; filename: string; format: string; row_count: number }
interface EscalateAction { type: 'escalate'; ticket_id: string }
interface ErrorAction { type: 'export_error' | 'escalate_error'; message: string }
interface PreviewAction { type: 'action_preview'; planned: PlannedAction }
interface ExecutionResultAction { type: 'execution_result'; ok: boolean; affected_count: number; error?: string; rollback_available?: boolean; rollback_expires_at?: string; action_log_id?: string }
interface DocumentAction { type: 'document'; document: DocumentReadResult }
type MessageAction = ExportAction | EscalateAction | ErrorAction | PreviewAction | ExecutionResultAction | DocumentAction | null

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  action?: MessageAction
  intent?: string
  timestamp: Date
}

interface ConvSummary {
  id: string
  title: string | null
  message_count: number
  last_message_at: string
  last_intent: string | null
  has_escalated: boolean
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

export default function AskAriaPage() {
  const { business, loading } = useBusinessContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<ConvSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [pendingAction, setPendingAction] = useState<PlannedAction | null>(null)
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q && !input && messages.length === 0) setInput(q)
  }, [input, messages.length])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/ask/history')
      if (res.ok) {
        const data = await res.json() as { conversations?: ConvSummary[] }
        setHistory(data.conversations ?? [])
      }
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])


  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/aria/ask/history?id=${id}&messages=true`)
      if (!res.ok) return
      const data = await res.json() as { conversation?: { messages?: Array<{ role: string; content: string; ts?: string }> } }
      const conv = data.conversation
      if (!conv?.messages) return
      const loaded: Message[] = conv.messages.map((m: { role: string; content: string; ts?: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.ts ?? Date.now()),
      }))
      setMessages(loaded)
      setConversationId(id)
      setShowHistory(false)
    } catch { /* non-fatal */ }
  }, [])

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || sending) return

    setInput('')
    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() }
    setMessages(prev => [...prev.slice(-20), userMsg, { role: 'assistant', content: '', streaming: true, timestamp: new Date() }])
    setSending(true)

    try {
      const res = await fetch('/api/aria/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversation_id: conversationId }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error ?? 'Request failed')
      }

      const data = await res.json() as {
        response?: string; conversation_id?: string; intent?: string
        action?: { action?: string; planned?: PlannedAction; type?: string; [k: string]: unknown }
        cost_usd_cents?: number
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
            content: data.response ?? '',
            streaming: false,
            action: msgAction,
            intent: data.intent,
          }
        }
        return updated
      })

      loadHistory()
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
      inputRef.current?.focus()
    }
  }, [input, sending, conversationId, loadHistory])

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
    try {
      const res = await fetch('/api/aria/ask/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'confirm', message: 'yes', conversation_id: conversationId }),
      })
      const data = await res.json() as { execution_result?: ExecutionResultAction; status?: string }
      const result = data.execution_result
      const resultText = result?.ok
        ? `Done — ${result.affected_count} item${result.affected_count !== 1 ? 's' : ''} updated.${result.rollback_available ? ' You can undo within 1 hour.' : ''}`
        : `Action failed: ${result?.error ?? 'Unknown error'}`
      setMessages(prev => [...prev, { role: 'assistant', content: resultText, action: result ? { ...result, type: 'execution_result' } as ExecutionResultAction : null, timestamp: new Date() }])
      setPendingAction(null)
      loadHistory()
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
      <div className="flex h-full items-center justify-center" style={{ background: '#0d0d14' }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#7FB897] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full" style={{ background: '#0d0d14' }}>
      {/* History sidebar */}
      {showHistory && (
        <div className="w-64 flex-shrink-0 flex flex-col border-r" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
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
            {history.map(c => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.04)', background: conversationId === c.id ? 'rgba(127,184,151,0.08)' : 'transparent' }}
              >
                <p className="text-xs font-medium text-white truncate">{c.title ?? 'Untitled'}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(c.last_message_at).toLocaleDateString()} · {c.message_count} msgs
                  {c.has_escalated && <span className="ml-1 text-red-400">↗</span>}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(v => !v)}
              title="Chat history"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: showHistory ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', color: showHistory ? '#7FB897' : 'rgba(255,255,255,0.5)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <div>
              <h1 className="font-semibold text-white text-lg leading-tight">Ask Aria</h1>
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                AI advisor for {business?.name ?? 'your business'}
                {' · '}
                <span className="text-[#7FB897]">{business?.data_source === 'square' ? 'Square data' : 'Aria POS data'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/ask-aria/intelligence"
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}
              title="Intelligence settings">
              ✦ Intel
            </Link>
            {messages.length > 0 && (
              <button onClick={newConversation}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}>
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
                <p className="text-white font-medium mb-1">
                  Hi {business?.owner_name?.split(' ')[0] ?? 'there'} — what can I help you with?
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  I use connected business data when it exists, and I will say exactly what is missing when it does not.
                </p>
              </div>
              <ChatSuggestions onSelect={send} disabled={sending} />
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
              <div className="max-w-2xl w-full">
                <div className="px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                  style={m.role === 'user'
                    ? { background: '#2D5240', color: '#fff', borderRadius: '18px 18px 4px 18px' }
                    : { background: 'rgba(255,255,255,0.05)', color: '#e5e7eb', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px 18px 18px 4px' }}>
                  {m.streaming && !m.content
                    ? <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#7FB897] animate-pulse" /><span className="opacity-60">Thinking…</span></span>
                    : m.role === 'assistant' && m.content
                      ? parseAriaResponse(m.content).map((seg, si) =>
                          seg.kind === 'text'
                            ? <span key={si} className="whitespace-pre-wrap">{seg.content}</span>
                            : <AriaArtifact key={si} type={seg.type} title={seg.title} data={seg.data} />
                        )
                      : m.content}
                </div>
                {m.role === 'assistant' && m.action && <ActionCard action={m.action} />}
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
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
          />
          <div className="flex gap-2 max-w-3xl mx-auto items-end">
            <VoiceInput onTranscript={t => { setInput(p => p ? `${p} ${t}` : t) }} disabled={sending} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sending}
              title="Upload invoice or receipt"
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
            >
              {uploading
                ? <div className="w-4 h-4 rounded-full border-2 border-[#7FB897] border-t-transparent animate-spin" />
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
              }
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
              disabled={sending || !input.trim()}
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

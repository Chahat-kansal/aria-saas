'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import dynamic from 'next/dynamic'
import VoiceInput from '@/components/aria/VoiceInput'
import ChatSuggestions from '@/components/aria/ChatSuggestions'

const ChartBlock = dynamic(() => import('@/components/dashboard/ChartBlock'), { ssr: false })

interface ExportAction {
  type: 'export'
  url: string
  filename: string
  format: string
  row_count: number
}
interface EscalateAction { type: 'escalate'; ticket_id: string }
interface ErrorAction { type: 'export_error' | 'escalate_error'; message: string }
type MessageAction = ExportAction | EscalateAction | ErrorAction | null

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

function ActionCard({ action }: { action: MessageAction }) {
  if (!action) return null
  if (action.type === 'export') {
    return (
      <a
        href={action.url}
        download={action.filename}
        className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-opacity hover:opacity-80"
        style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897', textDecoration: 'none' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span>Download {action.filename} <span className="opacity-60">({action.row_count} rows)</span></span>
      </a>
    )
  }
  if (action.type === 'escalate') {
    return (
      <div className="mt-2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Support ticket created (#{action.ticket_id.slice(0,8)})
      </div>
    )
  }
  return null
}

export default function AskAriaPage() {
  const { business, loading } = useBusinessContext()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [history, setHistory] = useState<ConvSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
        response?: string; conversation_id?: string; intent?: string; action?: MessageAction; cost_usd_cents?: number
      }

      if (data.conversation_id) setConversationId(data.conversation_id)

      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = {
            ...last,
            content: data.response ?? '',
            streaming: false,
            action: data.action ?? null,
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

  function newConversation() {
    setMessages([])
    setConversationId(null)
    setInput('')
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
          {messages.length > 0 && (
            <button onClick={newConversation}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)' }}>
              New chat
            </button>
          )}
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
                  {m.content || (m.streaming
                    ? <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#7FB897] animate-pulse" /><span className="opacity-60">Thinking…</span></span>
                    : null)}
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
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
          <div className="flex gap-2 max-w-3xl mx-auto items-end">
            <VoiceInput onTranscript={t => { setInput(p => p ? `${p} ${t}` : t) }} disabled={sending} />
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

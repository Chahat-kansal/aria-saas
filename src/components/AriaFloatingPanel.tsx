'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { stopAriaSpeech, initVoice, ensureAudioUnlocked, setSpeakCallbacks } from '@/lib/aria/headTTSBridge'
import { parseAriaTags } from '@/lib/aria/parse-aria-tags'

const AriaTalkingHead = dynamic(
  () => import('@/components/aria/AriaTalkingHead'),
  { ssr: false },
)

function getBrain(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return '/api/aria/ask'
  if (pathname.startsWith('/staff/portal')) return '/api/aria/staff-talk'
  return '/api/aria/talk'
}

const PAGE_NAMES: [string, string][] = [
  ['/dashboard/ask-aria',         'Ask Aria'],
  ['/dashboard/staff',            'Staff Management'],
  ['/dashboard/inventory',        'Inventory'],
  ['/dashboard/cash-up',          'Cash Up'],
  ['/dashboard/reviews',          'Reviews'],
  ['/dashboard/customers',        'Customers'],
  ['/dashboard/autopilot',        'AI Autopilot'],
  ['/dashboard/intelligence',     'Business Intelligence'],
  ['/dashboard/daily-briefing',   'Daily Briefing'],
  ['/dashboard',                  'Dashboard Overview'],
  ['/staff/portal/timesheets',    'Timesheets'],
  ['/staff/portal/leave',         'Leave Management'],
  ['/staff/portal/availability',  'Availability'],
  ['/staff/portal/messages',      'Messages'],
  ['/staff/portal/training',      'Training'],
  ['/staff/portal',               'Staff Home'],
]

function getPageName(pathname: string): string {
  for (const [route, name] of PAGE_NAMES) {
    if (pathname === route || pathname.startsWith(route + '/')) return name
  }
  if (pathname.startsWith('/dashboard')) return 'Dashboard'
  if (pathname.startsWith('/staff'))     return 'Staff Portal'
  return 'Aria'
}

function heuristicMood(text: string): string {
  const t = text.toLowerCase()
  if (/\b(great|excellent|up|growth|well done|positive|good news)\b/.test(t)) return 'happy'
  if (/\b(concern|issue|problem|drop|risk|alert|low)\b/.test(t))              return 'concerned'
  if (/\b(consider|suggest|recommend|analysing|looking at)\b/.test(t))        return 'thinking'
  return 'neutral'
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

const T = {
  sage: '#7FB897',
  deep: '#2D5240',
  text: '#E8EDE7',
  body: 'var(--font-body, Outfit, Inter, sans-serif)',
}

type SpeechRecognitionEvent = {
  results: Array<{ 0: { transcript: string }; isFinal: boolean }>
}
type AriaRecog = {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror:  ((e: unknown) => void) | null
  onend:    (() => void) | null
  start: () => void; stop: () => void; abort: () => void
}

export default function AriaFloatingPanel({ onClose }: { onClose: () => void }) {
  const pathname  = usePathname() ?? '/'
  const [phase,   setPhase]   = useState<Phase>('idle')
  const [input,   setInput]   = useState('')
  const [reply,   setReply]   = useState('')
  const [mood,    setMood]    = useState('neutral')
  const [gesture, setGesture] = useState('')
  const [error,   setError]   = useState('')
  const [micOk,   setMicOk]   = useState(false)

  // Conversation history — passed to API for context, never rendered
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])

  const inputRef  = useRef<HTMLInputElement>(null)
  const recognRef = useRef<AriaRecog | null>(null)
  const brain     = getBrain(pathname)
  const pageName  = getPageName(pathname)

  useEffect(() => {
    initVoice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    setMicOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition))
    return () => { setSpeakCallbacks({ onSpeakEnd: null }); stopAriaSpeech(); recognRef.current?.abort() }
  }, [])

  // Event-driven phase transitions — driven by real AudioContext events, not timers
  useEffect(() => {
    setSpeakCallbacks({
      onSpeakEnd: () => {
        setPhase('idle')
        setReply('')
        inputRef.current?.focus()
      },
    })
  }, [])

  const send = useCallback(async (text: string) => {
    ensureAudioUnlocked()  // synchronous — must precede any await to satisfy autoplay policy
    const msg = text.trim()
    if (!msg || phase === 'thinking' || phase === 'speaking') return

    const newMessages = [...messages, { role: 'user' as const, content: msg }].slice(-20)
    setMessages(newMessages)

    stopAriaSpeech()
    setReply('')
    setError('')
    setInput('')
    setGesture('')
    setPhase('thinking')

    try {
      const res = await fetch(brain, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          messages: newMessages,
          page_context: { route: pathname, page_name: pageName },
        }),
      })
      const data = await res.json() as { reply?: string; response?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong — try again.')
        setPhase('idle')
        return
      }

      const raw = (data.reply ?? data.response ?? '').trim()
      const { clean, mood: m, gesture: g } = parseAriaTags(raw)
      const resolvedMood    = (m !== 'neutral' || /\[mood:/.test(raw)) ? m : heuristicMood(clean)
      const resolvedGesture = g || (resolvedMood === 'happy' ? 'thumbup' : resolvedMood === 'concerned' ? 'shrug' : '')

      setMessages(prev => [...prev, { role: 'assistant' as const, content: clean }].slice(-20))
      setMood(resolvedMood)
      setGesture(resolvedGesture)
      setReply(clean)
      setPhase('speaking')
      // Phase transitions to idle via onSpeakEnd callback (real AudioContext events)
    } catch (e) {
      setError((e as Error).message ?? 'Network error')
      setPhase('idle')
    }
  }, [phase, brain, pathname, pageName, messages])

  const startListening = useCallback(() => {
    ensureAudioUnlocked()  // unlock AudioContext on mic button press (user gesture)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    const rec: AriaRecog = new SR()
    recognRef.current = rec
    rec.lang = 'en-AU'; rec.continuous = false; rec.interimResults = true
    setPhase('listening'); setError('')
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t) }
    }
    rec.onerror = () => { setPhase('idle') }
    rec.onend   = () => { setPhase(p => p === 'listening' ? 'idle' : p) }
    rec.start()
  }, [send])

  const stopListening = useCallback(() => {
    recognRef.current?.stop()
    setPhase('idle')
  }, [])

  const busy = phase === 'thinking' || phase === 'speaking'

  const statusText =
    phase === 'thinking' ? 'Aria is thinking…' :
    phase === 'speaking' ? 'Aria is speaking…' :
    phase === 'listening' ? 'Listening…' : null

  return (
    // Outer: no background, no border, no shadow — just positioning
    <div style={{
      position: 'fixed', bottom: 88, right: 24, zIndex: 9998,
      width: 280,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      animation: 'ariaSlideUp 250ms cubic-bezier(0.34,1.56,0.64,1) forwards',
    }}>

      {/* Avatar — transparent, no box */}
      <div style={{ width: '100%', height: 320, position: 'relative' }}>
        <AriaTalkingHead
          mode={phase === 'speaking' ? 'talking' : 'idle'}
          replyText={reply}
          mood={mood}
          gesture={gesture}
        />

        {/* Floating close button — top-right of avatar */}
        <button
          onClick={onClose}
          aria-label="Close Aria"
          style={{
            position: 'absolute', top: 8, right: 4, zIndex: 10,
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(14,20,17,0.6)',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer', color: 'rgba(255,255,255,0.65)',
            fontSize: 16, lineHeight: 1, padding: 0,
            backdropFilter: 'blur(4px)',
          }}
        >×</button>

        {/* Subtle page context — bottom-left of avatar */}
        {pageName !== 'Aria' && (
          <div style={{
            position: 'absolute', bottom: 6, left: 10, zIndex: 10,
            fontSize: 9, color: 'rgba(127,184,151,0.5)',
            fontFamily: T.body, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {pageName}
          </div>
        )}
      </div>

      {/* Status / error — floating text, no background box */}
      {(statusText || error) && (
        <p style={{
          fontSize: 10, margin: '2px 0 5px', textAlign: 'center',
          fontFamily: T.body,
          color: error ? '#EF4444' : 'rgba(255,255,255,0.5)',
        }}>
          {error ?? statusText}
        </p>
      )}

      {/* Input — pill only, frosted glass */}
      <div style={{
        display: 'flex', gap: 4, alignItems: 'center',
        background: 'rgba(14,20,17,0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: 999,
        padding: '5px 5px 5px 14px',
        border: '1px solid rgba(127,184,151,0.2)',
        width: 'calc(100% - 8px)',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder={phase === 'listening' ? 'Listening…' : 'Ask Aria…'}
          disabled={busy || phase === 'listening'}
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', outline: 'none',
            color: T.text, fontSize: 13, fontFamily: T.body, height: 28,
            opacity: (busy || phase === 'listening') ? 0.5 : 1,
          }}
        />

        {micOk && (
          <button
            onClick={phase === 'listening' ? stopListening : startListening}
            disabled={busy}
            title={phase === 'listening' ? 'Stop' : 'Speak'}
            style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: phase === 'listening' ? 'rgba(127,184,151,0.25)' : 'rgba(127,184,151,0.1)',
              border: 'none',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.4 : 1,
              animation: phase === 'listening' ? 'ariaVoicePulse 0.9s ease-in-out infinite' : 'none',
            }}
          >
            {phase === 'listening'
              ? <svg width="9" height="9" viewBox="0 0 9 9"><rect width="9" height="9" rx="2" fill={T.sage}/></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.sage} strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
            }
          </button>
        )}

        <button
          onClick={() => send(input)}
          disabled={!input.trim() || busy || phase === 'listening'}
          style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: (!input.trim() || busy || phase === 'listening') ? 'rgba(45,82,64,0.4)' : T.deep,
            border: 'none',
            cursor: (!input.trim() || busy || phase === 'listening') ? 'default' : 'pointer',
            opacity: (!input.trim() || busy || phase === 'listening') ? 0.4 : 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes ariaSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes ariaVoicePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}

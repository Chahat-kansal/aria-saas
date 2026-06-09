'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { speakAriaText, stopAriaSpeech, initVoice } from '@/lib/aria/headTTSBridge'
import { parseAriaTags } from '@/lib/aria/parse-aria-tags'

const AriaTalkingHead = dynamic(
  () => import('@/components/aria/AriaTalkingHead'),
  { ssr: false },
)

// ── Route → brain endpoint ──────────────────────────────────────────────────
function getBrain(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return '/api/aria/ask'
  if (pathname.startsWith('/staff/portal')) return '/api/aria/staff-talk'
  return '/api/aria/talk'
}

// ── Route → human-readable page name ────────────────────────────────────────
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

// ── Heuristic mood for endpoints that don't return [mood:X] tags ────────────
function heuristicMood(text: string): string {
  const t = text.toLowerCase()
  if (/\b(great|excellent|up|growth|well done|positive|good news)\b/.test(t)) return 'happy'
  if (/\b(concern|issue|problem|drop|risk|alert|low)\b/.test(t))              return 'concerned'
  if (/\b(consider|suggest|recommend|analysing|looking at)\b/.test(t))        return 'thinking'
  return 'neutral'
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

// ── Design tokens (matches landing page dark palette) ──────────────────────
const T = {
  bg:      '#13201a',
  card:    '#1a2b22',
  border:  'rgba(127,184,151,0.15)',
  text:    '#E8EDE7',
  muted:   '#9BA8A0',
  sage:    '#7FB897',
  deep:    '#2D5240',
  display: 'var(--font-display, Cormorant, Georgia, serif)',
  body:    'var(--font-body, Outfit, Inter, sans-serif)',
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
  const pathname   = usePathname() ?? '/'
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [input,    setInput]    = useState('')
  const [reply,    setReply]    = useState('')
  const [mood,     setMood]     = useState('neutral')
  const [gesture,  setGesture]  = useState('')
  const [error,    setError]    = useState('')
  const [micOk,    setMicOk]    = useState(false)
  const [transcript, setTranscript] = useState('')

  const inputRef  = useRef<HTMLInputElement>(null)
  const recognRef = useRef<AriaRecog | null>(null)
  const brain     = getBrain(pathname)
  const pageName  = getPageName(pathname)

  useEffect(() => {
    initVoice()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    setMicOk(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition))
    return () => { stopAriaSpeech(); recognRef.current?.abort() }
  }, [])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || phase === 'thinking' || phase === 'speaking') return
    stopAriaSpeech()
    setReply('')
    setError('')
    setInput('')
    setGesture('')
    setPhase('thinking')

    try {
      // /api/aria/ask uses a different body shape; others use { message }
      const isAsk = brain === '/api/aria/ask'
      const body = isAsk
        ? JSON.stringify({ message: msg, page_context: { route: pathname, page_name: pageName } })
        : JSON.stringify({ message: msg, page_context: { route: pathname, page_name: pageName } })

      const res  = await fetch(brain, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const data = await res.json() as { reply?: string; response?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong — try again.')
        setPhase('idle')
        return
      }

      // ask → data.response ; talk/staff-talk → data.reply
      const raw = (data.reply ?? data.response ?? '').trim()
      const { clean, mood: m, gesture: g } = parseAriaTags(raw)
      // For /api/aria/ask which doesn't emit tags, use heuristic mood
      const resolvedMood    = (m !== 'neutral' || /\[mood:/.test(raw)) ? m : heuristicMood(clean)
      const resolvedGesture = g || (resolvedMood === 'happy' ? 'thumbup' : resolvedMood === 'concerned' ? 'shrug' : '')

      setMood(resolvedMood)
      setGesture(resolvedGesture)
      setReply(clean)
      setPhase('speaking')

      speakAriaText(clean, (_schedule, _startMs) => {
        const approxMs = Math.max(1500, clean.split(' ').length * 350)
        setTimeout(() => {
          setPhase('idle')
          setReply('')
          inputRef.current?.focus()
        }, approxMs)
      })
    } catch (e) {
      setError((e as Error).message ?? 'Network error')
      setPhase('idle')
    }
  }, [phase, brain, pathname, pageName])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    const rec: AriaRecog = new SR()
    recognRef.current = rec
    rec.lang = 'en-AU'; rec.continuous = false; rec.interimResults = true
    setPhase('listening'); setTranscript(''); setError('')
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = e.results.map(r => r[0].transcript).join('')
      setTranscript(t)
      if (e.results[e.results.length - 1].isFinal) { rec.stop(); send(t); setTranscript('') }
    }
    rec.onerror = () => { setPhase('idle'); setTranscript('') }
    rec.onend   = () => { setPhase(p => p === 'listening' ? 'idle' : p) }
    rec.start()
  }, [send])

  const stopListening = useCallback(() => {
    recognRef.current?.stop()
    setPhase('idle'); setTranscript('')
  }, [])

  const busy = phase === 'thinking' || phase === 'speaking'

  const phaseLabel: Record<Phase, string> = {
    idle: '', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…'
  }

  return (
    <div style={{
      position: 'fixed', bottom: 88, right: 24, zIndex: 9998,
      width: 360, maxWidth: 'calc(100vw - 32px)',
      background: T.bg,
      border: '1px solid ' + T.border,
      borderRadius: 20,
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      animation: 'ariaSlideUp 220ms cubic-bezier(0.34,1.56,0.64,1) forwards',
    }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid ' + T.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.display, fontStyle: 'italic', fontSize: 18, fontWeight: 500, color: T.sage }}>Aria</span>
          <span style={{ fontSize: 10, color: T.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {'· ' + pageName}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close Aria"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.muted, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
        >×</button>
      </div>

      {/* ── Avatar canvas ─────────────────────────────────────── */}
      <div style={{ position: 'relative', height: 200, background: 'linear-gradient(180deg, #1e3329 0%, #152820 100%)' }}>
        <AriaTalkingHead
          mode={phase === 'speaking' ? 'talking' : 'idle'}
          replyText={reply}
          mood={mood}
          gesture={gesture}
        />
        {phase !== 'idle' && (
          <div style={{
            position: 'absolute', bottom: 10, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
              borderRadius: 99, padding: '3px 12px',
              fontSize: 11, color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: phase === 'listening' ? '#EF4444' : T.sage,
                display: 'inline-block', animation: 'ariaVoicePulse 0.9s ease-in-out infinite',
              }} />
              {phaseLabel[phase]}
            </div>
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reply ? (
          <div style={{
            background: 'rgba(127,184,151,0.08)',
            border: '1px solid ' + T.border,
            borderRadius: 12, padding: '10px 12px',
            fontSize: 13, color: T.text, lineHeight: 1.6, fontFamily: T.body,
          }}>
            {reply}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: T.muted, margin: 0, fontFamily: T.body }}>
            {'Hi! Ask me anything about ' + pageName + '.'}
          </p>
        )}

        {error && (
          <p style={{ fontSize: 11, color: '#EF4444', margin: 0 }}>{error}</p>
        )}

        {transcript && (
          <p style={{ fontSize: 12, color: T.muted, fontStyle: 'italic', margin: 0 }}>{transcript}</p>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {micOk && (
            <button
              onClick={phase === 'listening' ? stopListening : startListening}
              disabled={busy}
              title={phase === 'listening' ? 'Stop' : 'Speak'}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: phase === 'listening' ? '#EF4444' : 'rgba(127,184,151,0.12)',
                border: '1px solid ' + (phase === 'listening' ? '#EF4444' : T.border),
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.4 : 1,
              }}
            >
              {phase === 'listening'
                ? <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="2" fill="#fff"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sage} strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="2" width="6" height="12" rx="3"/>
                    <path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="19" x2="12" y2="22"/>
                    <line x1="8" y1="22" x2="16" y2="22"/>
                  </svg>
              }
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder={phase === 'listening' ? 'Listening…' : 'Ask Aria…'}
            disabled={busy || phase === 'listening'}
            style={{
              flex: 1, height: 36, padding: '0 10px', borderRadius: 8,
              border: '1px solid ' + T.border,
              background: T.card, color: T.text, fontSize: 13,
              fontFamily: T.body, outline: 'none',
              opacity: (busy || phase === 'listening') ? 0.5 : 1,
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || busy || phase === 'listening'}
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.deep, border: 'none',
              cursor: (!input.trim() || busy || phase === 'listening') ? 'default' : 'pointer',
              opacity: (!input.trim() || busy || phase === 'listening') ? 0.3 : 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ariaSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes ariaVoicePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}

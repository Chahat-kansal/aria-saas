'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { stopAriaSpeech, initVoice, getVoiceBackend, ensureAudioUnlocked, onSpeakEnd } from '@/lib/aria/headTTSBridge'
import { parseAriaTags } from '@/lib/aria/parse-aria-tags'

// Avatar loaded client-only (Three.js / WebGL)
const AriaTalkingHead = dynamic(
  () => import('@/components/aria/AriaTalkingHead'),
  { ssr: false },
)

// ── Design tokens (Financial Trust palette) ──────────────────────────────
const T = {
  bg:       '#f4f7f5',
  card:     '#ffffff',
  ink:      '#1d2a24',
  muted:    '#6b7d74',
  line:     '#e6ece8',
  sage:     '#7FB897',
  deep:     '#2D5240',
  sageTint: '#eef6f1',
  amber:    '#BA7517',
  shadow:   '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)',
  display:  'var(--font-display, Cormorant, Georgia, serif)',
  body:     'var(--font-body, Outfit, Inter, sans-serif)',
} as const

const STARTERS = [
  'What can Aria do?',
  'How much does it cost?',
  'Is it right for my café?',
  'How does the daily briefing work?',
]

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking'

// Local minimal types for the Web Speech API (browser-only, not in @types/node)
type SpeechRecognitionEvent = {
  results: Array<{ 0: { transcript: string }; isFinal: boolean; length: number }>
}
type AriaRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export default function TalkToAria({ className }: { className?: string }) {
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [input,       setInput]       = useState('')
  const [replyText,   setReplyText]   = useState('')
  const [mood,        setMood]        = useState('neutral')
  const [gesture,     setGesture]     = useState('')
  const [transcript,  setTranscript]  = useState('')
  const [error,       setError]       = useState('')
  const [micSupported, setMicSupported] = useState(false)
  const [voiceBackend, setVoiceBackend] = useState<string>('none')

  const inputRef  = useRef<HTMLInputElement>(null)
  const recognRef = useRef<AriaRecognition | null>(null)

  // Initialise HeadTTS voice backend once
  useEffect(() => {
    initVoice().then(() => {
      setVoiceBackend(getVoiceBackend())
    })

    // Check Web Speech API availability
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    setMicSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition))

    return () => {
      stopAriaSpeech()
      recognRef.current?.abort()
    }
  }, [])

  // Event-driven phase transitions — driven by real AudioContext events, not timers
  useEffect(() => {
    return onSpeakEnd(() => {
      setPhase('idle')
      setReplyText('')
      inputRef.current?.focus()
    })
  }, [])

  // ── Send a message to /api/aria/talk ────────────────────────────────────
  const send = useCallback(async (text: string) => {
    ensureAudioUnlocked()  // synchronous — must precede any await to satisfy autoplay policy
    const msg = text.trim()
    if (!msg || phase === 'thinking' || phase === 'speaking') return

    stopAriaSpeech()
    setReplyText('')
    setError('')
    setInput('')
    setPhase('thinking')

    try {
      const res = await fetch('/api/aria/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json() as { reply?: string; error?: string }

      if (!res.ok || data.error) {
        setError(data.error ?? 'Something went wrong — please try again.')
        setPhase('idle')
        return
      }

      const rawReply = data.reply ?? ''
      const { clean: reply, mood: replyMood, gesture: replyGesture } = parseAriaTags(rawReply)
      setMood(replyMood)
      setGesture(replyGesture)
      setReplyText(reply)
      setPhase('speaking')
      // Phase transitions to idle via onSpeakEnd callback (real AudioContext events)

    } catch (e) {
      setError((e as Error).message ?? 'Network error')
      setPhase('idle')
    }
  }, [phase])

  // ── Mic / Web Speech Recognition ────────────────────────────────────────
  const startListening = useCallback(() => {
    ensureAudioUnlocked()  // unlock AudioContext on mic button press (user gesture)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return

    const recognition: AriaRecognition = new SR()
    recognRef.current = recognition
    recognition.lang = 'en-AU'
    recognition.continuous = false
    recognition.interimResults = true

    // Using side-effect on start via direct call below
    setPhase('listening')
    setTranscript('')
    setError('')

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setTranscript(t)
      if (e.results[e.results.length - 1].isFinal) {
        recognition.stop()
        send(t)
        setTranscript('')
      }
    }

    recognition.onerror = () => {
      setPhase('idle')
      setTranscript('')
    }

    recognition.onend = () => {
      setPhase(p => p === 'listening' ? 'idle' : p)
    }

    recognition.start()
  }, [send])

  const stopListening = useCallback(() => {
    recognRef.current?.stop()
    setPhase('idle')
    setTranscript('')
  }, [])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const busy = phase === 'thinking' || phase === 'speaking'

  // ── Phase label shown below avatar ─────────────────────────────────────
  const phaseLabel: Record<Phase, string> = {
    idle:      '',
    listening: 'Listening…',
    thinking:  'Thinking…',
    speaking:  'Speaking…',
  }

  return (
    <div
      className={className}
      style={{
        background: T.card,
        borderRadius: 24,
        boxShadow: T.shadow,
        border: '1px solid ' + T.line,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 440,
        width: '100%',
      }}
    >
      {/* ── Avatar panel ──────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(180deg, #2D5240 0%, #356048 100%)',
        position: 'relative',
        height: 260,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        overflow: 'hidden',
      }}>
        {/* Leaf glow */}
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 140, height: 140, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,.12), transparent 60%)',
          pointerEvents: 'none',
        }} />

        {/* Avatar canvas */}
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
          <AriaTalkingHead
            mode={phase === 'speaking' ? 'talking' : 'idle'}
            replyText={replyText}
            mood={mood}
            gesture={gesture}
          />
        </div>

        {/* Branding overlay */}
        <div style={{
          position: 'absolute', top: 14, left: 18, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            fontFamily: T.display,
            fontStyle: 'italic',
            fontSize: 22, fontWeight: 500,
            color: '#ffffff',
            letterSpacing: '-0.01em',
          }}>
            Aria
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.55)',
          }}>
            AI Business Co-Owner
          </span>
        </div>

        {/* Voice backend badge (debug/info) */}
        {voiceBackend.startsWith('kokoro') && (
          <div style={{
            position: 'absolute', top: 14, right: 14, zIndex: 10,
            background: 'rgba(127,184,151,.25)',
            border: '1px solid rgba(127,184,151,.45)',
            borderRadius: 99, padding: '2px 9px',
            fontSize: 10, fontWeight: 600, color: T.sage,
          }}>
            WebGPU
          </div>
        )}

        {/* Phase indicator */}
        {phase !== 'idle' && (
          <div style={{
            position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 10,
            display: 'flex', justifyContent: 'center',
          }}>
            <div style={{
              background: 'rgba(0,0,0,.45)',
              backdropFilter: 'blur(6px)',
              borderRadius: 99, padding: '4px 14px',
              fontSize: 12, fontWeight: 500, color: '#fff',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {/* Pulse dot */}
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: phase === 'listening' ? '#E24B4A' : T.sage,
                display: 'inline-block',
                animation: 'ariaPulse 0.9s ease-in-out infinite',
              }} />
              {phaseLabel[phase]}
            </div>
          </div>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Last Aria reply */}
        {replyText ? (
          <div style={{
            background: T.sageTint,
            border: '1px solid ' + T.line,
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 14,
            color: T.ink,
            lineHeight: 1.6,
            fontFamily: T.body,
          }}>
            {replyText}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: T.muted, margin: 0, fontFamily: T.body, lineHeight: 1.55 }}>
            Hi! I'm Aria — your AI-powered business co-owner. Ask me anything about what I do or how I can help your business.
          </p>
        )}

        {/* Error */}
        {error && (
          <p style={{ fontSize: 12, color: '#E24B4A', margin: 0 }}>{error}</p>
        )}

        {/* Starter chips — shown when idle */}
        {phase === 'idle' && !replyText && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {STARTERS.map(q => (
              <button
                key={q}
                onClick={() => send(q)}
                style={{
                  padding: '6px 12px', borderRadius: 99,
                  fontSize: 12, fontWeight: 500,
                  background: T.sageTint,
                  border: '1px solid ' + T.line,
                  color: T.deep,
                  cursor: 'pointer', fontFamily: T.body,
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Interim transcript while listening */}
        {transcript && (
          <p style={{ fontSize: 13, color: T.muted, fontStyle: 'italic', margin: 0 }}>
            {transcript}
          </p>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

          {/* Mic button */}
          {micSupported && (
            <button
              onClick={phase === 'listening' ? stopListening : startListening}
              disabled={busy}
              title={phase === 'listening' ? 'Stop listening' : 'Speak your question'}
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: phase === 'listening' ? '#E24B4A' : T.sageTint,
                border: '1px solid ' + (phase === 'listening' ? '#E24B4A' : T.line),
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.45 : 1,
              }}
            >
              {phase === 'listening' ? (
                /* Square = stop */
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect width="12" height="12" rx="2" fill="#fff"/>
                </svg>
              ) : (
                /* Mic icon */
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0014 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                </svg>
              )}
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={phase === 'listening' ? 'Listening…' : 'Ask Aria anything…'}
            disabled={busy || phase === 'listening'}
            style={{
              flex: 1, height: 40,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid ' + T.line,
              background: T.card,
              color: T.ink,
              fontSize: 14,
              fontFamily: T.body,
              outline: 'none',
              opacity: (busy || phase === 'listening') ? 0.5 : 1,
            }}
          />

          {/* Send button */}
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || busy || phase === 'listening'}
            style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.deep,
              border: 'none',
              cursor: (!input.trim() || busy || phase === 'listening') ? 'default' : 'pointer',
              opacity: (!input.trim() || busy || phase === 'listening') ? 0.35 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>

        {/* Attribution */}
        <p style={{ fontSize: 10, color: T.muted, margin: 0, textAlign: 'center', opacity: 0.7 }}>
          Powered by{' '}
          <a href="https://ariaos.site" target="_blank" rel="noopener noreferrer"
            style={{ color: T.deep, textDecoration: 'none', fontWeight: 500 }}>
            Aria OS
          </a>
          {voiceBackend.startsWith('kokoro') ? ' · Kokoro voice' : ' · speechSynthesis voice'}
        </p>
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes ariaPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  )
}

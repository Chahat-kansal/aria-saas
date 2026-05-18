'use client'
import { useState, useRef, useCallback } from 'react'

interface Props {
  onTranscript: (text: string) => void
  disabled?: boolean
}

interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance

export default function VoiceInput({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => {
    if (typeof window === 'undefined') return false
    const w = window as unknown as Record<string, unknown>
    return 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w
  })
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const toggle = useCallback(() => {
    if (!supported) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const w = window as unknown as Record<string, unknown>
    const SpeechRecognitionAPI = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as SpeechRecognitionCtor | undefined
    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-AU'

    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim()) onTranscript(transcript.trim())
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening, supported, onTranscript])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop listening' : 'Speak your question'}
      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
      style={{
        background: listening ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${listening ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
        color: listening ? '#ef4444' : 'rgba(255,255,255,0.5)',
      }}
    >
      {listening ? (
        <span className="w-2.5 h-2.5 rounded-sm bg-current animate-pulse" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      )}
    </button>
  )
}

'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean
  responseText: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { TalkingHead: any }
}

export function AriaTalkingHead({ isActive, responseText }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const lastTextRef = useRef('')
  const speakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const avatarUrl = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL
    ?? 'https://tcowd5vdie4rwa2o.public.blob.vercel-storage.com/Aria.glb'

  // Load TalkingHead — importmap in layout.tsx resolves bare 'three' specifier
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.TalkingHead) { setScriptReady(true); return }

    const load = async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
        console.log('[AriaTalkingHead] TalkingHead loaded')
      } catch (e) {
        console.error('[AriaTalkingHead] Load failed:', e)
      }
    }
    load()
  }, [])

  // Init — pass dummy ttsEndpoint to satisfy constructor validation
  // We never actually call TTS; we drive animations via speakAudio() with silence
  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current) return
    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        // TalkingHead v1.3 requires a ttsEndpoint string — pass a dummy that satisfies
        // the URL check. We never call speakText() so no actual TTS requests are made.
        ttsEndpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
        ttsApikey: 'DISABLED', // never used — we don't call speakText()
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraDistance: 0.7,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      headRef.current.showAvatar(
        { url: avatarUrl, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => {
          setLoaded(true)
          console.log('[AriaTalkingHead] Avatar loaded')
        },
        (e: Error) => {
          console.error('[AriaTalkingHead] Avatar load error:', e)
        }
      )
    } catch (e) {
      console.error('[AriaTalkingHead] Init error:', e)
    }
  }, [scriptReady, avatarUrl])

  // Drive speaking animation with a silent AudioBuffer
  // speakAudio() animates the avatar from audio without calling TTS
  const startSpeaking = useCallback(() => {
    if (!headRef.current || !loaded) return
    try {
      headRef.current.setMood('happy')

      // Create a short silent audio buffer — just long enough to start animation loop
      const audioCtx = new AudioContext()
      const duration = 1.5 // seconds — we'll loop it while isActive
      const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate)

      // speakAudio drives mouth/expression animation from audio timing
      // with a silent buffer it shows speaking pose without sound
      headRef.current.speakAudio(
        { audio: buffer, words: ['speaking'], wtimes: [0], wdurations: [duration * 1000] },
        () => { /* onstart */ },
        () => {
          // onend — if still active, loop
          if (speakIntervalRef.current !== null) startSpeaking()
        }
      )
      audioCtx.close()
    } catch (e) {
      console.warn('[AriaTalkingHead] speakAudio error:', e)
    }
  }, [loaded])

  const stopSpeaking = useCallback(() => {
    if (!headRef.current || !loaded) return
    try {
      headRef.current.stopSpeaking()
      headRef.current.setMood('neutral')
    } catch { /**/ }
  }, [loaded])

  useEffect(() => {
    if (!loaded) return
    if (isActive) {
      speakIntervalRef.current = 1 as unknown as ReturnType<typeof setInterval> // sentinel
      startSpeaking()
    } else {
      speakIntervalRef.current = null
      stopSpeaking()
    }
    return () => { speakIntervalRef.current = null }
  }, [isActive, loaded, startSpeaking, stopSpeaking])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />

      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(127,184,151,0.3)', borderTopColor: '#7FB897', animation: 'ariaSpin 0.8s linear infinite' }} />
          <span style={{ fontSize: 9, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}

      {isActive && loaded && (
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, pointerEvents: 'none' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 2, borderRadius: 2, background: '#7FB897', height: [5,9,7,8][i], animation: `ariaBar${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes ariaSpin { to { transform: rotate(360deg); } }
        @keyframes ariaBar0 { from { height: 4px; } to { height: 8px; } }
        @keyframes ariaBar1 { from { height: 9px; } to { height: 3px; } }
        @keyframes ariaBar2 { from { height: 5px; } to { height: 9px; } }
        @keyframes ariaBar3 { from { height: 7px; } to { height: 4px; } }
      `}</style>
    </div>
  )
}

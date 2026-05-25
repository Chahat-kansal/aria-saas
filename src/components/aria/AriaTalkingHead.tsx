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

// Public RPM avatar with ARKit + Oculus visemes — works out of the box with TalkingHead
// Use Aria's Blob GLB if available, otherwise this public fallback
// TalkingHead author's own sample — guaranteed compatible, always reachable
const FALLBACK_AVATAR = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

export function AriaTalkingHead({ isActive, responseText }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const speakingRef = useRef(false)

  // Proxy route auto-discovers the GLB from Blob storage — no hardcoded URL needed
  const avatarUrl = '/api/aria/avatar'

  // Load TalkingHead — importmap in layout.tsx resolves bare 'three' specifier
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.TalkingHead) { setScriptReady(true); return }

    const load = async () => {
      try {
        // @ts-expect-error — CDN ES module, no local types
        const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
        console.log('[AriaTalkingHead] loaded')
      } catch (e) {
        console.error('[AriaTalkingHead] load failed:', e)
      }
    }
    load()
  }, [])

  // Init — use our own /api/aria/tts as the endpoint (satisfies URL validation)
  // We never call speakText(), so this endpoint is never actually used for TTS
  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current) return
    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: '/api/aria/tts',   // our route — satisfies validation, never called
        ttsApikey: '',
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraDistance: 0.7,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      headRef.current.showAvatar(
        { url: avatarUrl, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => { setLoaded(true); console.log('[AriaTalkingHead] avatar loaded') },
        (e: Error) => { console.error('[AriaTalkingHead] avatar load error:', e) }
      )
    } catch (e) {
      console.error('[AriaTalkingHead] init error:', e)
    }
  }, [scriptReady, avatarUrl])

  // Drive speaking animation via speakAudio() with a silent AudioBuffer
  // This animates the mouth without any TTS call
  const startSpeaking = useCallback(() => {
    if (!headRef.current || !loaded || speakingRef.current) return
    speakingRef.current = true
    try {
      headRef.current.setMood('happy')
      const actx = new AudioContext()
      const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * 2), actx.sampleRate)
      headRef.current.speakAudio(
        { audio: buf, words: ['...'], wtimes: [0], wdurations: [2000] },
        undefined,
        () => {
          speakingRef.current = false
          if (isActive) startSpeaking() // loop while active
        }
      )
      actx.close()
    } catch (e) {
      speakingRef.current = false
      console.warn('[AriaTalkingHead] speakAudio error:', e)
    }
  }, [loaded, isActive])

  useEffect(() => {
    if (!loaded) return
    if (isActive) {
      startSpeaking()
    } else {
      speakingRef.current = false
      try { headRef.current?.stopSpeaking?.(); headRef.current?.setMood?.('neutral') } catch { /**/ }
    }
  }, [isActive, loaded, startSpeaking])

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

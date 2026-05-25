'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean
  responseText: string
}

// TalkingHead is an ES module loaded from CDN at runtime
// It does NOT go through webpack — uses dynamic import with webpackIgnore
// This means zero build-time dependencies, zero peer conflicts
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

  const avatarUrl = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL ?? 'https://tcowd5vdie4rwa2o.public.blob.vercel-storage.com/Aria.glb'

  // Load TalkingHead from CDN as ES module — completely bypasses webpack
  useEffect(() => {
    if (typeof window === 'undefined' || !avatarUrl) return
    if (window.TalkingHead) { setScriptReady(true); return }

    const load = async () => {
      try {
        // webpackIgnore: true prevents Next.js bundler from trying to resolve this
        const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
      } catch (e) {
        console.error('[AriaTalkingHead] CDN load failed:', e)
      }
    }
    load()
  }, [avatarUrl])

  // Initialise once script + container ready
  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current || !avatarUrl) return
    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: null,
        ttsApikey: null,
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraDistance: 0.7,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      headRef.current.showAvatar(
        { url: avatarUrl, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => { setLoaded(true); console.log('[AriaTalkingHead] Loaded') },
        (e: Error) => { console.error('[AriaTalkingHead] Load error:', e) }
      )
    } catch (e) { console.error('[AriaTalkingHead] Init error:', e) }
  }, [scriptReady, avatarUrl])

  // Silent lip animation — speakText with volume 0 drives mouth shapes visually
  const animateSpeaking = useCallback((text: string) => {
    if (!headRef.current || !loaded || !text || text === lastTextRef.current) return
    lastTextRef.current = text
    try {
      headRef.current.speakText(text, { volumeAudio: 0, volumeBackground: 0, avatarMood: 'happy' })
    } catch (e) { console.warn('[AriaTalkingHead] speakText error:', e) }
  }, [loaded])

  useEffect(() => {
    if (!loaded) return
    if (isActive && responseText) {
      animateSpeaking(responseText)
    } else if (!isActive) {
      lastTextRef.current = ''
      try { headRef.current?.stopSpeaking?.(); headRef.current?.setMood?.('neutral') } catch { /* ok */ }
    }
  }, [isActive, responseText, loaded, animateSpeaking])

  if (!avatarUrl) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(127,184,151,0.4)', borderTopColor: '#7FB897', animation: 'ariaSpin 0.8s linear infinite' }} />
          <span style={{ fontSize: 9, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}
      {isActive && loaded && (
        <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end', height: 10, pointerEvents: 'none' }}>
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

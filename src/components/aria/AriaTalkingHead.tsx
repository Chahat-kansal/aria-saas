'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface AriaTalkingHeadProps {
  isActive: boolean       // true while Aria's text is streaming
  responseText: string    // the text being streamed (triggers silent lip animation)
}

// TalkingHead loaded via script tag — declare global type
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TalkingHead: any
  }
}

export function AriaTalkingHead({ isActive, responseText }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const lastTextRef = useRef<string>('')

  const avatarUrl = process.env.NEXT_PUBLIC_ARIA_AVATAR_URL ?? ''

  // Step 1 — Load TalkingHead from jsDelivr CDN as ES module
  useEffect(() => {
    if (typeof window === 'undefined' || !avatarUrl) return
    if (window.TalkingHead) { setScriptReady(true); return }

    const load = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error — CDN ES module, no local types
        const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
      } catch (err) {
        console.error('[AriaTalkingHead] CDN load failed:', err)
      }
    }
    load()
  }, [avatarUrl])

  // Step 2 — Initialise avatar once script is ready and container mounted
  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current || !avatarUrl) return

    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: null,
        ttsApikey: null,
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraRotateY: 0,
        cameraDistance: 0.7,
        cameraX: 0,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })

      headRef.current.showAvatar(
        {
          url: avatarUrl,
          body: 'F',
          avatarMood: 'neutral',
          lipsyncLang: 'en',
        },
        () => {
          setLoaded(true)
          console.log('[AriaTalkingHead] Aria loaded')
        },
        (err: Error) => {
          console.error('[AriaTalkingHead] Load error:', err)
        }
      )
    } catch (err) {
      console.error('[AriaTalkingHead] Init error:', err)
    }
  }, [scriptReady, avatarUrl])

  // Step 3 — Drive silent lip animation from response text while streaming
  // speakText with volumeAudio: 0 = visual lip sync only, completely silent
  const animateSpeaking = useCallback((text: string) => {
    if (!headRef.current || !loaded || !text) return
    if (text === lastTextRef.current) return
    lastTextRef.current = text

    try {
      headRef.current.speakText(text, {
        volumeAudio: 0,
        volumeBackground: 0,
        avatarMood: 'happy',
      })
    } catch (err) {
      console.warn('[AriaTalkingHead] speakText error:', err)
    }
  }, [loaded])

  // Step 4 — When active and text is streaming, animate
  useEffect(() => {
    if (!loaded) return
    if (isActive && responseText) {
      animateSpeaking(responseText)
    } else if (!isActive) {
      lastTextRef.current = ''
      try {
        headRef.current?.stopSpeaking?.()
        headRef.current?.setMood?.('neutral')
      } catch { /* non-fatal */ }
    }
  }, [isActive, responseText, loaded, animateSpeaking])

  if (!avatarUrl) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      />

      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid rgba(127,184,151,0.4)',
            borderTopColor: '#7FB897',
            animation: 'ariaSpin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 10, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}

      {isActive && loaded && (
        <div style={{
          position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2,
          background: 'linear-gradient(to right, transparent, #7FB897, transparent)',
          borderRadius: 1, opacity: 0.6,
          animation: 'ariaPulseBar 1s ease-in-out infinite alternate',
        }} />
      )}

      <style>{`
        @keyframes ariaSpin { to { transform: rotate(360deg); } }
        @keyframes ariaPulseBar { from { opacity: 0.3; } to { opacity: 0.8; } }
      `}</style>
    </div>
  )
}

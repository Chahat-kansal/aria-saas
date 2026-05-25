'use client'
import { useEffect, useRef, useState, useCallback, Component } from 'react'
import type { ReactNode } from 'react'

// Error boundary — TalkingHead errors must never crash the page
class AvatarErrorBoundary extends Component<{children: ReactNode}, {error: boolean}> {
  constructor(props: {children: ReactNode}) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <AriaSVGFallback isActive={false} />
    return this.props.children
  }
}

// Simple SVG fallback — shows when TalkingHead fails
function AriaSVGFallback({ isActive }: { isActive: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1.5px solid rgba(127,184,151,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#7FB897', fontSize: 22, lineHeight: 1 }}>A</span>
      </div>
      {isActive && (
        <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end' }}>
          {[5,9,7,8].map((h,i) => (
            <div key={i} style={{ width: 2, height: h, borderRadius: 2, background: '#7FB897', animation: `ariaBar${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes ariaBar0{from{height:4px}to{height:8px}}
        @keyframes ariaBar1{from{height:9px}to{height:3px}}
        @keyframes ariaBar2{from{height:5px}to{height:9px}}
        @keyframes ariaBar3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

interface AriaTalkingHeadProps {
  isActive: boolean
  responseText: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { TalkingHead: any }
}

// TalkingHead requires a Mixamo-rigged GLB with specific bone names.
// VRoid exports are NOT compatible — use TalkingHead's own sample avatar.
const AVATAR_URL = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

function AriaTalkingHeadInner({ isActive, responseText }: AriaTalkingHeadProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)
  const speakingRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.TalkingHead) { setScriptReady(true); return }
    const load = async () => {
      try {
        const mod = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
        window.TalkingHead = mod.TalkingHead ?? mod.default
        setScriptReady(true)
      } catch (e) {
        console.error('[AriaTalkingHead] load failed:', e)
        setFailed(true)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!scriptReady || !containerRef.current || headRef.current) return
    try {
      headRef.current = new window.TalkingHead(containerRef.current, {
        ttsEndpoint: '/api/aria/tts',
        ttsApikey: '',
        cameraView: 'upper',
        cameraRotateX: 6,
        cameraDistance: 0.7,
        cameraY: 0.07,
        backgroundColor: 'transparent',
        modelPixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      })
      headRef.current.showAvatar(
        { url: AVATAR_URL, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => { setLoaded(true); console.log('[AriaTalkingHead] avatar loaded') },
        (e: Error) => { console.error('[AriaTalkingHead] avatar load error:', e); setFailed(true) }
      )
    } catch (e) {
      console.error('[AriaTalkingHead] init error:', e)
      setFailed(true)
    }
  }, [scriptReady])

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
        () => { speakingRef.current = false; if (isActive) startSpeaking() }
      )
      actx.close()
    } catch (e) {
      speakingRef.current = false
      console.warn('[AriaTalkingHead] speakAudio error:', e)
    }
  }, [loaded, isActive])

  useEffect(() => {
    if (!loaded) return
    if (isActive) { startSpeaking() }
    else {
      speakingRef.current = false
      try { headRef.current?.stopSpeaking?.(); headRef.current?.setMood?.('neutral') } catch { /**/ }
    }
  }, [isActive, loaded, startSpeaking])

  if (failed) return <AriaSVGFallback isActive={isActive} />

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'transparent' }} />
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(127,184,151,0.3)', borderTopColor: '#7FB897', animation: 'ariaSpin 0.8s linear infinite' }} />
          <span style={{ fontSize: 9, color: 'rgba(127,184,151,0.5)' }}>Aria</span>
        </div>
      )}
      {isActive && loaded && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, alignItems: 'flex-end', height: 12, pointerEvents: 'none' }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 2, borderRadius: 2, background: '#7FB897', height: [5,9,7,8][i], animation: `ariaBar${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes ariaSpin{to{transform:rotate(360deg)}}
        @keyframes ariaBar0{from{height:4px}to{height:8px}}
        @keyframes ariaBar1{from{height:9px}to{height:3px}}
        @keyframes ariaBar2{from{height:5px}to{height:9px}}
        @keyframes ariaBar3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

export function AriaTalkingHead(props: AriaTalkingHeadProps) {
  return (
    <AvatarErrorBoundary>
      <AriaTalkingHeadInner {...props} />
    </AvatarErrorBoundary>
  )
}

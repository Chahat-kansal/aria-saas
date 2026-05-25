'use client'
import { useEffect, useRef, useState, Component } from 'react'
import type { ReactNode } from 'react'

// Error boundary — nothing inside can crash the page
class AvatarErrorBoundary extends Component<{children: ReactNode}, {error: boolean}> {
  constructor(props: {children: ReactNode}) { super(props); this.state = { error: false } }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <AriaMonogram isActive={false} />
    return this.props.children
  }
}

function AriaMonogram({ isActive }: { isActive: boolean }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(127,184,151,0.12)', border: '1.5px solid rgba(127,184,151,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', color: '#7FB897', fontSize: 24, lineHeight: 1 }}>A</span>
      </div>
      {isActive && (
        <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 10 }}>
          {[5,9,7,8].map((h, i) => (
            <div key={i} style={{ width: 2, height: h, borderRadius: 2, background: '#7FB897', animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes ariaB0{from{height:4px}to{height:8px}}@keyframes ariaB1{from{height:9px}to{height:3px}}
        @keyframes ariaB2{from{height:5px}to{height:9px}}@keyframes ariaB3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

interface Props { isActive: boolean; responseText: string }

declare global { interface Window { TalkingHead: any } } // eslint-disable-line @typescript-eslint/no-explicit-any

const AVATAR = 'https://raw.githubusercontent.com/met4citizen/TalkingHead/main/avatars/brunette.glb'

function Inner({ isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const prevActiveRef = useRef(false)

  // Load TalkingHead from CDN
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.TalkingHead) { initAvatar(); return }
    import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.3/modules/talkinghead.mjs')
      .then(mod => { window.TalkingHead = mod.TalkingHead ?? mod.default; initAvatar() })
      .catch(e => { console.error('[Avatar] CDN load failed:', e); setFailed(true) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function initAvatar() {
    if (!containerRef.current || headRef.current) return
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
        { url: AVATAR, body: 'F', avatarMood: 'neutral', lipsyncLang: 'en' },
        () => { setLoaded(true); console.log('[Avatar] loaded') },
        (e: Error) => { console.error('[Avatar] load error:', e); setFailed(true) }
      )
    } catch (e) { console.error('[Avatar] init error:', e); setFailed(true) }
  }

  // Toggle mood only — no AudioContext, no audio, purely visual
  // TalkingHead animates the avatar with built-in idle/talk poses via setMood()
  useEffect(() => {
    if (!loaded || !headRef.current) return
    if (isActive === prevActiveRef.current) return
    prevActiveRef.current = isActive
    try {
      headRef.current.setMood(isActive ? 'happy' : 'neutral')
    } catch { /* ok */ }
  }, [isActive, loaded])

  if (failed) return <AriaMonogram isActive={isActive} />

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
          {[5,9,7,8].map((h, i) => (
            <div key={i} style={{ width: 2, borderRadius: 2, background: '#7FB897', height: h, animation: `ariaB${i} 0.5s ease-in-out infinite alternate`, animationDelay: `${i*0.12}s` }} />
          ))}
        </div>
      )}
      <style>{`
        @keyframes ariaSpin{to{transform:rotate(360deg)}}
        @keyframes ariaB0{from{height:4px}to{height:8px}}@keyframes ariaB1{from{height:9px}to{height:3px}}
        @keyframes ariaB2{from{height:5px}to{height:9px}}@keyframes ariaB3{from{height:7px}to{height:4px}}
      `}</style>
    </div>
  )
}

export function AriaTalkingHead(props: Props) {
  return <AvatarErrorBoundary><Inner {...props} /></AvatarErrorBoundary>
}

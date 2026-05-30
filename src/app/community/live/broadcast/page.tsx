'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { FlipHorizontal2, X, Mic, MicOff, Radio, Users } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, FONT } from '../../theme'
import { supabase } from '@/lib/supabase'

const LIVE_LIMIT = 420 // 7 minutes

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

type ChatMsg = { id: string; sender_name: string; message: string; created_at: string }
type Phase = 'pre' | 'live' | 'stats'

export default function BroadcastPage() {
  const router = useRouter()
  const videoRef  = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const pcRef     = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const [phase, setPhase]           = useState<Phase>('pre')
  const [title, setTitle]           = useState('')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [muted, setMuted]           = useState(false)
  const [elapsed, setElapsed]       = useState(0)
  const [toast, setToast]           = useState('')
  const [streamId, setStreamId]     = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [messages, setMessages]     = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]   = useState('')
  const [biz, setBiz]               = useState<{ id: string; name: string } | null>(null)
  const [endedBy, setEndedBy]       = useState<'user' | 'time_limit' | null>(null)
  const [peakViewers, setPeakViewers] = useState(0)
  const [totalMessages, setTotalMessages] = useState(0)

  // Auth + business check
  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
      const user = res.data?.user
      if (!user) { router.push('/dashboard'); return }
      supabase.from('businesses').select('id,name').eq('user_id', user.id).eq('is_active', true)
        .limit(1).single()
        .then((r: { data: { id: string; name: string } | null }) => {
          if (!r.data) { router.push('/dashboard'); return }
          setBiz(r.data)
        })
    })
  }, [router])

  // Camera preview
  async function startCamera(facing: 'user' | 'environment') {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = s
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true }
    } catch { showToast('Camera access denied') }
  }

  useEffect(() => {
    if (phase === 'pre') startCamera(facingMode)
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function flipCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    await startCamera(next)
  }

  function toggleMute() {
    const track = streamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = muted
    setMuted(m => !m)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Go Live
  async function goLive() {
    if (!biz || !streamRef.current) return
    const res = await fetch('/api/community/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || biz.name + ' Live' }),
    })
    if (!res.ok) { showToast('Failed to start live'); return }
    const d = await res.json() as { stream_id: string; whip_url: string; playback_hls: string; post_id: string }
    setStreamId(d.stream_id)
    setPhase('live')
    // WebRTC WHIP
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
    pcRef.current = pc
    streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!))
    pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) sendOffer(d.whip_url, pc)
    })
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    subscribeChat(d.stream_id)
  }

  async function sendOffer(whipUrl: string, pc: RTCPeerConnection) {
    try {
      const r = await fetch(whipUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription!.sdp,
      })
      const sdp = await r.text()
      await pc.setRemoteDescription({ type: 'answer', sdp })
    } catch { showToast('WHIP connection failed') }
  }

  // 7-min timer + auto-end
  useEffect(() => {
    if (phase !== 'live') return
    const iv = setInterval(() => {
      setElapsed(e => {
        const next = e + 1
        if (next === 360) showToast('1 minute remaining')
        if (next === 390) showToast('30 seconds remaining')
        if (next >= LIVE_LIMIT) { clearInterval(iv); endLive('time_limit') }
        return next
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll viewer count
  useEffect(() => {
    if (phase !== 'live' || !streamId) return
    const iv = setInterval(async () => {
      const d = await fetch('/api/community/live/viewers?stream_id=' + streamId).then(r => r.json()).catch(() => ({})) as { count?: number }
      if (d.count !== undefined) {
        setViewerCount(d.count)
        setPeakViewers(p => Math.max(p, d.count ?? 0))
      }
    }, 10000)
    return () => clearInterval(iv)
  }, [phase, streamId])

  function subscribeChat(sid: string) {
    const ch = supabase.channel('live-' + sid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_live_chat', filter: 'stream_id=eq.' + sid },
        (payload: { new: ChatMsg }) => {
          setMessages(prev => [...prev.slice(-49), payload.new])
          setTotalMessages(n => n + 1)
        })
      .subscribe()
    channelRef.current = ch
  }

  const endLive = useCallback(async (by: 'user' | 'time_limit') => {
    if (!streamId) return
    setEndedBy(by)
    pcRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    await fetch('/api/community/live?stream_id=' + streamId, { method: 'DELETE' }).catch(() => {})
    setPhase('stats')
  }, [streamId])

  async function sendChat() {
    if (!chatInput.trim() || !streamId || !biz) return
    const msg = chatInput.trim()
    setChatInput('')
    await fetch('/api/community/live/' + streamId + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_name: biz.name, message: msg, business_id: biz.id }),
    }).catch(() => {})
  }

  const remaining = LIVE_LIMIT - elapsed
  const isWarning = remaining <= 60

  // ── Stats screen ───────────────────────────────────────────────────
  if (phase === 'stats') return (
    <div style={{ minHeight: '100dvh', background: PALETTE.ink, color: PALETTE.surface, fontFamily: FONT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>🎬</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: PALETTE.surface }}>
        {endedBy === 'time_limit' ? 'Your 7-min live just ended' : 'Live ended'}
      </h2>
      {endedBy === 'time_limit' && (
        <span style={{ background: PALETTE.live, color: PALETTE.surface, padding: '4px 14px', borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 700 }}>7-MIN LIMIT REACHED</span>
      )}
      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
        <Stat label="Duration" value={fmtTime(elapsed)} />
        <Stat label="Peak viewers" value={String(peakViewers)} />
        <Stat label="Messages" value={String(totalMessages)} />
      </div>
      <button onClick={() => router.push('/community/me')}
        style={{ marginTop: 20, padding: '15px 40px', borderRadius: RADIUS.pill, background: PALETTE.accent, color: PALETTE.ink, fontWeight: 700, fontSize: 16, border: 'none', cursor: 'pointer' }}>
        Done
      </button>
    </div>
  )

  // ── Live screen ────────────────────────────────────────────────────
  if (phase === 'live') return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', fontFamily: FONT }}>
      <video ref={videoRef} autoPlay muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* Top overlay */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 12px) + 12px)', left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: PALETTE.live, color: '#fff', padding: '4px 10px', borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 800, letterSpacing: '0.06em' }}>LIVE</span>
          <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: RADIUS.pill, fontSize: 13, fontWeight: 700 }}>
            {isWarning
              ? <span style={{ color: PALETTE.live }}>{fmtTime(remaining)}</span>
              : fmtTime(elapsed)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: RADIUS.pill, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Users size={12} /> {viewerCount}
          </span>
          <button onClick={() => endLive('user')}
            style={{ background: PALETTE.live, border: 'none', color: '#fff', padding: '7px 14px', borderRadius: RADIUS.pill, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            End Live
          </button>
        </div>
      </div>

      {/* Bottom chat */}
      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 8px) + 8px)', left: 12, right: 12, zIndex: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, maxHeight: 160, overflowY: 'hidden' }}>
          {messages.slice(-5).map(m => (
            <div key={m.id} style={{ background: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.pill, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: PALETTE.accent }}>{m.sender_name}</span>
              <span style={{ fontSize: 12, color: '#fff' }}>{m.message}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendChat() }}
            placeholder="Say something…" maxLength={200}
            style={{ flex: 1, padding: '10px 16px', borderRadius: RADIUS.pill, background: 'rgba(0,0,0,0.55)', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 14, outline: 'none' }} />
          <button onClick={sendChat} style={{ padding: '0 20px', borderRadius: RADIUS.pill, background: PALETTE.accent, border: 'none', color: PALETTE.ink, fontWeight: 700, cursor: 'pointer' }}>
            Send
          </button>
        </div>
      </div>
      {toast && <LiveToast msg={toast} />}
    </div>
  )

  // ── Pre-live screen ────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', fontFamily: FONT }}>
      <video ref={videoRef} autoPlay muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />

      {/* Close */}
      <button onClick={() => router.back()}
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 12px) + 12px)', left: 16, zIndex: 10, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
        <X size={20} color="#fff" />
      </button>

      {/* Flip camera */}
      <button onClick={flipCamera}
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 12px) + 12px)', right: 64, zIndex: 10, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
        <FlipHorizontal2 size={20} color="#fff" />
      </button>

      {/* Mute toggle */}
      <button onClick={toggleMute}
        style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 12px) + 12px)', right: 16, zIndex: 10, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
        {muted ? <MicOff size={20} color="#fff" /> : <Mic size={20} color="#fff" />}
      </button>

      {/* Bottom controls */}
      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 24px) + 24px)', left: 24, right: 24, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={biz ? biz.name + ' Live' : 'Add title…'}
          style={{ width: '100%', padding: '13px 18px', borderRadius: RADIUS.pill, background: 'rgba(0,0,0,0.6)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
        <button onClick={goLive} disabled={!biz}
          style={{ width: 80, height: 80, borderRadius: '50%', background: PALETTE.live, border: '4px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: biz ? 'pointer' : 'default', opacity: biz ? 1 : 0.5 }}>
          <Radio size={32} color="#fff" />
        </button>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600 }}>7-minute limit · no recording</span>
      </div>
      {toast && <LiveToast msg={toast} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: PALETTE.accent }}>{value}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function LiveToast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: RADIUS.pill, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', border: BORDER, zIndex: 100 }}>
      {msg}
    </div>
  )
}

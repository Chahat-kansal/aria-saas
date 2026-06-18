'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { X, Volume2, VolumeX, Users, Send } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, FONT, SIGNAL_COLORS } from '../../theme'
import { supabase } from '@/lib/supabase'

type ChatMsg = { id: string; sender_name: string; message: string; created_at: string }
type StreamInfo = { id: string; title: string | null; cf_playback_hls: string; status: string; businesses: { name: string | null; logo_url: string | null } | null }

export default function ViewerPage() {
  const router = useRouter()
  const params = useParams()
  const streamId = params?.stream_id as string

  const videoRef   = useRef<HTMLVideoElement>(null)
  const hlsRef     = useRef<unknown>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const [stream, setStream]         = useState<StreamInfo | null>(null)
  const [loading, setLoading]       = useState(true)
  const [ended, setEnded]           = useState(false)
  const [muted, setMuted]           = useState(false)
  const [messages, setMessages]     = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]   = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [nickname, setNickname]     = useState('viewer')
  const [pulse, setPulse]           = useState<{ busy_now: boolean; promo_live: boolean; sales_this_stream: number } | null>(null)

  // Load stream info
  useEffect(() => {
    if (!streamId) return
    fetch('/api/community/live/stream?stream_id=' + streamId)
      .then(r => r.json())
      .then((d: { stream?: StreamInfo; error?: string }) => {
        if (!d.stream || d.stream.status === 'ended') { setEnded(true); setLoading(false); return }
        setStream(d.stream)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Get or create nickname
    supabase.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
      const user = res.data?.user
      if (user) {
        supabase.from('businesses').select('name').eq('user_id', user.id).limit(1).single()
          .then((r: { data: { name: string } | null }) => { if (r.data?.name) setNickname(r.data.name) })
      }
    })
  }, [streamId])

  // HLS player
  useEffect(() => {
    if (!stream || !videoRef.current) return
    const video = videoRef.current
    const src = stream.cf_playback_hls

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (!Hls.isSupported()) { video.src = src; video.play().catch(() => {}); return }
        const hls = new Hls()
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
        hlsRef.current = hls
      })
    }
    return () => {
      const hls = hlsRef.current as { destroy?: () => void } | null
      hls?.destroy?.()
    }
  }, [stream])

  // Realtime chat + presence
  useEffect(() => {
    if (!streamId) return
    const ch = supabase.channel('live-' + streamId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'community_live_chat',
        filter: 'stream_id=eq.' + streamId,
      }, (payload: { new: ChatMsg }) => {
        setMessages(prev => [...prev.slice(-49), payload.new])
      })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        setViewerCount(Object.keys(state).length)
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user: nickname })
        }
      })
    channelRef.current = ch

    // Watch for stream end
    const endWatch = supabase.channel('live-end-' + streamId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'community_live_streams',
        filter: 'id=eq.' + streamId,
      }, (payload: { new: { status: string } }) => {
        if (payload.new.status === 'ended') {
          setEnded(true)
          setTimeout(() => router.push('/community'), 3000)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
      supabase.removeChannel(endWatch)
    }
  }, [streamId, nickname, router])

  // POS pulse — grounded live signals for the streaming business. Poll every 60s while active.
  useEffect(() => {
    const sid = stream?.id
    if (!sid || ended) return
    let active = true
    const load = () => {
      fetch('/api/community/live/' + sid + '/pulse')
        .then(r => (r.ok ? r.json() : null))
        .then((d: { busy_now?: boolean; promo_live?: boolean; sales_this_stream?: number } | null) => {
          if (active && d) setPulse({ busy_now: !!d.busy_now, promo_live: !!d.promo_live, sales_this_stream: Number(d.sales_this_stream) || 0 })
        })
        .catch(() => {})
    }
    load()
    const iv = setInterval(load, 60000)
    return () => { active = false; clearInterval(iv) }
  }, [stream?.id, ended])

  async function sendChat() {
    if (!chatInput.trim() || !streamId) return
    const msg = chatInput.trim()
    setChatInput('')
    await fetch('/api/community/live/' + streamId + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_name: nickname, message: msg }),
    }).catch(() => {})
  }

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: FONT, fontSize: 14 }}>
      Loading live stream…
    </div>
  )

  if (ended) return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: FONT, color: '#fff', textAlign: 'center', padding: 32 }}>
      <div style={{ fontSize: 48 }}>📺</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Live has ended</h2>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Redirecting to feed…</p>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', fontFamily: FONT }}>
      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        muted={muted}
        onClick={() => setMuted(m => !m)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
      />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 12px) + 12px)', left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: stream?.businesses?.logo_url ? 'center/cover' : PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: PALETTE.ink, overflow: 'hidden' }}>
            {stream?.businesses?.logo_url
              ? <img src={stream.businesses.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (stream?.businesses?.name?.[0]?.toUpperCase() ?? '?')}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{stream?.businesses?.name ?? 'Live'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: PALETTE.live, color: '#fff', padding: '2px 8px', borderRadius: RADIUS.pill, fontSize: 10, fontWeight: 800 }}>LIVE</span>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Users size={10} /> {viewerCount}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMuted(m => !m)}
            style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            {muted ? <VolumeX size={16} color="#fff" /> : <Volume2 size={16} color="#fff" />}
          </button>
          <button onClick={() => router.push('/community')}
            style={{ background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={18} color="#fff" />
          </button>
        </div>
      </div>

      {/* Tap-for-sound hint */}
      {muted && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translateX(-50%) translateY(-50%)', background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '8px 16px', borderRadius: RADIUS.pill, fontSize: 13, pointerEvents: 'none', fontWeight: 600 }}>
          Tap for sound
        </div>
      )}

      {/* Bottom chat */}
      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 8px) + 8px)', left: 12, right: 12, zIndex: 10 }}>
        {/* POS pulse — only renders when the DB confirms a live signal (no empty row, no invented figures) */}
        {pulse && (pulse.busy_now || pulse.promo_live || pulse.sales_this_stream > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {pulse.busy_now && (
              <span style={{ background: SIGNAL_COLORS.busy, color: '#fff', padding: '4px 11px', borderRadius: RADIUS.pill, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>🔴 BUSY NOW</span>
            )}
            {pulse.promo_live && (
              <span style={{ background: SIGNAL_COLORS.promo, color: '#fff', padding: '4px 11px', borderRadius: RADIUS.pill, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>📣 PROMO LIVE</span>
            )}
            {pulse.sales_this_stream > 0 && (
              <span style={{ background: SIGNAL_COLORS.fresh, color: '#fff', padding: '4px 11px', borderRadius: RADIUS.pill, fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>🛒 {pulse.sales_this_stream} {pulse.sales_this_stream === 1 ? 'sale' : 'sales'} this stream</span>
            )}
          </div>
        )}
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
          <button onClick={sendChat}
            style={{ padding: '0 16px', borderRadius: RADIUS.pill, background: PALETTE.accent, border: BORDER, color: PALETTE.ink, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Send size={16} color={PALETTE.ink} />
          </button>
        </div>
      </div>
    </div>
  )
}

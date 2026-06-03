'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const EDGE = SB_URL + '/functions/v1/reel-engine'
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ── Types ─────────────────────────────────────────────────────────────────────
type Inf = { id: string; name: string; description: string; image_url: string
             higgsfield_job_id: string; soul_id: string | null; soul_status: string }
type Session = { id: string; status: string; video_url: string | null
                 cost_aud: number; created_at: string; style: string; duration_seconds: number }

// ── Editor config ─────────────────────────────────────────────────────────────
const STYLES = [
  { id: 'lifestyle',        emoji: '☀️', label: 'Lifestyle',    desc: 'Warm & relatable' },
  { id: 'ugc',              emoji: '📱', label: 'UGC',          desc: 'Raw creator feel' },
  { id: 'product_showcase', emoji: '🛍️', label: 'Product',      desc: 'Hero shot' },
  { id: 'cinematic',        emoji: '🎬', label: 'Cinematic',    desc: 'Film quality' },
  { id: 'behind_scenes',    emoji: '🎥', label: 'BTS',          desc: 'Authentic' },
  { id: 'flash_sale',       emoji: '⚡', label: 'Flash Sale',   desc: 'Urgent energy' },
  { id: 'testimonial',      emoji: '💬', label: 'Testimonial',  desc: 'Social proof' },
  { id: 'day_in_life',      emoji: '🌅', label: 'Day in Life',  desc: 'Story format' },
]

const GENRES = ['auto','action','comedy','drama','epic','noir']

const DURATIONS = [
  { secs: 5,  label: '5s',  credits: 10, costAud: 0.48 },
  { secs: 8,  label: '8s',  credits: 16, costAud: 0.76 },
  { secs: 10, label: '10s', credits: 20, costAud: 0.95 },
  { secs: 15, label: '15s', credits: 30, costAud: 1.43 },
]

const RESOLUTIONS = [
  { id: '720p',  label: '720p HD', note: 'Fast' },
  { id: '1080p', label: '1080p FHD', note: 'Best' },
]

const CAPTION_STYLES = [
  { id: 'none',    label: 'None' },
  { id: 'bold',    label: 'Bold white' },
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'minimal', label: 'Minimal' },
]

const FILTER_PRESETS = [
  { id: 'none',    label: 'Original', css: '' },
  { id: 'warm',    label: 'Warm',     css: 'sepia(0.3) saturate(1.3) brightness(1.05)' },
  { id: 'cool',    label: 'Cool',     css: 'hue-rotate(20deg) saturate(0.9) brightness(0.95)' },
  { id: 'vivid',   label: 'Vivid',    css: 'saturate(1.6) contrast(1.1)' },
  { id: 'muted',   label: 'Muted',    css: 'saturate(0.7) contrast(0.95) brightness(1.05)' },
  { id: 'noir',    label: 'Noir',     css: 'grayscale(0.8) contrast(1.2)' },
  { id: 'golden',  label: 'Golden',   css: 'sepia(0.5) saturate(1.4) hue-rotate(-10deg)' },
]

const MUSIC_MOODS = [
  { id: 'upbeat',    label: '⚡ Upbeat',     query: 'upbeat happy pop' },
  { id: 'chill',     label: '🎶 Chill',      query: 'chill lofi calm' },
  { id: 'energetic', label: '🔥 Energetic',  query: 'energetic bold powerful' },
  { id: 'warm',      label: '🌅 Warm',       query: 'warm acoustic cosy' },
  { id: 'cinematic', label: '🎬 Cinematic',  query: 'cinematic orchestral epic' },
  { id: 'corporate', label: '💼 Corporate',  query: 'corporate professional uplifting' },
]
type PixabayTrack = { id: number; title: string; duration: number; url: string; preview: string|null; bpm: number|null; artist: string }

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReelStudioPage() {
  const supabase = createBrowserClient(SB_URL, SB_ANON)
  const [bid, setBid] = useState<string|null>(null)
  const [userToken, setUserToken] = useState<string|null>(null)

  // Influencer
  const [influencers, setInfluencers] = useState<Inf[]>([])
  const [selectedInf, setSelectedInf] = useState<Inf|null>(null)
  const [showPicker, setShowPicker] = useState(false)

  // Scene
  const [scenePreview, setScenePreview] = useState<string|null>(null)
  const [sceneUrl, setSceneUrl] = useState<string|null>(null)
  const [sceneUploading, setSceneUploading] = useState(false)
  const sceneRef = useRef<HTMLInputElement>(null)

  // Editor settings
  const [style, setStyle] = useState('lifestyle')
  const [duration, setDuration] = useState(10)
  const [resolution, setResolution] = useState('720p')
  const [genre, setGenre] = useState('auto')
  const [prompt, setPrompt] = useState('')
  const [captionStyle, setCaptionStyle] = useState('none')
  const [captionText, setCaptionText] = useState('')
  const [filter, setFilter] = useState('none')
  const [music, setMusic] = useState('none')
  const [musicMood, setMusicMood] = useState('upbeat')
  const [musicTracks, setMusicTracks] = useState<PixabayTrack[]>([])
  const [musicLoading, setMusicLoading] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<PixabayTrack|null>(null)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement|null>(null)
  const [playingId, setPlayingId] = useState<number|null>(null)
  const [speed, setSpeed] = useState(1)
  const [watermark, setWatermark] = useState(false)
  const [endCard, setEndCard] = useState('')

  // Generation state
  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [latestVideo, setLatestVideo] = useState<string|null>(null)
  const [activeJob, setActiveJob] = useState<{jobId:string;sessionId:string}|null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')
  const [publishCaption, setPublishCaption] = useState('')
  const [publishPlatform, setPublishPlatform] = useState<'instagram'|'facebook'>('instagram')
  const pollRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  // History + tabs
  const [sessions, setSessions] = useState<Session[]>([])
  const [tab, setTab] = useState<'create'|'edit'|'history'>('create')
  const [totalSpent, setTotalSpent] = useState(0)
  const [monthlyReels, setMonthlyReels] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUserToken(session.access_token)
        loadBiz(session.user.id)
      }
    })
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  async function loadBiz(uid: string) {
    const { data } = await supabase.from('businesses').select('id')
      .eq('user_id', uid).eq('is_active', true).maybeSingle()
    if (!data) return
    setBid(data.id)
    const [infRes, sesRes] = await Promise.all([
      fetch('/api/social/influencer-library'),
      supabase.from('reel_studio_sessions').select('*')
        .eq('business_id', data.id).order('created_at', { ascending: false }).limit(30)
    ])
    const infData = await infRes.json()
    if (infData.influencers) setInfluencers(infData.influencers)
    if (sesRes.data) {
      setSessions(sesRes.data)
      const completed = sesRes.data.filter((s: Session) => s.status === 'completed')
      setTotalSpent(completed.reduce((a: number, s: Session) => a + Number(s.cost_aud ?? 0), 0))
      const thisMonth = sesRes.data.filter((s: Session) => new Date(s.created_at).getMonth() === new Date().getMonth())
      setMonthlyReels(thisMonth.length)
    }
  }

  async function loadMusicTracks(mood: string) {
    setMusicLoading(true); setMusicTracks([])
    try {
      const res = await fetch(`/api/social/music-search?mood=${mood}`)
      const d = await res.json()
      setMusicTracks(d.tracks ?? [])
    } catch {}
    setMusicLoading(false)
  }

  function previewTrack(track: PixabayTrack) {
    if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0 }
    if (playingId === track.id) { setPlayingId(null); return }
    const url = track.preview ?? track.url
    if (!url) return
    const audio = new Audio(url)
    audio.volume = 0.4
    audio.play().catch(() => {})
    audio.onended = () => setPlayingId(null)
    setPreviewAudio(audio)
    setPlayingId(track.id)
  }

  async function handleSceneUpload(file: File) {
    setScenePreview(URL.createObjectURL(file))
    setSceneUploading(true)
    try {
      const path = `${bid}/${Date.now()}.${file.name.split('.').pop()}`
      await supabase.storage.from('reel-scenes').upload(path, file)
      const { data: { publicUrl } } = supabase.storage.from('reel-scenes').getPublicUrl(path)
      setSceneUrl(publicUrl)
    } catch (e: any) { setGenMsg('Upload failed: ' + e.message) }
    setSceneUploading(false)
  }

  async function generate() {
    if (!bid || !userToken || generating) return
    setGenerating(true); setLatestVideo(null); setGenProgress(5)
    setGenMsg(selectedInf?.soul_status === 'ready'
      ? '🎭 Soul detected — consistent face guaranteed…'
      : selectedInf ? '🎬 Using influencer as start frame…'
      : '✨ Generating scene…')

    try {
      const res = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
        body: JSON.stringify({
          business_id: bid,
          influencer_id: selectedInf?.id ?? null,
          soul_id: selectedInf?.soul_status === 'ready' ? selectedInf.soul_id : null,
          higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null,
          scene_image_url: sceneUrl ?? null,
          prompt: prompt || null, style, duration_seconds: duration,
          resolution, genre,
        }),
      })
      const d = await res.json()
      if (!d.job_id) throw new Error(d.error ?? 'No job_id')
      setGenMsg(`🎬 Generating ${duration}s reel (~60–90s)… ${d.used_soul ? '• Soul mode ✓' : ''}`)
      setGenProgress(15)
      setActiveJob({ jobId: d.job_id, sessionId: d.session_id })
      pollStatus(d.job_id, d.session_id, userToken)
    } catch (e: any) {
      setGenMsg('❌ ' + e.message); setGenerating(false); setGenProgress(0)
    }
  }

  const pollStatus = useCallback(async (jobId: string, sessionId: string, token: string) => {
    try {
      const res = await fetch(`${EDGE}?job_id=${jobId}&session_id=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const d = await res.json()
      if (d.status === 'COMPLETED') {
        setLatestVideo(d.video_url); setGenerating(false); setGenProgress(100)
        setGenMsg('✅ Reel ready! Review below then download.')
        setActiveJob(null); setTab('edit')
        if (bid) loadBiz(bid)
      } else if (d.status === 'FAILED') {
        setGenMsg('❌ ' + (d.error ?? 'Generation failed')); setGenerating(false); setGenProgress(0); setActiveJob(null)
      } else {
        setGenProgress(p => Math.min(p + 8, 88))
        pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 5000)
      }
    } catch {
      pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 8000)
    }
  }, [bid])

  async function publishReel() {
    if (!latestVideo || !bid || !userToken || publishing) return
    setPublishing(true); setPublishMsg('')
    try {
      // Create a social_post record with the video_url then publish it
      const createRes = await fetch('/api/social/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: bid,
          platform: publishPlatform,
          caption: publishCaption || (selectedInf ? selectedInf.name + ' visits our store — authentic & warm ☕' : 'Check out our latest reel!'),
          hashtags: ['smallbusiness', 'australia', 'reels', 'local'],
          post_type: 'reel',
          video_url: latestVideo,
        }),
      })
      const cd = await createRes.json()
      if (!cd.post?.id) throw new Error(cd.error ?? 'Could not create post')

      const pubRes = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: cd.post.id, business_id: bid, post_type_override: 'reel' }),
      })
      const pd = await pubRes.json()
      if (!pubRes.ok) throw new Error(pd.error ?? 'Publish failed')
      setPublishMsg('✅ Published to ' + publishPlatform + '!')
    } catch (e: any) {
      setPublishMsg('❌ ' + e.message)
    }
    setPublishing(false)
  }

  const selectedDuration = DURATIONS.find(d => d.secs === duration) ?? DURATIONS[2]
  const selectedFilter = FILTER_PRESETS.find(f => f.id === filter) ?? FILTER_PRESETS[0]

  const C = {
    page: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh', background: '#08090d', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13 },
    hdr: { padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    tabs: { display: 'flex', gap: 4, padding: '12px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
    tab: (a: boolean) => ({ padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, background: a ? '#1a1d24' : 'transparent', color: a ? '#fff' : 'rgba(255,255,255,0.4)', borderBottom: a ? '2px solid #7FB897' : '2px solid transparent' }),
    body: { display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, flex: 1 },
    left: { borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto' as const, padding: '20px 16px', display: 'flex', flexDirection: 'column' as const, gap: 16 },
    right: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: 32, background: '#0a0b0f', gap: 20 },
    section: { background: 'rgba(255,255,255,0.025)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' },
    slabel: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 10, display: 'block' },
    chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
    chip: (a: boolean) => ({ padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, background: a ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.06)', color: a ? '#7FB897' : 'rgba(255,255,255,0.5)', boxShadow: a ? 'inset 0 0 0 1px rgba(127,184,151,0.5)' : 'none', transition: 'all 120ms' }),
  }

  return (
    <div style={C.page}>
      {/* Header */}
      <div style={C.hdr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>🎬 Reel Studio</span>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>PLUS</span>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 11 }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{monthlyReels} reels this month</span>
          <span style={{ color: '#F59E0B', fontWeight: 700 }}>${totalSpent.toFixed(2)} AUD spent</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={C.tabs}>
        {(['create', 'edit', 'history'] as const).map(t => (
          <button key={t} style={C.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'create' ? '✦ Create' : t === 'edit' ? '✂ Edit & Export' : '⏱ History'}
          </button>
        ))}
      </div>

      {/* CREATE TAB */}
      {tab === 'create' && (
        <div style={C.body}>
          {/* Left — controls */}
          <div style={C.left}>

            {/* Influencer */}
            <div style={C.section}>
              <span style={C.slabel}>
                AI Influencer
                {selectedInf?.soul_status === 'ready' && <span style={{ color: '#7FB897', marginLeft: 6 }}>✓ Soul trained</span>}
              </span>
              {selectedInf ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img src={selectedInf.image_url} alt="" style={{ width: 44, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedInf.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>
                      {selectedInf.soul_status === 'ready' ? '✓ Consistent face across all reels' : 'Single reference frame'}
                    </div>
                  </div>
                  <button onClick={() => setShowPicker(true)} style={{ ...C.chip(false), flexShrink: 0 }}>Change</button>
                </div>
              ) : (
                <button onClick={() => setShowPicker(true)} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px dashed rgba(127,184,151,0.25)', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit', fontSize: 12 }}>
                  + Pick AI Influencer
                </button>
              )}
            </div>

            {/* Scene photo */}
            <div style={C.section}>
              <span style={C.slabel}>Shop / Product photo <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>optional</span></span>
              <input ref={sceneRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleSceneUpload(e.target.files[0])} />
              {scenePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={scenePreview} alt="" style={{ height: 72, borderRadius: 8, objectFit: 'cover', border: '1.5px solid rgba(127,184,151,0.3)' }} />
                  {sceneUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>Uploading…</div>}
                  <button onClick={() => { setScenePreview(null); setSceneUrl(null) }} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <button onClick={() => sceneRef.current?.click()} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit', fontSize: 12 }}>
                  📷 Upload photo
                </button>
              )}
            </div>

            {/* Vibe */}
            <div style={C.section}>
              <span style={C.slabel}>Vibe / Style</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {STYLES.map(s => (
                  <button key={s.id} onClick={() => setStyle(s.id)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: style === s.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)', boxShadow: style === s.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', transition: 'all 120ms' }}>
                    <span style={{ fontSize: 15 }}>{s.emoji}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: style === s.id ? '#7FB897' : 'rgba(255,255,255,0.7)', marginTop: 2 }}>{s.label}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Scene description */}
            <div style={C.section}>
              <span style={C.slabel}>Scene description <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>optional — Aria writes it for you if blank</span></span>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                placeholder="e.g. Walks into a warm café, picks up a flat white, smiles at camera, cosy morning light"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
            </div>

            {/* Duration + Resolution */}
            <div style={C.section}>
              <span style={C.slabel}>Duration</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {DURATIONS.map(d => (
                  <button key={d.secs} onClick={() => setDuration(d.secs)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, background: duration === d.secs ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)', boxShadow: duration === d.secs ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: duration === d.secs ? '#7FB897' : 'rgba(255,255,255,0.4)', transition: 'all 120ms' }}>
                    {d.label}
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginTop: 1 }}>${d.costAud}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {RESOLUTIONS.map(r => (
                  <button key={r.id} onClick={() => setResolution(r.id)} style={{ ...C.chip(resolution === r.id) }}>
                    {r.label} <span style={{ opacity: 0.6 }}>· {r.note}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Genre (for Seedance) */}
            <div style={C.section}>
              <span style={C.slabel}>Cinematic genre</span>
              <div style={C.chipRow}>
                {GENRES.map(g => (
                  <button key={g} onClick={() => setGenre(g)} style={C.chip(genre === g)}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost + Generate */}
            <div style={{ background: 'rgba(127,184,151,0.05)', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>This reel</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{selectedDuration.credits} credits · {resolution} · {duration}s</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B' }}>${selectedDuration.costAud.toFixed(2)}</div>
            </div>

            <button onClick={generate} disabled={generating} style={{ padding: '14px 0', borderRadius: 12, border: 'none', cursor: generating ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, background: generating ? 'rgba(127,184,151,0.25)' : 'linear-gradient(135deg,#7FB897,#2D5240)', color: generating ? 'rgba(255,255,255,0.4)' : '#fff', letterSpacing: -0.3, boxShadow: generating ? 'none' : '0 4px 20px rgba(127,184,151,0.2)' }}>
              {generating ? '⏳ Generating…' : `Generate Reel — $${selectedDuration.costAud.toFixed(2)} AUD`}
            </button>

            {genMsg && (
              <div style={{ fontSize: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: genMsg.startsWith('✅') ? '#7FB897' : genMsg.startsWith('❌') ? '#EF4444' : 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                {genMsg}
                {generating && (
                  <div style={{ marginTop: 8, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: genProgress + '%', background: '#7FB897', borderRadius: 99, transition: 'width 0.8s ease' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — preview */}
          <div style={C.right}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#7FB897', marginBottom: 12, fontWeight: 700 }}>✅ Reel generated — switch to Edit tab to add captions, music & filters</div>
                <div style={{ border: '2px solid rgba(127,184,151,0.3)', borderRadius: 16, overflow: 'hidden', width: 220 }}>
                  <video ref={videoRef} src={latestVideo} controls autoPlay loop playsInline style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                  <button onClick={() => setTab('edit')} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: '#7FB897', color: '#0f1117' }}>✂ Edit →</button>
                  <a href={latestVideo} download="aria-reel.mp4" style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>⬇ Download</a>
                </div>
              </div>
            ) : generating ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, border: '3px solid rgba(127,184,151,0.2)', borderTopColor: '#7FB897', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Generating your reel…</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Usually 60–90 seconds · Powered by Higgsfield</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                <div style={{ width: 120, height: 200, borderRadius: 16, border: '2px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>🎬</div>
                <div style={{ fontSize: 13 }}>Configure your reel and hit Generate</div>
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>9:16 vertical · up to 15s · 1080p</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT TAB */}
      {tab === 'edit' && (
        <div style={C.body}>
          <div style={C.left}>
            {!latestVideo && (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                Generate a reel first, then edit it here
              </div>
            )}

            {/* Speed */}
            <div style={C.section}>
              <span style={C.slabel}>Playback speed</span>
              <div style={C.chipRow}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                  <button key={s} onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s }} style={C.chip(speed === s)}>{s}×</button>
                ))}
              </div>
            </div>

            {/* Filter */}
            <div style={C.section}>
              <span style={C.slabel}>Visual filter</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {FILTER_PRESETS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, textAlign: 'left', background: filter === f.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)', boxShadow: filter === f.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: filter === f.id ? '#7FB897' : 'rgba(255,255,255,0.6)', transition: 'all 120ms' }}>{f.label}</button>
                ))}
              </div>
            </div>

            {/* Captions */}
            <div style={C.section}>
              <span style={C.slabel}>Auto-captions</span>
              <div style={C.chipRow}>
                {CAPTION_STYLES.map(c => (
                  <button key={c.id} onClick={() => setCaptionStyle(c.id)} style={C.chip(captionStyle === c.id)}>{c.label}</button>
                ))}
              </div>
              {captionStyle !== 'none' && (
                <textarea value={captionText} onChange={e => setCaptionText(e.target.value)} rows={2} placeholder="Caption text (e.g. Fresh every morning ☕)" style={{ width: '100%', marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              )}
            </div>

            {/* Music — Pixabay live search */}
            <div style={C.section}>
              <span style={C.slabel}>Background music <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>powered by Pixabay · 230k free tracks</span></span>
              <button onClick={() => { setMusic('none'); setSelectedTrack(null) }} style={{ ...C.chip(music === 'none'), marginBottom: 10 }}>🚫 No music</button>
              {/* Mood selector */}
              <div style={C.chipRow}>
                {MUSIC_MOODS.map(m => (
                  <button key={m.id} onClick={() => { setMusicMood(m.id); loadMusicTracks(m.id) }} style={C.chip(musicMood === m.id)}>{m.label}</button>
                ))}
              </div>
              {/* Track list */}
              <div style={{ marginTop: 10 }}>
                {musicLoading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '8px 0' }}>🔍 Searching Pixabay…</div>}
                {!musicLoading && musicTracks.length === 0 && (
                  <button onClick={() => loadMusicTracks(musicMood)} style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>Load tracks →</button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {musicTracks.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: selectedTrack?.id === t.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)', boxShadow: selectedTrack?.id === t.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'all 120ms' }}
                      onClick={() => { setSelectedTrack(t); setMusic(t.url) }}>
                      <button onClick={e => { e.stopPropagation(); previewTrack(t) }} style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: playingId === t.id ? '#7FB897' : 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 10, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {playingId === t.id ? '■' : '▶'}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: selectedTrack?.id === t.id ? '#7FB897' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{t.artist} · {t.duration ? Math.floor(t.duration/60)+'m '+String(t.duration%60).padStart(2,'0')+'s' : ''}{t.bpm ? ' · '+t.bpm+' BPM' : ''}</div>
                      </div>
                      {selectedTrack?.id === t.id && <span style={{ fontSize: 9, color: '#7FB897', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Brand */}
            <div style={C.section}>
              <span style={C.slabel}>Brand options</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
                <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Add Aria watermark</span>
              </label>
              <input value={endCard} onChange={e => setEndCard(e.target.value)} placeholder="End card text (e.g. Visit us at 123 Cafe St)" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {latestVideo && (
              <a href={latestVideo} download="aria-reel.mp4" style={{ display: 'block', textAlign: 'center', padding: '13px 0', borderRadius: 12, background: 'linear-gradient(135deg,#7FB897,#2D5240)', color: '#fff', fontSize: 14, fontWeight: 800, textDecoration: 'none', letterSpacing: -0.3 }}>
                ⬇ Download Reel
              </a>
            )}

            {/* Publish to social */}
            {latestVideo && (
              <div style={C.section}>
                <span style={C.slabel}>Publish directly to social</span>

                {/* Platform selector */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {(['instagram', 'facebook'] as const).map(p => (
                    <button key={p} onClick={() => setPublishPlatform(p)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: publishPlatform === p ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)', boxShadow: publishPlatform === p ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: publishPlatform === p ? '#7FB897' : 'rgba(255,255,255,0.4)' }}>
                      {p === 'instagram' ? '📸 Instagram' : '👍 Facebook'}
                    </button>
                  ))}
                </div>

                {/* Caption */}
                <textarea
                  value={publishCaption}
                  onChange={e => setPublishCaption(e.target.value)}
                  rows={3}
                  placeholder="Caption for this reel (leave blank for auto-generated)"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: 10, lineHeight: 1.6 }}
                />

                <button
                  onClick={publishReel}
                  disabled={publishing}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', cursor: publishing ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, background: publishing ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#4f46e5)', color: publishing ? 'rgba(255,255,255,0.4)' : '#fff', letterSpacing: -0.2 }}>
                  {publishing ? '⏳ Publishing…' : `🚀 Publish to ${publishPlatform === 'instagram' ? 'Instagram' : 'Facebook'} Reels`}
                </button>

                {publishMsg && (
                  <div style={{ fontSize: 12, marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', color: publishMsg.startsWith('✅') ? '#7FB897' : '#EF4444' }}>
                    {publishMsg}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — live preview */}
          <div style={C.right}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Live preview with edits applied</div>
                <div style={{ position: 'relative', width: 220, margin: '0 auto' }}>
                  <div style={{ border: '2px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' }}>
                    <video ref={videoRef} src={latestVideo} controls autoPlay loop playsInline
                      style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                  </div>
                  {captionStyle !== 'none' && captionText && (
                    <div style={{
                      position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center',
                      fontSize: captionStyle === 'bold' ? 14 : 11, fontWeight: captionStyle === 'bold' ? 900 : 600,
                      color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                      padding: '4px 8px',
                      background: captionStyle === 'karaoke' ? 'rgba(0,0,0,0.7)' : captionStyle === 'minimal' ? 'transparent' : 'transparent',
                      textTransform: captionStyle === 'bold' ? 'uppercase' : 'none',
                      letterSpacing: captionStyle === 'bold' ? 1 : 0,
                    }}>{captionText}</div>
                  )}
                  {watermark && <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1 }}>ARIA</div>}
                </div>
                <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  Filter: {selectedFilter.label} · Speed: {speed}× · Music: {MUSIC_TRACKS.find(m => m.id === music)?.label}
                </div>
              </div>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Generate a reel first</div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={{ padding: '24px', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {sessions.map(s => (
              <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {s.video_url
                  ? <video src={s.video_url} muted loop playsInline style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} onMouseEnter={e => (e.target as HTMLVideoElement).play()} onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                  : <div style={{ aspectRatio: '9/16', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{s.status === 'processing' ? '⏳' : s.status === 'failed' ? '❌' : '🎬'}</div>
                }
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: s.status === 'completed' ? '#7FB897' : s.status === 'failed' ? '#EF4444' : '#F59E0B', textTransform: 'capitalize' }}>{s.status}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>${Number(s.cost_aud ?? 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{s.style} · {s.duration_seconds}s</div>
                  {s.video_url && <a href={s.video_url} download style={{ display: 'block', marginTop: 8, padding: '5px 0', borderRadius: 6, background: 'rgba(127,184,151,0.1)', color: '#7FB897', textAlign: 'center', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>Download</a>}
                </div>
              </div>
            ))}
            {sessions.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', fontSize: 13 }}>No reels generated yet</div>}
          </div>
        </div>
      )}

      {/* Influencer picker overlay */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', background: '#0f1117', borderRadius: '20px 20px 0 0', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Choose Influencer</div>
              <button onClick={() => setShowPicker(false)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {influencers.map(inf => (
                <div key={inf.id} onClick={() => { setSelectedInf(inf); setShowPicker(false) }} style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: '2px solid ' + (selectedInf?.id === inf.id ? '#7FB897' : 'rgba(255,255,255,0.07)') }}>
                  <div style={{ position: 'relative', aspectRatio: '3/4' }}>
                    <img src={inf.image_url} alt={inf.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {inf.soul_status === 'ready' && <div style={{ position: 'absolute', top: 6, left: 6, background: '#7FB897', color: '#0f1117', fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 99 }}>SOUL ✓</div>}
                  </div>
                  <div style={{ padding: '8px 10px', background: '#111' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{inf.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

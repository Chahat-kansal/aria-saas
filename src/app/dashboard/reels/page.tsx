'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const EDGE = SB_URL + '/functions/v1/reel-engine'

type Inf = { id: string; name: string; description: string; image_url: string
             higgsfield_job_id: string; soul_id: string | null; soul_status: string | null }
type Session = { id: string; status: string; video_url: string | null
                 cost_aud: number; created_at: string; style: string; duration_seconds: number }
type ReelIdea = { title: string; why: string; style: string; prompt: string; hook: string; hashtags: string[]; urgency: 'high'|'medium'|'low' }
type PixabayTrack = { id: number; title: string; duration: number; url: string; preview: string|null; bpm: number|null; artist: string }

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
// Each clip is max 15s — longer reels auto-stitch multiple clips client-side
const DURATIONS = [
  { secs: 10, label: '10s', clips: 1, costAud: 0.95 },
  { secs: 15, label: '15s', clips: 1, costAud: 1.43 },
  { secs: 20, label: '20s', clips: 2, costAud: 1.90 },
  { secs: 30, label: '30s', clips: 3, costAud: 2.85 },
  { secs: 45, label: '45s', clips: 3, costAud: 3.80 },
  { secs: 60, label: '60s', clips: 4, costAud: 5.70 },
]
const RESOLUTIONS = [{ id: '720p', label: '720p HD', note: 'Fast' }, { id: '1080p', label: '1080p FHD', note: 'Best' }]
const FILTER_PRESETS = [
  { id: 'none',   label: 'Original', css: '' },
  { id: 'warm',   label: 'Warm',     css: 'sepia(0.3) saturate(1.3) brightness(1.05)' },
  { id: 'cool',   label: 'Cool',     css: 'hue-rotate(20deg) saturate(0.9) brightness(0.95)' },
  { id: 'vivid',  label: 'Vivid',    css: 'saturate(1.6) contrast(1.1)' },
  { id: 'muted',  label: 'Muted',    css: 'saturate(0.7) contrast(0.95) brightness(1.05)' },
  { id: 'noir',   label: 'Noir',     css: 'grayscale(0.8) contrast(1.2)' },
  { id: 'golden', label: 'Golden',   css: 'sepia(0.5) saturate(1.4) hue-rotate(-10deg)' },
]
const CAPTION_STYLES = [
  { id: 'none', label: 'None' }, { id: 'bold', label: 'Bold white' },
  { id: 'karaoke', label: 'Karaoke' }, { id: 'minimal', label: 'Minimal' },
]
const MUSIC_MOODS = [
  { id: 'upbeat', label: '⚡ Upbeat' }, { id: 'chill', label: '🎶 Chill' },
  { id: 'energetic', label: '🔥 Energetic' }, { id: 'warm', label: '🌅 Warm' },
  { id: 'cinematic', label: '🎬 Cinematic' }, { id: 'corporate', label: '💼 Corporate' },
]

export default function ReelStudioPage() {
  const supabase = createBrowserClient(SB_URL, SB_ANON)
  const [bid, setBid] = useState<string|null>(null)
  const [userToken, setUserToken] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)

  const [influencers, setInfluencers] = useState<Inf[]>([])
  const [selectedInf, setSelectedInf] = useState<Inf|null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const [scenePreview, setScenePreview] = useState<string|null>(null)
  const [sceneUrl, setSceneUrl] = useState<string|null>(null)
  const [sceneUploading, setSceneUploading] = useState(false)
  const sceneRef = useRef<HTMLInputElement>(null)

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

  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [latestVideo, setLatestVideo] = useState<string|null>(null)
  const [activeJob, setActiveJob] = useState<{jobId:string;sessionId:string}|null>(null)
  const [clipUrls, setClipUrls] = useState<string[]>([])
  const [clipProgress, setClipProgress] = useState(0)
  const [totalClips, setTotalClips] = useState(1)
  const [stitching, setStitching] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')
  const [publishCaption, setPublishCaption] = useState('')
  const [publishPlatform, setPublishPlatform] = useState<'instagram'|'facebook'>('instagram')
  const pollRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  const [sessions, setSessions] = useState<Session[]>([])
  const [tab, setTab] = useState<'create'|'edit'|'history'>('create')
  const [totalSpent, setTotalSpent] = useState(0)
  const [monthlyReels, setMonthlyReels] = useState(0)
  const [reelIdeas, setReelIdeas] = useState<ReelIdea[]>([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasLoaded, setIdeasLoaded] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState<number|null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setError('Not logged in'); setLoading(false); return }
      setUserToken(session.access_token)
      await loadBiz(session.user.id, session.access_token)
      setLoading(false)
    })
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  async function loadBiz(uid: string, token: string) {
    try {
      // Use localStorage active business ID (same as BusinessProvider/switcher)
      const storedId = typeof window !== 'undefined'
        ? localStorage.getItem('aria_active_business_id') : null

      const query = supabase.from('businesses').select('id')
        .eq('user_id', uid).eq('is_active', true)

      const { data: bizList } = await query.order('created_at', { ascending: false }).limit(10)
      if (!bizList?.length) { setError('No active business found'); return }

      // Prefer stored active business, fallback to first
      const biz = storedId
        ? (bizList.find(b => b.id === storedId) ?? bizList[0])
        : bizList[0]

      setBid(biz.id)
      // Auto-load reel ideas
      setTimeout(() => loadIdeas(), 100)

      const [infRes, sesRes] = await Promise.all([
        fetch('/api/social/influencer-library'),
        supabase.from('reel_studio_sessions').select('*')
          .eq('business_id', biz.id).order('created_at', { ascending: false }).limit(30)
      ])
      if (infRes.ok) {
        const infData = await infRes.json()
        setInfluencers(infData.influencers ?? [])
      }
      if (sesRes.data) {
        setSessions(sesRes.data)
        const completed = sesRes.data.filter((s: Session) => s.status === 'completed')
        setTotalSpent(completed.reduce((a: number, s: Session) => a + Number(s.cost_aud ?? 0), 0))
        const thisMonth = sesRes.data.filter((s: Session) =>
          new Date(s.created_at).getMonth() === new Date().getMonth())
        setMonthlyReels(thisMonth.length)
      }
    } catch (e: any) {
      setError('Failed to load: ' + e.message)
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

  async function loadIdeas() {
    if (!bid || ideasLoading) return
    setIdeasLoading(true)
    try {
      const res = await fetch(`/api/reels/ideas?business_id=${bid}`)
      const d = await res.json()
      if (d.ideas?.length) { setReelIdeas(d.ideas); setIdeasLoaded(true) }
    } catch {}
    setIdeasLoading(false)
  }

  function applyIdea(idea: ReelIdea) {
    setStyle(idea.style)
    setPrompt(idea.prompt)
    setPublishCaption(idea.hook + '\n\n' + (idea.hashtags ?? []).map((h: string) => '#' + h).join(' '))
    setExpandedIdea(null)
    // Scroll to generate button
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  // Each Higgsfield clip = max 15s. Longer reels = multiple clips generated in parallel then stitched.
  function clipsNeeded(secs: number) { return Math.ceil(secs / 15) }
  function secsPerClip(secs: number) { return Math.min(secs, 15) }

  async function generateSingleClip(clipNum: number, totalClipsCount: number): Promise<string | null> {
    const clipPrompt = prompt
      ? (clipNum === 1 ? prompt : prompt + `, continuation scene ${clipNum} of ${totalClipsCount}, same setting`)
      : null
    try {
      const res = await fetch(EDGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken!}` },
        body: JSON.stringify({
          business_id: bid,
          influencer_id: selectedInf?.id ?? null,
          soul_id: selectedInf?.soul_status === 'ready' ? selectedInf.soul_id : null,
          higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null,
          scene_image_url: sceneUrl ?? null,
          prompt: clipPrompt, style,
          duration_seconds: secsPerClip(duration), resolution, genre,
        }),
      })
      const d = await res.json()
      if (!d.job_id) throw new Error(d.error ?? 'No job_id')
      // Poll until complete
      return await pollClip(d.job_id, d.session_id)
    } catch (e: any) {
      console.error(`Clip ${clipNum} failed:`, e.message)
      return null
    }
  }

  async function pollClip(jobId: string, sessionId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 60; attempt++) {
      await new Promise(r => setTimeout(r, 5000))
      try {
        const res = await fetch(`${EDGE}?job_id=${jobId}&session_id=${sessionId}`,
          { headers: { Authorization: `Bearer ${userToken!}` } })
        const d = await res.json()
        if (d.status === 'COMPLETED' && d.video_url) return d.video_url
        if (d.status === 'FAILED') return null
      } catch {}
    }
    return null
  }

  async function stitchClips(urls: string[]): Promise<string> {
    if (urls.length === 1) return urls[0]
    setStitching(true)
    setGenMsg('🎞 Stitching clips into one reel…')
    try {
      // Use ffmpeg.wasm to concatenate clips in the browser
      const { FFmpeg } = await import('@ffmpeg/ffmpeg' as any)
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util' as any)
      const ffmpeg = new FFmpeg()
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      // Write each clip
      const listLines: string[] = []
      for (let i = 0; i < urls.length; i++) {
        const data = await fetchFile(urls[i])
        await ffmpeg.writeFile(`clip${i}.mp4`, data)
        listLines.push(`file 'clip${i}.mp4'`)
      }
      await ffmpeg.writeFile('list.txt', listLines.join('
'))
      // Concatenate
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4'])
      const data = await ffmpeg.readFile('output.mp4')
      const blob = new Blob([data], { type: 'video/mp4' })
      setStitching(false)
      return URL.createObjectURL(blob)
    } catch (e: any) {
      setStitching(false)
      // Fallback: just return first clip if stitching fails
      console.error('Stitch failed, using first clip:', e.message)
      return urls[0]
    }
  }

  async function generate() {
    if (!bid || !userToken || generating) return
    setGenerating(true); setLatestVideo(null); setGenProgress(5)
    setClipUrls([]); setClipProgress(0)

    const clips = clipsNeeded(duration)
    setTotalClips(clips)
    setGenMsg(clips > 1
      ? `🎬 Generating ${clips} clips for ${duration}s reel… (~${clips * 90}s)`
      : `🎬 Generating ${duration}s reel… (~90s)`)

    try {
      if (clips === 1) {
        // Single clip — existing flow
        const res = await fetch(EDGE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
          body: JSON.stringify({
            business_id: bid,
            influencer_id: selectedInf?.id ?? null,
            soul_id: selectedInf?.soul_status === 'ready' ? selectedInf.soul_id : null,
            higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null,
            scene_image_url: sceneUrl ?? null,
            prompt: prompt || null, style,
            duration_seconds: duration, resolution, genre,
          }),
        })
        const d = await res.json()
        if (!d.job_id) throw new Error(d.error ?? 'No job_id returned')
        setGenMsg(`⏳ Generating ${duration}s reel…`)
        setGenProgress(15)
        setActiveJob({ jobId: d.job_id, sessionId: d.session_id })
        pollStatus(d.job_id, d.session_id, userToken)
      } else {
        // Multi-clip: generate all in parallel
        setGenMsg(`🎬 Generating ${clips} clips in parallel for ${duration}s reel…`)
        const clipPromises = Array.from({ length: clips }, (_, i) =>
          generateSingleClip(i + 1, clips).then(url => {
            if (url) {
              setClipProgress(p => p + 1)
              setGenProgress(p => Math.min(p + Math.floor(80 / clips), 88))
            }
            return url
          })
        )
        const results = await Promise.all(clipPromises)
        const validClips = results.filter(Boolean) as string[]
        if (validClips.length === 0) throw new Error('All clips failed to generate')

        setGenMsg(`✅ ${validClips.length}/${clips} clips ready — stitching…`)
        setGenProgress(90)
        const finalUrl = await stitchClips(validClips)
        setLatestVideo(finalUrl)
        setGenerating(false)
        setGenProgress(100)
        setGenMsg(`✅ ${duration}s reel ready! (${validClips.length} clips stitched)`)
        setTab('edit')
        if (bid) loadBiz(bid, userToken)
      }
    } catch (e: any) {
      setGenMsg('❌ ' + e.message); setGenerating(false); setGenProgress(0)
    }
  }

  const pollStatus = useCallback(async (jobId: string, sessionId: string, token: string) => {
    try {
      const res = await fetch(`${EDGE}?job_id=${jobId}&session_id=${sessionId}`,
        { headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json()
      if (d.status === 'COMPLETED') {
        setLatestVideo(d.video_url); setGenerating(false); setGenProgress(100)
        setGenMsg('✅ Reel ready!')
        setActiveJob(null); setTab('edit')
        if (bid) loadBiz(bid, token)
      } else if (d.status === 'FAILED') {
        setGenMsg('❌ ' + (d.error ?? 'Generation failed'))
        setGenerating(false); setGenProgress(0); setActiveJob(null)
      } else {
        setGenProgress(p => Math.min(p + 8, 88))
        pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 5000)
      }
    } catch {
      pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 8000)
    }
  }, [bid])

  async function publishReel() {
    if (!latestVideo || !bid || publishing) return
    setPublishing(true); setPublishMsg('')
    try {
      const createRes = await fetch('/api/social/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: bid, platform: publishPlatform,
          caption: publishCaption || 'Check out our latest reel! 🎬',
          hashtags: ['smallbusiness', 'australia', 'reels'],
          post_type: 'reel', video_url: latestVideo,
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
      setPublishMsg('✅ Published to ' + publishPlatform + ' Reels!')
    } catch (e: any) { setPublishMsg('❌ ' + e.message) }
    setPublishing(false)
  }

  const selectedFilter = FILTER_PRESETS.find(f => f.id === filter) ?? FILTER_PRESETS[0]
  const selectedDur = DURATIONS.find(d => d.secs === duration)
  const estimatedCost = selectedDur?.costAud ?? parseFloat((duration * 0.095).toFixed(2))

  const S = {
    page: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh',
      background: '#08090d', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13 },
    hdr: { padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    tabs: { display: 'flex', gap: 4, padding: '12px 24px 0',
      borderBottom: '1px solid rgba(255,255,255,0.06)' },
    tab: (a: boolean) => ({ padding: '8px 20px', borderRadius: '8px 8px 0 0', border: 'none',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
      background: a ? '#1a1d24' : 'transparent', color: a ? '#fff' : 'rgba(255,255,255,0.4)',
      borderBottom: a ? '2px solid #7FB897' : '2px solid transparent' }),
    body: { display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0, flex: 1 },
    left: { borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto' as const,
      padding: '20px 16px', display: 'flex', flexDirection: 'column' as const, gap: 14 },
    right: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
      justifyContent: 'center', padding: 32, background: '#0a0b0f', gap: 20 },
    card: { background: 'rgba(255,255,255,0.025)', borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' },
    label: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
      letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 10, display: 'block' },
    chip: (a: boolean) => ({ padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
      background: a ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.06)',
      color: a ? '#7FB897' : 'rgba(255,255,255,0.5)',
      boxShadow: a ? 'inset 0 0 0 1px rgba(127,184,151,0.5)' : 'none', transition: 'all 120ms' }),
    chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
    btn: (primary: boolean, disabled = false) => ({
      padding: '13px 0', borderRadius: 12, border: 'none',
      cursor: disabled ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
      background: disabled ? 'rgba(127,184,151,0.2)'
        : primary ? 'linear-gradient(135deg,#7FB897,#2D5240)' : 'rgba(255,255,255,0.08)',
      color: disabled ? 'rgba(255,255,255,0.35)' : '#fff', letterSpacing: -0.3,
    }),
  }

  if (loading) return (
    <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid rgba(127,184,151,0.2)',
        borderTopColor: '#7FB897', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ ...S.page, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ fontSize: 14, color: '#EF4444' }}>{error}</div>
    </div>
  )

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.hdr}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>🎬 Reel Studio</span>
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99,
            background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>PLUS</span>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 11 }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{monthlyReels} reels this month</span>
          <span style={{ color: '#F59E0B', fontWeight: 700 }}>${totalSpent.toFixed(2)} AUD spent</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {(['create','edit','history'] as const).map(t => (
          <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
            {t === 'create' ? '✦ Create' : t === 'edit' ? '✂ Edit & Export' : '⏱ History'}
          </button>
        ))}
      </div>

      {/* CREATE TAB */}
      {tab === 'create' && (
        <div style={S.body}>
          <div style={S.left}>

            {/* Aria Ideas Panel */}
            <div style={{ background: 'linear-gradient(135deg, rgba(127,184,151,0.08), rgba(45,82,64,0.12))',
              border: '1px solid rgba(127,184,151,0.2)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ideasLoaded ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15 }}>✦</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7FB897' }}>Aria Reel Ideas</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>from your POS data</span>
                </div>
                <button onClick={loadIdeas} disabled={ideasLoading} style={{ fontSize: 10, padding: '4px 10px',
                  borderRadius: 99, border: 'none', cursor: ideasLoading ? 'wait' : 'pointer',
                  background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontFamily: 'inherit', fontWeight: 700 }}>
                  {ideasLoading ? '⏳' : ideasLoaded ? '↻ Refresh' : '✦ Generate ideas'}
                </button>
              </div>

              {ideasLoading && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', paddingTop: 8 }}>
                  Reading your sales data, products & reviews…
                </div>
              )}

              {ideasLoaded && reelIdeas.map((idea, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div onClick={() => setExpandedIdea(expandedIdea === i ? null : i)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                      background: expandedIdea === i ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)',
                      boxShadow: expandedIdea === i ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.07)',
                      transition: 'all 120ms' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                          background: idea.urgency === 'high' ? 'rgba(239,68,68,0.2)' : idea.urgency === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(127,184,151,0.2)',
                          color: idea.urgency === 'high' ? '#EF4444' : idea.urgency === 'medium' ? '#F59E0B' : '#7FB897' }}>
                          {idea.urgency === 'high' ? '🔥 Hot' : idea.urgency === 'medium' ? '⚡ Good' : '✓ Evergreen'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8, flexShrink: 0 }}>{expandedIdea === i ? '▲' : '▼'}</span>
                  </div>

                  {expandedIdea === i && (
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
                      borderRadius: '0 0 10px 10px', border: '1px solid rgba(127,184,151,0.15)',
                      borderTop: 'none', marginTop: -2 }}>
                      <div style={{ fontSize: 11, color: '#7FB897', marginBottom: 6, lineHeight: 1.5 }}>
                        📊 {idea.why}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, lineHeight: 1.5 }}>
                        🎬 {idea.prompt}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
                        Hook: "{idea.hook}"
                      </div>
                      <button onClick={() => applyIdea(idea)} style={{ width: '100%', padding: '9px 0',
                        borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 800, background: 'linear-gradient(135deg,#7FB897,#2D5240)',
                        color: '#fff', letterSpacing: -0.2 }}>
                        ✦ Use this idea →
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Influencer */}
            <div style={S.card}>
              <span style={S.label}>
                AI Influencer
                {selectedInf?.soul_status === 'ready' && <span style={{ color: '#7FB897', marginLeft: 6 }}>✓ Soul trained</span>}
              </span>
              {selectedInf ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img src={selectedInf.image_url} alt="" style={{ width: 44, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{selectedInf.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>
                      {selectedInf.soul_status === 'ready' ? '✓ Consistent face' : 'Reference frame mode'}
                    </div>
                  </div>
                  <button onClick={() => setShowPicker(true)} style={S.chip(false)}>Change</button>
                </div>
              ) : (
                <button onClick={() => setShowPicker(true)} style={{ width: '100%', padding: 12,
                  borderRadius: 10, border: '1.5px dashed rgba(127,184,151,0.25)',
                  background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'inherit', fontSize: 12 }}>
                  {influencers.length > 0 ? `+ Pick Influencer (${influencers.length} available)` : '+ Pick AI Influencer'}
                </button>
              )}
            </div>

            {/* Scene photo */}
            <div style={S.card}>
              <span style={S.label}>Scene photo <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>optional</span></span>
              <input ref={sceneRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleSceneUpload(e.target.files[0])} />
              {scenePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={scenePreview} alt="" style={{ height: 72, borderRadius: 8, objectFit: 'cover',
                    border: '1.5px solid rgba(127,184,151,0.3)' }} />
                  {sceneUploading && <div style={{ position: 'absolute', inset: 0,
                    background: 'rgba(0,0,0,0.6)', borderRadius: 8, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>Uploading…</div>}
                  <button onClick={() => { setScenePreview(null); setSceneUrl(null) }}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                      borderRadius: '50%', border: 'none', background: '#EF4444', color: '#fff',
                      fontSize: 11, cursor: 'pointer' }}>×</button>
                </div>
              ) : (
                <button onClick={() => sceneRef.current?.click()} style={{ width: '100%', padding: 10,
                  borderRadius: 8, border: '1px dashed rgba(255,255,255,0.1)', background: 'transparent',
                  cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit', fontSize: 12 }}>
                  📷 Upload product/shop photo
                </button>
              )}
            </div>

            {/* Style */}
            <div style={S.card}>
              <span style={S.label}>Vibe</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {STYLES.map(s => (
                  <button key={s.id} onClick={() => setStyle(s.id)} style={{ padding: '8px 10px',
                    borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', background: style === s.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)',
                    boxShadow: style === s.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    transition: 'all 120ms' }}>
                    <span style={{ fontSize: 15 }}>{s.emoji}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700,
                      color: style === s.id ? '#7FB897' : 'rgba(255,255,255,0.7)', marginTop: 2 }}>{s.label}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div style={S.card}>
              <span style={S.label}>Scene description <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>optional</span></span>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                placeholder="e.g. Walks into a warm café, picks up a flat white, smiles at camera"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none',
                  boxSizing: 'border-box', lineHeight: 1.6 }} />
            </div>

            {/* Duration */}
            <div style={S.card}>
              <span style={S.label}>Duration</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DURATIONS.map(d => (
                  <button key={d.secs} onClick={() => setDuration(d.secs)} style={{ flex: '1 1 55px',
                    padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 700, fontSize: 12,
                    background: duration === d.secs ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)',
                    boxShadow: duration === d.secs ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    color: duration === d.secs ? '#7FB897' : 'rgba(255,255,255,0.4)', transition: 'all 120ms' }}>
                    {d.label}
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginTop: 1 }}>${d.costAud}</div>
                    {d.clips > 1 && <div style={{ fontSize: 8, color: 'rgba(127,184,151,0.6)', marginTop: 1 }}>{d.clips} clips</div>}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Custom:</span>
                <input type="number" min={3} max={60} placeholder="sec"
                  onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 3 && v <= 60) setDuration(v) }}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>3–60s</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {RESOLUTIONS.map(r => (
                  <button key={r.id} onClick={() => setResolution(r.id)} style={S.chip(resolution === r.id)}>
                    {r.label} · {r.note}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre */}
            <div style={S.card}>
              <span style={S.label}>Cinematic genre</span>
              <div style={S.chipRow}>
                {GENRES.map(g => (
                  <button key={g} onClick={() => setGenre(g)} style={S.chip(genre === g)}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Cost + Generate */}
            <div style={{ background: 'rgba(127,184,151,0.05)', border: '1px solid rgba(127,184,151,0.15)',
              borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Estimated cost</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{resolution} · {duration}s · Higgsfield</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B' }}>${estimatedCost.toFixed(2)} AUD</div>
            </div>

            <button onClick={generate} disabled={generating || stitching} style={{ ...S.btn(true, generating || stitching), width: '100%' }}>
              {stitching ? '🎞 Stitching clips…'
                : generating && totalClips > 1 ? `⏳ ${clipProgress}/${totalClips} clips…`
                : generating ? '⏳ Generating…'
                : `Generate ${duration}s Reel — $${estimatedCost.toFixed(2)} AUD${clipsNeeded(duration) > 1 ? ` (${clipsNeeded(duration)} clips)` : ''}`}
            </button>

            {genMsg && (
              <div style={{ fontSize: 12, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                color: genMsg.startsWith('✅') ? '#7FB897' : genMsg.startsWith('❌') ? '#EF4444' : 'rgba(255,255,255,0.6)',
                lineHeight: 1.5 }}>
                {genMsg}
                {(generating || stitching) && (
                  <div style={{ marginTop: 8, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: genProgress + '%', background: '#7FB897',
                      borderRadius: 99, transition: 'width 0.8s ease' }} />
                  </div>
                )}
                {generating && totalClips > 1 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                    Clips ready: {clipProgress}/{totalClips} · Auto-stitching when all done
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right preview */}
          <div style={S.right}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#7FB897', marginBottom: 12, fontWeight: 700 }}>
                  ✅ Reel ready — switch to Edit tab
                </div>
                <div style={{ border: '2px solid rgba(127,184,151,0.3)', borderRadius: 16, overflow: 'hidden', width: 220 }}>
                  <video src={latestVideo} controls autoPlay loop playsInline
                    style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
                  <button onClick={() => setTab('edit')} style={{ padding: '10px 20px', borderRadius: 10,
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    fontWeight: 700, background: '#7FB897', color: '#0f1117' }}>✂ Edit →</button>
                  <a href={latestVideo} download="aria-reel.mp4" style={{ padding: '10px 20px',
                    borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: '#fff',
                    fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>⬇ Download</a>
                </div>
              </div>
            ) : generating ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, border: '3px solid rgba(127,184,151,0.2)',
                  borderTopColor: '#7FB897', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Generating reel…</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>~60–90 seconds · Higgsfield AI</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                <div style={{ width: 120, height: 200, borderRadius: 16,
                  border: '2px dashed rgba(255,255,255,0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 32 }}>🎬</div>
                <div style={{ fontSize: 13 }}>Configure your reel and hit Generate</div>
                <div style={{ fontSize: 11, marginTop: 6, opacity: 0.6 }}>9:16 vertical · up to 60s · 1080p</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT TAB */}
      {tab === 'edit' && (
        <div style={S.body}>
          <div style={S.left}>
            {!latestVideo && (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                Generate a reel first, then edit it here
              </div>
            )}

            <div style={S.card}>
              <span style={S.label}>Speed</span>
              <div style={S.chipRow}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
                  <button key={s} onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s }}
                    style={S.chip(speed === s)}>{s}×</button>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <span style={S.label}>Filter</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {FILTER_PRESETS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '8px 10px',
                    borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 11, fontWeight: 600, textAlign: 'left',
                    background: filter === f.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)',
                    boxShadow: filter === f.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                    color: filter === f.id ? '#7FB897' : 'rgba(255,255,255,0.6)', transition: 'all 120ms' }}>{f.label}</button>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <span style={S.label}>Captions</span>
              <div style={S.chipRow}>
                {CAPTION_STYLES.map(c => (
                  <button key={c.id} onClick={() => setCaptionStyle(c.id)} style={S.chip(captionStyle === c.id)}>{c.label}</button>
                ))}
              </div>
              {captionStyle !== 'none' && (
                <textarea value={captionText} onChange={e => setCaptionText(e.target.value)} rows={2}
                  placeholder="Caption text…" style={{ width: '100%', marginTop: 10, padding: '8px 10px',
                    borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              )}
            </div>

            <div style={S.card}>
              <span style={S.label}>Music · Pixabay <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none' }}>free commercial license</span></span>
              <button onClick={() => { setMusic('none'); setSelectedTrack(null) }}
                style={{ ...S.chip(music === 'none'), marginBottom: 10 }}>🚫 No music</button>
              <div style={S.chipRow}>
                {MUSIC_MOODS.map(m => (
                  <button key={m.id} onClick={() => { setMusicMood(m.id); loadMusicTracks(m.id) }}
                    style={S.chip(musicMood === m.id)}>{m.label}</button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                {musicLoading && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '8px 0' }}>🔍 Searching…</div>}
                {!musicLoading && musicTracks.length === 0 && (
                  <button onClick={() => loadMusicTracks(musicMood)}
                    style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
                    Load tracks →
                  </button>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {musicTracks.map(t => (
                    <div key={t.id} onClick={() => { setSelectedTrack(t); setMusic(t.url) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                        background: selectedTrack?.id === t.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.04)',
                        boxShadow: selectedTrack?.id === t.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.4)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                        transition: 'all 120ms' }}>
                      <button onClick={e => { e.stopPropagation(); previewTrack(t) }}
                        style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', flexShrink: 0,
                          background: playingId === t.id ? '#7FB897' : 'rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {playingId === t.id ? '■' : '▶'}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600,
                          color: selectedTrack?.id === t.id ? '#7FB897' : 'rgba(255,255,255,0.8)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                          {t.artist}{t.bpm ? ` · ${t.bpm} BPM` : ''}
                        </div>
                      </div>
                      {selectedTrack?.id === t.id && <span style={{ fontSize: 9, color: '#7FB897', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={S.card}>
              <span style={S.label}>Brand</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 10 }}>
                <input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Aria watermark</span>
              </label>
              <input value={endCard} onChange={e => setEndCard(e.target.value)}
                placeholder="End card text (e.g. Visit us at 123 Main St)"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 12,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {latestVideo && (
              <a href={latestVideo} download="aria-reel.mp4" style={{ display: 'block', textAlign: 'center',
                padding: '13px 0', borderRadius: 12, background: 'linear-gradient(135deg,#7FB897,#2D5240)',
                color: '#fff', fontSize: 14, fontWeight: 800, textDecoration: 'none', letterSpacing: -0.3 }}>
                ⬇ Download Reel
              </a>
            )}

            {latestVideo && (
              <div style={S.card}>
                <span style={S.label}>Publish to social</span>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {(['instagram','facebook'] as const).map(p => (
                    <button key={p} onClick={() => setPublishPlatform(p)} style={{ flex: 1, padding: '8px 0',
                      borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 12, fontWeight: 700,
                      background: publishPlatform === p ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)',
                      boxShadow: publishPlatform === p ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
                      color: publishPlatform === p ? '#7FB897' : 'rgba(255,255,255,0.4)' }}>
                      {p === 'instagram' ? '📸 Instagram' : '👍 Facebook'}
                    </button>
                  ))}
                </div>
                <textarea value={publishCaption} onChange={e => setPublishCaption(e.target.value)} rows={3}
                  placeholder="Caption (blank = auto)"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#fff', fontSize: 12, fontFamily: 'inherit', resize: 'none', outline: 'none',
                    boxSizing: 'border-box', marginBottom: 10, lineHeight: 1.6 }} />
                <button onClick={publishReel} disabled={publishing} style={{ width: '100%', padding: '12px 0',
                  borderRadius: 12, border: 'none', cursor: publishing ? 'wait' : 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                  background: publishing ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                  color: publishing ? 'rgba(255,255,255,0.4)' : '#fff', letterSpacing: -0.2 }}>
                  {publishing ? '⏳ Publishing…' : `🚀 Publish to ${publishPlatform === 'instagram' ? 'Instagram' : 'Facebook'} Reels`}
                </button>
                {publishMsg && (
                  <div style={{ fontSize: 12, marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    color: publishMsg.startsWith('✅') ? '#7FB897' : '#EF4444' }}>{publishMsg}</div>
                )}
              </div>
            )}
          </div>

          <div style={S.right}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Live preview</div>
                <div style={{ position: 'relative', width: 220, margin: '0 auto' }}>
                  <div style={{ border: '2px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' }}>
                    <video ref={videoRef} src={latestVideo} controls autoPlay loop playsInline
                      style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                  </div>
                  {captionStyle !== 'none' && captionText && (
                    <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center',
                      fontSize: captionStyle === 'bold' ? 14 : 11,
                      fontWeight: captionStyle === 'bold' ? 900 : 600, color: '#fff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.9)', padding: '4px 8px',
                      background: captionStyle === 'karaoke' ? 'rgba(0,0,0,0.7)' : 'transparent',
                      textTransform: captionStyle === 'bold' ? 'uppercase' : 'none',
                      letterSpacing: captionStyle === 'bold' ? 1 : 0 }}>{captionText}</div>
                  )}
                  {watermark && <div style={{ position: 'absolute', top: 10, right: 10,
                    fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1 }}>ARIA</div>}
                </div>
              </div>
            ) : <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>Generate a reel first</div>}
          </div>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === 'history' && (
        <div style={{ padding: 24, flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {sessions.map(s => (
              <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {s.video_url
                  ? <video src={s.video_url} muted loop playsInline
                      style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }}
                      onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                      onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                  : <div style={{ aspectRatio: '9/16', background: 'rgba(0,0,0,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                      {s.status === 'processing' ? '⏳' : s.status === 'failed' ? '❌' : '🎬'}
                    </div>
                }
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
                      color: s.status === 'completed' ? '#7FB897' : s.status === 'failed' ? '#EF4444' : '#F59E0B' }}>
                      {s.status}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>${Number(s.cost_aud ?? 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{s.style} · {s.duration_seconds}s</div>
                  {s.video_url && (
                    <a href={s.video_url} download style={{ display: 'block', marginTop: 8, padding: '5px 0',
                      borderRadius: 6, background: 'rgba(127,184,151,0.1)', color: '#7FB897',
                      textAlign: 'center', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>Download</a>
                  )}
                </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.3)', gridColumn: '1/-1',
                textAlign: 'center', padding: '60px 0', fontSize: 13 }}>No reels generated yet</div>
            )}
          </div>
        </div>
      )}

      {/* Influencer picker */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowPicker(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640,
            maxHeight: '88vh', overflowY: 'auto', background: '#0f1117',
            borderRadius: '20px 20px 0 0', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Choose Influencer</div>
              <button onClick={() => setShowPicker(false)} style={{ width: 28, height: 28,
                borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
            {influencers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                Loading influencers…
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {influencers.map(inf => (
                  <div key={inf.id} onClick={() => { setSelectedInf(inf); setShowPicker(false) }}
                    style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                      border: '2px solid ' + (selectedInf?.id === inf.id ? '#7FB897' : 'rgba(255,255,255,0.07)') }}>
                    <div style={{ position: 'relative', aspectRatio: '3/4' }}>
                      <img src={inf.image_url} alt={inf.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {inf.soul_status === 'ready' && (
                        <div style={{ position: 'absolute', top: 6, left: 6, background: '#7FB897',
                          color: '#0f1117', fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 99 }}>
                          SOUL ✓
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px', background: '#111' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{inf.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

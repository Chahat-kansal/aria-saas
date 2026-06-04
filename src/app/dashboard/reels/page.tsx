'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Sparkles, Film, Clock, Edit3, RefreshCw, ChevronDown, ChevronUp,
  Upload, X, Play, Pause, Download, Send, Zap, Music, Eye,
  Loader2, AlertCircle, CheckCircle2, Users, Image as ImageIcon,
  Layers, Mic, Tag, Star
} from 'lucide-react'

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
// Generation runs on Vercel (AWS Lambda) — Higgsfield allows these IPs
// Supabase edge functions were blocked (522 timeout every time)
const REEL_GENERATE = '/api/reels/generate'
const REEL_STATUS   = '/api/reels/status'

// ─── Types ────────────────────────────────────────────────────────────────────
type Inf = { id: string; name: string; description: string; image_url: string; higgsfield_job_id: string; soul_id: string | null; soul_status: string | null }
type Session = { id: string; status: string; video_url: string | null; cost_aud: number; created_at: string; style: string; duration_seconds: number }
type ReelIdea = { title: string; why: string; style: string; prompt: string; hook: string; hashtags: string[]; urgency: 'high' | 'medium' | 'low' }
type PixabayTrack = { id: number; title: string; duration: number; url: string; preview: string | null; bpm: number | null; artist: string }

// ─── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:       '#09090b',
  surface:  '#111113',
  surfaceHover: '#18181b',
  border:   'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(127,184,151,0.35)',
  accent:   '#7FB897',
  accentDim:'rgba(127,184,151,0.15)',
  accentBg: 'rgba(127,184,151,0.08)',
  text:     '#fafafa',
  textMid:  'rgba(255,255,255,0.6)',
  textDim:  'rgba(255,255,255,0.35)',
  textFaint:'rgba(255,255,255,0.18)',
  danger:   '#ef4444',
  warn:     '#f59e0b',
  gold:     '#f59e0b',
  purple:   '#6366f1',
  r:        { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 },
  sp:       { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  font:     "'Inter', -apple-system, sans-serif",
}

// ─── Static config ─────────────────────────────────────────────────────────────
const STYLES = [
  { id: 'lifestyle',        label: 'Lifestyle',    desc: 'Warm & relatable' },
  { id: 'ugc',              label: 'UGC',          desc: 'Raw creator feel' },
  { id: 'product_showcase', label: 'Product',      desc: 'Hero shot' },
  { id: 'cinematic',        label: 'Cinematic',    desc: 'Film quality' },
  { id: 'behind_scenes',    label: 'BTS',          desc: 'Authentic' },
  { id: 'flash_sale',       label: 'Flash Sale',   desc: 'Urgent energy' },
  { id: 'testimonial',      label: 'Testimonial',  desc: 'Social proof' },
  { id: 'day_in_life',      label: 'Day in Life',  desc: 'Story format' },
]
const GENRES = ['auto', 'action', 'comedy', 'drama', 'epic', 'noir']
const DURATIONS = [
  { secs: 10, label: '10s', clips: 1, costAud: 0.95 },
  { secs: 15, label: '15s', clips: 1, costAud: 1.43 },
  { secs: 20, label: '20s', clips: 2, costAud: 1.90 },
  { secs: 30, label: '30s', clips: 2, costAud: 2.85 },
  { secs: 60, label: '60s', clips: 4, costAud: 5.70 },
]
const RESOLUTIONS = [{ id: '720p', label: '720p', note: 'Fast' }, { id: '1080p', label: '1080p', note: 'Best' }]
const FILTERS = [
  { id: 'none',   label: 'Original', css: '' },
  { id: 'warm',   label: 'Warm',     css: 'sepia(0.3) saturate(1.3) brightness(1.05)' },
  { id: 'cool',   label: 'Cool',     css: 'hue-rotate(20deg) saturate(0.9) brightness(0.95)' },
  { id: 'vivid',  label: 'Vivid',    css: 'saturate(1.6) contrast(1.1)' },
  { id: 'muted',  label: 'Muted',    css: 'saturate(0.7) contrast(0.95)' },
  { id: 'noir',   label: 'Noir',     css: 'grayscale(0.8) contrast(1.2)' },
  { id: 'golden', label: 'Golden',   css: 'sepia(0.5) saturate(1.4)' },
]
const CAPTION_STYLES = [
  { id: 'none', label: 'None' }, { id: 'bold', label: 'Bold' },
  { id: 'karaoke', label: 'Karaoke' }, { id: 'minimal', label: 'Minimal' },
]
const MUSIC_MOODS = [
  { id: 'upbeat', label: 'Upbeat' }, { id: 'chill', label: 'Chill' },
  { id: 'energetic', label: 'Energetic' }, { id: 'warm', label: 'Warm' },
  { id: 'cinematic', label: 'Cinematic' }, { id: 'corporate', label: 'Corporate' },
]

function clipsNeeded(secs: number) { return Math.ceil(secs / 15) }
function clipDuration(secs: number) { return Math.min(secs, 15) }

// ─── Reusable primitives ───────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.surface, borderRadius: T.r.lg, border: `1px solid ${T.border}`, padding: `${T.sp.md}px ${T.sp.lg}px`, ...style }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', margin: `0 0 ${T.sp.sm}px` }}>{children}</p>
}
function Chip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: small ? '4px 10px' : '6px 14px', borderRadius: T.r.full, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: small ? 10 : 11, fontWeight: 600, background: active ? T.accentDim : 'rgba(255,255,255,0.05)', color: active ? T.accent : T.textMid, boxShadow: active ? `inset 0 0 0 1px ${T.borderAccent}` : 'none', transition: 'all 120ms', minHeight: 32 }}>
      {children}
    </button>
  )
}
function PrimaryBtn({ onClick, disabled, loading, children, style }: { onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp.sm, width: '100%', padding: '14px 0', borderRadius: T.r.md, border: 'none', cursor: (disabled || loading) ? 'not-allowed' : 'pointer', fontFamily: T.font, fontSize: 14, fontWeight: 700, background: (disabled || loading) ? 'rgba(127,184,151,0.2)' : 'linear-gradient(135deg,#7FB897,#2D5240)', color: (disabled || loading) ? 'rgba(255,255,255,0.35)' : '#fff', letterSpacing: -0.2, minHeight: 48, transition: 'opacity 150ms', ...style }}>
      {loading && <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />}
      {children}
    </button>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ReelStudioPage() {
  const supabase = createBrowserClient(SB_URL, SB_ANON)
  const [bid, setBid] = useState<string | null>(null)
  const [userToken, setUserToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  const [influencers, setInfluencers] = useState<Inf[]>([])
  const [selectedInf, setSelectedInf] = useState<Inf | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const [scenePreview, setScenePreview] = useState<string | null>(null)
  const [sceneUrl, setSceneUrl] = useState<string | null>(null)
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
  const [selectedTrack, setSelectedTrack] = useState<PixabayTrack | null>(null)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [speed, setSpeed] = useState(1)
  const [watermark, setWatermark] = useState(false)
  const [endCard, setEndCard] = useState('')

  const [generating, setGenerating] = useState(false)
  const [genMsg, setGenMsg] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [clipProgress, setClipProgress] = useState(0)
  const [totalClips, setTotalClips] = useState(1)
  const [latestVideo, setLatestVideo] = useState<string | null>(null)
  const [activeJob, setActiveJob] = useState<{ jobId: string; sessionId: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState('')
  const [publishCaption, setPublishCaption] = useState('')
  const [publishPlatform, setPublishPlatform] = useState<'instagram' | 'facebook'>('instagram')

  const [sessions, setSessions] = useState<Session[]>([])
  const [tab, setTab] = useState<'create' | 'edit' | 'history'>('create')
  const [totalSpent, setTotalSpent] = useState(0)
  const [monthlyReels, setMonthlyReels] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [reelIdeas, setReelIdeas] = useState<ReelIdea[]>([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [ideasLoaded, setIdeasLoaded] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setPageError('Not logged in'); setLoading(false); return }
      setUserToken(session.access_token)
      await loadBiz(session.user.id)
      setLoading(false)
    })
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [])

  async function loadBiz(uid: string) {
    try {
      const storedId = typeof window !== 'undefined' ? localStorage.getItem('aria_active_business_id') : null
      const { data: bizList } = await supabase.from('businesses').select('id').eq('user_id', uid).eq('is_active', true).order('created_at', { ascending: false }).limit(10)
      if (!bizList?.length) { setPageError('No active business found'); return }
      const biz = storedId ? (bizList.find((b) => b.id === storedId) ?? bizList[0]) : bizList[0]
      setBid(biz.id)
      const [infRes, sesRes] = await Promise.all([
        fetch('/api/social/influencer-library'),
        supabase.from('reel_studio_sessions').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(30),
      ])
      if (infRes.ok) { const d = await infRes.json(); setInfluencers(d.influencers ?? []) }
      if (sesRes.data) {
        setSessions(sesRes.data)
        const done = sesRes.data.filter((s: Session) => s.status === 'completed')
        setTotalSpent(done.reduce((a: number, s: Session) => a + Number(s.cost_aud ?? 0), 0))
        setMonthlyReels(sesRes.data.filter((s: Session) => new Date(s.created_at).getMonth() === new Date().getMonth()).length)
      }
      // Load connected social platforms
      const { data: connections } = await supabase.from('social_connections')
        .select('platform').eq('business_id', biz.id).eq('is_active', true)
      setConnectedPlatforms((connections ?? []).map((c: any) => c.platform))
      loadIdeasForBiz(biz.id)
    } catch (e: any) { setPageError('Failed to load: ' + e.message) }
  }

  async function loadIdeasForBiz(businessId: string) {
    setIdeasLoading(true)
    try {
      const res = await fetch('/api/reels/ideas?business_id=' + businessId)
      const d = await res.json()
      if (d.ideas?.length) { setReelIdeas(d.ideas); setIdeasLoaded(true) }
    } catch {}
    setIdeasLoading(false)
  }
  async function loadIdeas() { if (!bid || ideasLoading) return; loadIdeasForBiz(bid) }

  function applyIdea(idea: ReelIdea) {
    setStyle(idea.style); setPrompt(idea.prompt)
    setPublishCaption(idea.hook + '\n\n' + (idea.hashtags ?? []).map((h: string) => '#' + h).join(' '))
    setExpandedIdea(null)
  }

  async function loadMusicTracks(mood: string) {
    setMusicLoading(true); setMusicTracks([])
    try { const d = await fetch('/api/social/music-search?mood=' + mood).then(r => r.json()); setMusicTracks(d.tracks ?? []) } catch {}
    setMusicLoading(false)
  }

  function previewTrack(track: PixabayTrack) {
    if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0 }
    if (playingId === track.id) { setPlayingId(null); return }
    const url = track.preview ?? track.url
    if (!url) return
    const audio = new Audio(url); audio.volume = 0.4
    audio.play().catch(() => {}); audio.onended = () => setPlayingId(null)
    setPreviewAudio(audio); setPlayingId(track.id)
  }

  async function handleSceneUpload(file: File) {
    setScenePreview(URL.createObjectURL(file)); setSceneUploading(true)
    try {
      const path = bid + '/' + Date.now() + '.' + file.name.split('.').pop()
      await supabase.storage.from('reel-scenes').upload(path, file)
      const { data: { publicUrl } } = supabase.storage.from('reel-scenes').getPublicUrl(path)
      setSceneUrl(publicUrl)
    } catch (e: any) { setGenMsg('Upload failed: ' + e.message) }
    setSceneUploading(false)
  }

  async function pollClip(jobId: string, sessionId: string, token: string): Promise<string | null> {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      try {
        const d = await fetch(REEL_STATUS + '?job_id=' + jobId + '&session_id=' + sessionId).then(r => r.json())
        if (d.status === 'COMPLETED' && d.video_url) return d.video_url as string
        if (d.status === 'FAILED') return null
      } catch {}
    }
    return null
  }

  const pollStatus = useCallback(async (jobId: string, sessionId: string, token: string) => {
    try {
      const d = await fetch(REEL_STATUS + '?job_id=' + jobId + '&session_id=' + sessionId).then(r => r.json())
      if (d.status === 'COMPLETED') {
        setLatestVideo(d.video_url); setGenerating(false); setGenProgress(100)
        setGenMsg('Reel ready!'); setActiveJob(null); setTab('edit')
        if (bid) loadBiz(bid)
      } else if (d.status === 'FAILED') {
        setGenMsg(d.error ?? 'Generation failed'); setGenerating(false); setGenProgress(0); setActiveJob(null)
      } else {
        setGenProgress((p) => Math.min(p + 8, 88))
        pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 5000)
      }
    } catch { pollRef.current = setTimeout(() => pollStatus(jobId, sessionId, token), 8000) }
  }, [bid])

  // Call Higgsfield directly from browser (Vercel AWS IPs are blocked with 522)
  async function callHiggsfield(body: Record<string, any>): Promise<{ job_id: string; session_id: string; estimated_cost_aud: number }> {
    // Step 1: Vercel creates DB session, returns key + payload
    const prep = await fetch(REEL_GENERATE, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json())
    if (prep.error) throw new Error(prep.error)

    // Step 2: Browser calls Higgsfield directly (no IP block)
    const hfRes = await fetch(prep.hf_endpoint, {
      method: 'POST',
      headers: { 'Authorization': prep.hf_key, 'Content-Type': 'application/json' },
      body: JSON.stringify(prep.payload),
    })
    const hfText = await hfRes.text()
    if (!hfRes.ok) {
      const msg = hfText.startsWith('<') ? 'Higgsfield unavailable — try again in 30 seconds.' : `Higgsfield ${hfRes.status}: ${hfText.slice(0, 120)}`
      throw new Error(msg)
    }
    const hf = JSON.parse(hfText)
    const job_id = hf.id ?? hf.job_id ?? hf.request_id
    if (!job_id) throw new Error('No job ID from Higgsfield: ' + hfText.slice(0, 100))

    // Step 3: Save job_id to DB
    await fetch(REEL_GENERATE, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: prep.session_id, job_id, status: 'processing' }),
    })
    return { job_id, session_id: prep.session_id, estimated_cost_aud: prep.estimated_cost_aud }
  }


  async function generate() {
    if (!bid || !userToken || generating) return
    setGenerating(true); setLatestVideo(null); setGenProgress(5); setClipProgress(0)
    const clips = clipsNeeded(duration); setTotalClips(clips)
    const clipSecs = clipDuration(duration)
    const base = { business_id: bid, influencer_id: selectedInf?.id ?? null, soul_id: selectedInf?.soul_status === 'ready' ? selectedInf.soul_id : null, higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null, scene_image_url: sceneUrl ?? null, style, resolution, genre }

    if (clips === 1) {
      setGenMsg('Generating ' + duration + 's reel…')
      try {
        const d = await callHiggsfield({ ...base, prompt: prompt || null, duration_seconds: duration }).then(r => r.json())
        if (!d.job_id) throw new Error('No job_id returned')
        setGenProgress(15); setActiveJob({ jobId: d.job_id, sessionId: d.session_id })
        pollStatus(d.job_id, d.session_id, userToken)
      } catch (e: any) {
        const msg = (e.message ?? '').replace(/<[^>]*>/g, '').slice(0, 120)
        const friendly = msg.includes('522') || msg.includes('timeout') || msg.includes('DOCTYPE')
          ? 'Higgsfield API is temporarily unavailable. Please try again in 30 seconds.'
          : msg || 'Generation failed'
        setGenMsg(friendly); setGenerating(false); setGenProgress(0)
      }
      return
    }

    setGenMsg('Generating ' + clips + ' clips for ' + duration + 's reel…')
    try {
      const clipUrls: string[] = []
      for (let i = 0; i < clips; i++) {
        const clipPrompt = prompt ? (i === 0 ? prompt : prompt + ', continuation ' + (i + 1) + ' of ' + clips) : null
        const d = await callHiggsfield({ ...base, prompt: clipPrompt || null, duration_seconds: clipSecs })
        if (!d.job_id) throw new Error('Clip ' + (i + 1) + ' failed: no job_id')
        setGenMsg('Clip ' + (i + 1) + '/' + clips + ' submitted, waiting…'); setGenProgress(10 + Math.floor(i * 70 / clips))
        const url = await pollClip(d.job_id, d.session_id, userToken)
        if (!url) throw new Error('Clip ' + (i + 1) + ' generation failed')
        clipUrls.push(url); setClipProgress(i + 1); setGenProgress(10 + Math.floor((i + 1) * 70 / clips))
      }
      setLatestVideo(clipUrls[0])
      setGenerating(false); setGenProgress(100)
      setGenMsg(clipUrls.length + ' clips ready. Showing clip 1 — download all below.')
      setTab('edit')
      if (bid) loadBiz(bid)
    } catch (e: any) {
      const msg = (e.message ?? '').replace(/<[^>]*>/g, '').slice(0, 120)
      const friendly = msg.includes('522') || msg.includes('timeout') || msg.includes('DOCTYPE')
        ? 'Higgsfield API is temporarily unavailable. Please try again in 30 seconds.'
        : msg || 'Generation failed'
      setGenMsg(friendly); setGenerating(false); setGenProgress(0)
    }
  }

  async function publishReelTo(platform: string) {
    if (!latestVideo || !bid || publishing) return
    setPublishing(true); setPublishMsg('')
    try {
      const cd = await fetch('/api/social/posts/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bid, platform, caption: publishCaption || 'Check out our latest reel! 🎬', hashtags: ['smallbusiness', 'australia', 'reels'], post_type: 'reel', video_url: latestVideo }),
      }).then(r => r.json())
      if (!cd.post?.id) throw new Error(cd.error ?? 'Could not create post')
      const pd = await fetch('/api/social/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: cd.post.id, business_id: bid, post_type_override: 'reel' }),
      })
      if (!pd.ok) { const e = await pd.json(); throw new Error(e.error ?? 'Publish failed') }
      setPublishMsg('Published to ' + platform.charAt(0).toUpperCase() + platform.slice(1) + ' Reels!')
    } catch (e: any) { setPublishMsg(e.message) }
    setPublishing(false)
  }

  // Keep old publishReel for backward compat
  async function publishReel() { return publishReelTo(publishPlatform) }

  const selectedFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]
  const selectedDur = DURATIONS.find((d) => d.secs === duration)
  const estimatedCost = selectedDur?.costAud ?? parseFloat((duration * 0.095).toFixed(2))
  const urgencyColor = (u: string) => u === 'high' ? T.danger : u === 'medium' ? T.warn : T.accent
  const urgencyBg = (u: string) => u === 'high' ? 'rgba(239,68,68,0.12)' : u === 'medium' ? 'rgba(245,158,11,0.12)' : T.accentDim

  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg }}>
      <Loader2 size={32} color={T.accent} style={{ animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (pageError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg, gap: T.sp.md, color: T.text, fontFamily: T.font }}>
      <AlertCircle size={40} color={T.danger} />
      <p style={{ fontSize: 15, color: T.textMid, margin: 0 }}>{pageError}</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.font, fontSize: 13 }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header style={{ padding: `${T.sp.md}px ${T.sp.xl}px`, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm }}>
          <Film size={20} color={T.accent} />
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.5 }}>Reel Studio</span>
          <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: T.r.full, background: T.accentDim, color: T.accent, fontWeight: 700, letterSpacing: 0.5 }}>PLUS</span>
        </div>
        <div style={{ display: 'flex', gap: T.sp.xl, fontSize: 12 }}>
          <span style={{ color: T.textDim }}><span style={{ color: T.text, fontWeight: 600 }}>{monthlyReels}</span> reels this month</span>
          <span style={{ color: T.gold, fontWeight: 700 }}>${totalSpent.toFixed(2)} AUD spent</span>
        </div>
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <nav style={{ display: 'flex', gap: 2, padding: `${T.sp.sm}px ${T.sp.xl}px 0`, borderBottom: `1px solid ${T.border}`, background: T.surface }} aria-label="Reel Studio tabs">
        {([
          { id: 'create', label: 'Create', icon: <Film size={13} /> },
          { id: 'edit',   label: 'Edit & Export', icon: <Edit3 size={13} /> },
          { id: 'history',label: 'History', icon: <Clock size={13} /> },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} aria-selected={tab === t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: `${T.r.sm}px ${T.r.sm}px 0 0`, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: 600, background: tab === t.id ? T.bg : 'transparent', color: tab === t.id ? T.text : T.textDim, borderBottom: tab === t.id ? `2px solid ${T.accent}` : '2px solid transparent', transition: 'all 120ms', minHeight: 36 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>

      {/* ── CREATE TAB ────────────────────────────────────────────────────────── */}
      {tab === 'create' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', flex: 1, minHeight: 0 }}>
          {/* Left panel */}
          <aside style={{ borderRight: `1px solid ${T.border}`, overflowY: 'auto', padding: `${T.sp.lg}px ${T.sp.md}px`, display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>

            {/* Aria Ideas */}
            <div style={{ background: 'linear-gradient(135deg,rgba(127,184,151,0.07),rgba(45,82,64,0.1))', border: `1px solid ${T.borderAccent}`, borderRadius: T.r.lg, padding: `${T.sp.md}px ${T.sp.lg}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: ideasLoaded ? T.sp.md : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm }}>
                  <Sparkles size={14} color={T.accent} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>Aria Reel Ideas</span>
                  <span style={{ fontSize: 10, color: T.textDim }}>from your POS data</span>
                </div>
                <button onClick={loadIdeas} disabled={ideasLoading} aria-label="Refresh reel ideas" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '5px 10px', borderRadius: T.r.full, border: 'none', cursor: ideasLoading ? 'wait' : 'pointer', background: T.accentDim, color: T.accent, fontFamily: T.font, fontWeight: 700, minHeight: 28 }}>
                  {ideasLoading ? <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={11} />}
                  {ideasLoaded ? 'Refresh' : 'Generate'}
                </button>
              </div>
              {ideasLoading && <p style={{ fontSize: 11, color: T.textDim, margin: `${T.sp.sm}px 0 0` }}>Reading your sales data, products and reviews…</p>}
              {ideasLoaded && reelIdeas.map((idea, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <button onClick={() => setExpandedIdea(expandedIdea === i ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${T.sp.sm}px ${T.sp.md}px`, borderRadius: T.r.md, border: 'none', cursor: 'pointer', background: expandedIdea === i ? T.accentDim : 'rgba(255,255,255,0.03)', boxShadow: expandedIdea === i ? `inset 0 0 0 1.5px ${T.borderAccent}` : `inset 0 0 0 1px ${T.border}`, transition: 'all 120ms', minHeight: 44, fontFamily: T.font }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: T.r.full, fontWeight: 700, background: urgencyBg(idea.urgency), color: urgencyColor(idea.urgency), flexShrink: 0 }}>{idea.urgency === 'high' ? 'HOT' : idea.urgency === 'medium' ? 'GOOD' : 'EVERGREEN'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                    </div>
                    {expandedIdea === i ? <ChevronUp size={13} color={T.textDim} /> : <ChevronDown size={13} color={T.textDim} />}
                  </button>
                  {expandedIdea === i && (
                    <div style={{ padding: `${T.sp.md}px ${T.sp.md}px`, background: 'rgba(255,255,255,0.02)', borderRadius: `0 0 ${T.r.md}px ${T.r.md}px`, border: `1px solid ${T.borderAccent}`, borderTop: 'none' }}>
                      <p style={{ fontSize: 11, color: T.accent, marginBottom: T.sp.sm, lineHeight: 1.5, display: 'flex', gap: 6 }}><Zap size={11} style={{ flexShrink: 0, marginTop: 1 }} />{idea.why}</p>
                      <p style={{ fontSize: 11, color: T.textMid, marginBottom: T.sp.sm, lineHeight: 1.5 }}>{idea.prompt}</p>
                      <p style={{ fontSize: 10, color: T.textDim, marginBottom: T.sp.md, fontStyle: 'italic' }}>&#34;{idea.hook}&#34;</p>
                      <PrimaryBtn onClick={() => applyIdea(idea)} style={{ minHeight: 40, fontSize: 12 }}>Use this idea</PrimaryBtn>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Influencer */}
            <Card>
              <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Users size={10} />AI Influencer{selectedInf?.soul_status === 'ready' && <span style={{ color: T.accent }}>· Soul trained</span>}</span></SectionLabel>
              {selectedInf ? (
                <div style={{ display: 'flex', gap: T.sp.md, alignItems: 'center' }}>
                  <img src={selectedInf.image_url} alt={selectedInf.name} style={{ width: 44, height: 56, borderRadius: T.r.sm, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${T.border}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{selectedInf.name}</p>
                    <p style={{ color: T.textDim, fontSize: 11, margin: `${T.sp.xs}px 0 0` }}>{selectedInf.soul_status === 'ready' ? 'Consistent face mode' : 'Reference frame mode'}</p>
                  </div>
                  <Chip active={false} onClick={() => setShowPicker(true)}>Change</Chip>
                </div>
              ) : (
                <button onClick={() => setShowPicker(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp.sm, width: '100%', padding: T.sp.md + 'px', borderRadius: T.r.md, border: `1.5px dashed ${T.borderAccent}`, background: 'transparent', cursor: 'pointer', color: T.textMid, fontFamily: T.font, fontSize: 12, minHeight: 48 }}>
                  <Users size={14} color={T.accent} />
                  {influencers.length > 0 ? 'Pick influencer (' + influencers.length + ' available)' : 'Pick AI influencer'}
                </button>
              )}
            </Card>

            {/* Scene photo */}
            <Card>
              <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ImageIcon size={10} />Scene photo <span style={{ color: T.textFaint, fontWeight: 400, textTransform: 'none' }}>optional</span></span></SectionLabel>
              <input ref={sceneRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleSceneUpload(e.target.files[0])} aria-label="Upload scene photo" />
              {scenePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={scenePreview} alt="Scene preview" style={{ height: 72, borderRadius: T.r.sm, objectFit: 'cover', border: `1.5px solid ${T.borderAccent}` }} />
                  {sceneUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: T.r.sm, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={16} color="#fff" style={{ animation: 'spin 0.8s linear infinite' }} /></div>}
                  <button onClick={() => { setScenePreview(null); setSceneUrl(null) }} aria-label="Remove scene photo" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: T.r.full, border: 'none', background: T.danger, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={11} /></button>
                </div>
              ) : (
                <button onClick={() => sceneRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp.sm, width: '100%', padding: T.sp.md + 'px', borderRadius: T.r.sm, border: `1px dashed ${T.border}`, background: 'transparent', cursor: 'pointer', color: T.textDim, fontFamily: T.font, fontSize: 12, minHeight: 48 }}>
                  <Upload size={14} />Upload product or shop photo
                </button>
              )}
            </Card>

            {/* Style */}
            <Card>
              <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Layers size={10} />Vibe</span></SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {STYLES.map((s) => (
                  <button key={s.id} onClick={() => setStyle(s.id)} style={{ padding: '9px 10px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', fontFamily: T.font, textAlign: 'left', background: style === s.id ? T.accentDim : 'rgba(255,255,255,0.03)', boxShadow: style === s.id ? `inset 0 0 0 1.5px ${T.borderAccent}` : `inset 0 0 0 1px ${T.border}`, transition: 'all 120ms', minHeight: 56 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: style === s.id ? T.accent : T.text, margin: 0 }}>{s.label}</p>
                    <p style={{ fontSize: 10, color: T.textDim, margin: `2px 0 0` }}>{s.desc}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* Prompt */}
            <Card>
              <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mic size={10} />Scene description <span style={{ color: T.textFaint, fontWeight: 400, textTransform: 'none' }}>optional</span></span></SectionLabel>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="e.g. Walks into a warm café, picks up a flat white, smiles at camera" aria-label="Scene description" style={{ width: '100%', padding: '10px 12px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, resize: 'none', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }} />
            </Card>

            {/* Duration */}
            <Card>
              <SectionLabel>Duration</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DURATIONS.map((d) => (
                  <button key={d.secs} onClick={() => setDuration(d.secs)} aria-pressed={duration === d.secs} style={{ flex: '1 1 52px', padding: '8px 0', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', fontFamily: T.font, fontWeight: 700, fontSize: 12, background: duration === d.secs ? T.accentDim : 'rgba(255,255,255,0.04)', boxShadow: duration === d.secs ? `inset 0 0 0 1.5px ${T.borderAccent}` : `inset 0 0 0 1px ${T.border}`, color: duration === d.secs ? T.accent : T.textMid, transition: 'all 120ms', minHeight: 52 }}>
                    <p style={{ margin: 0, fontSize: 13 }}>{d.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 9, color: T.textDim, fontWeight: 400 }}>${d.costAud}</p>
                    {d.clips > 1 && <p style={{ margin: '2px 0 0', fontSize: 8, color: T.accent, fontWeight: 600 }}>{d.clips} clips</p>}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, marginTop: T.sp.sm }}>
                <label htmlFor="custom-duration" style={{ fontSize: 11, color: T.textDim }}>Custom:</label>
                <input id="custom-duration" type="number" min={3} max={60} placeholder="sec" onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v >= 3 && v <= 60) setDuration(v) }} style={{ width: 60, padding: '6px 8px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
                <span style={{ fontSize: 10, color: T.textFaint }}>3–60s</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: T.sp.sm }}>
                {RESOLUTIONS.map((r) => <Chip key={r.id} active={resolution === r.id} onClick={() => setResolution(r.id)}>{r.label} · {r.note}</Chip>)}
              </div>
            </Card>

            {/* Genre */}
            <Card>
              <SectionLabel>Cinematic genre</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {GENRES.map((g) => <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>{g.charAt(0).toUpperCase() + g.slice(1)}</Chip>)}
              </div>
            </Card>

            {/* Cost + Generate */}
            <div style={{ background: T.accentBg, border: `1px solid ${T.borderAccent}`, borderRadius: T.r.lg, padding: `${T.sp.md}px ${T.sp.lg}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 11, color: T.textDim, margin: 0 }}>Estimated cost</p>
                <p style={{ fontSize: 10, color: T.textFaint, margin: `${T.sp.xs}px 0 0` }}>{resolution} · {duration}s{clipsNeeded(duration) > 1 ? ' · ' + clipsNeeded(duration) + ' clips' : ''}</p>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.gold }}>${estimatedCost.toFixed(2)}</span>
            </div>

            <PrimaryBtn onClick={generate} loading={generating} disabled={generating}>
              {generating && totalClips > 1 ? clipProgress + '/' + totalClips + ' clips…' : generating ? 'Generating…' : 'Generate ' + duration + 's Reel — $' + estimatedCost.toFixed(2) + ' AUD'}
            </PrimaryBtn>

            {genMsg && (
              <div style={{ display: 'flex', gap: T.sp.sm, alignItems: 'flex-start', fontSize: 12, padding: `${T.sp.sm}px ${T.sp.md}px`, borderRadius: T.r.sm, background: 'rgba(255,255,255,0.03)', color: genMsg.startsWith('Reel ready') ? T.accent : T.danger.includes(genMsg) ? T.danger : T.textMid, lineHeight: 1.5, border: `1px solid ${T.border}` }}>
                {genMsg.startsWith('Reel ready') ? <CheckCircle2 size={14} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /> : generating ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} color={T.danger} style={{ flexShrink: 0, marginTop: 1 }} />}
                <div style={{ flex: 1 }}>
                  {genMsg}
                  {generating && (
                    <div style={{ marginTop: T.sp.sm, height: 3, borderRadius: T.r.full, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: genProgress + '%', background: T.accent, borderRadius: T.r.full, transition: 'width 0.8s ease' }} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>

          {/* Right — preview */}
          <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: T.sp.xxl + 'px', background: '#0a0b0f', gap: T.sp.lg }}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: T.accent, marginBottom: T.sp.md, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle2 size={14} />Reel ready — switch to Edit tab</p>
                <div style={{ border: `2px solid ${T.borderAccent}`, borderRadius: T.r.xl, overflow: 'hidden', width: 220 }}>
                  <video src={latestVideo} controls autoPlay loop playsInline style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                </div>
                <div style={{ display: 'flex', gap: T.sp.sm, marginTop: T.sp.lg, justifyContent: 'center' }}>
                  <button onClick={() => setTab('edit')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: 700, background: T.accent, color: '#0f1117', minHeight: 40 }}><Edit3 size={13} />Edit</button>
                  <a href={latestVideo} download="aria-reel.mp4" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 12, fontWeight: 700, textDecoration: 'none', minHeight: 40 }}><Download size={13} />Download</a>
                </div>
              </div>
            ) : generating ? (
              <div style={{ textAlign: 'center' }}>
                <Loader2 size={48} color={T.accent} style={{ animation: 'spin 0.8s linear infinite', marginBottom: T.sp.lg }} />
                <p style={{ fontSize: 14, color: T.textMid, margin: 0 }}>Generating reel…</p>
                <p style={{ fontSize: 11, color: T.textDim, margin: `${T.sp.sm}px 0 0` }}>~60–90 seconds · Higgsfield AI</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: T.textFaint }}>
                <div style={{ width: 120, height: 200, borderRadius: T.r.xl, border: `2px dashed ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto ' + T.sp.lg + 'px' }}><Film size={36} color={T.textFaint} /></div>
                <p style={{ fontSize: 13, margin: 0 }}>Configure your reel and hit Generate</p>
                <p style={{ fontSize: 11, marginTop: T.sp.sm, opacity: 0.6, margin: `${T.sp.sm}px 0 0` }}>9:16 vertical · up to 60s · 1080p</p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* ── EDIT TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'edit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', flex: 1 }}>
          <aside style={{ borderRight: `1px solid ${T.border}`, overflowY: 'auto', padding: `${T.sp.lg}px ${T.sp.md}px`, display: 'flex', flexDirection: 'column', gap: T.sp.sm }}>
            {!latestVideo && <p style={{ padding: '40px 0', textAlign: 'center', color: T.textFaint, fontSize: 13 }}>Generate a reel first</p>}

            <Card>
              <SectionLabel>Playback speed</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <Chip key={s} active={speed === s} onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s }}>{s}×</Chip>
                ))}
              </div>
            </Card>

            <Card>
              <SectionLabel>Visual filter</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {FILTERS.map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id} style={{ padding: '9px 10px', borderRadius: T.r.sm, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 11, fontWeight: 600, textAlign: 'left', background: filter === f.id ? T.accentDim : 'rgba(255,255,255,0.03)', boxShadow: filter === f.id ? `inset 0 0 0 1.5px ${T.borderAccent}` : `inset 0 0 0 1px ${T.border}`, color: filter === f.id ? T.accent : T.textMid, transition: 'all 120ms', minHeight: 40 }}>{f.label}</button>
                ))}
              </div>
            </Card>

            <Card>
              <SectionLabel>Auto-captions</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CAPTION_STYLES.map((c) => <Chip key={c.id} active={captionStyle === c.id} onClick={() => setCaptionStyle(c.id)}>{c.label}</Chip>)}
              </div>
              {captionStyle !== 'none' && (
                <textarea value={captionText} onChange={(e) => setCaptionText(e.target.value)} rows={2} placeholder="Caption text…" aria-label="Caption text" style={{ width: '100%', marginTop: T.sp.sm, padding: '8px 10px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              )}
            </Card>

            <Card>
              <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Music size={10} />Background music <span style={{ color: T.textFaint, fontWeight: 400, textTransform: 'none' }}>Pixabay · free commercial</span></span></SectionLabel>
              <div style={{ marginBottom: T.sp.sm }}><Chip active={music === 'none'} onClick={() => { setMusic('none'); setSelectedTrack(null) }}>No music</Chip></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MUSIC_MOODS.map((m) => <Chip key={m.id} active={musicMood === m.id} small onClick={() => { setMusicMood(m.id); loadMusicTracks(m.id) }}>{m.label}</Chip>)}
              </div>
              <div style={{ marginTop: T.sp.sm }}>
                {musicLoading && <p style={{ fontSize: 11, color: T.textDim, margin: 0 }}>Searching…</p>}
                {!musicLoading && musicTracks.length === 0 && <button onClick={() => loadMusicTracks(musicMood)} style={{ fontSize: 11, color: T.accent, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, padding: '4px 0' }}>Load tracks →</button>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {musicTracks.map((t) => (
                    <div key={t.id} onClick={() => { setSelectedTrack(t); setMusic(t.url) }} style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, padding: '7px 10px', borderRadius: T.r.sm, cursor: 'pointer', background: selectedTrack?.id === t.id ? T.accentDim : 'rgba(255,255,255,0.03)', boxShadow: selectedTrack?.id === t.id ? `inset 0 0 0 1.5px ${T.borderAccent}` : `inset 0 0 0 1px ${T.border}`, transition: 'all 120ms', minHeight: 40 }}>
                      <button onClick={(e) => { e.stopPropagation(); previewTrack(t) }} aria-label={playingId === t.id ? 'Stop preview' : 'Preview track'} style={{ width: 28, height: 28, borderRadius: T.r.full, border: 'none', flexShrink: 0, background: playingId === t.id ? T.accent : 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {playingId === t.id ? <Pause size={11} /> : <Play size={11} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: selectedTrack?.id === t.id ? T.accent : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{t.title}</p>
                        <p style={{ fontSize: 9, color: T.textDim, margin: `2px 0 0` }}>{t.artist}{t.bpm ? ' · ' + t.bpm + ' BPM' : ''}</p>
                      </div>
                      {selectedTrack?.id === t.id && <CheckCircle2 size={13} color={T.accent} />}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <SectionLabel>Brand</SectionLabel>
              <label style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, cursor: 'pointer', marginBottom: T.sp.sm, minHeight: 36 }}>
                <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} aria-label="Add Aria watermark" />
                <span style={{ fontSize: 12, color: T.textMid }}>Add Aria watermark</span>
              </label>
              <input value={endCard} onChange={(e) => setEndCard(e.target.value)} placeholder="End card text (e.g. Visit us at 123 Main St)" aria-label="End card text" style={{ width: '100%', padding: '8px 10px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', boxSizing: 'border-box', minHeight: 36 }} />
            </Card>

            {latestVideo && (
              <a href={latestVideo} download="aria-reel.mp4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp.sm, textAlign: 'center', padding: '13px 0', borderRadius: T.r.md, background: 'linear-gradient(135deg,#7FB897,#2D5240)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none', letterSpacing: -0.2, minHeight: 48 }}><Download size={16} />Download Reel</a>
            )}

            {latestVideo && (
              <Card>
                <SectionLabel><span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Send size={10} />Publish to social</span></SectionLabel>

                {/* Caption */}
                <textarea value={publishCaption} onChange={(e) => setPublishCaption(e.target.value)} rows={3} placeholder="Caption (blank = auto-generated)" aria-label="Social media caption" style={{ width: '100%', padding: '10px 12px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontFamily: T.font, resize: 'none', outline: 'none', boxSizing: 'border-box', marginBottom: T.sp.sm, lineHeight: 1.6 }} />

                {/* 1-click per connected platform */}
                {connectedPlatforms.length === 0 ? (
                  <div style={{ fontSize: 12, color: T.textDim, padding: '8px 0' }}>
                    No social accounts connected. Connect them in <a href="/dashboard/social" style={{ color: T.accent }}>Social settings</a>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {connectedPlatforms.map(platform => (
                      <button key={platform} onClick={() => { setPublishPlatform(platform as 'instagram' | 'facebook'); publishReelTo(platform) }}
                        disabled={publishing} aria-label={'Publish to ' + platform}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: T.r.sm, border: 'none', cursor: publishing ? 'wait' : 'pointer', fontFamily: T.font, fontSize: 13, fontWeight: 700, minHeight: 44, transition: 'opacity 150ms',
                          background: platform === 'instagram' ? 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)'
                            : platform === 'facebook' ? 'linear-gradient(135deg,#1877f2,#1651b5)'
                            : platform === 'tiktok' ? 'linear-gradient(135deg,#000,#333)'
                            : 'linear-gradient(135deg,#6366f1,#4f46e5)',
                          color: '#fff', opacity: publishing ? 0.5 : 1 }}>
                        <Send size={14} />
                        Publish to {platform.charAt(0).toUpperCase() + platform.slice(1)} Reels
                      </button>
                    ))}
                  </div>
                )}

                {publishMsg && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: T.sp.sm, padding: '8px 12px', borderRadius: T.r.sm, background: 'rgba(255,255,255,0.03)', color: publishMsg.includes('Published') ? T.accent : T.danger }}>
                    {publishMsg.includes('Published') ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                    {publishMsg}
                  </div>
                )}
              </Card>
            )}
          </aside>

          <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: T.sp.xxl + 'px', background: '#0a0b0f' }}>
            {latestVideo ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: T.textDim, marginBottom: T.sp.md, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Eye size={12} />Live preview with edits applied</p>
                <div style={{ position: 'relative', width: 220, margin: '0 auto' }}>
                  <div style={{ border: `2px solid ${T.border}`, borderRadius: T.r.xl, overflow: 'hidden' }}>
                    <video ref={videoRef} src={latestVideo} controls autoPlay loop playsInline style={{ width: '100%', display: 'block', filter: selectedFilter.css }} />
                  </div>
                  {captionStyle !== 'none' && captionText && (
                    <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, textAlign: 'center', fontSize: captionStyle === 'bold' ? 14 : 11, fontWeight: captionStyle === 'bold' ? 900 : 600, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.9)', padding: '4px 8px', background: captionStyle === 'karaoke' ? 'rgba(0,0,0,0.7)' : 'transparent', textTransform: captionStyle === 'bold' ? 'uppercase' : 'none' }}>
                      {captionText}
                    </div>
                  )}
                  {watermark && <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1 }}>ARIA</span>}
                </div>
              </div>
            ) : <p style={{ color: T.textFaint, fontSize: 13 }}>Generate a reel first</p>}
          </main>
        </div>
      )}

      {/* ── HISTORY TAB ───────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div style={{ padding: T.sp.xl + 'px', flex: 1 }}>
          {sessions.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: T.sp.md, color: T.textFaint }}>
              <Clock size={36} />
              <p style={{ fontSize: 14, margin: 0 }}>No reels generated yet</p>
              <p style={{ fontSize: 12, margin: 0, color: T.textFaint }}>Generated reels appear here</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: T.sp.lg }}>
              {sessions.map((s) => (
                <article key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r.lg, overflow: 'hidden' }}>
                  {s.video_url
                    ? <video src={s.video_url} muted loop playsInline style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} onMouseEnter={(e) => (e.target as HTMLVideoElement).play()} onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }} />
                    : <div style={{ aspectRatio: '9/16', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.status === 'processing' ? <Loader2 size={24} color={T.warn} style={{ animation: 'spin 0.8s linear infinite' }} /> : s.status === 'failed' ? <AlertCircle size={24} color={T.danger} /> : <Film size={24} color={T.textFaint} />}
                      </div>
                  }
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'capitalize', color: s.status === 'completed' ? T.accent : s.status === 'failed' ? T.danger : T.warn }}>{s.status}</span>
                      <span style={{ fontSize: 10, color: T.textDim }}>${Number(s.cost_aud ?? 0).toFixed(2)}</span>
                    </div>
                    <p style={{ fontSize: 10, color: T.textDim, margin: `${T.sp.xs}px 0 0` }}>{s.style} · {s.duration_seconds}s</p>
                    {s.video_url && (
                      <a href={s.video_url} download style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: T.sp.sm, padding: '6px 0', borderRadius: T.r.sm, background: T.accentBg, color: T.accent, textAlign: 'center', fontSize: 10, fontWeight: 700, textDecoration: 'none', minHeight: 32 }}><Download size={10} />Download</a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Influencer picker modal ────────────────────────────────────────────── */}
      {showPicker && (
        <div role="dialog" aria-label="Choose influencer" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowPicker(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', background: T.surface, borderRadius: `${T.r.xl}px ${T.r.xl}px 0 0`, padding: T.sp.xl + 'px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: T.sp.lg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm }}>
                <Users size={16} color={T.accent} />
                <span style={{ fontSize: 16, fontWeight: 800 }}>Choose Influencer</span>
              </div>
              <button onClick={() => setShowPicker(false)} aria-label="Close picker" style={{ width: 32, height: 32, borderRadius: T.r.full, border: 'none', background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            {influencers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.sp.sm }}><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />Loading influencers…</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: T.sp.md }}>
                {influencers.map((inf) => (
                  <button key={inf.id} onClick={() => { setSelectedInf(inf); setShowPicker(false) }} style={{ borderRadius: T.r.md, overflow: 'hidden', cursor: 'pointer', border: `2px solid ${selectedInf?.id === inf.id ? T.accent : T.border}`, background: 'transparent', padding: 0, textAlign: 'left', transition: 'border-color 120ms' }}>
                    <div style={{ position: 'relative', aspectRatio: '3/4' }}>
                      <img src={inf.image_url} alt={inf.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {inf.soul_status === 'ready' && (
                        <span style={{ position: 'absolute', top: 6, left: 6, background: T.accent, color: '#0f1117', fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: T.r.full }}>SOUL</span>
                      )}
                    </div>
                    <div style={{ padding: '8px 10px', background: '#111' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: T.text }}>{inf.name}</p>
                    </div>
                  </button>
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

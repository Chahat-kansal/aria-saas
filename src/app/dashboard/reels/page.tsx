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

  async function generate() {
    if (!bid || !userToken || generating) return
    setGenerating(true); setLatestVideo(null); setGenProgress(5); setClipProgress(0)
    const clips = clipsNeeded(duration); setTotalClips(clips)
    const clipSecs = clipDuration(duration)
    const base = { business_id: bid, influencer_id: selectedInf?.id ?? null, soul_id: selectedInf?.soul_status === 'ready' ? selectedInf.soul_id : null, higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null, scene_image_url: sceneUrl ?? null, style, resolution, genre }

    if (clips === 1) {
      setGenMsg('Generating ' + duration + 's reel…')
      try {
        const d = await fetch(REEL_GENERATE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, prompt: prompt || null, duration_seconds: duration }) }).then(r => r.json())
        if (!d.job_id) throw new Error(d.error ?? 'No job_id returned')
        setGenProgress(15); setActiveJob({ jobId: d.job_id, sessionId: d.session_id })
        pollStatus(d.job_id, d.session_id, userToken)
      } catch (e: any) {
        const msg = (e.message ?? '').replace(/<[^>]*>/g, '').slice(0, 120)
        setGenMsg(msg || 'Generation failed'); setGenerating(false); setGenProgress(0)
      }
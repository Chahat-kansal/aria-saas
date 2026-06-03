'use client'
import { useState, useEffect, useRef } from 'react'
import { createBrowserSupabaseClient } from '@/lib/supabase-browser'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const EDGE_FN = SUPABASE_URL + '/functions/v1/reel-engine'

const STYLES = [
  { id: 'lifestyle',        emoji: '☀️', label: 'Lifestyle' },
  { id: 'product_showcase', emoji: '📦', label: 'Product' },
  { id: 'behind_scenes',    emoji: '🎥', label: 'BTS' },
  { id: 'flash_sale',       emoji: '⚡', label: 'Flash sale' },
  { id: 'testimonial',      emoji: '💬', label: 'Testimonial' },
  { id: 'day_in_life',      emoji: '🌅', label: 'Day in life' },
]

type Influencer = {
  id: string; name: string; description: string; image_url: string
  higgsfield_job_id: string; soul_id: string | null; soul_status: string
  industry_tags: string[]
}
type Session = {
  id: string; status: string; video_url: string | null; cost_aud: number
  created_at: string; style: string; duration_seconds: number
  higgsfield_job_id: string | null
}
type CostStats = {
  total_reels: number; completed_reels: number; total_cost_aud: number
  reels_this_month: number; cost_this_month: number; avg_cost_per_reel: number
}

export default function ReelStudioPage() {
  const supabase = createBrowserSupabaseClient()
  const [bid, setBid] = useState<string | null>(null)
  const [session, setSession] = useState<any>(null)

  // Influencer state
  const [influencers, setInfluencers] = useState<Influencer[]>([])
  const [selectedInf, setSelectedInf] = useState<Influencer | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  // Soul training state
  const [showTraining, setShowTraining] = useState(false)
  const [trainingInf, setTrainingInf] = useState<Influencer | null>(null)
  const [trainImages, setTrainImages] = useState<string[]>([])
  const [trainUploading, setTrainUploading] = useState(false)
  const [trainSubmitting, setTrainSubmitting] = useState(false)
  const [trainMsg, setTrainMsg] = useState('')

  // Scene builder
  const [sceneFile, setSceneFile] = useState<File | null>(null)
  const [scenePreview, setScenePreview] = useState<string | null>(null)
  const [sceneUploading, setSceneUploading] = useState(false)
  const [sceneUrl, setSceneUrl] = useState<string | null>(null)

  // Generation
  const [style, setStyle] = useState('lifestyle')
  const [duration, setDuration] = useState(10)
  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [activeJob, setActiveJob] = useState<{jobId:string,sessionId:string}|null>(null)
  const [latestVideo, setLatestVideo] = useState<string|null>(null)
  const [genMsg, setGenMsg] = useState('')

  // History + cost
  const [sessions, setSessions] = useState<Session[]>([])
  const [costStats, setCostStats] = useState<CostStats|null>(null)
  const [tab, setTab] = useState<'create'|'history'|'cost'>('create')

  // Soul training images upload
  const trainInputRef = useRef<HTMLInputElement>(null)
  const sceneInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) loadBusiness(s.user.id)
    })
  }, [])

  async function loadBusiness(userId: string) {
    const { data } = await supabase.from('businesses')
      .select('id').eq('user_id', userId).eq('is_active', true).maybeSingle()
    if (data) { setBid(data.id); loadAll(data.id) }
  }

  async function loadAll(businessId: string) {
    const [infRes, sesRes] = await Promise.all([
      fetch('/api/social/influencer-library'),
      supabase.from('reel_studio_sessions')
        .select('*').eq('business_id', businessId)
        .order('created_at', { ascending: false }).limit(20),
    ])
    const infData = await infRes.json()
    if (infData.influencers) setInfluencers(infData.influencers)
    if (sesRes.data) setSessions(sesRes.data)

    const { data: stats } = await supabase.from('reel_cost_dashboard')
      .select('*').eq('business_id', businessId).maybeSingle()
    if (stats) setCostStats(stats)
  }

  // ── Scene upload ──────────────────────────────────────────────────────────
  async function handleSceneFile(file: File) {
    setSceneFile(file)
    setScenePreview(URL.createObjectURL(file))
    setSceneUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${bid}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('reel-scenes').upload(path, file)
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('reel-scenes').getPublicUrl(path)
      setSceneUrl(publicUrl)
    } catch (e: any) {
      setGenMsg('Scene upload failed: ' + e.message)
    }
    setSceneUploading(false)
  }

  // ── Generate reel ─────────────────────────────────────────────────────────
  async function generate() {
    if (!bid || generating) return
    setGenerating(true); setGenMsg('Submitting to Higgsfield Kling 3.0…'); setLatestVideo(null)
    try {
      const token = session?.access_token
      const res = await fetch(EDGE_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          business_id: bid,
          influencer_id: selectedInf?.id ?? null,
          soul_id: selectedInf?.soul_id ?? null,
          higgsfield_job_id: selectedInf?.higgsfield_job_id ?? null,
          scene_image_url: sceneUrl ?? null,
          prompt: prompt || null,
          style, duration_seconds: duration,
        }),
      })
      const d = await res.json()
      if (!d.job_id) throw new Error(d.error ?? 'No job_id returned')
      setGenMsg(d.used_soul
        ? '✓ Soul detected — face will be 100% consistent. Generating (~60–90s)…'
        : '⚡ Generating with reference image (~60–90s)…')
      setActiveJob({ jobId: d.job_id, sessionId: d.session_id })
      pollJob(d.job_id, d.session_id, token)
    } catch (e: any) {
      setGenMsg('Error: ' + e.message); setGenerating(false)
    }
  }

  async function pollJob(jobId: string, sessionId: string, token: string) {
    try {
      const res = await fetch(
        `${EDGE_FN}?job_id=${jobId}&session_id=${sessionId}`,
        { headers: { Authorization: 'Bearer ' + token } }
      )
      const d = await res.json()
      if (d.status === 'COMPLETED') {
        setLatestVideo(d.video_url); setGenerating(false)
        setGenMsg('✅ Reel ready!'); setActiveJob(null)
        if (bid) loadAll(bid)
      } else if (d.status === 'FAILED') {
        setGenMsg('❌ Generation failed — try again'); setGenerating(false); setActiveJob(null)
      } else {
        setTimeout(() => pollJob(jobId, sessionId, token), 5000)
      }
    } catch { setTimeout(() => pollJob(jobId, sessionId, token), 8000) }
  }

  // ── Soul training ─────────────────────────────────────────────────────────
  async function uploadTrainingImages(files: FileList) {
    setTrainUploading(true)
    const ids: string[] = [...trainImages]
    for (const file of Array.from(files).slice(0, 20 - ids.length)) {
      try {
        const ext = file.name.split('.').pop()
        const path = `soul-training/${trainingInf?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        await supabase.storage.from('reel-scenes').upload(path, file)
        const { data: { publicUrl } } = supabase.storage.from('reel-scenes').getPublicUrl(path)
        // For training we use the image_url directly (Higgsfield accepts URLs)
        ids.push(publicUrl)
      } catch {}
    }
    setTrainImages(ids); setTrainUploading(false)
  }

  async function submitSoulTraining() {
    if (!trainingInf || trainImages.length < 5) return
    setTrainSubmitting(true); setTrainMsg('Submitting Soul training — takes ~10 minutes…')
    try {
      const token = session?.access_token
      const res = await fetch(EDGE_FN + '?action=train_soul', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          influencer_id: trainingInf.id,
          image_job_ids: trainImages,
          name: trainingInf.name + ' Soul',
        }),
      })
      const d = await res.json()
      if (d.soul_id) {
        setTrainMsg('✅ Soul training started! Check back in ~10 minutes. Soul ID: ' + d.soul_id)
      } else {
        setTrainMsg('Error: ' + (d.error ?? 'Training failed'))
      }
    } catch (e: any) {
      setTrainMsg('Error: ' + e.message)
    }
    setTrainSubmitting(false)
  }

  const S: Record<string, any> = {
    page: { minHeight: '100vh', background: '#0a0d12', color: '#fff', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' },
    header: { padding: '20px 28px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 16 },
    title: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5 },
    subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
    tabs: { display: 'flex', gap: 4, padding: '16px 28px 0' },
    tab: (active: boolean) => ({ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, background: active ? 'rgba(127,184,151,0.15)' : 'transparent', color: active ? '#7FB897' : 'rgba(255,255,255,0.4)', boxShadow: active ? 'inset 0 0 0 1px rgba(127,184,151,0.4)' : 'none' }),
    body: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '24px 28px', maxWidth: 1200 },
    panel: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24 },
    label: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'block' },
    section: { marginBottom: 24 },
    btn: (primary?: boolean) => ({ padding: primary ? '13px 24px' : '9px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: primary ? 15 : 12, background: primary ? 'linear-gradient(135deg,#7FB897,#2D5240)' : 'rgba(255,255,255,0.07)', color: primary ? '#fff' : 'rgba(255,255,255,0.7)', width: primary ? '100%' : 'auto' }),
  }

  const costPerReel = { 5: 0.48, 10: 0.95 }[duration] ?? 0.95

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.title}>🎬 Aria Reel Studio</div>
          <div style={S.subtitle}>AI influencer reels for your business · Powered by Higgsfield Kling 3.0</div>
        </div>
        {costStats && (
          <div style={{ display: 'flex', gap: 24, fontSize: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)' }}>This month</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#7FB897' }}>{costStats.reels_this_month} reels</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)' }}>Cost</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#F59E0B' }}>${Number(costStats.cost_this_month ?? 0).toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>

      <div style={S.tabs}>
        {(['create','history','cost'] as const).map(t => (
          <button key={t} style={S.tab(tab===t)} onClick={() => setTab(t)}>
            {t === 'create' ? '✦ Create' : t === 'history' ? '⏱ History' : '$ Cost'}
          </button>
        ))}
      </div>

      {/* ── CREATE TAB ── */}
      {tab === 'create' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: '20px 28px', flex: 1 }}>

          {/* LEFT: Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Influencer picker */}
            <div style={S.panel}>
              <span style={S.label}>AI Influencer {selectedInf?.soul_status === 'ready' && <span style={{ color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '1px 6px', borderRadius: 99, fontSize: 9, marginLeft: 6 }}>SOUL TRAINED ✓</span>}</span>
              {selectedInf ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={selectedInf.image_url} alt={selectedInf.name} style={{ width: 56, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedInf.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{selectedInf.description?.slice(0,60)}</div>
                    {selectedInf.soul_status === 'ready'
                      ? <div style={{ fontSize: 11, color: '#7FB897', marginTop: 6 }}>✓ Soul trained — 100% face consistency</div>
                      : <button onClick={() => { setTrainingInf(selectedInf); setShowTraining(true) }} style={{ ...S.btn(), marginTop: 6, fontSize: 10, color: '#F59E0B' }}>Train Soul for consistent face →</button>
                    }
                  </div>
                  <button onClick={() => setShowPicker(true)} style={S.btn()}>Change</button>
                </div>
              ) : (
                <button onClick={() => setShowPicker(true)} style={{ width: '100%', padding: 16, borderRadius: 12, border: '1.5px dashed rgba(127,184,151,0.3)', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontSize: 13 }}>
                  + Choose AI Influencer
                </button>
              )}
            </div>

            {/* Scene builder */}
            <div style={S.panel}>
              <span style={S.label}>Scene / Background photo <span style={{ color: 'rgba(255,255,255,0.2)', textTransform: 'none', fontWeight: 400 }}>optional</span></span>
              <input ref={sceneInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleSceneFile(e.target.files[0])} />
              {scenePreview ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={scenePreview} alt="scene" style={{ height: 100, borderRadius: 10, objectFit: 'cover', border: '1.5px solid rgba(127,184,151,0.4)' }} />
                  {sceneUploading && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>Uploading…</div>}
                  <button onClick={() => { setSceneFile(null); setScenePreview(null); setSceneUrl(null) }} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#EF4444', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                </div>
              ) : (
                <button onClick={() => sceneInputRef.current?.click()} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1.5px dashed rgba(255,255,255,0.1)', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit', fontSize: 13 }}>
                  📷 Upload your shop or product photo
                </button>
              )}
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>This becomes the scene/environment for the influencer</div>
            </div>

            {/* Vibe */}
            <div style={S.panel}>
              <span style={S.label}>Vibe</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {STYLES.map(s => (
                  <button key={s.id} onClick={() => setStyle(s.id)} style={{ padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center', background: style === s.id ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)', boxShadow: style === s.id ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{s.emoji}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: style === s.id ? '#7FB897' : 'rgba(255,255,255,0.5)' }}>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div style={S.panel}>
              <span style={S.label}>Scene description <span style={{ color: 'rgba(255,255,255,0.2)', textTransform: 'none', fontWeight: 400 }}>optional</span></span>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="e.g. Walks into a busy Melbourne café, looks around impressed, picks up a flat white…" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Duration */}
            <div style={S.panel}>
              <span style={S.label}>Duration</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {[5, 10].map(d => (
                  <button key={d} onClick={() => setDuration(d)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, background: duration === d ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)', boxShadow: duration === d ? 'inset 0 0 0 1.5px rgba(127,184,151,0.5)' : 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: duration === d ? '#7FB897' : 'rgba(255,255,255,0.4)' }}>
                    {d}s
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>~${costPerReel.toFixed(2)} AUD · 20 Higgsfield credits</div>
            </div>

            {/* Generate */}
            <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Estimated cost</div>
                {selectedInf?.soul_status === 'ready' && <div style={{ fontSize: 10, color: '#7FB897', marginTop: 2 }}>Soul mode — consistent face ✓</div>}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B' }}>${costPerReel.toFixed(2)} AUD</div>
            </div>
            <button onClick={generate} disabled={generating} style={{ padding: 16, borderRadius: 14, border: 'none', cursor: generating ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 800, background: generating ? 'rgba(127,184,151,0.3)' : 'linear-gradient(135deg,#7FB897 0%,#2D5240 100%)', color: '#fff', boxShadow: generating ? 'none' : '0 4px 20px rgba(127,184,151,0.25)', letterSpacing: -0.3 }}>
              {generating ? '⏳ Generating…' : `Generate Reel — $${costPerReel.toFixed(2)} AUD`}
            </button>
            {genMsg && <div style={{ fontSize: 12, color: genMsg.startsWith('✅') ? '#7FB897' : genMsg.startsWith('❌') ? '#EF4444' : 'rgba(255,255,255,0.5)', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>{genMsg}</div>}
          </div>

          {/* RIGHT: Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ ...S.panel, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500, position: 'relative' }}>
              {latestVideo ? (
                <div style={{ width: '100%' }}>
                  <video src={latestVideo} controls autoPlay loop playsInline style={{ width: '100%', maxHeight: 520, borderRadius: 12, objectFit: 'contain' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <a href={latestVideo} download="aria-reel.mp4" style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#7FB897', color: '#0f1117', textAlign: 'center', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>⬇ Download</a>
                  </div>
                </div>
              ) : generating ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 48, height: 48, border: '3px solid rgba(127,184,151,0.2)', borderTopColor: '#7FB897', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Generating your reel…</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Usually 60–90 seconds</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎬</div>
                  <div style={{ fontSize: 14 }}>Your reel will appear here</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16 }}>
            {sessions.map(s => (
              <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {s.video_url
                  ? <video src={s.video_url} muted loop playsInline style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', display: 'block' }} onMouseEnter={e => (e.target as HTMLVideoElement).play()} onMouseLeave={e => (e.target as HTMLVideoElement).pause()} />
                  : <div style={{ aspectRatio: '9/16', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>{s.status === 'processing' ? '⏳' : s.status === 'failed' ? '❌' : '🎬'}</div>
                }
                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: s.status === 'completed' ? '#7FB897' : s.status === 'failed' ? '#EF4444' : '#F59E0B', fontWeight: 700, textTransform: 'capitalize' }}>{s.status}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>${Number(s.cost_aud ?? 0).toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{s.style} · {s.duration_seconds}s · {new Date(s.created_at).toLocaleDateString('en-AU')}</div>
                  {s.video_url && <a href={s.video_url} download style={{ display: 'block', marginTop: 8, padding: '6px 0', borderRadius: 8, background: 'rgba(127,184,151,0.1)', color: '#7FB897', textAlign: 'center', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>Download</a>}
                </div>
              </div>
            ))}
            {sessions.length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, gridColumn: '1/-1', textAlign: 'center', paddingTop: 60 }}>No reels generated yet</div>}
          </div>
        </div>
      )}

      {/* ── COST TAB ── */}
      {tab === 'cost' && (
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total reels', value: costStats?.total_reels ?? 0, unit: '' },
              { label: 'Completed', value: costStats?.completed_reels ?? 0, unit: '' },
              { label: 'Total spent', value: `$${Number(costStats?.total_cost_aud ?? 0).toFixed(2)}`, unit: 'AUD' },
              { label: 'This month', value: costStats?.reels_this_month ?? 0, unit: 'reels' },
              { label: 'Cost this month', value: `$${Number(costStats?.cost_this_month ?? 0).toFixed(2)}`, unit: 'AUD' },
              { label: 'Avg per reel', value: `$${Number(costStats?.avg_cost_per_reel ?? 0).toFixed(2)}`, unit: 'AUD' },
            ].map(m => (
              <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{m.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{m.value} <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>{m.unit}</span></div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Pricing reference</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <div>5s reel = $0.48 AUD<br/><span style={{ color: 'rgba(255,255,255,0.3)' }}>10 Higgsfield credits</span></div>
              <div>10s reel = $0.95 AUD<br/><span style={{ color: 'rgba(255,255,255,0.3)' }}>20 Higgsfield credits</span></div>
              <div>20s reel = $1.90 AUD<br/><span style={{ color: 'rgba(255,255,255,0.3)' }}>2 × 10s clips</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ── INFLUENCER PICKER OVERLAY ── */}
      {showPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', background: '#0f1117', borderRadius: '24px 24px 0 0', padding: '24px 24px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Choose Influencer</div>
              <button onClick={() => setShowPicker(false)} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {influencers.map(inf => (
                <div key={inf.id} onClick={() => { setSelectedInf(inf); setShowPicker(false) }} style={{ borderRadius: 14, overflow: 'hidden', cursor: 'pointer', border: '2px solid ' + (selectedInf?.id === inf.id ? '#7FB897' : 'rgba(255,255,255,0.07)') }}>
                  <div style={{ position: 'relative', aspectRatio: '3/4' }}>
                    <img src={inf.image_url} alt={inf.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {inf.soul_status === 'ready' && <div style={{ position: 'absolute', top: 8, left: 8, background: '#7FB897', color: '#0f1117', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 99 }}>SOUL ✓</div>}
                  </div>
                  <div style={{ padding: '10px 12px', background: '#111' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{inf.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{inf.description?.slice(0,50)}</div>
                    <button onClick={e => { e.stopPropagation(); setTrainingInf(inf); setShowPicker(false); setShowTraining(true) }} style={{ marginTop: 8, fontSize: 10, color: inf.soul_status === 'ready' ? '#7FB897' : '#F59E0B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                      {inf.soul_status === 'ready' ? '✓ Soul trained' : '+ Train Soul for consistent face'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SOUL TRAINING MODAL ── */}
      {showTraining && trainingInf && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#0f1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Train Soul — {trainingInf.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Upload 5–20 photos of this character for 100% face consistency</div>
              </div>
              <button onClick={() => { setShowTraining(false); setTrainImages([]); setTrainMsg('') }} style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#F59E0B' }}>
              ⚠ Requires Higgsfield Plus plan ($29/mo). Training takes ~10 minutes.
            </div>

            <input ref={trainInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => e.target.files && uploadTrainingImages(e.target.files)} />
            <button onClick={() => trainInputRef.current?.click()} disabled={trainUploading} style={{ width: '100%', padding: 14, borderRadius: 12, border: '1.5px dashed rgba(127,184,151,0.3)', background: 'transparent', cursor: 'pointer', color: trainImages.length >= 5 ? '#7FB897' : 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontSize: 13, marginBottom: 12 }}>
              {trainUploading ? 'Uploading…' : `📸 Upload photos (${trainImages.length}/20) — need at least 5`}
            </button>

            {trainImages.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {trainImages.map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)' }} />
                ))}
              </div>
            )}

            {trainMsg && <div style={{ fontSize: 12, color: trainMsg.startsWith('✅') ? '#7FB897' : trainMsg.startsWith('Error') ? '#EF4444' : 'rgba(255,255,255,0.6)', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', marginBottom: 16 }}>{trainMsg}</div>}

            <button onClick={submitSoulTraining} disabled={trainImages.length < 5 || trainSubmitting} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: trainImages.length < 5 || trainSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, background: trainImages.length >= 5 ? 'linear-gradient(135deg,#7FB897,#2D5240)' : 'rgba(255,255,255,0.08)', color: trainImages.length >= 5 ? '#fff' : 'rgba(255,255,255,0.3)' }}>
              {trainSubmitting ? 'Starting training…' : `Start Soul Training (${trainImages.length} photos)`}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

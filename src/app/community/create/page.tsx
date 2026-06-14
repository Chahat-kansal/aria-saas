'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, FONT, MAX_W } from '../theme'
import { supabase } from '@/lib/supabase'
import { isLikelyNSFW } from '@/lib/moderation/nsfw-check'

const BG = PALETTE.ink
const FG = PALETTE.surface
const ACC = PALETTE.accent

type PostType = 'photo' | 'reel' | 'story' | 'update'

const TYPE_CARDS: { id: PostType; emoji: string; label: string; desc: string }[] = [
  { id: 'photo',  emoji: '📸', label: 'Photo post',       desc: 'Share an image'          },
  { id: 'reel',   emoji: '🎬', label: 'Reel',             desc: 'Short video'             },
  { id: 'story',  emoji: '⚡', label: 'Story (24h)',      desc: 'Disappears in 24 hours'  },
  { id: 'update', emoji: '📢', label: 'Update / Offer',   desc: 'Text announcement'       },
]

const TAGS = ['#local', '#food', '#sale', '#new', '#event', '#weekend', '#business']

function Dots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 18 : 6, height: 6, borderRadius: 3,
          background: i === step ? ACC : 'rgba(255,255,255,0.3)',
          transition: 'width 200ms',
        }} />
      ))}
    </div>
  )
}

export default function CreatePost() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]           = useState(0)
  const [type, setType]           = useState<PostType>('photo')
  const [biz, setBiz]             = useState<{ id: string; name: string } | null>(null)
  const [preview, setPreview]     = useState<string | null>(null)
  const [isVideo, setIsVideo]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [uploading, setUploading] = useState(false)
  const [mediaUrl, setMediaUrl]   = useState('')
  const [thumbUrl, setThumbUrl]   = useState('')
  const [title, setTitle]         = useState('')
  const [body, setBody]           = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [toast, setToast]         = useState('')

  useEffect(() => {
    supabase.auth.getUser().then((res: { data: { user: { id: string } | null } }) => {
      const user = res.data?.user
      if (!user) { router.push('/dashboard'); return }
      supabase.from('businesses').select('id,name')
        .eq('user_id', user.id).eq('is_active', true).limit(1).single()
        .then((bizRes: { data: { id: string; name: string } | null }) => {
          if (bizRes.data) setBiz(bizRes.data)
        })
    })
  }, [router])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !biz) return
    const vid = f.type.startsWith('video/')
    // FA-2.5 (CDN): client-side NSFW gate for still images only (the model classifies images, not
    // video). Fails OPEN — isLikelyNSFW returns {flagged:false} on any CDN/model error, so it never
    // blocks uploads if the check can't load. Zero server call, zero logging.
    if (!vid && f.type.startsWith('image/')) {
      setUploading(true)
      const verdict = await isLikelyNSFW(f)
      setUploading(false)
      if (verdict.flagged) {
        showToast('This image looks inappropriate and can’t be posted.')
        e.target.value = ''
        return
      }
    }
    setIsVideo(vid)
    setPreview(URL.createObjectURL(f))
    setUploading(true)
    setProgress(0)
    const fd = new FormData()
    fd.append('file', f)
    fd.append('type', type === 'reel' || vid ? 'reel' : 'post')
    fd.append('business_id', biz.id)
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', ev => {
      if (ev.lengthComputable) setProgress(Math.round(ev.loaded / ev.total * 100))
    })
    xhr.onload = () => {
      setUploading(false)
      if (xhr.status === 200) {
        const r = JSON.parse(xhr.responseText) as { url?: string; thumbnail_url?: string }
        setMediaUrl(r.url ?? '')
        setThumbUrl(r.thumbnail_url ?? '')
        setStep(2)
      } else {
        showToast('Upload failed — try again')
      }
    }
    xhr.onerror = () => { setUploading(false); showToast('Upload error') }
    xhr.open('POST', '/api/community/upload-media')
    xhr.send(fd)
  }

  function appendTag(tag: string) {
    if (body.includes(tag)) return
    setBody(b => b + (b === '' || b.endsWith(' ') ? '' : ' ') + tag + ' ')
  }

  async function publish() {
    if (!biz || !body.trim()) { showToast('Body text required'); return }
    setPublishing(true)
    const apiType = type === 'photo' ? 'update' : type
    const res = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: biz.id,
        post_type: apiType,
        title: title || undefined,
        body: body.trim(),
        media_url: mediaUrl || undefined,
        thumbnail_url: thumbUrl || undefined,
        is_story: type === 'story',
        scheduled_for: schedDate || undefined,
      }),
    })
    setPublishing(false)
    if (res.ok) {
      showToast('Posted!')
      setTimeout(() => router.push('/community'), 800)
    } else {
      const d = await res.json() as { error?: string }
      showToast(d.error ?? 'Publish failed')
    }
  }

  function back() {
    if (step === 0) router.back()
    else if (step === 1) setStep(0)
    else if (step === 2) setStep(type === 'update' ? 0 : 1)
    else setStep(2)
  }

  const totalSteps = type === 'update' ? 3 : 4
  const dotStep = type === 'update'
    ? (step === 0 ? 0 : step === 2 ? 1 : 2)
    : step

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 8px', flexShrink: 0 }}>
      <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, marginLeft: -8, color: FG, display: 'flex', alignItems: 'center' }}>
        <ArrowLeft size={22} color={FG} />
      </button>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <Dots step={dotStep} total={totalSteps} />
      </div>
      <div style={{ width: 38 }} />
    </div>
  )

  const PAGE: React.CSSProperties = {
    minHeight: '100dvh', background: BG, color: FG, fontFamily: FONT,
    display: 'flex', flexDirection: 'column',
    maxWidth: MAX_W, margin: '0 auto',
    paddingBottom: 'env(safe-area-inset-bottom)',
  }

  // ── Step 0 — type picker ─────────────────────────────────────────────
  if (step === 0) return (
    <div style={PAGE}>
      {header}
      <div style={{ flex: 1, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: FG }}>What are you sharing?</h2>
        {TYPE_CARDS.map(t => (
          <button key={t.id}
            onClick={() => { setType(t.id); setStep(t.id === 'update' ? 2 : 1) }}
            style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: RADIUS.lg, background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.12)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <span style={{ fontSize: 28 }}>{t.emoji}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: FG }}>{t.label}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{t.desc}</div>
            </div>
          </button>
        ))}
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  )

  // ── Step 1 — media picker ────────────────────────────────────────────
  if (step === 1) return (
    <div style={PAGE}>
      {header}
      <input ref={fileRef} type="file"
        accept={type === 'reel' ? 'video/mp4,video/mov,video/webm,video/*' : 'image/*'}
        capture="environment" style={{ display: 'none' }} onChange={handleFilePick} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 20 }}>
        {preview ? (
          <div style={{ width: '100%', maxWidth: 340, borderRadius: RADIUS.xl, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.15)', position: 'relative' }}>
            {isVideo
              ? <video src={preview} autoPlay muted loop playsInline style={{ width: '100%', display: 'block', maxHeight: 420, objectFit: 'cover' }} />
              : <img src={preview} alt="preview" style={{ width: '100%', display: 'block', maxHeight: 420, objectFit: 'cover' }} />}
            {uploading && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.2)' }}>
                  <div style={{ height: '100%', width: progress + '%', background: ACC, transition: 'width 100ms' }} />
                </div>
                <div style={{ textAlign: 'center', padding: '6px 0', fontSize: 12, color: FG, background: 'rgba(0,0,0,0.6)' }}>
                  Uploading {progress}%
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            style={{ width: '100%', maxWidth: 340, aspectRatio: '4/3', borderRadius: RADIUS.xl, border: '2px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: FG }}>
            <span style={{ fontSize: 44 }}>{type === 'reel' ? '🎬' : '📸'}</span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Tap to pick {type === 'reel' ? 'video' : 'photo'}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>opens camera roll</div>
          </button>
        )}
        {preview && !uploading && (
          <button onClick={() => fileRef.current?.click()}
            style={{ padding: '10px 24px', borderRadius: RADIUS.pill, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.2)', color: FG, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
            Change {type === 'reel' ? 'video' : 'photo'}
          </button>
        )}
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  )

  // ── Step 2 — caption + details ───────────────────────────────────────
  if (step === 2) return (
    <div style={PAGE}>
      {header}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: FG }}>Add details</h2>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
          style={{ width: '100%', padding: '14px 16px', borderRadius: RADIUS.md, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: FG, fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ position: 'relative' }}>
          <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 500))}
            placeholder="Write something..." rows={5}
            style={{ width: '100%', padding: '14px 16px', borderRadius: RADIUS.md, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: FG, fontSize: 15, outline: 'none', resize: 'none', whiteSpace: 'pre-wrap', boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', bottom: 10, right: 14, fontSize: 11, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>{body.length}/500</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TAGS.map(tag => (
            <button key={tag} onClick={() => appendTag(tag)}
              style={{ padding: '6px 12px', borderRadius: RADIUS.pill, background: body.includes(tag) ? ACC : 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: body.includes(tag) ? PALETTE.ink : FG, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {tag}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Schedule (optional)</label>
        <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: RADIUS.md, background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)', color: FG, fontSize: 14, outline: 'none' }} />
        <button onClick={() => setStep(3)} disabled={!body.trim()}
          style={{ padding: '16px', borderRadius: RADIUS.pill, background: body.trim() ? ACC : 'rgba(255,255,255,0.12)', color: body.trim() ? PALETTE.ink : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 16, border: 'none', cursor: body.trim() ? 'pointer' : 'default', marginTop: 4 }}>
          Preview →
        </button>
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  )

  // ── Step 3 — preview + publish ───────────────────────────────────────
  return (
    <div style={PAGE}>
      {header}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: FG }}>Preview</h2>
        <div style={{ borderRadius: RADIUS.lg, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.12)', background: PALETTE.surface }}>
          <div style={{ padding: '14px 16px 10px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: PALETTE.ink, fontSize: 14, flexShrink: 0 }}>
              {biz?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: PALETTE.ink }}>{biz?.name ?? 'Your Business'}</div>
              <div style={{ fontSize: 11, color: PALETTE.inkSoft, textTransform: 'capitalize' }}>{type === 'story' ? 'Story · 24h' : type}</div>
            </div>
          </div>
          {preview && (
            isVideo
              ? <video src={preview} controls muted playsInline style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block' }} />
              : <img src={preview} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block' }} />
          )}
          <div style={{ padding: '12px 16px 16px' }}>
            {title && <div style={{ fontWeight: 700, fontSize: 15, color: PALETTE.ink, marginBottom: 6 }}>{title}</div>}
            <div style={{ fontSize: 14, color: PALETTE.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{body}</div>
            {schedDate && <div style={{ marginTop: 8, fontSize: 11, color: PALETTE.inkSoft }}>Scheduled: {new Date(schedDate).toLocaleString('en-AU')}</div>}
          </div>
        </div>
        <button onClick={publish} disabled={publishing}
          style={{ padding: '17px', borderRadius: RADIUS.pill, background: publishing ? 'rgba(255,255,255,0.12)' : ACC, color: publishing ? 'rgba(255,255,255,0.4)' : PALETTE.ink, fontWeight: 800, fontSize: 17, border: 'none', cursor: publishing ? 'default' : 'pointer' }}>
          {publishing ? 'Publishing...' : (schedDate ? 'Schedule Post' : 'Publish Now')}
        </button>
      </div>
      {toast && <Toast msg={toast} />}
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: PALETTE.surface, color: PALETTE.ink, padding: '10px 20px', borderRadius: RADIUS.pill, border: BORDER, fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 200 }}>
      {msg}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface StudioAsset {
  id: string; name: string | null; prompt: string | null; enhanced_prompt: string | null
  style: string; format: string; provider: string | null; image_url: string
  folder: string; tags: string[]; favourite: boolean; status: string; created_at: string
}

/* ─── constants ─────────────────────────────────────────────────── */
const MODELS = [
  { id: 'fast',  label: 'Nano Banana 2',  sub: 'Fast · High efficiency', badge: '2', pro: false, desc: 'Best for rapid iteration and high-volume generation. Optimised for speed.' },
  { id: 'pro',   label: 'Nano Banana Pro', sub: 'Thinking · Best quality', badge: 'Pro', pro: true, desc: 'Advanced reasoning model. Follows complex instructions and renders high-fidelity text.' },
]

const RATIOS = [
  { id: 'square',    label: '1:1',  hint: 'Instagram',  w: 1, h: 1 },
  { id: 'portrait',  label: '9:16', hint: 'Story',      w: 9, h: 16 },
  { id: 'landscape', label: '16:9', hint: 'Banner',     w: 16, h: 9 },
  { id: '4:3',       label: '4:3',  hint: 'Presentation', w: 4, h: 3 },
  { id: '3:4',       label: '3:4',  hint: 'Portrait',   w: 3, h: 4 },
]

const STYLES = [
  { id: 'photorealistic', label: 'Photorealistic', emoji: '📷' },
  { id: 'illustration',   label: 'Illustration',   emoji: '🎨' },
  { id: 'minimalist',     label: 'Minimalist',     emoji: '◻' },
  { id: 'bold',           label: 'Bold',           emoji: '⚡' },
  { id: 'vintage',        label: 'Vintage',        emoji: '🎞' },
  { id: 'neon',           label: 'Neon',           emoji: '💜' },
]

const TEMPLATES = [
  { label: 'Weekend Special',  prompt: 'Weekend special promotion with warm festive atmosphere, golden lighting, inviting mood, Australian summer' },
  { label: 'New Arrival',      prompt: 'New product launch announcement, clean studio lighting, exciting product reveal on dark background' },
  { label: 'Happy Hour',       prompt: 'Happy hour drinks promotion, vibrant atmosphere, premium cocktails, warm ambient bar lighting' },
  { label: 'Seasonal Sale',    prompt: 'Seasonal sale event, colourful festive decorations, shopping excitement, bright energetic mood' },
  { label: 'Loyalty Reward',   prompt: 'Customer loyalty appreciation, gold stars, premium feel, warm personalised thank you message' },
  { label: 'Grand Opening',    prompt: 'Grand opening celebration, ribbon cutting, balloons, community excitement, bright welcoming' },
  { label: 'Product Hero',     prompt: 'Hero product showcase, professional studio lighting, white background, premium commercial photography' },
  { label: 'Local Business',   prompt: 'Local Australian small business community promotion, authentic warm colours, neighbourhood feel' },
]

const HOW_STEPS = [
  { n: '01', title: 'Choose your model', body: 'Select Nano Banana 2 for speed or Nano Banana Pro for professional-grade quality with advanced reasoning.' },
  { n: '02', title: 'Describe your image', body: 'Write a prompt or pick a template. Hit \u2726\u00a0Aria refine and watch it transform your idea into a detailed generation prompt.' },
  { n: '03', title: 'Set format & style', body: 'Pick the aspect ratio that fits your channel \u2014 Instagram square, Story portrait, or Facebook banner \u2014 and choose a visual style.' },
  { n: '04', title: 'Generate & download', body: 'Click Generate. In 15\u201360 seconds your marketing image is ready to download, favourite, or use as a template.' },
]

const FOLDERS = ['generated', 'uploads', 'banners', 'social', 'promotions', 'products', 'events']

/* ─── CSS injected once ─────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

.aria-studio * { box-sizing: border-box; }
.aria-studio { font-family: 'DM Sans', sans-serif; background: #000; color: #f0ede8; min-height: 100vh; }

/* grain overlay */
.aria-studio::before {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  background-size: 200px;
}

/* ambient glow top-right */
.aria-studio .glow-orb {
  position: fixed; top: -200px; right: -200px;
  width: 600px; height: 600px; border-radius: 50%;
  background: radial-gradient(ellipse, rgba(127,184,151,0.07) 0%, transparent 70%);
  pointer-events: none; z-index: 0;
}

@keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
@keyframes shimmer { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse-ring { 0% { transform:scale(1); opacity:0.6; } 100% { transform:scale(1.6); opacity:0; } }
@keyframes slide-in { from { opacity:0; transform:translateX(20px); } to { opacity:1; transform:translateX(0); } }
@keyframes progress { from { width:0; } to { width:100%; } }

.fade-up-1 { animation: fadeUp 0.6s ease both; }
.fade-up-2 { animation: fadeUp 0.6s 0.1s ease both; }
.fade-up-3 { animation: fadeUp 0.6s 0.2s ease both; }

.as-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 24px; border-radius: 100px; font-family: 'DM Sans', sans-serif;
  font-size: 14px; font-weight: 500; cursor: pointer; border: none;
  transition: all 0.2s;
}
.as-btn-primary { background: #f0ede8; color: #000; }
.as-btn-primary:hover { background: #fff; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(240,237,232,0.2); }
.as-btn-ghost { background: rgba(255,255,255,0.06); color: #f0ede8; border: 1px solid rgba(255,255,255,0.1); }
.as-btn-ghost:hover { background: rgba(255,255,255,0.1); }
.as-btn-green { background: #2D5240; color: #7FB897; border: 1px solid rgba(127,184,151,0.3); }
.as-btn-green:hover { background: #3a6b52; }
.as-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }

.as-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px; transition: border-color 0.2s;
}
.as-card:hover { border-color: rgba(255,255,255,0.14); }
.as-card.active { border-color: rgba(127,184,151,0.5); background: rgba(127,184,151,0.06); }

.as-input {
  width: 100%; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
  color: #f0ede8; font-family: 'DM Sans', sans-serif; font-size: 14px;
  padding: 12px 16px; outline: none; resize: vertical;
  transition: border-color 0.2s;
}
.as-input:focus { border-color: rgba(127,184,151,0.4); }
.as-input::placeholder { color: rgba(240,237,232,0.25); }

.as-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(240,237,232,0.35); margin: 0 0 10px; }

.ratio-btn {
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); transition: all 0.2s; position: relative; overflow: hidden;
}
.ratio-btn.active { border-color: rgba(127,184,151,0.5); background: rgba(127,184,151,0.06); }
.ratio-btn:hover { border-color: rgba(255,255,255,0.2); }

.ratio-vis { background: rgba(255,255,255,0.15); border-radius: 3px; border: 1px solid rgba(255,255,255,0.3); }
.ratio-btn.active .ratio-vis { background: rgba(127,184,151,0.4); border-color: rgba(127,184,151,0.6); }

.style-chip {
  padding: 8px 14px; border-radius: 100px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: rgba(240,237,232,0.6);
  transition: all 0.2s; white-space: nowrap;
}
.style-chip.active { border-color: rgba(127,184,151,0.5); background: rgba(127,184,151,0.1); color: #7FB897; }
.style-chip:hover { border-color: rgba(255,255,255,0.2); color: #f0ede8; }

.tmpl-chip {
  padding: 7px 14px; border-radius: 100px; font-size: 12px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08); background: transparent;
  color: rgba(240,237,232,0.5); transition: all 0.2s; white-space: nowrap; font-family: 'DM Sans', sans-serif;
}
.tmpl-chip:hover { border-color: rgba(255,255,255,0.2); color: #f0ede8; background: rgba(255,255,255,0.04); }
.tmpl-chip.active { border-color: rgba(127,184,151,0.4); background: rgba(127,184,151,0.08); color: #7FB897; }

.model-card {
  padding: 16px; border-radius: 14px; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03);
  transition: all 0.2s; position: relative;
}
.model-card.active { border-color: rgba(127,184,151,0.5); background: rgba(127,184,151,0.06); }
.model-card:hover { border-color: rgba(255,255,255,0.16); }

.img-grid-item {
  border-radius: 12px; overflow: hidden; position: relative;
  cursor: pointer; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07); transition: all 0.2s;
}
.img-grid-item:hover { border-color: rgba(255,255,255,0.18); transform: translateY(-2px); }
.img-grid-item.selected { border-color: rgba(127,184,151,0.5); }
.img-grid-item .overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%); opacity: 0; transition: opacity 0.2s; }
.img-grid-item:hover .overlay { opacity: 1; }

.drop-zone {
  border: 2px dashed rgba(255,255,255,0.15); border-radius: 16px;
  transition: all 0.2s; cursor: pointer;
}
.drop-zone.drag-over { border-color: rgba(127,184,151,0.5); background: rgba(127,184,151,0.04); }
.drop-zone:hover { border-color: rgba(255,255,255,0.25); }

.gen-progress-bar {
  height: 2px; background: rgba(127,184,151,0.2); border-radius: 1px; overflow: hidden; margin-top: 12px;
}
.gen-progress-fill { height: 100%; background: #7FB897; border-radius: 1px; animation: progress 45s linear forwards; }

.tab-btn { padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: transparent; color: rgba(240,237,232,0.4); border-bottom: 2px solid transparent; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
.tab-btn.active { color: #f0ede8; border-bottom-color: #7FB897; }
.tab-btn:hover { color: rgba(240,237,232,0.8); }

.how-step { padding: 28px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.how-step:last-child { border-bottom: none; }
.how-num { font-family: 'DM Serif Display', serif; font-size: 48px; color: rgba(127,184,151,0.2); line-height: 1; }

.fav-btn { position: absolute; top: 8px; right: 8px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: rgba(255,255,255,0.6); }
.fav-btn:hover { background: rgba(0,0,0,0.85); color: #f0ede8; }
.fav-btn.active { color: #F59E0B; }

.detail-panel { width: 320px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.07); background: rgba(0,0,0,0.4); overflow-y: auto; animation: slide-in 0.25s ease; }

scrollbar-width: thin;
.as-scroll::-webkit-scrollbar { width: 4px; }
.as-scroll::-webkit-scrollbar-track { background: transparent; }
.as-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
`

export default function AriaStudioPage() {
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  // Generator state
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('fast')
  const [ratio, setRatio] = useState('square')
  const [style, setStyle] = useState('photorealistic')
  const [selectedTemplate, setSelectedTemplate] = useState('')

  // UI state
  const [activeTab, setActiveTab] = useState<'console' | 'library' | 'how'>('console')
  const [filterFolder, setFilterFolder] = useState<string | null>(null)
  const [filterFav, setFilterFav] = useState(false)
  const [selected, setSelected] = useState<StudioAsset | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [lastGenerated, setLastGenerated] = useState<StudioAsset | null>(null)
  const [genKey, setGenKey] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cssInjected = useRef(false)

  // Inject CSS once
  useEffect(() => {
    if (cssInjected.current) return
    cssInjected.current = true
    const el = document.createElement('style')
    el.textContent = CSS
    document.head.appendChild(el)
    return () => { document.head.removeChild(el) }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/aria/studio?limit=80').then(r => r.json()) as { assets?: StudioAsset[] }
      setAssets(d.assets ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const refinePrompt = async () => {
    if (!prompt.trim()) return
    setRefining(true)
    try {
      const d = await fetch('/api/aria/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refine_prompt', prompt }) }).then(r => r.json()) as { refined_prompt?: string }
      if (d.refined_prompt) setPrompt(d.refined_prompt)
    } finally { setRefining(false) }
  }

  const generate = async () => {
    if (!prompt.trim()) { showToast('Enter a prompt first', false); return }
    setGenerating(true); setGenKey(k => k + 1)
    try {
      const d = await fetch('/api/aria/studio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style, format: ratio, prefer_pro: model === 'pro', folder: 'generated', tags: [] }),
      }).then(r => r.json()) as { asset?: StudioAsset; provider?: string; error?: string }
      if (d.error) { showToast(d.error, false); return }
      if (d.asset) {
        setLastGenerated(d.asset)
        setAssets(prev => [d.asset!, ...prev])
        showToast('Generated via ' + (d.provider ?? 'AI'))
        setActiveTab('console')
      }
    } catch { showToast('Generation failed', false) } finally { setGenerating(false) }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) await uploadFile(file)
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'uploads')
      const d = await fetch('/api/aria/studio/upload', { method: 'POST', body: fd }).then(r => r.json()) as { asset?: StudioAsset; error?: string }
      if (d.error) { showToast(d.error, false); return }
      if (d.asset) { setAssets(prev => [d.asset!, ...prev]); showToast('Uploaded!') }
    } finally { setUploading(false) }
  }

  const toggleFav = async (asset: StudioAsset, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await fetch('/api/aria/studio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: asset.id, favourite: !asset.favourite }) })
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, favourite: !a.favourite } : a))
    if (selected?.id === asset.id) setSelected(prev => prev ? { ...prev, favourite: !prev.favourite } : null)
  }

  const deleteAsset = async (id: string) => {
    await fetch('/api/aria/studio?id=' + id, { method: 'DELETE' })
    setAssets(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
    showToast('Deleted')
  }

  const filteredAssets = assets.filter(a => {
    if (filterFav && !a.favourite) return false
    if (filterFolder && a.folder !== filterFolder) return false
    return true
  })

  const ratioStyle = (r: typeof RATIOS[0]) => {
    const maxW = 28, maxH = 28
    const scale = Math.min(maxW / r.w, maxH / r.h)
    return { width: r.w * scale, height: r.h * scale }
  }

  return (
    <div className="aria-studio" style={{ position: 'relative', zIndex: 1 }}>
      <div className="glow-orb" />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '12px 20px', borderRadius: 12, background: toast.ok ? 'rgba(45,82,64,0.95)' : 'rgba(80,20,20,0.95)', border: '1px solid ' + (toast.ok ? 'rgba(127,184,151,0.4)' : 'rgba(239,68,68,0.3)'), color: toast.ok ? '#7FB897' : '#fca5a5', fontSize: 13, fontWeight: 500, backdropFilter: 'blur(12px)', animation: 'slide-in 0.2s ease', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          {toast.ok ? '✓ ' : '✗ '}{toast.msg}
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '48px 40px 40px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative grid lines */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: 720 }}>
          {/* Badge */}
          <div className="fade-up-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 100, border: '1px solid rgba(127,184,151,0.25)', background: 'rgba(127,184,151,0.06)', marginBottom: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7FB897', animation: 'shimmer 2s infinite', display: 'inline-block' }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7FB897' }}>Gemini Nano Banana · Powered</span>
          </div>

          <h1 className="fade-up-2" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, fontWeight: 400, lineHeight: 1.1, margin: '0 0 16px', color: '#f0ede8', letterSpacing: '-0.02em' }}>
            AI Image Studio<br />
            <em style={{ color: 'rgba(240,237,232,0.45)', fontStyle: 'italic' }}>for your business</em>
          </h1>

          <p className="fade-up-3" style={{ fontSize: 15, color: 'rgba(240,237,232,0.45)', lineHeight: 1.7, margin: '0 0 28px', maxWidth: 520 }}>
            Generate promo banners, posters and marketing images with Gemini Nano Banana \u2014 the same model powering the world\u2019s best AI image tools. Describe your vision, generate in seconds.
          </p>

          <div className="fade-up-3" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="as-btn as-btn-primary" onClick={() => setActiveTab('console')}>
              <span style={{ fontSize: 13 }}>\u2728</span> Start creating
            </button>
            <button className="as-btn as-btn-ghost" onClick={() => setActiveTab('how')}>
              How it works
            </button>
            <button className="as-btn as-btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <span>\u2191</span> {uploading ? 'Uploading\u2026' : 'Upload image'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{ marginTop: 40, display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          {[['Nano Banana 2', 'Fast model · low latency'], ['Nano Banana Pro', 'Best quality · complex prompts'], ['4 Providers', 'Stability, DALL\u00b73, FLUX fallback'], [assets.length + ' Images', 'In your library']].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f0ede8', marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.35)' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', paddingLeft: 40, display: 'flex', gap: 4 }}>
        <button className={'tab-btn' + (activeTab === 'console' ? ' active' : '')} onClick={() => setActiveTab('console')}>\u2728 Generate</button>
        <button className={'tab-btn' + (activeTab === 'library' ? ' active' : '')} onClick={() => setActiveTab('library')}>\uD83D\uDDBC Library {assets.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>{assets.length}</span>}</button>
        <button className={'tab-btn' + (activeTab === 'how' ? ' active' : '')} onClick={() => setActiveTab('how')}>How it works</button>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      {activeTab === 'how' && (
        <div style={{ maxWidth: 680, padding: '60px 40px', margin: '0 auto' }}>
          <div style={{ marginBottom: 48 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', marginBottom: 12 }}>HOW IT WORKS</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, fontWeight: 400, margin: 0, color: '#f0ede8', lineHeight: 1.2 }}>Four steps to a professional<br /><em style={{ color: 'rgba(240,237,232,0.4)' }}>marketing image</em></h2>
          </div>

          {HOW_STEPS.map((s, i) => (
            <div key={s.n} className="how-step" style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 24, animation: 'fadeUp 0.6s ' + (i * 0.1) + 's ease both' }}>
              <div>
                <div className="how-num">{s.n}</div>
              </div>
              <div style={{ paddingTop: 8 }}>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, margin: '0 0 10px', color: '#f0ede8' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(240,237,232,0.45)', lineHeight: 1.7, margin: 0 }}>{s.body}</p>
              </div>
            </div>
          ))}

          {/* Model comparison */}
          <div style={{ marginTop: 60 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', marginBottom: 20 }}>MODEL COMPARISON</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Model', 'Speed', 'Quality', 'Best for'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 0', color: 'rgba(240,237,232,0.4)', fontWeight: 500, paddingRight: 24 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: '#f0ede8', fontWeight: 500 }}>Nano Banana 2</td>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: '#7FB897' }}>Fast</td>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: 'rgba(240,237,232,0.5)' }}>High</td>
                  <td style={{ padding: '14px 0', color: 'rgba(240,237,232,0.5)' }}>Daily social posts, rapid iteration</td>
                </tr>
                <tr>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: '#f0ede8', fontWeight: 500 }}>Nano Banana Pro</td>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: '#F59E0B' }}>Slower</td>
                  <td style={{ padding: '14px 0', paddingRight: 24, color: '#7FB897' }}>Best</td>
                  <td style={{ padding: '14px 0', color: 'rgba(240,237,232,0.5)' }}>Hero banners, text rendering, complex scenes</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 40, textAlign: 'center' }}>
            <button className="as-btn as-btn-primary" onClick={() => setActiveTab('console')} style={{ fontSize: 15 }}>
              \u2728 Start generating
            </button>
          </div>
        </div>
      )}

      {/* ── CONSOLE (GENERATE) ───────────────────────────────────── */}
      {activeTab === 'console' && (
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', minHeight: 'calc(100vh - 230px)' }}>
          {/* ── Left panel ── */}
          <div className="as-scroll" style={{ borderRight: '1px solid rgba(255,255,255,0.07)', padding: '28px 24px', overflowY: 'auto' }}>

            {/* Model selector */}
            <p className="as-label">AI Model</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {MODELS.map(m => (
                <div key={m.id} className={'model-card' + (model === m.id ? ' active' : '')} onClick={() => setModel(m.id)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: model === m.id ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                      \uD83C\uDF4C
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: model === m.id ? '#f0ede8' : 'rgba(240,237,232,0.7)' }}>{m.label}</span>
                        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 6, background: m.pro ? 'rgba(245,158,11,0.15)' : 'rgba(127,184,151,0.15)', color: m.pro ? '#F59E0B' : '#7FB897', fontWeight: 700, letterSpacing: '0.05em' }}>{m.badge}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(240,237,232,0.35)' }}>{m.sub}</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid ' + (model === m.id ? '#7FB897' : 'rgba(255,255,255,0.2)'), background: model === m.id ? '#7FB897' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {model === m.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#000' }} />}
                    </div>
                  </div>
                  {model === m.id && <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.4)', margin: '10px 0 0', lineHeight: 1.5 }}>{m.desc}</p>}
                </div>
              ))}
            </div>

            {/* Templates */}
            <p className="as-label">Quick templates</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
              {TEMPLATES.map(t => (
                <button key={t.label} className={'tmpl-chip' + (selectedTemplate === t.label ? ' active' : '')}
                  onClick={() => { setPrompt(t.prompt); setSelectedTemplate(t.label) }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Prompt */}
            <p className="as-label">Prompt</p>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <textarea className="as-input" rows={5} value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Weekend BBQ special with sizzling prawns, golden sunset light, Australian summer vibes, premium menu feel..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <span style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)' }}>{prompt.length}/5000</span>
              <button onClick={refinePrompt} disabled={refining || !prompt.trim()}
                style={{ fontSize: 11, padding: '5px 12px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', opacity: refining || !prompt.trim() ? 0.4 : 1, transition: 'all 0.2s' }}>
                {refining ? '\u23F3 Refining\u2026' : '\u2726 Aria refine'}
              </button>
            </div>

            {/* Aspect ratio */}
            <p className="as-label">Aspect ratio</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {RATIOS.map(r => {
                const vs = ratioStyle(r)
                return (
                  <div key={r.id} className={'ratio-btn' + (ratio === r.id ? ' active' : '')}
                    onClick={() => setRatio(r.id)}
                    style={{ padding: '10px 14px', flexDirection: 'column', gap: 8, minWidth: 64 }}>
                    <div className="ratio-vis" style={vs} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: ratio === r.id ? '#7FB897' : 'rgba(240,237,232,0.7)' }}>{r.label}</div>
                      <div style={{ fontSize: 9, color: 'rgba(240,237,232,0.3)', marginTop: 1 }}>{r.hint}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Style */}
            <p className="as-label">Visual style</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
              {STYLES.map(s => (
                <button key={s.id} className={'style-chip' + (style === s.id ? ' active' : '')} onClick={() => setStyle(s.id)}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>

            {/* Drop zone for image-to-image */}
            <p className="as-label">Image reference <span style={{ textTransform: 'none', letterSpacing: 0, color: 'rgba(240,237,232,0.2)', fontWeight: 400 }}>(optional, upload a photo to guide style)</span></p>
            <div className={'drop-zone' + (isDragOver ? ' drag-over' : '')}
              style={{ padding: '20px', textAlign: 'center', marginBottom: 24 }}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>{uploading ? '\u23F3' : '\u2191'}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,237,232,0.35)' }}>{uploading ? 'Uploading\u2026' : 'Click or drag & drop · PNG, JPG, WEBP'}</div>
            </div>

            {/* Generate button */}
            <button onClick={generate} disabled={generating || !prompt.trim()}
              className="as-btn as-btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '15px 24px', borderRadius: 14 }}>
              {generating ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  Generating\u2026
                </>
              ) : <>\u2728 Generate Image</>}
            </button>

            {generating && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(240,237,232,0.4)', marginBottom: 6 }}>
                  <span>Processing your request</span>
                  <span>~30\u201360s</span>
                </div>
                <div className="gen-progress-bar" key={genKey}>
                  <div className="gen-progress-fill" />
                </div>
                <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.3)', marginTop: 8, lineHeight: 1.5 }}>
                  Gemini Nano Banana is generating your image. Please keep this tab open.
                </p>
              </div>
            )}
          </div>

          {/* ── Right panel: preview + recent ── */}
          <div className="as-scroll" style={{ overflowY: 'auto' }}>
            {/* Latest generation */}
            {lastGenerated ? (
              <div style={{ padding: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', margin: 0 }}>Latest generation</p>
                    <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.25)', margin: '4px 0 0' }}>{lastGenerated.provider} \u00b7 {lastGenerated.style} \u00b7 {lastGenerated.format}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleFav(lastGenerated)}
                      style={{ padding: '7px 14px', borderRadius: 100, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: lastGenerated.favourite ? '#F59E0B' : 'rgba(240,237,232,0.5)', transition: 'all 0.2s' }}>
                      {lastGenerated.favourite ? '\u2605 Saved' : '\u2606 Save'}
                    </button>
                    <a href={lastGenerated.image_url} download target="_blank" rel="noreferrer" className="as-btn as-btn-green" style={{ padding: '7px 16px', borderRadius: 100, fontSize: 12, textDecoration: 'none' }}>
                      \u2913 Download
                    </a>
                  </div>
                </div>

                {/* Image */}
                <div style={{ borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
                  <img src={lastGenerated.image_url} alt={lastGenerated.prompt ?? ''} style={{ width: '100%', display: 'block', aspectRatio: lastGenerated.format === 'landscape' ? '16/9' : lastGenerated.format === 'portrait' ? '4/5' : '1', objectFit: 'cover', maxHeight: 520 }} />
                </div>

                {/* Prompt used */}
                <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.25)', margin: '0 0 6px' }}>Prompt used</p>
                  <p style={{ fontSize: 12, color: 'rgba(240,237,232,0.45)', margin: 0, lineHeight: 1.6 }}>{lastGenerated.enhanced_prompt ?? lastGenerated.prompt}</p>
                </div>

                {/* Use as template */}
                <button onClick={() => { setPrompt(lastGenerated.prompt ?? ''); setStyle(lastGenerated.style); setRatio(lastGenerated.format) }}
                  style={{ marginTop: 10, fontSize: 12, padding: '8px 16px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(240,237,232,0.4)', transition: 'all 0.2s' }}>
                  \u21BA Regenerate with changes
                </button>
              </div>
            ) : (
              /* Empty state */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, padding: 40, textAlign: 'center' }}>
                <div style={{ width: 80, height: 80, borderRadius: 24, background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 20 }}>
                  \uD83C\uDF4C
                </div>
                <h3 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, margin: '0 0 10px', color: '#f0ede8' }}>Ready to create</h3>
                <p style={{ fontSize: 13, color: 'rgba(240,237,232,0.35)', margin: '0 0 24px', lineHeight: 1.6, maxWidth: 340 }}>
                  Pick a template, write a prompt, choose your model and hit Generate. Your image will appear here.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {TEMPLATES.slice(0, 3).map(t => (
                    <button key={t.label} onClick={() => { setPrompt(t.prompt); setSelectedTemplate(t.label) }}
                      style={{ padding: '8px 16px', borderRadius: 100, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(240,237,232,0.5)', transition: 'all 0.2s' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recent strip */}
            {assets.length > 0 && (
              <div style={{ padding: '0 28px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,237,232,0.3)', margin: 0 }}>Recent</p>
                  <button onClick={() => setActiveTab('library')} style={{ fontSize: 11, color: '#7FB897', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>View all \u2192</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {assets.slice(0, 10).map(a => (
                    <div key={a.id} className="img-grid-item" onClick={() => { setActiveTab('library'); setSelected(a) }} style={{ aspectRatio: '1' }}>
                      <img src={a.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LIBRARY ──────────────────────────────────────────────── */}
      {activeTab === 'library' && (
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 230px)' }}>
          {/* Sidebar */}
          <div style={{ width: 200, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '20px 12px', flexShrink: 0 }}>
            <p className="as-label" style={{ padding: '0 8px' }}>Filter</p>
            {[
              { label: 'All images', active: !filterFolder && !filterFav, onClick: () => { setFilterFolder(null); setFilterFav(false) } },
              { label: '\u2605 Favourites', active: filterFav, onClick: () => { setFilterFav(true); setFilterFolder(null) } },
            ].map(btn => (
              <button key={btn.label} onClick={btn.onClick}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: btn.active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: btn.active ? 'rgba(127,184,151,0.1)' : 'transparent', color: btn.active ? '#7FB897' : 'rgba(240,237,232,0.4)', textAlign: 'left', marginBottom: 2, transition: 'all 0.2s' }}>
                {btn.label}
              </button>
            ))}

            <p className="as-label" style={{ padding: '12px 8px 6px' }}>Folders</p>
            {FOLDERS.map(f => {
              const count = assets.filter(a => a.folder === f).length
              if (!count) return null
              const isActive = filterFolder === f
              return (
                <button key={f} onClick={() => { setFilterFolder(f); setFilterFav(false) }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: isActive ? 'rgba(127,184,151,0.1)' : 'transparent', color: isActive ? '#7FB897' : 'rgba(240,237,232,0.4)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', marginBottom: 2, transition: 'all 0.2s' }}>
                  <span>{f}</span>
                  <span style={{ fontSize: 10, color: 'rgba(240,237,232,0.25)' }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Grid */}
          <div className="as-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,237,232,0.3)', fontSize: 13 }}>Loading\u2026</div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>\uD83D\uDDBC</div>
                <p style={{ fontSize: 15, margin: '0 0 8px', color: 'rgba(240,237,232,0.5)' }}>No images yet</p>
                <button onClick={() => setActiveTab('console')} className="as-btn as-btn-primary" style={{ marginTop: 16 }}>\u2728 Start generating</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {filteredAssets.map(a => (
                  <div key={a.id} className={'img-grid-item' + (selected?.id === a.id ? ' selected' : '')} onClick={() => setSelected(a)}>
                    <div className="overlay" />
                    <img src={a.image_url} alt={a.prompt ?? ''} style={{ width: '100%', aspectRatio: a.format === 'landscape' ? '16/9' : a.format === 'portrait' ? '4/5' : '1', objectFit: 'cover', display: 'block' }} />
                    <button className={'fav-btn' + (a.favourite ? ' active' : '')} onClick={e => toggleFav(a, e)}>
                      {a.favourite ? '\u2605' : '\u2606'}
                    </button>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 2px', color: '#f0ede8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name ?? a.prompt?.slice(0, 40) ?? 'Untitled'}</p>
                      <p style={{ fontSize: 10, color: 'rgba(240,237,232,0.3)', margin: 0 }}>{a.provider ?? a.style} \u00b7 {a.format}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="detail-panel as-scroll">
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(240,237,232,0.6)' }}>Details</span>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,237,232,0.3)', fontSize: 18, lineHeight: 1, padding: 0 }}>\u00d7</button>
              </div>

              <div style={{ padding: 20 }}>
                <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={selected.image_url} alt={selected.prompt ?? ''} style={{ width: '100%', display: 'block', aspectRatio: selected.format === 'landscape' ? '16/9' : selected.format === 'portrait' ? '4/5' : '1', objectFit: 'cover' }} />
                </div>

                {/* Meta */}
                <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['Provider', selected.provider ?? '-'], ['Style', selected.style], ['Format', selected.format], ['Folder', selected.folder], ['Created', new Date(selected.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'rgba(240,237,232,0.35)' }}>{k}</span>
                      <span style={{ color: '#f0ede8', fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>

                {selected.prompt && (
                  <div style={{ marginBottom: 16, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 9, color: 'rgba(240,237,232,0.3)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Prompt</p>
                    <p style={{ fontSize: 11, color: 'rgba(240,237,232,0.45)', margin: 0, lineHeight: 1.6 }}>{selected.prompt}</p>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a href={selected.image_url} download target="_blank" rel="noreferrer" className="as-btn as-btn-primary" style={{ justifyContent: 'center', textDecoration: 'none', borderRadius: 10, padding: '10px' }}>
                    \u2913 Download
                  </a>
                  <button onClick={() => toggleFav(selected)}
                    style={{ padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: selected.favourite ? '#F59E0B' : 'rgba(240,237,232,0.4)', transition: 'all 0.2s' }}>
                    {selected.favourite ? '\u2605 Remove from saved' : '\u2606 Save to favourites'}
                  </button>
                  <button onClick={() => { setPrompt(selected.prompt ?? ''); setStyle(selected.style); setRatio(selected.format); setActiveTab('console') }}
                    style={{ padding: '10px', borderRadius: 10, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(240,237,232,0.4)', transition: 'all 0.2s' }}>
                    \u21BA Use as template
                  </button>
                  <button onClick={() => deleteAsset(selected.id)}
                    style={{ padding: '10px', borderRadius: 10, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: 'rgba(239,68,68,0.6)', transition: 'all 0.2s' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface StudioAsset {
  id: string; name: string | null; prompt: string | null; enhanced_prompt: string | null
  style: string; format: string; provider: string | null; image_url: string
  folder: string; tags: string[]; favourite: boolean; status: string; created_at: string
}

const MODELS = [
  { id: 'nano2', label: 'Nano Banana 2', sublabel: 'Fast & efficient', icon: '🍌', prefer_pro: false, speed: 'Fast', quality: 'High' },
  { id: 'pro', label: 'Nano Banana Pro', sublabel: 'Premium quality', icon: '🍌', prefer_pro: true, speed: 'Slower', quality: 'Ultra' },
]

const ASPECT_RATIOS = [
  { id: 'square',    label: '1:1',   hint: 'Post',    w: 1, h: 1 },
  { id: 'portrait',  label: '9:16',  hint: 'Story',   w: 9, h: 16 },
  { id: 'landscape', label: '16:9',  hint: 'Banner',  w: 16, h: 9 },
  { id: 'p34',       label: '3:4',   hint: 'Print',   w: 3, h: 4 },
  { id: 'l43',       label: '4:3',   hint: 'Screen',  w: 4, h: 3 },
  { id: 'p23',       label: '2:3',   hint: 'Portrait', w: 2, h: 3 },
  { id: 'l32',       label: '3:2',   hint: 'Landscape', w: 3, h: 2 },
]

const STYLES = [
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'bold', label: 'Bold & Graphic' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'neon', label: 'Neon / Dark' },
]

const RESOLUTIONS = ['1K', '2K', '4K']
const OUTPUT_FORMATS = ['PNG', 'JPG']

const TEMPLATES = [
  { label: 'Weekend Special', prompt: 'Weekend special promotion banner, warm lighting, festive Australian cafe atmosphere, golden hour' },
  { label: 'New Arrival', prompt: 'New product arrival announcement, exciting product reveal, clean modern retail display, fresh and vibrant' },
  { label: 'Happy Hour', prompt: 'Happy hour promotion, vibrant bar atmosphere, craft cocktails, warm amber lighting, inviting' },
  { label: 'Seasonal Sale', prompt: 'Seasonal sale promotion, colourful Australian summer decorations, energetic shopping atmosphere' },
  { label: 'Loyalty Reward', prompt: 'Customer loyalty reward program, warm appreciation theme, gold stars, premium premium feel' },
  { label: 'Grand Opening', prompt: 'Grand opening celebration, ribbon cutting ceremony, excited crowd, balloons, fresh modern storefront' },
  { label: 'Product Hero', prompt: 'Hero product showcase, professional studio lighting, premium presentation on white background' },
  { label: 'Local Community', prompt: 'Local Australian small business community promotion, authentic warm colours, neighbourhood feel' },
  { label: 'Staff Pick', prompt: "Staff picks and recommendations, friendly team members, warm inviting store atmosphere" },
  { label: 'Flash Sale', prompt: 'Flash sale urgent promotion, bold graphics, high energy, red and yellow accent colours' },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'Choose your model', desc: 'Select Nano Banana 2 for speed or Nano Banana Pro for ultra-quality. Both powered by Gemini AI.', icon: '🤖' },
  { step: '02', title: 'Describe your image', desc: 'Write what you want — or pick a template. Aria automatically enhances your prompt for better results.', icon: '✍️' },
  { step: '03', title: 'Set format & style', desc: 'Pick aspect ratio (1:1, 16:9, 9:16 and more), resolution, and visual style to match your brand.', icon: '🎨' },
  { step: '04', title: 'Generate & download', desc: 'AI creates your image in 15–60 seconds. Download, favourite, or use it as a starting point for your next creation.', icon: '⚡' },
]

// Format → API format string
function apiFormat(ratioId: string): string {
  if (ratioId === 'portrait' || ratioId === 'p34' || ratioId === 'p23') return 'portrait'
  if (ratioId === 'landscape' || ratioId === 'l43' || ratioId === 'l32') return 'landscape'
  return 'square'
}

// AspectRatio box visual
function RatioBox({ w, h, active }: { w: number; h: number; active: boolean }) {
  const maxS = 20
  const bw = h > w ? Math.round(maxS * w / h) : maxS
  const bh = w > h ? Math.round(maxS * h / w) : maxS
  return (
    <div style={{ width: bw, height: bh, border: '1.5px solid ' + (active ? '#fff' : 'rgba(255,255,255,0.3)'), borderRadius: 2, flexShrink: 0 }} />
  )
}

// Animated progress dots
function GeneratingDots() {
  const [dot, setDot] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 4), 400)
    return () => clearInterval(t)
  }, [])
  return <span>{'.'.repeat(dot)}<span style={{ opacity: 0 }}>{'.'.repeat(3 - dot)}</span></span>
}

// Animated generation log
function GenerationLog({ provider }: { provider?: string }) {
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const steps = [
      '> Connecting to ' + (provider ?? 'Gemini Nano Banana') + '...',
      '> Enhancing prompt with Aria intelligence...',
      '> Sending generation request...',
      '> Processing image data...',
      '> Applying style parameters...',
      '> Optimising output quality...',
      '> Uploading to secure storage...',
    ]
    let i = 0
    const t = setInterval(() => {
      if (i < steps.length) { setLines(l => [...l, steps[i]]); i++ }
      else clearInterval(t)
    }, 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7FB897', lineHeight: 2 }}>
      {lines.map((l, i) => (
        <div key={i} style={{ opacity: i === lines.length - 1 ? 1 : 0.5 }}>{l}</div>
      ))}
      <div style={{ color: 'rgba(127,184,151,0.6)' }}>{'> Generating'}<GeneratingDots /></div>
    </div>
  )
}

export default function AriaStudioPage() {
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Generator state
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState('nano2')
  const [ratioId, setRatioId] = useState('square')
  const [style, setStyle] = useState('photorealistic')
  const [resolution, setResolution] = useState('1K')
  const [outputFormat, setOutputFormat] = useState('PNG')

  // View state
  const [view, setView] = useState<'studio' | 'library' | 'how'>('studio')
  const [filterFav, setFilterFav] = useState(false)
  const [filterFolder, setFilterFolder] = useState<string | null>(null)
  const [selected, setSelected] = useState<StudioAsset | null>(null)
  const [lastGen, setLastGen] = useState<StudioAsset | null>(null)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [generatingProvider, setGeneratingProvider] = useState<string | undefined>()

  // Animation state for how-it-works
  const [activeStep, setActiveStep] = useState(0)
  useEffect(() => {
    if (view !== 'how') return
    const t = setInterval(() => setActiveStep(s => (s + 1) % HOW_IT_WORKS.length), 2500)
    return () => clearInterval(t)
  }, [view])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/aria/studio?limit=80').then(r => r.json()) as { assets?: StudioAsset[] }
      setAssets(d.assets ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const showMsg = (text: string, err = false) => {
    setMsg(text); setMsgErr(err)
    setTimeout(() => setMsg(''), 5000)
  }

  const refine = async () => {
    if (!prompt.trim() || refining) return
    setRefining(true)
    try {
      const d = await fetch('/api/aria/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refine_prompt', prompt }) }).then(r => r.json()) as { refined_prompt?: string }
      if (d.refined_prompt) setPrompt(d.refined_prompt)
    } finally { setRefining(false) }
  }

  const generate = async () => {
    if (!prompt.trim()) { showMsg('Enter a prompt first', true); return }
    const model = MODELS.find(m => m.id === modelId)!
    setGenerating(true)
    setGeneratingProvider(model.label)
    setMsg('')
    try {
      const d = await fetch('/api/aria/studio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style, format: apiFormat(ratioId), prefer_pro: model.prefer_pro, folder: 'generated' }),
      }).then(r => r.json()) as { asset?: StudioAsset; provider?: string; error?: string }
      if (d.error) { showMsg(d.error, true); return }
      if (d.asset) {
        setLastGen(d.asset)
        setAssets(prev => [d.asset!, ...prev])
        showMsg('Image created via ' + (d.provider ?? 'AI'))
      }
    } catch { showMsg('Generation failed — check your API keys', true) }
    finally { setGenerating(false); setGeneratingProvider(undefined) }
  }

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) { showMsg('Only image files supported', true); return }
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'uploads')
      const d = await fetch('/api/aria/studio/upload', { method: 'POST', body: fd }).then(r => r.json()) as { asset?: StudioAsset; error?: string }
      if (d.error) { showMsg(d.error, true); return }
      if (d.asset) { setAssets(prev => [d.asset!, ...prev]); showMsg('Uploaded successfully') }
    } finally { setUploading(false) }
  }

  const toggleFav = async (a: StudioAsset, e?: React.MouseEvent) => {
    e?.stopPropagation()
    await fetch('/api/aria/studio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, favourite: !a.favourite }) })
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, favourite: !x.favourite } : x))
    if (selected?.id === a.id) setSelected(prev => prev ? { ...prev, favourite: !prev.favourite } : null)
    if (lastGen?.id === a.id) setLastGen(prev => prev ? { ...prev, favourite: !prev.favourite } : null)
  }

  const del = async (id: string) => {
    await fetch('/api/aria/studio?id=' + id, { method: 'DELETE' })
    setAssets(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
    showMsg('Deleted')
  }

  const filtered = assets.filter(a => {
    if (filterFav && !a.favourite) return false
    if (filterFolder && a.folder !== filterFolder) return false
    return true
  })

  const selRatio = ASPECT_RATIOS.find(r => r.id === ratioId)!
  const selModel = MODELS.find(m => m.id === modelId)!

  // Nano Banana dark theme
  const B = {
    bg: '#000',
    card: '#111',
    card2: '#181818',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.14)',
    text: '#fff',
    muted: 'rgba(255,255,255,0.5)',
    dim: 'rgba(255,255,255,0.25)',
    green: '#7FB897',
    green2: '#2D5240',
    accent: '#7FB897',
  }

  return (
    <div style={{ minHeight: '100vh', background: B.bg, color: B.text, fontFamily: 'inherit' }}>
      {/* ── Top nav ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 56, borderBottom: '1px solid ' + B.border, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🍌</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: B.text }}>Aria Studio</span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: B.green, fontWeight: 700, letterSpacing: '0.04em' }}>POWERED BY GEMINI</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['studio', 'library', 'how'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (view === v ? B.border2 : 'transparent'), background: view === v ? B.card2 : 'transparent', color: view === v ? B.text : B.muted, textTransform: 'capitalize' }}>
              {v === 'studio' ? '✦ Studio' : v === 'library' ? 'Library (' + assets.length + ')' : '? How it works'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {msg && <span style={{ fontSize: 12, color: msgErr ? '#EF4444' : B.green, maxWidth: 300, textAlign: 'right' }}>{msg}</span>}
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border2, background: B.card2, color: B.text, opacity: uploading ? 0.6 : 1 }}>
            {uploading ? 'Uploading…' : '↑ Upload'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      {view === 'how' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 99, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', marginBottom: 20 }}>
              <span style={{ fontSize: 14 }}>🍌</span>
              <span style={{ fontSize: 12, color: B.green, fontWeight: 600 }}>Powered by Gemini Nano Banana</span>
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              AI images for your business,<br />
              <span style={{ color: B.green }}>in seconds</span>
            </h1>
            <p style={{ fontSize: 16, color: B.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
              Aria Studio uses Google Gemini Nano Banana — the same AI that outperforms industry leaders in text-based image generation. Create promo banners, social posts, product shots, and more without a designer.
            </p>
          </div>

          {/* Animated steps */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 64 }}>
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} onClick={() => setActiveStep(i)}
                style={{ padding: 28, borderRadius: 16, border: '1px solid ' + (activeStep === i ? 'rgba(127,184,151,0.4)' : B.border), background: activeStep === i ? 'rgba(127,184,151,0.06)' : B.card, cursor: 'pointer', transition: 'all 0.3s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: activeStep === i ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: activeStep === i ? B.green : B.dim, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>STEP {s.step}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: activeStep === i ? B.text : 'rgba(255,255,255,0.7)' }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: B.muted, lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                </div>
                {activeStep === i && (
                  <div style={{ marginTop: 16, height: 2, background: 'rgba(127,184,151,0.3)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: B.green, borderRadius: 1, animation: 'progress 2.5s linear', animationFillMode: 'forwards' }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Example use cases */}
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>What you can create</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { title: 'Promo Banners', desc: 'Weekend specials, flash sales, seasonal offers', icon: '🎯' },
                { title: 'Social Posts', desc: 'Instagram, Facebook, Google Business images', icon: '📱' },
                { title: 'Product Shots', desc: 'Hero images, catalogue photos, lifestyle shots', icon: '📦' },
                { title: 'Event Posters', desc: 'Grand openings, live music, community events', icon: '🎉' },
                { title: 'Loyalty Cards', desc: 'Reward program visuals, member materials', icon: '⭐' },
                { title: 'Menu Visuals', desc: 'Food photography style images for menus', icon: '🍽️' },
              ].map((u, i) => (
                <div key={i} style={{ padding: '18px 20px', borderRadius: 12, background: B.card, border: '1px solid ' + B.border }}>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>{u.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{u.title}</div>
                  <div style={{ fontSize: 12, color: B.muted }}>{u.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Model comparison */}
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>Model comparison</h2>
            <div style={{ borderRadius: 16, border: '1px solid ' + B.border, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: B.card2 }}>
                    {['Model', 'Speed', 'Quality', 'Best for'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: B.dim, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid ' + B.border }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid ' + B.border }}>
                    <td style={{ padding: '14px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>🍌</span><div><div style={{ fontSize: 13, fontWeight: 600 }}>Nano Banana 2</div><div style={{ fontSize: 11, color: B.muted }}>gemini-3.1-flash-image-preview</div></div></div></td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: B.green }}>Fast (15–30s)</td>
                    <td style={{ padding: '14px 16px', fontSize: 13 }}>High</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: B.muted }}>Daily content, quick iterations</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '14px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>🍌</span><div><div style={{ fontSize: 13, fontWeight: 600 }}>Nano Banana Pro</div><div style={{ fontSize: 11, color: B.muted }}>gemini-3-pro-image-preview</div></div></div></td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: '#F59E0B' }}>Slower (30–60s)</td>
                    <td style={{ padding: '14px 16px', fontSize: 13, color: B.green }}>Ultra</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: B.muted }}>Hero banners, complex prompts, text rendering</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setView('studio')} style={{ padding: '14px 36px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: B.green, color: '#fff' }}>
              ✦ Start creating
            </button>
          </div>

          <style>{`@keyframes progress { from { width: 0% } to { width: 100% } }`}</style>
        </div>
      )}

      {/* ── STUDIO ── */}
      {view === 'studio' && (
        <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', minHeight: 'calc(100vh - 56px)' }}>
          {/* ── Left panel: controls ── */}
          <div style={{ borderRight: '1px solid ' + B.border, overflowY: 'auto', background: B.card }}>
            <div style={{ padding: 20 }}>

              {/* Model selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>AI Model</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {MODELS.map(m => (
                    <button key={m.id} onClick={() => setModelId(m.id)}
                      style={{ flex: 1, padding: '12px 10px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (modelId === m.id ? B.green : B.border), background: modelId === m.id ? 'rgba(127,184,151,0.08)' : B.card2, textAlign: 'center', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{m.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: modelId === m.id ? B.green : B.text }}>{m.label}</div>
                      <div style={{ fontSize: 10, color: B.muted, marginTop: 2 }}>{m.sublabel}</div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: B.dim }}>{m.speed}</span>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: modelId === m.id ? 'rgba(127,184,151,0.12)' : 'rgba(255,255,255,0.06)', color: modelId === m.id ? B.green : B.dim }}>{m.quality}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload / drag-drop area */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
                onClick={() => fileInputRef.current?.click()}
                style={{ marginBottom: 20, padding: '16px', borderRadius: 12, border: '1px dashed ' + (dragOver ? B.green : B.border2), background: dragOver ? 'rgba(127,184,151,0.05)' : B.card2, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>🖼</div>
                <div style={{ fontSize: 12, color: B.muted }}>Click to upload or drag & drop</div>
                <div style={{ fontSize: 10, color: B.dim, marginTop: 4 }}>PNG, JPG, JPEG, WEBP</div>
              </div>

              {/* Prompt */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Prompt</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: B.dim }}>{prompt.length}/5000</span>
                    <button onClick={refine} disabled={refining || !prompt.trim()}
                      style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: B.green, opacity: refining || !prompt.trim() ? 0.4 : 1, fontWeight: 600 }}>
                      {refining ? '…' : '✦ Aria refine'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 5000))}
                  placeholder="Describe the image you want to create…"
                  rows={4}
                  style={{ width: '100%', padding: '12px 14px', background: B.card2, border: '1px solid ' + B.border2, borderRadius: 10, color: B.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
                />
              </div>

              {/* Quick templates */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Quick Templates</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TEMPLATES.map(t => (
                    <button key={t.label} onClick={() => setPrompt(t.prompt)}
                      style={{ padding: '5px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (prompt === t.prompt ? 'rgba(127,184,151,0.5)' : B.border), background: prompt === t.prompt ? 'rgba(127,184,151,0.1)' : 'transparent', color: prompt === t.prompt ? B.green : B.muted, transition: 'all 0.15s' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Resolution</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {RESOLUTIONS.map(r => (
                    <button key={r} onClick={() => setResolution(r)}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (resolution === r ? B.green : B.border), background: resolution === r ? 'rgba(127,184,151,0.1)' : B.card2, color: resolution === r ? B.green : B.muted }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output format */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Output Format</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {OUTPUT_FORMATS.map(f => (
                    <button key={f} onClick={() => setOutputFormat(f)}
                      style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (outputFormat === f ? B.green : B.border), background: outputFormat === f ? 'rgba(127,184,151,0.1)' : B.card2, color: outputFormat === f ? B.green : B.muted }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect ratio */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Aspect Ratio</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ASPECT_RATIOS.map(r => (
                    <button key={r.id} onClick={() => setRatioId(r.id)}
                      style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (ratioId === r.id ? B.green : B.border), background: ratioId === r.id ? 'rgba(127,184,151,0.1)' : B.card2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 50 }}>
                      <RatioBox w={r.w} h={r.h} active={ratioId === r.id} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: ratioId === r.id ? B.green : B.muted }}>{r.label}</span>
                      <span style={{ fontSize: 9, color: B.dim }}>{r.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Style</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {STYLES.map(s => (
                    <button key={s.id} onClick={() => setStyle(s.id)}
                      style={{ padding: '8px 6px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (style === s.id ? B.green : B.border), background: style === s.id ? 'rgba(127,184,151,0.1)' : B.card2, color: style === s.id ? B.green : B.muted, textAlign: 'center' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate */}
              <button onClick={generate} disabled={generating || !prompt.trim()}
                style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: generating || !prompt.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', border: 'none', background: generating || !prompt.trim() ? 'rgba(45,82,64,0.4)' : B.green, color: '#fff', letterSpacing: '0.01em', transition: 'all 0.2s' }}>
                {generating ? '⏳ Generating…' : '✦ Generate'}
              </button>

            </div>
          </div>

          {/* ── Right panel: output ── */}
          <div style={{ overflowY: 'auto', background: B.bg }}>
            {generating ? (
              /* Generation console — Nano Banana style */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)', padding: 48 }}>
                <div style={{ width: '100%', maxWidth: 600 }}>
                  {/* Pulsing circle */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40 }}>
                    <div style={{ position: 'relative', width: 100, height: 100 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(127,184,151,0.08)', animation: 'pulse 2s ease-in-out infinite' }} />
                      <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: 'rgba(127,184,151,0.12)', animation: 'pulse 2s ease-in-out 0.3s infinite' }} />
                      <div style={{ position: 'absolute', inset: 20, borderRadius: '50%', background: 'rgba(127,184,151,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                        🍌
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                      {generatingProvider ?? 'Gemini Nano Banana'} is creating your image
                    </div>
                    <div style={{ fontSize: 13, color: B.muted }}>This typically takes 15–60 seconds</div>
                  </div>

                  {/* Terminal-style log */}
                  <div style={{ background: '#0a0a0a', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 14, padding: '20px 24px', minHeight: 180 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                      {['#EF4444', '#F59E0B', B.green].map((c, i) => (
                        <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
                      ))}
                    </div>
                    <GenerationLog provider={generatingProvider} />
                  </div>

                  <div style={{ marginTop: 20, fontSize: 11, color: B.dim, textAlign: 'center' }}>
                    Model: {selModel.label} · Ratio: {selRatio.label} · Style: {style}
                  </div>
                </div>
                <style>{`@keyframes pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.1);opacity:0.7} }`}</style>
              </div>
            ) : lastGen ? (
              /* Generated image view */
              <div style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 'calc(100vh - 56px)' }}>
                <div style={{ width: '100%', maxWidth: 640 }}>
                  {/* Success badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: B.green }} />
                    <span style={{ fontSize: 12, color: B.green, fontWeight: 600 }}>Generated via {lastGen.provider ?? 'AI'}</span>
                  </div>

                  {/* Image */}
                  <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid ' + B.border, marginBottom: 20, position: 'relative' }}>
                    <img src={lastGen.image_url} alt={lastGen.prompt ?? ''}
                      style={{ width: '100%', display: 'block', aspectRatio: lastGen.format === 'landscape' ? '16/9' : lastGen.format === 'portrait' ? '4/5' : '1/1', objectFit: 'cover' }} />
                    <button onClick={e => toggleFav(lastGen, e)}
                      style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: lastGen.favourite ? '#F59E0B' : '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      {lastGen.favourite ? '★' : '☆'}
                    </button>
                  </div>

                  {/* Prompt display */}
                  <div style={{ padding: '12px 16px', background: B.card, borderRadius: 10, border: '1px solid ' + B.border, marginBottom: 16, fontSize: 13, color: B.muted, lineHeight: 1.6 }}>
                    {lastGen.prompt}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
                    <a href={lastGen.image_url} download target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: B.green, color: '#fff', textDecoration: 'none' }}>
                      ↓ Download
                    </a>
                    <button onClick={() => { setPrompt(lastGen.prompt ?? ''); setLastGen(null) }}
                      style={{ padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border2, background: B.card2, color: B.text }}>
                      ↺ Regenerate
                    </button>
                    <button onClick={() => setLastGen(null)}
                      style={{ padding: '11px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border, background: 'transparent', color: B.muted }}>
                      + New
                    </button>
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {[['Style', lastGen.style], ['Format', lastGen.format], ['Provider', lastGen.provider ?? 'AI']].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: 9, color: B.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent strip */}
                  {assets.length > 1 && (
                    <div style={{ marginTop: 32 }}>
                      <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Recent creations</div>
                      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                        {assets.filter(a => a.id !== lastGen.id).slice(0, 8).map(a => (
                          <div key={a.id} onClick={() => setLastGen(a)} style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', border: '1px solid ' + B.border }}>
                            <img src={a.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Empty state with animation */
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 56px)', padding: 48, textAlign: 'center' }}>
                <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 32 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(127,184,151,0.15)', animation: 'spin 8s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '1px dashed rgba(127,184,151,0.1)', animation: 'spin 12s linear infinite reverse' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>🍌</div>
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Ready to create</h2>
                <p style={{ fontSize: 14, color: B.muted, maxWidth: 360, lineHeight: 1.7, margin: '0 0 28px' }}>
                  Choose a model, write a prompt or pick a template, then hit Generate. Your image will appear here in seconds.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {TEMPLATES.slice(0, 4).map(t => (
                    <button key={t.label} onClick={() => setPrompt(t.prompt)}
                      style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border2, background: B.card, color: B.muted }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── LIBRARY ── */}
      {view === 'library' && (
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
          {/* Sidebar */}
          <div style={{ width: 200, borderRight: '1px solid ' + B.border, padding: '16px 12px', flexShrink: 0, background: B.card }}>
            <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Filter</div>
            {[
              { label: 'All images', active: !filterFolder && !filterFav, action: () => { setFilterFolder(null); setFilterFav(false) } },
              { label: '★ Favourites', active: filterFav, action: () => { setFilterFav(true); setFilterFolder(null) } },
            ].map(f => (
              <button key={f.label} onClick={f.action}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: f.active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: f.active ? 'rgba(127,184,151,0.12)' : 'transparent', color: f.active ? B.green : B.muted, textAlign: 'left', marginBottom: 2 }}>
                {f.label}
              </button>
            ))}
            <div style={{ fontSize: 10, color: B.dim, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '16px 0 8px' }}>Folders</div>
            {['generated', 'uploads', 'banners', 'social', 'promotions', 'products', 'events'].map(f => {
              const count = assets.filter(a => a.folder === f).length
              if (count === 0) return null
              return (
                <button key={f} onClick={() => { setFilterFolder(f); setFilterFav(false) }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: filterFolder === f ? 'rgba(127,184,151,0.12)' : 'transparent', color: filterFolder === f ? B.green : B.muted, textAlign: 'left', display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>{f}</span><span style={{ fontSize: 10, color: B.dim }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: B.bg }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: B.muted }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, color: B.muted }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.2 }}>🖼</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No images yet</div>
                <div style={{ fontSize: 13, marginBottom: 24 }}>Generate your first image in the Studio</div>
                <button onClick={() => setView('studio')} style={{ padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: B.green, color: '#fff' }}>
                  ✦ Go to Studio
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {filtered.map(a => (
                  <div key={a.id} onClick={() => setSelected(a)}
                    style={{ borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: B.card, border: '1px solid ' + (selected?.id === a.id ? 'rgba(127,184,151,0.5)' : B.border), position: 'relative', transition: 'border-color 0.15s' }}>
                    <img src={a.image_url} alt={a.prompt ?? ''}
                      style={{ width: '100%', aspectRatio: a.format === 'landscape' ? '16/9' : a.format === 'portrait' ? '4/5' : '1', objectFit: 'cover', display: 'block' }} />
                    <button onClick={e => toggleFav(a, e)}
                      style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: a.favourite ? '#F59E0B' : '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      {a.favourite ? '★' : '☆'}
                    </button>
                    <div style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: B.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                        {a.name ?? a.prompt?.slice(0, 36) ?? 'Untitled'}
                      </div>
                      <div style={{ fontSize: 10, color: B.dim }}>{a.provider ?? a.style} · {a.format}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 300, borderLeft: '1px solid ' + B.border, padding: 20, overflowY: 'auto', flexShrink: 0, background: B.card }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Details</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: B.muted, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16, border: '1px solid ' + B.border }}>
                <img src={selected.image_url} alt={selected.prompt ?? ''}
                  style={{ width: '100%', display: 'block', aspectRatio: selected.format === 'landscape' ? '16/9' : selected.format === 'portrait' ? '4/5' : '1', objectFit: 'cover' }} />
              </div>

              {[['Provider', selected.provider ?? '-'], ['Style', selected.style], ['Format', selected.format], ['Folder', selected.folder],
                ['Created', new Date(selected.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })]
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: B.muted }}>{k}</span>
                  <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{v}</span>
                </div>
              ))}

              {selected.prompt && (
                <div style={{ margin: '14px 0', padding: '10px 12px', background: B.card2, borderRadius: 9, border: '1px solid ' + B.border }}>
                  <div style={{ fontSize: 9, color: B.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Prompt</div>
                  <div style={{ fontSize: 12, color: B.muted, lineHeight: 1.5 }}>{selected.prompt}</div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <a href={selected.image_url} download target="_blank" rel="noreferrer"
                  style={{ display: 'block', padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: B.green, color: '#fff', textAlign: 'center', textDecoration: 'none' }}>
                  ↓ Download
                </a>
                <button onClick={() => toggleFav(selected)}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border2, background: 'transparent', color: selected.favourite ? '#F59E0B' : B.muted }}>
                  {selected.favourite ? '★ Remove favourite' : '☆ Add favourite'}
                </button>
                <button onClick={() => { setPrompt(selected.prompt ?? ''); setStyle(selected.style); setView('studio') }}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + B.border, background: 'transparent', color: B.muted }}>
                  ↺ Use as starting point
                </button>
                <button onClick={() => del(selected.id)}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444' }}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

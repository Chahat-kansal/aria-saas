'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface StudioAsset {
  id: string; name: string | null; prompt: string | null; enhanced_prompt: string | null
  style: string; format: string; provider: string | null; image_url: string
  folder: string; tags: string[]; favourite: boolean; status: string; created_at: string
}

const STYLES = [
  { id: 'photorealistic', label: 'Photo', icon: '📷', desc: 'Real photography look' },
  { id: 'illustration', label: 'Illustration', icon: '🎨', desc: 'Digital art & illustration' },
  { id: 'minimalist', label: 'Minimalist', icon: '◻', desc: 'Clean & modern' },
  { id: 'bold', label: 'Bold', icon: '⚡', desc: 'High-impact poster style' },
  { id: 'vintage', label: 'Vintage', icon: '🎞', desc: 'Retro & nostalgic' },
  { id: 'neon', label: 'Neon', icon: '💜', desc: 'Dark with neon glow' },
]

const FORMATS = [
  { id: 'square', label: 'Square', dim: '1:1', icon: '⬜', hint: 'Instagram post' },
  { id: 'portrait', label: 'Portrait', dim: '4:5', icon: '📱', hint: 'Story / Reel' },
  { id: 'landscape', label: 'Landscape', dim: '16:9', icon: '🖥', hint: 'Facebook / Banner' },
]

const TEMPLATES = [
  { id: 'weekend_special', label: 'Weekend Special', prompt: 'Weekend special promotion banner with festive atmosphere, warm lighting, inviting atmosphere' },
  { id: 'new_arrival', label: 'New Arrival', prompt: 'New product arrival announcement, exciting reveal, clean product showcase' },
  { id: 'happy_hour', label: 'Happy Hour', prompt: 'Happy hour drinks promotion, vibrant bar atmosphere, cocktails and smiles' },
  { id: 'seasonal', label: 'Seasonal Sale', prompt: 'Seasonal sale promotion, colourful decorations, shopping atmosphere' },
  { id: 'loyalty', label: 'Loyalty Reward', prompt: 'Customer loyalty reward program, appreciation, gold stars, premium feel' },
  { id: 'grand_opening', label: 'Grand Opening', prompt: 'Grand opening celebration banner, ribbon cutting, excitement, balloons' },
  { id: 'product_hero', label: 'Product Hero', prompt: 'Hero product showcase, studio lighting, premium presentation, white background' },
  { id: 'local_promo', label: 'Local Business', prompt: 'Local Australian small business promotion, community feel, authentic, warm colours' },
]

const FOLDERS = ['generated', 'uploads', 'banners', 'social', 'promotions', 'products', 'events']

const S = {
  bg: 'var(--bg-base)', sf: 'rgba(255,255,255,0.03)', sf2: 'rgba(255,255,255,0.06)',
  bd: 'rgba(255,255,255,0.07)', bd2: 'rgba(255,255,255,0.12)',
  g: '#7FB897', g2: '#2D5240', dim: 'rgba(255,255,255,0.4)', m: 'rgba(255,255,255,0.2)',
  red: '#EF4444', amber: '#F59E0B', text: '#e8ede7',
}

export default function AriaStudioPage() {
  const [assets, setAssets] = useState<StudioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Generator state
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState('photorealistic')
  const [format, setFormat] = useState('square')
  const [folder, setFolder] = useState('generated')
  const [tags, setTags] = useState('')

  // UI state
  const [activeTab, setActiveTab] = useState<'generate' | 'library'>('generate')
  const [filterFolder, setFilterFolder] = useState<string | null>(null)
  const [filterFav, setFilterFav] = useState(false)
  const [selected, setSelected] = useState<StudioAsset | null>(null)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<StudioAsset | null>(null)
  const [editName, setEditName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '80' })
      if (filterFolder) params.set('folder', filterFolder)
      const d = await fetch('/api/aria/studio?' + params).then(r => r.json()) as { assets?: StudioAsset[] }
      setAssets(d.assets ?? [])
    } finally { setLoading(false) }
  }, [filterFolder])

  useEffect(() => { load() }, [load])

  const showMsg = (text: string, err = false) => {
    setMsg(text); setMsgErr(err)
    setTimeout(() => setMsg(''), 4000)
  }

  const refinePrompt = async () => {
    if (!prompt.trim()) return
    setRefining(true)
    try {
      const d = await fetch('/api/aria/studio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refine_prompt', prompt }) }).then(r => r.json()) as { refined_prompt?: string }
      if (d.refined_prompt) setPrompt(d.refined_prompt)
    } catch { /* ignore */ } finally { setRefining(false) }
  }

  const generate = async () => {
    if (!prompt.trim()) { showMsg('Enter a prompt first', true); return }
    setGenerating(true); setMsg('')
    try {
      const d = await fetch('/api/aria/studio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), style, format, folder, tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [] }),
      }).then(r => r.json()) as { asset?: StudioAsset; url?: string; provider?: string; error?: string }
      if (d.error) { showMsg(d.error, true); return }
      if (d.asset) {
        setLastGenerated(d.asset)
        setAssets(prev => [d.asset!, ...prev])
        showMsg('Image generated via ' + (d.provider ?? 'AI'))
        setActiveTab('library')
      }
    } catch { showMsg('Generation failed', true) } finally { setGenerating(false) }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'uploads')
      const d = await fetch('/api/aria/studio/upload', { method: 'POST', body: fd }).then(r => r.json()) as { asset?: StudioAsset; error?: string }
      if (d.error) { showMsg(d.error, true); return }
      if (d.asset) { setAssets(prev => [d.asset!, ...prev]); showMsg('Uploaded!') }
    } catch { showMsg('Upload failed', true) } finally { setUploading(false) }
  }

  const toggleFav = async (asset: StudioAsset) => {
    await fetch('/api/aria/studio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: asset.id, favourite: !asset.favourite }) })
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, favourite: !a.favourite } : a))
    if (selected?.id === asset.id) setSelected(prev => prev ? { ...prev, favourite: !prev.favourite } : null)
  }

  const deleteAsset = async (id: string) => {
    await fetch('/api/aria/studio?id=' + id, { method: 'DELETE' })
    setAssets(prev => prev.filter(a => a.id !== id))
    if (selected?.id === id) setSelected(null)
    showMsg('Deleted')
  }

  const saveEdit = async (id: string) => {
    await fetch('/api/aria/studio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name: editName }) })
    setAssets(prev => prev.map(a => a.id === id ? { ...a, name: editName } : a))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, name: editName } : null)
    setEditingId(null)
  }

  const filteredAssets = assets.filter(a => {
    if (filterFav && !a.favourite) return false
    if (filterFolder && a.folder !== filterFolder) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', color: S.text, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid ' + S.bd }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>✦</span>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Aria Studio</h1>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(127,184,151,0.15)', color: S.g, fontWeight: 600 }}>AI Image Generator</span>
            </div>
            <p style={{ fontSize: 13, color: S.dim, margin: 0 }}>Create promo banners, posters, and marketing images for your business</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {msg && <span style={{ fontSize: 13, color: msgErr ? S.red : S.g }}>{msg}</span>}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd2, background: S.sf2, color: S.text, opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading\u2026' : '\u2191 Upload image'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {(['generate', 'library'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: 'transparent', color: activeTab === t ? S.g : S.dim, borderBottom: '2px solid ' + (activeTab === t ? S.g : 'transparent'), transition: 'all 0.15s' }}>
              {t === 'generate' ? '\u2728 Generate' : '\uD83D\uDDBC\uFE0F Library (' + assets.length + ')'}
            </button>
          ))}
        </div>
      </div>

      {/* Generate tab */}
      {activeTab === 'generate' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, flex: 1 }}>
          {/* Left: Controls */}
          <div style={{ padding: 24, borderRight: '1px solid ' + S.bd, overflowY: 'auto' }}>
            {/* Templates */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px', fontWeight: 600 }}>Quick Templates</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setPrompt(t.prompt)}
                    style={{ padding: '10px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd, background: prompt === t.prompt ? 'rgba(127,184,151,0.1)' : S.sf, color: prompt === t.prompt ? S.g : S.dim, textAlign: 'center', lineHeight: 1.3 }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, fontWeight: 600 }}>Describe your image</p>
                <button onClick={refinePrompt} disabled={refining || !prompt.trim()}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: S.g, opacity: refining || !prompt.trim() ? 0.4 : 1 }}>
                  {refining ? 'Refining\u2026' : '\u2726 Aria refine'}
                </button>
              </div>
              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Weekend BBQ special promotion with sizzling meat, warm golden light, Australian summer vibes..."
                rows={4}
                style={{ width: '100%', padding: '12px 14px', background: S.sf2, border: '1px solid ' + S.bd2, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }}
              />
              <p style={{ fontSize: 11, color: S.dim, margin: '6px 0 0' }}>Aria will enhance your prompt automatically for better results</p>
            </div>

            {/* Style */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', fontWeight: 600 }}>Visual Style</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {STYLES.map(s => (
                  <button key={s.id} onClick={() => setStyle(s.id)}
                    style={{ padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (style === s.id ? 'rgba(127,184,151,0.5)' : S.bd), background: style === s.id ? 'rgba(127,184,151,0.1)' : S.sf, textAlign: 'center' }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: style === s.id ? S.g : S.text }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: S.dim, marginTop: 2 }}>{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Format */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', fontWeight: 600 }}>Format</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {FORMATS.map(f => (
                  <button key={f.id} onClick={() => setFormat(f.id)}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + (format === f.id ? 'rgba(127,184,151,0.5)' : S.bd), background: format === f.id ? 'rgba(127,184,151,0.1)' : S.sf, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{f.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: format === f.id ? S.g : S.text }}>{f.label}</div>
                    <div style={{ fontSize: 10, color: S.dim }}>{f.dim} \u00b7 {f.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Folder + Tags */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontWeight: 600 }}>Save to folder</p>
                <select value={folder} onChange={e => setFolder(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', background: S.sf2, border: '1px solid ' + S.bd2, borderRadius: 9, color: S.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                  {FOLDERS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontWeight: 600 }}>Tags (comma separated)</p>
                <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="promo, summer, sale"
                  style={{ width: '100%', padding: '9px 12px', background: S.sf2, border: '1px solid ' + S.bd2, borderRadius: 9, color: S.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Generate button */}
            <button onClick={generate} disabled={generating || !prompt.trim()}
              style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: generating || !prompt.trim() ? 'rgba(45,82,64,0.4)' : S.g2, color: '#fff', letterSpacing: '0.01em' }}>
              {generating ? '\u23f3 Generating your image\u2026 (30-60s)' : '\u2728 Generate Image'}
            </button>

            {generating && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 10, fontSize: 12, color: S.dim, lineHeight: 1.6 }}>
                Aria is generating your image using AI. This takes 15\u201360 seconds depending on the provider. Don\u2019t close this tab.
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, fontWeight: 600 }}>Preview</p>
            {lastGenerated ? (
              <div>
                <div style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 12, background: S.sf2, border: '1px solid ' + S.bd }}>
                  <img src={lastGenerated.image_url} alt={lastGenerated.prompt ?? ''} style={{ width: '100%', display: 'block', aspectRatio: lastGenerated.format === 'landscape' ? '16/9' : lastGenerated.format === 'portrait' ? '4/5' : '1/1', objectFit: 'cover' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, color: S.dim, margin: '0 0 4px' }}>Provider: {lastGenerated.provider ?? 'AI'}</p>
                  <p style={{ fontSize: 11, color: S.dim, margin: 0 }}>Style: {lastGenerated.style} \u00b7 Format: {lastGenerated.format}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={lastGenerated.image_url} download target="_blank" rel="noreferrer"
                    style={{ flex: 1, padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: S.g2, color: '#fff', textAlign: 'center', textDecoration: 'none', display: 'block' }}>
                    \u2913 Download
                  </a>
                  <button onClick={() => toggleFav(lastGenerated)}
                    style={{ padding: '9px 12px', borderRadius: 9, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd, background: S.sf, color: lastGenerated.favourite ? S.amber : S.dim }}>
                    {lastGenerated.favourite ? '\u2605' : '\u2606'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: S.sf, border: '1px dashed ' + S.bd2, borderRadius: 14, padding: 32, textAlign: 'center', minHeight: 280 }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🖼</div>
                <p style={{ fontSize: 14, color: S.dim, margin: '0 0 8px' }}>Your generated image appears here</p>
                <p style={{ fontSize: 12, color: S.m, margin: 0 }}>Choose a template or write a custom prompt, then click Generate</p>
              </div>
            )}

            {/* Recent quick access */}
            {assets.length > 0 && (
              <div>
                <p style={{ fontSize: 11, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px', fontWeight: 600 }}>Recent</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {assets.slice(0, 6).map(a => (
                    <div key={a.id} onClick={() => { setSelected(a); setActiveTab('library') }}
                      style={{ borderRadius: 8, overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: S.sf2, border: '1px solid ' + S.bd }}>
                      <img src={a.image_url} alt={a.prompt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Library tab */}
      {activeTab === 'library' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar filters */}
          <div style={{ width: 200, borderRight: '1px solid ' + S.bd, padding: '16px 12px', flexShrink: 0, overflowY: 'auto' }}>
            <p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px', fontWeight: 600 }}>Filter</p>
            <button onClick={() => { setFilterFolder(null); setFilterFav(false) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: !filterFolder && !filterFav ? 'rgba(127,184,151,0.12)' : 'transparent', color: !filterFolder && !filterFav ? S.g : S.dim, textAlign: 'left', marginBottom: 2 }}>
              All images
            </button>
            <button onClick={() => { setFilterFav(true); setFilterFolder(null) }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: filterFav ? 'rgba(127,184,151,0.12)' : 'transparent', color: filterFav ? S.g : S.dim, textAlign: 'left', marginBottom: 8 }}>
              \u2605 Favourites
            </button>
            <p style={{ fontSize: 10, color: S.m, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '8px 0 6px', fontWeight: 600 }}>Folders</p>
            {FOLDERS.map(f => {
              const count = assets.filter(a => a.folder === f).length
              if (count === 0) return null
              return (
                <button key={f} onClick={() => { setFilterFolder(f); setFilterFav(false) }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: filterFolder === f ? 'rgba(127,184,151,0.12)' : 'transparent', color: filterFolder === f ? S.g : S.dim, textAlign: 'left', display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>{f}</span>
                  <span style={{ fontSize: 10, color: S.m }}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: S.dim }}>Loading\u2026</div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: S.dim }}>
                <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>🖼</div>
                <p style={{ fontSize: 15, margin: '0 0 8px' }}>No images yet</p>
                <p style={{ fontSize: 13, margin: 0 }}>Switch to Generate to create your first image</p>
                <button onClick={() => setActiveTab('generate')} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: S.g2, color: '#fff' }}>
                  \u2728 Start generating
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {filteredAssets.map(a => (
                  <div key={a.id} onClick={() => setSelected(a)}
                    style={{ borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: S.sf2, border: '1px solid ' + (selected?.id === a.id ? 'rgba(127,184,151,0.5)' : S.bd), position: 'relative' }}>
                    <img src={a.image_url} alt={a.prompt ?? ''} style={{ width: '100%', aspectRatio: a.format === 'landscape' ? '16/9' : a.format === 'portrait' ? '4/5' : '1', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); toggleFav(a) }}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: a.favourite ? S.amber : '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        {a.favourite ? '\u2605' : '\u2606'}
                      </button>
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontSize: 11, fontWeight: 600, margin: '0 0 2px', color: S.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name ?? a.prompt?.slice(0, 40) ?? 'Untitled'}</p>
                      <p style={{ fontSize: 10, color: S.dim, margin: 0 }}>{a.provider ?? a.style} \u00b7 {a.format}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ width: 300, borderLeft: '1px solid ' + S.bd, padding: 20, overflowY: 'auto', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Details</h3>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, fontSize: 18, lineHeight: 1, padding: 0 }}>\u00d7</button>
              </div>
              <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16, border: '1px solid ' + S.bd }}>
                <img src={selected.image_url} alt={selected.prompt ?? ''} style={{ width: '100%', display: 'block', aspectRatio: selected.format === 'landscape' ? '16/9' : selected.format === 'portrait' ? '4/5' : '1', objectFit: 'cover' }} />
              </div>

              {/* Name */}
              <div style={{ marginBottom: 12 }}>
                {editingId === selected.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, padding: '6px 8px', background: S.sf2, border: '1px solid ' + S.bd2, borderRadius: 7, color: S.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                    <button onClick={() => saveEdit(selected.id)} style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: S.g2, color: '#fff' }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd, background: 'transparent', color: S.dim }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{selected.name ?? 'Untitled'}</p>
                    <button onClick={() => { setEditingId(selected.id); setEditName(selected.name ?? '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, fontSize: 11, fontFamily: 'inherit' }}>Edit</button>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['Provider', selected.provider ?? '-'], ['Style', selected.style], ['Format', selected.format], ['Folder', selected.folder], ['Created', new Date(selected.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: S.dim }}>{k}</span>
                    <span style={{ color: S.text, fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>

              {selected.prompt && (
                <div style={{ marginBottom: 16, padding: '10px 12px', background: S.sf, borderRadius: 9, border: '1px solid ' + S.bd }}>
                  <p style={{ fontSize: 10, color: S.m, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Original prompt</p>
                  <p style={{ fontSize: 12, color: S.dim, margin: 0, lineHeight: 1.5 }}>{selected.prompt}</p>
                </div>
              )}

              {selected.tags.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selected.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.1)', color: S.g }}>{t}</span>)}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a href={selected.image_url} download target="_blank" rel="noreferrer"
                  style={{ display: 'block', padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: S.g2, color: '#fff', textAlign: 'center', textDecoration: 'none' }}>
                  \u2913 Download
                </a>
                <button onClick={() => toggleFav(selected)}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd, background: 'transparent', color: selected.favourite ? S.amber : S.dim }}>
                  {selected.favourite ? '\u2605 Remove from favourites' : '\u2606 Add to favourites'}
                </button>
                <button onClick={() => { setPrompt(selected.prompt ?? ''); setStyle(selected.style); setFormat(selected.format); setActiveTab('generate') }}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid ' + S.bd, background: 'transparent', color: S.dim }}>
                  \u21BA Use as template
                </button>
                <button onClick={() => deleteAsset(selected.id)}
                  style={{ padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: S.red }}>
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

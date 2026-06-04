'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RemotionPreview } from './RemotionPreview'
import {
  type EditSpec,
  type Filter,
  type TextLayer,
  FILTER_CSS,
} from '@/remotion/types'

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:      '#0b0f0c',
  surface: '#141a16',
  card:    '#1a2320',
  border:  '#2a3830',
  accent:  '#7FB897',
  accentD: '#2D5240',
  muted:   '#4a6055',
  text:    '#e8f0ea',
  textSub: '#8aa89a',
  red:     '#e06060',
}

const FILTERS: Filter[] = ['none','brightness','contrast','saturate','grayscale','sepia','warm','cool','dramatic']
const FILTER_LABELS: Record<Filter, string> = {
  none: 'Original', brightness: 'Bright', contrast: 'Contrast',
  saturate: 'Vivid', grayscale: 'B&W', sepia: 'Sepia',
  warm: 'Warm', cool: 'Cool', dramatic: 'Dramatic',
}

interface Props {
  videoUrl: string
  sessionId: string
  businessId: string
  onPublish: (editedUrl: string) => void
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

export function TimelineEditor({ videoUrl, sessionId, businessId, onPublish }: Props) {
  const DEFAULT_FRAMES = 300
  const FPS = 30

  const [spec, setSpec] = useState<EditSpec>({
    videoUrl,
    trimStartFrame: 0,
    trimEndFrame: DEFAULT_FRAMES,
    speed: 1,
    filter: 'none',
    filterIntensity: 1,
    textLayers: [],
    audioLayers: [],
    watermark: true,
    outputFps: FPS,
    outputWidth: 1080,
    outputHeight: 1920,
  })

  const [tab, setTab] = useState<'trim'|'filter'|'text'|'export'>('trim')
  const [renderState, setRenderState] = useState<
    'idle'|'submitting'|'rendering'|'done'|'error'
  >('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderUrl, setRenderUrl] = useState<string|null>(null)
  const [renderError, setRenderError] = useState<string|null>(null)
  const [editingText, setEditingText] = useState<TextLayer|null>(null)
  const [capLoading, setCapLoading] = useState(false)
  const [capOnVideo, setCapOnVideo] = useState<string[]>([])
  const [capSocial, setCapSocial] = useState<{ caption: string; hashtags: string[] }[]>([])
  const [capError, setCapError] = useState<string|null>(null)
  const pollRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [jobIds, setJobIds] = useState<{sandboxId:string;cmdId:string}|null>(null)

  // ── Update spec.videoUrl when prop changes ────────────────────────────────
  useEffect(() => {
    setSpec(s => ({ ...s, videoUrl }))
  }, [videoUrl])

  // ── TrimBar component ─────────────────────────────────────────────────────
  const trimBarRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'start'|'end'|null>(null)

  const onTrimPointerDown = useCallback((e: React.PointerEvent, handle: 'start'|'end') => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = handle
  }, [])

  const onTrimPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !trimBarRef.current) return
    const rect = trimBarRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const frame = Math.round(ratio * DEFAULT_FRAMES)
    if (dragging.current === 'start') {
      setSpec(s => ({ ...s, trimStartFrame: Math.min(frame, s.trimEndFrame - 10) }))
    } else {
      setSpec(s => ({ ...s, trimEndFrame: Math.max(frame, s.trimStartFrame + 10) }))
    }
  }, [])

  const onTrimPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  // ── Render flow ───────────────────────────────────────────────────────────
  async function startRender() {
    setRenderState('submitting')
    setRenderError(null)
    setRenderProgress(0)
    try {
      const res = await fetch('/api/reels/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, business_id: businessId, spec }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Render failed to start')
      setJobIds({ sandboxId: data.sandboxId, cmdId: data.cmdId })
      setRenderState('rendering')
      pollRender(data.sandboxId, data.cmdId)
    } catch (e: any) {
      setRenderState('error')
      setRenderError(e.message)
    }
  }

  function pollRender(sandboxId: string, cmdId: string) {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          '/api/reels/render-status?sandboxId=' + sandboxId + '&cmdId=' + cmdId +
          '&session_id=' + sessionId
        )
        const data = await res.json()
        if (data.stage === 'done') {
          setRenderState('done')
          setRenderUrl(data.url)
          setRenderProgress(100)
          onPublish(data.url)
        } else if (data.stage === 'error' || data.stage === 'expired') {
          setRenderState('error')
          setRenderError(data.error || 'Render failed')
        } else {
          const pct = typeof data.progress === 'number' ? Math.round(data.progress * 100) : renderProgress
          setRenderProgress(pct)
          pollRender(sandboxId, cmdId)
        }
      } catch {
        pollRender(sandboxId, cmdId)
      }
    }, 3000)
  }

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // ── Text layer editor ────────────────────────────────────────────────────
  async function suggestCaptions() {
    if (!businessId || capLoading) return
    setCapLoading(true); setCapError(null)
    try {
      const r = await fetch('/api/reels/captions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not get suggestions')
      setCapOnVideo(d.onVideo ?? [])
      setCapSocial(d.social ?? [])
    } catch (e: any) { setCapError(e.message) }
    setCapLoading(false)
  }

  function addTextLayer(text?: string) {
    const layer: TextLayer = {
      id: nanoid(),
      text: text ?? 'Your text here',
      startFrame: 0,
      endFrame: 90,
      fontSize: 48,
      color: '#ffffff',
      fontFamily: 'Inter',
      x: 50,
      y: 80,
      bold: true,
      shadow: true,
      background: false,
      backgroundColor: 'rgba(0,0,0,0.5)',
    }
    setSpec(s => ({ ...s, textLayers: [...s.textLayers, layer] }))
    setEditingText(layer)
  }

  function updateText(id: string, patch: Partial<TextLayer>) {
    setSpec(s => ({
      ...s,
      textLayers: s.textLayers.map(l => l.id === id ? { ...l, ...patch } : l),
    }))
    if (editingText?.id === id) setEditingText(prev => prev ? { ...prev, ...patch } : null)
  }

  function deleteText(id: string) {
    setSpec(s => ({ ...s, textLayers: s.textLayers.filter(l => l.id !== id) }))
    if (editingText?.id === id) setEditingText(null)
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600,
    color: active ? T.accent : T.muted, background: 'transparent',
    border: 'none', cursor: 'pointer', borderBottom: '2px solid ' + (active ? T.accent : 'transparent'),
    transition: 'all 0.15s',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: T.muted, fontWeight: 600, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: T.surface, border: '1px solid ' + T.border,
    borderRadius: 6, padding: '7px 10px', color: T.text, fontSize: 13, outline: 'none',
  }

  const btnStyle = (variant: 'primary'|'ghost'|'danger' = 'primary'): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', border: 'none', transition: 'all 0.15s',
    background: variant === 'primary' ? T.accent
      : variant === 'danger' ? T.red : T.card,
    color: variant === 'primary' ? '#0b0f0c' : T.text,
  })

  const trimStartPct = (spec.trimStartFrame / DEFAULT_FRAMES) * 100
  const trimEndPct   = (spec.trimEndFrame   / DEFAULT_FRAMES) * 100
  const durationSec  = ((spec.trimEndFrame - spec.trimStartFrame) / FPS / spec.speed).toFixed(1)

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 600 }}>

      {/* ── Left: phone preview ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{
          width: 270, height: 480, background: '#0d0d0d', borderRadius: 36,
          border: '8px solid #1c1c1e',
          boxShadow: '0 0 0 1px #2a2a2a, 0 24px 60px rgba(0,0,0,0.85)',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 72, height: 20, background: '#0d0d0d',
            borderRadius: '0 0 10px 10px', zIndex: 10,
          }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden' }}>
            <RemotionPreview spec={spec} width={254} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.muted }}>
          {durationSec}s &nbsp;·&nbsp; {spec.outputWidth}&times;{spec.outputHeight} &nbsp;·&nbsp; {FPS}fps
        </div>
      </div>

      {/* ── Right: editor panel ─────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + T.border, marginBottom: 16 }}>
          {(['trim','filter','text','export'] as const).map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t === 'trim' ? 'Trim' : t === 'filter' ? 'Filter' : t === 'text' ? 'Text' : 'Export'}
            </button>
          ))}
        </div>

        {/* ── TRIM TAB ─────────────────────────────────────────────────── */}
        {tab === 'trim' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={labelStyle}>Timeline trim</div>
              <div
                ref={trimBarRef}
                onPointerMove={onTrimPointerMove}
                onPointerUp={onTrimPointerUp}
                style={{
                  position: 'relative', height: 48, background: T.surface,
                  borderRadius: 8, border: '1px solid ' + T.border,
                  cursor: 'default', userSelect: 'none',
                }}
              >
                {/* filled range */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: trimStartPct + '%',
                  width: (trimEndPct - trimStartPct) + '%',
                  background: T.accentD + '80',
                  borderRadius: 6,
                }} />
                {/* start handle */}
                <div
                  onPointerDown={e => onTrimPointerDown(e, 'start')}
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: 'calc(' + trimStartPct + '% - 6px)',
                    width: 12, background: T.accent, borderRadius: 4, cursor: 'ew-resize', zIndex: 2,
                  }}
                />
                {/* end handle */}
                <div
                  onPointerDown={e => onTrimPointerDown(e, 'end')}
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: 'calc(' + trimEndPct + '% - 6px)',
                    width: 12, background: T.accent, borderRadius: 4, cursor: 'ew-resize', zIndex: 2,
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: T.muted }}>
                <span>Start: {(spec.trimStartFrame / FPS).toFixed(2)}s</span>
                <span>Duration: {durationSec}s</span>
                <span>End: {(spec.trimEndFrame / FPS).toFixed(2)}s</span>
              </div>
            </div>

            <div>
              <div style={labelStyle}>Speed</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[0.5, 1, 1.5, 2].map(s => (
                  <button key={s} onClick={() => setSpec(sp => ({ ...sp, speed: s }))}
                    style={{
                      padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid ' + (spec.speed === s ? T.accent : T.border),
                      background: spec.speed === s ? T.accentD : T.surface,
                      color: spec.speed === s ? T.accent : T.textSub,
                    }}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FILTER TAB ───────────────────────────────────────────────── */}
        {tab === 'filter' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={labelStyle}>Filter preset</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {FILTERS.map(f => (
                  <button key={f} onClick={() => setSpec(s => ({ ...s, filter: f }))}
                    style={{
                      padding: '10px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid ' + (spec.filter === f ? T.accent : T.border),
                      background: spec.filter === f ? T.accentD : T.surface,
                      color: spec.filter === f ? T.accent : T.textSub,
                    }}>
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            {spec.filter !== 'none' && (
              <div>
                <div style={labelStyle}>Intensity — {Math.round(spec.filterIntensity * 100)}%</div>
                <input type="range" min={0} max={1} step={0.05}
                  value={spec.filterIntensity}
                  onChange={e => setSpec(s => ({ ...s, filterIntensity: parseFloat(e.target.value) }))}
                  style={{ width: '100%', accentColor: T.accent }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── TEXT TAB ─────────────────────────────────────────────────── */}
        {tab === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Aria caption suggestions */}
            <div style={{ background: T.card, borderRadius: 10, padding: '12px 14px', border: '1px solid ' + T.border }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>✨ Aria caption suggestions</span>
                <button onClick={suggestCaptions} disabled={capLoading}
                  style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: '1px solid ' + T.accent, background: 'transparent', color: T.accent, cursor: capLoading ? 'wait' : 'pointer' }}>
                  {capLoading ? 'Thinking…' : (capOnVideo.length || capSocial.length ? 'Regenerate' : 'Suggest')}
                </button>
              </div>
              {capError && <div style={{ color: T.red, fontSize: 12, marginBottom: 8 }}>{capError}</div>}
              {!capLoading && !capOnVideo.length && !capSocial.length && !capError && (
                <div style={{ color: T.muted, fontSize: 12 }}>Tap Suggest — Aria writes on-video text and social captions from your business data.</div>
              )}
              {capOnVideo.length > 0 && (
                <div style={{ marginBottom: capSocial.length ? 12 : 0 }}>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>On-video text — tap to add</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {capOnVideo.map((t, i) => (
                      <button key={i} onClick={() => addTextLayer(t)}
                        style={{ textAlign: 'left', fontSize: 13, color: T.text, background: T.bg, border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {capSocial.length > 0 && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>Social post captions — tap to copy</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {capSocial.map((s, i) => {
                      const full = s.caption + (s.hashtags?.length ? '\n\n' + s.hashtags.map(h => '#' + h).join(' ') : '')
                      return (
                        <button key={i} onClick={() => { navigator.clipboard?.writeText(full).catch(() => {}) }}
                          style={{ textAlign: 'left', fontSize: 12, color: T.textSub, background: T.bg, border: '1px solid ' + T.border, borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                          <div style={{ color: T.text }}>{s.caption}</div>
                          {s.hashtags?.length > 0 && <div style={{ color: T.accent, marginTop: 4 }}>{s.hashtags.map(h => '#' + h).join(' ')}</div>}
                          <div style={{ color: T.muted, fontSize: 10, marginTop: 4 }}>Tap to copy</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <button style={btnStyle('primary')} onClick={() => addTextLayer()}>
              + Add text layer
            </button>
            {spec.textLayers.length === 0 && (
              <div style={{ color: T.muted, fontSize: 13 }}>No text layers yet.</div>
            )}
            {spec.textLayers.map(layer => (
              <div key={layer.id} style={{
                background: T.card, borderRadius: 10, padding: '12px 14px',
                border: '1px solid ' + (editingText?.id === layer.id ? T.accent : T.border),
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <button onClick={() => setEditingText(editingText?.id === layer.id ? null : layer)}
                    style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {editingText?.id === layer.id ? '▲ Collapse' : '▼ Edit'}
                  </button>
                  <button onClick={() => deleteText(layer.id)}
                    style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 12 }}>
                    Delete
                  </button>
                </div>
                {editingText?.id === layer.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={labelStyle}>Text</div>
                      <textarea value={layer.text} rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                        onChange={e => updateText(layer.id, { text: e.target.value })} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Font size</div>
                        <input type="number" min={16} max={120} value={layer.fontSize} style={inputStyle}
                          onChange={e => updateText(layer.id, { fontSize: parseInt(e.target.value) || 48 })} />
                      </div>
                      <div>
                        <div style={labelStyle}>Color</div>
                        <input type="color" value={layer.color} style={{ ...inputStyle, padding: '2px', height: 36, cursor: 'pointer' }}
                          onChange={e => updateText(layer.id, { color: e.target.value })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={labelStyle}>X position %</div>
                        <input type="number" min={0} max={100} value={layer.x} style={inputStyle}
                          onChange={e => updateText(layer.id, { x: parseInt(e.target.value) || 50 })} />
                      </div>
                      <div>
                        <div style={labelStyle}>Y position %</div>
                        <input type="number" min={0} max={100} value={layer.y} style={inputStyle}
                          onChange={e => updateText(layer.id, { y: parseInt(e.target.value) || 80 })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <div style={labelStyle}>Start frame</div>
                        <input type="number" min={0} value={layer.startFrame} style={inputStyle}
                          onChange={e => updateText(layer.id, { startFrame: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <div style={labelStyle}>End frame</div>
                        <input type="number" min={1} value={layer.endFrame} style={inputStyle}
                          onChange={e => updateText(layer.id, { endFrame: parseInt(e.target.value) || 90 })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {([['bold', 'Bold'], ['shadow', 'Shadow'], ['background', 'BG']] as const).map(([k, label]) => (
                        <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: T.text }}>
                          <input type="checkbox" checked={layer[k as 'bold'|'shadow'|'background']}
                            onChange={e => updateText(layer.id, { [k]: e.target.checked } as Partial<TextLayer>)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {!editingText || editingText.id !== layer.id ? (
                  <div style={{ fontSize: 13, color: T.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {layer.text}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* ── EXPORT TAB ───────────────────────────────────────────────── */}
        {tab === 'export' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={labelStyle}>Output resolution</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([{w:1080,h:1920,label:'1080p'},{w:720,h:1280,label:'720p'},{w:540,h:960,label:'540p'}] as const).map(r => (
                  <button key={r.label}
                    onClick={() => setSpec(s => ({ ...s, outputWidth: r.w, outputHeight: r.h }))}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', border: '1px solid ' + (spec.outputWidth === r.w ? T.accent : T.border),
                      background: spec.outputWidth === r.w ? T.accentD : T.surface,
                      color: spec.outputWidth === r.w ? T.accent : T.textSub,
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.text }}>
                <input type="checkbox" checked={spec.watermark}
                  onChange={e => setSpec(s => ({ ...s, watermark: e.target.checked }))} />
                Add Aria watermark
              </label>
            </div>

            {renderState === 'idle' && (
              <button style={{ ...btnStyle('primary'), padding: '12px 24px', fontSize: 15 }}
                onClick={startRender}>
                Export MP4
              </button>
            )}

            {renderState === 'submitting' && (
              <div style={{ color: T.textSub, fontSize: 14 }}>Starting render sandbox…</div>
            )}

            {renderState === 'rendering' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 14, color: T.text }}>Rendering… {renderProgress}%</div>
                <div style={{
                  height: 6, background: T.border, borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: renderProgress + '%',
                    background: T.accent, transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>This may take 1-3 minutes. You can leave this page.</div>
              </div>
            )}

            {renderState === 'done' && renderUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ color: T.accent, fontSize: 14, fontWeight: 600 }}>Export complete!</div>
                <a
                  href={renderUrl}
                  download="reel.mp4"
                  style={{ ...btnStyle('primary'), textDecoration: 'none', textAlign: 'center' }}
                >
                  Download MP4
                </a>
                <button style={btnStyle('ghost')} onClick={() => {
                  setRenderState('idle')
                  setRenderUrl(null)
                  setRenderProgress(0)
                }}>
                  Re-export
                </button>
              </div>
            )}

            {renderState === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: T.red, fontSize: 13 }}>{renderError || 'Render failed'}</div>
                <button style={btnStyle('ghost')} onClick={() => {
                  setRenderState('idle')
                  setRenderError(null)
                }}>
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

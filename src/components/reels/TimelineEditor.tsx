'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { RemotionPreview } from './RemotionPreview'
import {
  type EditSpec,
  type Filter,
  type TextLayer,
  type TextAnim,
  type SpeedSegment,
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

const FILTERS: Filter[] = [
  'none','brightness','contrast','saturate','grayscale','sepia',
  'warm','cool','dramatic','vivid','noir','golden',
]
const FILTER_LABELS: Record<Filter, string> = {
  none: 'Original', brightness: 'Bright', contrast: 'Contrast',
  saturate: 'Vivid', grayscale: 'B&W', sepia: 'Sepia',
  warm: 'Warm', cool: 'Cool', dramatic: 'Dramatic',
  vivid: 'Super Vivid', noir: 'Noir', golden: 'Golden',
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

const TEXT_PRESETS: Array<{ label: string; patch: Partial<TextLayer> }> = [
  {
    label: 'Bold White',
    patch: { fontSize: 64, color: '#ffffff', bold: true, shadow: true, background: false, fontFamily: 'Inter', anim: 'fade' },
  },
  {
    label: 'Caption Bar',
    patch: { fontSize: 36, color: '#ffffff', bold: true, shadow: false, background: true, backgroundColor: 'rgba(0,0,0,0.65)', fontFamily: 'Inter', y: 85, anim: 'slide-up' },
  },
  {
    label: 'Title',
    patch: { fontSize: 80, color: '#7FB897', bold: true, shadow: true, background: false, fontFamily: 'Inter', y: 20, anim: 'pop' },
  },
  {
    label: 'Subtitle',
    patch: { fontSize: 32, color: '#e8f0ea', bold: false, shadow: true, background: false, fontFamily: 'Inter', y: 30, anim: 'fade' },
  },
  {
    label: 'Neon',
    patch: { fontSize: 56, color: '#39ff80', bold: true, shadow: true, background: false, fontFamily: 'Inter', anim: 'pop' },
  },
  {
    label: 'Handwritten',
    patch: { fontSize: 52, color: '#fffde7', bold: false, shadow: true, background: false, fontFamily: 'Georgia, serif', anim: 'fade' },
  },
]

interface SocialCaption {
  caption: string
  hashtags: string[]
}

interface CaptionSuggestions {
  onVideo: string[]
  social: SocialCaption[]
}

interface Props {
  videoUrl: string
  sessionId: string
  businessId: string
  onPublish: (editedUrl: string) => void
  onCaptionChosen?: (text: string) => void
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10)
}

export function TimelineEditor({ videoUrl, sessionId, businessId, onPublish, onCaptionChosen }: Props) {
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
    speedSegments: [],
  })

  const [tab, setTab] = useState<'trim'|'filter'|'text'|'ai'|'export'>('trim')
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState<string|null>(null)
  const [aiPrev, setAiPrev] = useState<EditSpec|null>(null)
  const [v2vConfirm, setV2vConfirm] = useState<{op:'restyle'|'bg-remove'; cost: number}|null>(null)
  const [v2vLoading, setV2vLoading] = useState(false)
  const [v2vJobId, setV2vJobId] = useState<string|null>(null)
  const [v2vStatus, setV2vStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const v2vPollRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [renderState, setRenderState] = useState<'idle'|'submitting'|'rendering'|'done'|'error'>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderUrl, setRenderUrl] = useState<string|null>(null)
  const [renderError, setRenderError] = useState<string|null>(null)
  const [editingText, setEditingText] = useState<TextLayer|null>(null)
  const [selectedSegment, setSelectedSegment] = useState<number|null>(null)
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [captionSuggestions, setCaptionSuggestions] = useState<CaptionSuggestions|null>(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  // ── Update spec.videoUrl when prop changes ──────────────────────────────────
  useEffect(() => {
    setSpec(s => ({ ...s, videoUrl }))
  }, [videoUrl])

  // ── TrimBar refs ────────────────────────────────────────────────────────────
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

  // ── Speed segment helpers ───────────────────────────────────────────────────
  function initSpeedSegments() {
    const seg: SpeedSegment = {
      startFrame: spec.trimStartFrame,
      endFrame: spec.trimEndFrame,
      speed: spec.speed,
    }
    setSpec(s => ({ ...s, speedSegments: [seg] }))
    setSelectedSegment(0)
  }

  function splitSegment(segIndex: number) {
    const seg = spec.speedSegments[segIndex]
    const mid = Math.round((seg.startFrame + seg.endFrame) / 2)
    if (mid <= seg.startFrame + 5 || mid >= seg.endFrame - 5) return
    const newSegs = [...spec.speedSegments]
    newSegs.splice(segIndex, 1,
      { ...seg, endFrame: mid },
      { ...seg, startFrame: mid },
    )
    setSpec(s => ({ ...s, speedSegments: newSegs }))
    setSelectedSegment(segIndex + 1)
  }

  function setSegmentSpeed(segIndex: number, speed: number) {
    setSpec(s => ({
      ...s,
      speedSegments: s.speedSegments.map((seg, i) => i === segIndex ? { ...seg, speed } : seg),
    }))
  }

  function deleteSegment(segIndex: number) {
    if (spec.speedSegments.length <= 1) { resetSegments(); return }
    const newSegs = [...spec.speedSegments]
    if (segIndex > 0) {
      // extend previous to cover removed segment's range
      newSegs[segIndex - 1] = { ...newSegs[segIndex - 1], endFrame: newSegs[segIndex].endFrame }
    } else {
      // extend next to cover removed segment's range
      newSegs[segIndex + 1] = { ...newSegs[segIndex + 1], startFrame: newSegs[segIndex].startFrame }
    }
    newSegs.splice(segIndex, 1)
    setSpec(s => ({ ...s, speedSegments: newSegs }))
    setSelectedSegment(Math.max(0, segIndex - 1))
  }

  function resetSegments() {
    setSpec(s => ({ ...s, speedSegments: [] }))
    setSelectedSegment(null)
  }

  // ── Render flow ─────────────────────────────────────────────────────────────
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
          '&session_id=' + sessionId,
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
  useEffect(() => () => { if (v2vPollRef.current) clearTimeout(v2vPollRef.current) }, [])

  // ── AI edit ─────────────────────────────────────────────────────────────────
  async function runAiEdit() {
    if (!aiInstruction.trim() || aiLoading) return
    setAiLoading(true)
    setAiMessage(null)
    setAiPrev(spec)
    try {
      const meta = { durationFrames: spec.trimEndFrame, fps: spec.outputFps }
      const res = await fetch('/api/reels/ai-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, instruction: aiInstruction, current_spec: spec, video_meta: meta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Edit failed')
      // V2V intent detected — open cost confirm modal
      if (data.v2v_required) {
        setAiPrev(null)
        setAiMessage(data.summary)
        setV2vConfirm({ op: data.op === 'bg-remove' ? 'bg-remove' : 'restyle', cost: data.op === 'bg-remove' ? 0.21 : 0.95 })
        return
      }
      setSpec(data.spec)
      setAiMessage(data.summary || 'Done.')
      setAiInstruction('')
      if (!data.changed) setAiPrev(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Edit failed'
      setAiMessage('Error: ' + msg)
      setAiPrev(null)
    } finally {
      setAiLoading(false)
    }
  }

  function openV2VConfirm(op: 'restyle' | 'bg-remove') {
    setV2vConfirm({ op, cost: op === 'bg-remove' ? 0.21 : 0.95 })
  }

  async function doV2V() {
    if (!v2vConfirm || v2vLoading) return
    setV2vLoading(true)
    try {
      const res = await fetch('/api/reels/v2v', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          session_id: sessionId,
          video_url: spec.videoUrl,
          op: v2vConfirm.op,
          confirm: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'V2V failed')
      setV2vConfirm(null)
      if (data.output_url) {
        // Synchronous result (bg-remove)
        setSpec(s => ({ ...s, videoUrl: data.output_url }))
        setV2vStatus('done')
      } else if (data.job_id) {
        // Async (restyle) — poll for completion
        setV2vJobId(data.job_id)
        setV2vStatus('processing')
        pollV2V(data.job_id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transform failed'
      setAiMessage('Error: ' + msg)
      setV2vStatus('error')
    } finally {
      setV2vLoading(false)
    }
  }

  function pollV2V(jobId: string) {
    v2vPollRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/reels/v2v-status?job_id=' + jobId)
        const data = await res.json()
        if (data.status === 'done' && data.output_url) {
          setSpec(s => ({ ...s, videoUrl: data.output_url }))
          setV2vStatus('done')
          setV2vJobId(null)
        } else if (data.status === 'error') {
          setV2vStatus('error')
          setV2vJobId(null)
        } else {
          pollV2V(jobId)
        }
      } catch {
        pollV2V(jobId)
      }
    }, 5000)
  }

  // ── Caption suggestions ─────────────────────────────────────────────────────
  async function suggestCaptions() {
    if (!businessId || captionLoading) return
    setCaptionLoading(true)
    setCaptionSuggestions(null)
    try {
      const res = await fetch('/api/reels/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, session_id: sessionId }),
      })
      if (res.ok) {
        const data = await res.json()
        setCaptionSuggestions(data)
      }
    } catch { /* non-fatal */ }
    setCaptionLoading(false)
  }

  // ── Text layer helpers ──────────────────────────────────────────────────────
  function addTextLayer(preset?: Partial<TextLayer>) {
    const base: TextLayer = {
      id: nanoid(),
      text: 'Your text here',
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
      anim: 'fade',
    }
    const layer = preset ? { ...base, ...preset, id: nanoid() } : base
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

  // ── Computed values ─────────────────────────────────────────────────────────
  const trimStartPct = (spec.trimStartFrame / DEFAULT_FRAMES) * 100
  const trimEndPct   = (spec.trimEndFrame   / DEFAULT_FRAMES) * 100

  const durationSec = spec.speedSegments.length > 0
    ? (spec.speedSegments.reduce((sum, seg) =>
        sum + Math.ceil((seg.endFrame - seg.startFrame) / seg.speed), 0) / FPS).toFixed(1)
    : ((spec.trimEndFrame - spec.trimStartFrame) / FPS / spec.speed).toFixed(1)

  const totalSourceFrames = spec.trimEndFrame - spec.trimStartFrame

  // ── Styles ──────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600,
    color: active ? T.accent : T.muted, background: 'transparent',
    border: 'none', cursor: 'pointer',
    borderBottom: '2px solid ' + (active ? T.accent : 'transparent'),
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

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid ' + (active ? T.accent : T.border),
    background: active ? T.accentD : T.surface,
    color: active ? T.accent : T.textSub,
  })

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 600 }}>

      {/* ── Left: phone preview ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{
          width: 270, height: 480, background: '#0d0d0d', borderRadius: 36,
          border: '8px solid #1c1c1e',
          boxShadow: '0 0 0 1px #2a2a2a, 0 24px 60px rgba(0,0,0,0.85)',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* Notch */}
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 72, height: 20, background: '#0d0d0d',
            borderRadius: '0 0 10px 10px', zIndex: 10,
          }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 28, overflow: 'hidden' }}>
            <RemotionPreview spec={spec} width={254} />
            {/* 9:16 safe-zone overlay */}
            {showSafeZone && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
                {/* top unsafe zone (Instagram UI ~12%) */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: '12%',
                  background: 'rgba(255,80,80,0.18)',
                  borderBottom: '1px dashed rgba(255,80,80,0.6)',
                }} />
                {/* bottom unsafe zone (TikTok/IG buttons ~20%) */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '20%',
                  background: 'rgba(255,80,80,0.18)',
                  borderTop: '1px dashed rgba(255,80,80,0.6)',
                }} />
                {/* centre safe label */}
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%,-50%)',
                  fontSize: 9, color: 'rgba(127,184,151,0.8)',
                  fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                  pointerEvents: 'none',
                }}>
                  Safe Zone
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview meta + safe-zone toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 12, color: T.muted }}>
            {durationSec}s &nbsp;·&nbsp; {spec.outputWidth}&times;{spec.outputHeight} &nbsp;·&nbsp; {FPS}fps
          </div>
          <button
            onClick={() => setShowSafeZone(z => !z)}
            style={{
              fontSize: 10, color: showSafeZone ? T.accent : T.muted,
              background: 'none', border: '1px solid ' + (showSafeZone ? T.accent : T.border),
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {showSafeZone ? 'Hide' : 'Show'} safe zone
          </button>
        </div>
      </div>

      {/* ── Right: editor panel ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid ' + T.border, marginBottom: 16 }}>
          {(['trim','filter','text','ai','export'] as const).map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t === 'trim' ? 'Trim & Speed' : t === 'filter' ? 'Filter' : t === 'text' ? 'Text' : t === 'ai' ? 'Ask Aria ✶' : 'Export'}
            </button>
          ))}
        </div>

        {/* ── TRIM & SPEED TAB ─────────────────────────────────────────────── */}
        {tab === 'trim' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Trim bar */}
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
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: trimStartPct + '%',
                  width: (trimEndPct - trimStartPct) + '%',
                  background: T.accentD + '80', borderRadius: 6,
                }} />
                <div
                  onPointerDown={e => onTrimPointerDown(e, 'start')}
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: 'calc(' + trimStartPct + '% - 6px)',
                    width: 12, background: T.accent, borderRadius: 4,
                    cursor: 'ew-resize', zIndex: 2,
                  }}
                />
                <div
                  onPointerDown={e => onTrimPointerDown(e, 'end')}
                  style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: 'calc(' + trimEndPct + '% - 6px)',
                    width: 12, background: T.accent, borderRadius: 4,
                    cursor: 'ew-resize', zIndex: 2,
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: T.muted }}>
                <span>Start: {(spec.trimStartFrame / FPS).toFixed(2)}s</span>
                <span>Duration: {durationSec}s</span>
                <span>End: {(spec.trimEndFrame / FPS).toFixed(2)}s</span>
              </div>
            </div>

            {/* ── Variable speed ── */}
            {spec.speedSegments.length === 0 ? (
              // Global speed mode
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={labelStyle}>Speed (global)</div>
                  <button
                    onClick={initSpeedSegments}
                    style={{ fontSize: 11, color: T.accent, background: 'none', border: '1px solid ' + T.accent, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    + Variable speed
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[0.5, 1, 1.5, 2].map(s => (
                    <button key={s} onClick={() => setSpec(sp => ({ ...sp, speed: s }))}
                      style={chipStyle(spec.speed === s)}>
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // Per-segment speed mode
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={labelStyle}>Variable speed — {spec.speedSegments.length} segment{spec.speedSegments.length > 1 ? 's' : ''}</div>
                  <button
                    onClick={resetSegments}
                    style={{ fontSize: 11, color: T.red, background: 'none', border: '1px solid ' + T.red, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Reset
                  </button>
                </div>

                {/* Visual segment track */}
                <div style={{ position: 'relative', height: 44, display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid ' + T.border, marginBottom: 10 }}>
                  {spec.speedSegments.map((seg, i) => {
                    const segWidth = totalSourceFrames > 0
                      ? ((seg.endFrame - seg.startFrame) / totalSourceFrames) * 100
                      : (100 / spec.speedSegments.length)
                    const isSelected = selectedSegment === i
                    return (
                      <div
                        key={i}
                        onClick={() => setSelectedSegment(isSelected ? null : i)}
                        style={{
                          width: segWidth + '%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isSelected ? T.accentD : (i % 2 === 0 ? T.surface : T.card),
                          borderRight: i < spec.speedSegments.length - 1 ? '2px solid ' + T.border : 'none',
                          cursor: 'pointer',
                          flexDirection: 'column', gap: 2,
                          boxShadow: isSelected ? 'inset 0 0 0 2px ' + T.accent : 'none',
                          transition: 'background 0.12s',
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? T.accent : T.textSub }}>{seg.speed}x</span>
                        <span style={{ fontSize: 9, color: T.muted }}>
                          {((seg.endFrame - seg.startFrame) / FPS).toFixed(1)}s
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Selected segment controls */}
                {selectedSegment !== null && spec.speedSegments[selectedSegment] && (
                  <div style={{ background: T.card, borderRadius: 8, padding: '12px 14px', border: '1px solid ' + T.accent + '60', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: T.accent, fontWeight: 700, marginBottom: 8 }}>
                      Segment {selectedSegment + 1} of {spec.speedSegments.length} &nbsp;·&nbsp;
                      {((spec.speedSegments[selectedSegment].endFrame - spec.speedSegments[selectedSegment].startFrame) / FPS).toFixed(1)}s source
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={labelStyle}>Playback speed</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {SPEED_OPTIONS.map(s => (
                          <button key={s}
                            onClick={() => setSegmentSpeed(selectedSegment, s)}
                            style={chipStyle(spec.speedSegments[selectedSegment].speed === s)}>
                            {s}x
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => splitSegment(selectedSegment)}
                        style={{ ...btnStyle('ghost'), fontSize: 12, padding: '6px 12px' }}
                      >
                        Split in half
                      </button>
                      {spec.speedSegments.length > 1 && (
                        <button
                          onClick={() => deleteSegment(selectedSegment)}
                          style={{ ...btnStyle('danger'), fontSize: 12, padding: '6px 12px' }}
                        >
                          Delete segment
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                  Click a segment to select it, then adjust its speed. &quot;Split in half&quot; divides it into two equal segments.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FILTER TAB ───────────────────────────────────────────────────── */}
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

        {/* ── TEXT TAB ─────────────────────────────────────────────────────── */}
        {tab === 'text' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Presets */}
            <div>
              <div style={labelStyle}>Quick presets</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEXT_PRESETS.map(preset => (
                  <button key={preset.label}
                    onClick={() => addTextLayer(preset.patch)}
                    style={{ ...chipStyle(false), fontSize: 11 }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <button style={btnStyle('primary')} onClick={() => addTextLayer()}>
              + Add custom text layer
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
                        <input type="color" value={layer.color}
                          style={{ ...inputStyle, padding: '2px', height: 36, cursor: 'pointer' }}
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
                    <div>
                      <div style={labelStyle}>Entrance animation</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['none','fade','slide-up','pop'] as TextAnim[]).map(anim => (
                          <button key={anim} onClick={() => updateText(layer.id, { anim })}
                            style={chipStyle(layer.anim === anim)}>
                            {anim === 'slide-up' ? 'Slide up' : anim.charAt(0).toUpperCase() + anim.slice(1)}
                          </button>
                        ))}
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
                {(!editingText || editingText.id !== layer.id) && (
                  <div style={{ fontSize: 13, color: T.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {layer.text}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ASK ARIA TAB ─────────────────────────────────────────────────── */}
        {tab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={labelStyle}>Tell Aria what to change</div>
              <textarea
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                rows={3}
                placeholder="e.g. bold hook caption at the top, warm cinematic filter, speed up the slow middle section 2x, trim the dead first second"
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                disabled={aiLoading}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['Bold hook caption', 'Warm cinematic look', 'Speed up middle 2x', 'Auto-captions', 'Cool filter', 'Trim dead intro'].map(chip => (
                <button key={chip} style={chipStyle(false)}
                  onClick={() => setAiInstruction(chip)}
                  disabled={aiLoading}>
                  {chip}
                </button>
              ))}
            </div>
            <button
              style={{ ...btnStyle('primary'), opacity: aiLoading || !aiInstruction.trim() ? 0.5 : 1 }}
              disabled={aiLoading || !aiInstruction.trim()}
              onClick={runAiEdit}>
              {aiLoading ? 'Aria is editing…' : 'Apply edit ✶'}
            </button>
            {aiMessage && (
              <div style={{ fontSize: 13, color: T.textSub, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{aiMessage}</span>
                {aiPrev && (
                  <button style={{ ...chipStyle(false), fontSize: 11, padding: '4px 10px' }}
                    onClick={() => { setSpec(aiPrev); setAiPrev(null); setAiMessage(null) }}>
                    Undo
                  </button>
                )}
              </div>
            )}
            {v2vStatus === 'processing' && v2vJobId && (
              <div style={{ fontSize: 13, color: T.textSub }}>AI transform running… this takes 60–90 seconds.</div>
            )}
            {v2vStatus === 'done' && (
              <div style={{ fontSize: 13, color: T.accent }}>Transform complete — video updated.</div>
            )}
            <div style={{ borderTop: '1px solid ' + T.border, paddingTop: 16 }}>
              <div style={labelStyle}>Transform video (AI · uses credits)</div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                Re-generates the actual clip frames. Slower than instant edits above.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btnStyle('ghost')} onClick={() => openV2VConfirm('restyle')}>
                  Restyle clip — ~$0.95
                </button>
                <button style={btnStyle('ghost')} onClick={() => openV2VConfirm('bg-remove')}>
                  Remove background — ~$0.21
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── EXPORT TAB ───────────────────────────────────────────────────── */}
        {tab === 'export' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={labelStyle}>Output resolution</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([{w:1080,h:1920,label:'1080p'},{w:720,h:1280,label:'720p'},{w:540,h:960,label:'540p'}] as const).map(r => (
                  <button key={r.label}
                    onClick={() => setSpec(s => ({ ...s, outputWidth: r.w, outputHeight: r.h }))}
                    style={chipStyle(spec.outputWidth === r.w)}>
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
                <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: renderProgress + '%',
                    background: T.accent, transition: 'width 0.5s',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>This may take 1–3 minutes. You can leave this page.</div>
              </div>
            )}

            {renderState === 'done' && renderUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ color: T.accent, fontSize: 14, fontWeight: 600 }}>Export complete!</div>
                <a href={renderUrl} download="reel.mp4"
                  style={{ ...btnStyle('primary'), textDecoration: 'none', textAlign: 'center' }}>
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

            {/* Caption suggestions */}
            <div style={{ borderTop: '1px solid ' + T.border, paddingTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={labelStyle}>Aria caption suggestions</div>
                <button
                  onClick={suggestCaptions}
                  disabled={captionLoading}
                  style={{
                    fontSize: 11, color: T.accent, background: 'none',
                    border: '1px solid ' + T.accent, borderRadius: 6,
                    padding: '4px 12px', cursor: captionLoading ? 'wait' : 'pointer', fontWeight: 600,
                  }}
                >
                  {captionLoading ? 'Generating…' : 'Suggest captions'}
                </button>
              </div>

              {captionSuggestions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {captionSuggestions.social.map((item, i) => (
                    <div key={i} style={{
                      background: T.card, borderRadius: 8, padding: '10px 12px',
                      border: '1px solid ' + T.border,
                    }}>
                      <p style={{ fontSize: 12, color: T.text, margin: '0 0 6px', lineHeight: 1.5 }}>
                        {item.caption}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {item.hashtags.map(h => (
                          <span key={h} style={{ fontSize: 10, color: T.accent, background: T.accentD + '60', borderRadius: 4, padding: '2px 6px' }}>
                            #{h}
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => navigator.clipboard.writeText(item.caption + '\n\n' + item.hashtags.map(h => '#' + h).join(' '))}
                          style={{ ...chipStyle(false), fontSize: 10, padding: '4px 10px' }}>
                          Copy
                        </button>
                        {onCaptionChosen && (
                          <button
                            onClick={() => onCaptionChosen(item.caption + '\n\n' + item.hashtags.map(h => '#' + h).join(' '))}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                              cursor: 'pointer', border: 'none',
                              background: T.accent, color: '#0b0f0c',
                            }}>
                            Use in publish
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* V2V cost confirm modal — position:fixed so it overlays regardless of parent */}
      {v2vConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, border: '1px solid ' + T.border, borderRadius: 12, padding: 20, width: 300 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 10 }}>
              {v2vConfirm.op === 'restyle' ? 'Restyle clip' : 'Remove background'}
            </div>
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6, marginBottom: 14 }}>
              {v2vConfirm.op === 'restyle'
                ? 'AI re-generates every frame in a new style. Takes 60–90 seconds.'
                : 'Removes the background, keeps your subject and audio. Takes ~30 seconds.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: T.card, borderRadius: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: T.textSub }}>Estimated cost</span>
              <span style={{ fontSize: 14, color: T.accent, fontWeight: 600 }}>{'~$' + v2vConfirm.cost.toFixed(2) + ' AUD'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnStyle('ghost')} onClick={() => setV2vConfirm(null)}>Cancel</button>
              <button
                style={{ ...btnStyle('primary'), opacity: v2vLoading ? 0.6 : 1 }}
                disabled={v2vLoading}
                onClick={doV2V}>
                {v2vLoading ? 'Starting…' : ('Confirm $' + v2vConfirm.cost.toFixed(2))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

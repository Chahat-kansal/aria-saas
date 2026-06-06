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
  bg:      '#09090c',
  surface: '#141418',
  card:    '#1c1c22',
  border:  '#2a2a35',
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

// ── Tool rail icon definitions ─────────────────────────────────────────────────
const TOOL_RAIL = [
  {
    id: 'trim' as const,
    label: 'Trim',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
        <path d="M6 9v6M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>
      </svg>
    ),
  },
  {
    id: 'filter' as const,
    label: 'Filter',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.64 5.64l2.83 2.83M15.54 15.54l2.83 2.83M5.64 18.36l2.83-2.83M15.54 8.46l2.83-2.83"/>
      </svg>
    ),
  },
  {
    id: 'text' as const,
    label: 'Text',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
      </svg>
    ),
  },
  {
    id: 'ai' as const,
    label: 'Aria',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ),
  },
  {
    id: 'export' as const,
    label: 'Export',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
      </svg>
    ),
  },
  {
    id: 'audio' as const,
    label: 'Audio',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zM18 19a3 3 0 100-6 3 3 0 000 6z"/>
      </svg>
    ),
  },
  {
    id: 'effect' as const,
    label: 'Effects',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>
      </svg>
    ),
  },
  {
    id: 'transition' as const,
    label: 'Cuts',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3l14 9-14 9V3z"/>
        <path d="M19 3v18"/>
      </svg>
    ),
  },
]

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

  const [tab, setTab] = useState<'trim'|'filter'|'text'|'ai'|'export'|'audio'|'effect'|'transition'>('trim')
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState<string|null>(null)
  const [aiPrev, setAiPrev] = useState<EditSpec|null>(null)
  const [v2vConfirm, setV2vConfirm] = useState<{op:'restyle'|'bg-remove'; cost: number}|null>(null)
  const [v2vLoading, setV2vLoading] = useState(false)
  const [v2vJobId, setV2vJobId] = useState<string|null>(null)
  const [v2vStatus, setV2vStatus] = useState<'idle'|'processing'|'done'|'error'>('idle')
  const v2vPollRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [publishState, setPublishState] = useState<'idle'|'loading'|'done'|'error'>('idle')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram'])
  const [publishCaption, setPublishCaption] = useState('')
  const [showPublishPanel, setShowPublishPanel] = useState(false)
  const [renderState, setRenderState] = useState<'idle'|'submitting'|'rendering'|'done'|'error'>('idle')
  const [renderProgress, setRenderProgress] = useState(0)
  const [renderUrl, setRenderUrl] = useState<string|null>(null)
  const [renderError, setRenderError] = useState<string|null>(null)
  const [editingText, setEditingText] = useState<TextLayer|null>(null)
  const [selectedSegment, setSelectedSegment] = useState<number|null>(null)
  const [showSafeZone, setShowSafeZone] = useState(false)
  const [captionSuggestions, setCaptionSuggestions] = useState<CaptionSuggestions|null>(null)
  const [captionLoading, setCaptionLoading] = useState(false)
  const [newAudioUrl, setNewAudioUrl] = useState('')
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
      newSegs[segIndex - 1] = { ...newSegs[segIndex - 1], endFrame: newSegs[segIndex].endFrame }
    } else {
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

  async function publishToMarketer() {
    if (!renderUrl || publishState === 'loading') return
    setPublishState('loading')
    try {
      const res = await fetch('/api/reels/publish-marketer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, session_id: sessionId, video_url: renderUrl, caption: publishCaption }),
      })
      if (!res.ok) throw new Error('Failed')
      setPublishState('done')
    } catch {
      setPublishState('error')
    }
  }

  async function publishToSocials() {
    if (!renderUrl || publishState === 'loading') return
    setPublishState('loading')
    try {
      const res = await fetch('/api/reels/publish-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, video_url: renderUrl, caption: publishCaption, platforms: selectedPlatforms }),
      })
      if (!res.ok) throw new Error('Failed')
      setPublishState('done')
      setShowPublishPanel(false)
    } catch {
      setPublishState('error')
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
        setSpec(s => ({ ...s, videoUrl: data.output_url }))
        setV2vStatus('done')
      } else if (data.job_id) {
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
    } catch (e) { console.error('[non-fatal]', e) }
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

  // ── Shared style helpers ────────────────────────────────────────────────────
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
    color: variant === 'primary' ? '#09090c' : T.text,
  })

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: '1px solid ' + (active ? T.accent : T.border),
    background: active ? T.accentD : T.surface,
    color: active ? T.accent : T.textSub,
  })

  // ── Panel renderers ─────────────────────────────────────────────────────────

  function renderTrimPanel() {
    return (
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

        {/* Variable speed */}
        {spec.speedSegments.length === 0 ? (
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
    )
  }

  function renderFilterPanel() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div style={labelStyle}>Filter preset</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
    )
  }

  function renderTextPanel() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
    )
  }

  function renderAiPanel() {
    return (
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
    )
  }

  function renderExportPanel() {
    return (
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.text }}>
          <input type="checkbox" checked={spec.watermark}
            onChange={e => setSpec(s => ({ ...s, watermark: e.target.checked }))} />
          Add Aria watermark
        </label>

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

            {/* Publish section */}
            <div style={{ borderTop: '1px solid ' + T.border, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={labelStyle}>Publish</div>
              <button
                style={{ ...btnStyle('ghost'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={() => setShowPublishPanel(p => !p)}>
                Publish to socials (Instagram · TikTok · Facebook)
              </button>
              <button
                style={{ ...btnStyle('primary'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: publishState === 'loading' ? 0.6 : 1 }}
                onClick={publishToMarketer}
                disabled={publishState === 'loading'}>
                {publishState === 'loading' ? 'Adding to plan…' : 'Send to Aria Marketer'}
              </button>
              {publishState === 'done' && (
                <div style={{ fontSize: 13, color: T.accent }}>Added to Aria Marketer</div>
              )}
              {publishState === 'error' && (
                <div style={{ fontSize: 13, color: T.red }}>Publish failed — try again</div>
              )}
            </div>

            {showPublishPanel && (
              <div style={{ background: T.card, border: '1px solid ' + T.border, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={labelStyle}>Platforms</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['instagram', 'tiktok', 'facebook', 'youtube'] as const).map(p => (
                    <button key={p} style={chipStyle(selectedPlatforms.includes(p))}
                      onClick={() => setSelectedPlatforms(prev =>
                        prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}>
                      {p}
                    </button>
                  ))}
                </div>
                <div style={labelStyle}>Caption</div>
                <textarea rows={3} value={publishCaption}
                  onChange={e => setPublishCaption(e.target.value)}
                  placeholder="Write a caption or use Aria's suggestions below…"
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                <button style={{ ...btnStyle('primary'), opacity: publishState === 'loading' || selectedPlatforms.length === 0 ? 0.5 : 1 }}
                  onClick={publishToSocials}
                  disabled={publishState === 'loading' || selectedPlatforms.length === 0}>
                  Queue for publishing
                </button>
                <div style={{ fontSize: 11, color: T.muted }}>
                  Platform connections are set up in Aria Settings. Posts are queued and sent when your account is connected.
                </div>
              </div>
            )}
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
                          background: T.accent, color: '#09090c',
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
    )
  }

  // ── Audio panel ─────────────────────────────────────────────────────────────
  function renderAudioPanel() {
    function addAudioLayer() {
      if (!newAudioUrl.trim()) return
      const layer = {
        id: nanoid(),
        src: newAudioUrl.trim(),
        startFrame: 0,
        volume: 0.8,
        fadeIn: 15,
        fadeOut: 15,
      }
      setSpec(s => ({ ...s, audioLayers: [...s.audioLayers, layer] }))
      setNewAudioUrl('')
    }

    function removeAudioLayer(id: string) {
      setSpec(s => ({ ...s, audioLayers: s.audioLayers.filter(l => l.id !== id) }))
    }

    function updateAudioLayer(id: string, patch: Partial<typeof spec.audioLayers[0]>) {
      setSpec(s => ({
        ...s,
        audioLayers: s.audioLayers.map(l => l.id === id ? { ...l, ...patch } : l),
      }))
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={labelStyle}>Background audio overlay</div>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 4 }}>
          Add a music or sound-effect track that plays over your video. Paste a direct audio URL (.mp3, .wav, .ogg).
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newAudioUrl}
            onChange={e => setNewAudioUrl(e.target.value)}
            placeholder="https://… audio URL"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={addAudioLayer}
            disabled={!newAudioUrl.trim()}
            style={{ ...btnStyle('primary'), padding: '7px 14px', opacity: newAudioUrl.trim() ? 1 : 0.5, flexShrink: 0 }}
          >
            Add
          </button>
        </div>

        {spec.audioLayers.length === 0 && (
          <div style={{ color: T.muted, fontSize: 13 }}>No audio layers. Add one above.</div>
        )}

        {spec.audioLayers.map((layer, i) => (
          <div key={layer.id} style={{ background: T.card, borderRadius: 10, padding: '12px 14px', border: '1px solid ' + T.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Audio track {i + 1}</span>
              <button onClick={() => removeAudioLayer(layer.id)}
                style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Remove
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {layer.src}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={labelStyle}>Volume — {Math.round(layer.volume * 100)}%</div>
                <input type="range" min={0} max={1} step={0.05}
                  value={layer.volume}
                  onChange={e => updateAudioLayer(layer.id, { volume: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: T.accent }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={labelStyle}>Fade in (frames)</div>
                  <input type="number" min={0} max={60} value={layer.fadeIn} style={inputStyle}
                    onChange={e => updateAudioLayer(layer.id, { fadeIn: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <div style={labelStyle}>Fade out (frames)</div>
                  <input type="number" min={0} max={60} value={layer.fadeOut} style={inputStyle}
                    onChange={e => updateAudioLayer(layer.id, { fadeOut: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <div style={labelStyle}>Start at frame</div>
                <input type="number" min={0} value={layer.startFrame} style={inputStyle}
                  onChange={e => updateAudioLayer(layer.id, { startFrame: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Effect panel ─────────────────────────────────────────────────────────────
  function renderEffectPanel() {
    const EFFECT_PRESETS: Array<{ label: string; filter: Filter; intensity: number }> = [
      { label: 'Cinematic', filter: 'dramatic', intensity: 0.85 },
      { label: 'Golden Hour', filter: 'golden', intensity: 0.9 },
      { label: 'Moody B&W', filter: 'noir', intensity: 1 },
      { label: 'Warm Glow', filter: 'warm', intensity: 0.8 },
      { label: 'Cool Edit', filter: 'cool', intensity: 0.75 },
      { label: 'Vivid Pop', filter: 'vivid', intensity: 1 },
      { label: 'Clean Bright', filter: 'brightness', intensity: 0.7 },
      { label: 'Vintage', filter: 'sepia', intensity: 0.6 },
    ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={labelStyle}>One-tap effect presets</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {EFFECT_PRESETS.map(preset => {
            const isActive = spec.filter === preset.filter && Math.abs(spec.filterIntensity - preset.intensity) < 0.05
            return (
              <button
                key={preset.label}
                onClick={() => setSpec(s => ({ ...s, filter: preset.filter, filterIntensity: preset.intensity }))}
                style={{
                  padding: '10px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid ' + (isActive ? T.accent : T.border),
                  background: isActive ? T.accentD : T.surface,
                  color: isActive ? T.accent : T.textSub,
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid ' + T.border, paddingTop: 16 }}>
          <div style={labelStyle}>Fine-tune</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8 }}>
              Active: <span style={{ color: T.accent, fontWeight: 600 }}>{FILTER_LABELS[spec.filter]}</span>
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
          <button
            onClick={() => setSpec(s => ({ ...s, filter: 'none', filterIntensity: 1 }))}
            style={{ ...btnStyle('ghost'), fontSize: 12, padding: '6px 12px' }}
          >
            Reset to original
          </button>
        </div>
      </div>
    )
  }

  // ── Transition panel ─────────────────────────────────────────────────────────
  function renderTransitionPanel() {
    const TRANSITION_OPTIONS: Array<{ id: 'none'|'fade'|'whip'; label: string; desc: string }> = [
      { id: 'none',  label: 'Cut',      desc: 'Hard cut between segments' },
      { id: 'fade',  label: 'Fade',     desc: 'Smooth crossfade (12 frames)' },
      { id: 'whip',  label: 'Whip pan', desc: 'Motion-blur wipe effect' },
    ]

    if (spec.speedSegments.length === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            Transitions apply between variable speed segments. Create segments in the Trim panel first.
          </div>
          <button
            onClick={() => { initSpeedSegments(); setTab('trim') }}
            style={btnStyle('primary')}
          >
            Open Trim + create segments
          </button>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={labelStyle}>Segment transitions</div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>
          {spec.speedSegments.length} segment{spec.speedSegments.length > 1 ? 's' : ''}. Set the transition at the end of each segment.
        </div>

        {spec.speedSegments.map((seg, i) => {
          if (i === spec.speedSegments.length - 1) return null
          const currentTransition = seg.transition ?? 'none'
          return (
            <div key={i} style={{ background: T.card, borderRadius: 8, padding: '12px 14px', border: '1px solid ' + T.border }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textSub, marginBottom: 10 }}>
                After segment {i + 1} ({seg.speed}x → {spec.speedSegments[i + 1].speed}x)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TRANSITION_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSpec(s => ({
                      ...s,
                      speedSegments: s.speedSegments.map((sg, idx) =>
                        idx === i ? { ...sg, transition: opt.id } : sg
                      ),
                    }))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid ' + (currentTransition === opt.id ? T.accent : T.border),
                      background: currentTransition === opt.id ? T.accentD : T.surface,
                      color: currentTransition === opt.id ? T.accent : T.textSub,
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{opt.label}</span>
                    <span style={{ fontSize: 10, color: currentTransition === opt.id ? T.accent : T.muted }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        <div style={{ borderTop: '1px solid ' + T.border, paddingTop: 14 }}>
          <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            Transitions are applied during export. Whip pan works best between segments with a speed change of 2x or more.
          </div>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 620,
      background: T.bg, color: T.text,
      fontFamily: 'Inter, system-ui, sans-serif',
      borderRadius: 12, overflow: 'hidden',
      border: '1px solid ' + T.border,
    }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid ' + T.border, padding: '0 16px', flexShrink: 0,
        background: T.surface,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>Reel Studio</span>
          {v2vStatus === 'processing' && (
            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>AI transform running…</span>
          )}
          {v2vStatus === 'done' && (
            <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>Transform complete</span>
          )}
        </div>
        <button
          onClick={() => setShowSafeZone(v => !v)}
          style={{
            fontSize: 11, background: 'none', cursor: 'pointer', fontWeight: 600,
            color: showSafeZone ? T.accent : T.muted,
            border: '1px solid ' + (showSafeZone ? T.accent : T.border),
            borderRadius: 6, padding: '4px 10px',
          }}
        >
          {showSafeZone ? 'Hide safe zone' : 'Safe zone'}
        </button>
      </div>

      {/* ── MAIN ROW ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── TOOL RAIL ──────────────────────────────────────────────────────── */}
        <nav style={{
          width: 56, display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '10px 0', gap: 2, borderRight: '1px solid ' + T.border,
          flexShrink: 0, background: T.surface,
        }}>
          {TOOL_RAIL.map(tool => (
            <button
              key={tool.id}
              onClick={() => setTab(tool.id)}
              title={tool.label}
              style={{
                width: 44, height: 44, borderRadius: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                border: 'none', cursor: 'pointer',
                background: tab === tool.id ? T.accentD + 'cc' : 'transparent',
                color: tab === tool.id ? T.accent : T.muted,
                transition: 'all 0.15s',
              }}
            >
              {tool.icon}
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.2, lineHeight: 1 }}>{tool.label}</span>
            </button>
          ))}
        </nav>

        {/* ── SLIDING PANEL ──────────────────────────────────────────────────── */}
        <div style={{
          width: 276, flexShrink: 0,
          borderRight: '1px solid ' + T.border,
          overflowY: 'auto', background: T.surface,
        }}>
          <div style={{ padding: 16 }}>
            {tab === 'trim'       && renderTrimPanel()}
            {tab === 'filter'     && renderFilterPanel()}
            {tab === 'text'       && renderTextPanel()}
            {tab === 'ai'         && renderAiPanel()}
            {tab === 'export'     && renderExportPanel()}
            {tab === 'audio'      && renderAudioPanel()}
            {tab === 'effect'     && renderEffectPanel()}
            {tab === 'transition' && renderTransitionPanel()}
          </div>
        </div>

        {/* ── CANVAS ─────────────────────────────────────────────────────────── */}
        <main style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#09090c', gap: 14, padding: '20px 24px', overflow: 'auto',
        }}>

          {/* Phone preview */}
          <div style={{ position: 'relative' }}>
            <RemotionPreview spec={spec} width={270} />
          </div>

          {/* AI quick bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 360 }}>
            <input
              value={aiInstruction}
              onChange={e => setAiInstruction(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !aiLoading && aiInstruction.trim()) runAiEdit() }}
              placeholder="Ask Aria to edit…"
              disabled={aiLoading}
              style={{
                flex: 1, background: T.card,
                border: '1px solid ' + T.border,
                borderRadius: 8, padding: '8px 12px',
                color: T.text, fontSize: 13, outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <button
              onClick={runAiEdit}
              disabled={aiLoading || !aiInstruction.trim()}
              style={{
                ...btnStyle('primary'),
                padding: '8px 14px', flexShrink: 0,
                opacity: aiLoading || !aiInstruction.trim() ? 0.5 : 1,
              }}
            >
              {aiLoading ? '…' : '✶'}
            </button>
          </div>

          {aiMessage && (
            <div style={{
              fontSize: 12, color: T.textSub,
              display: 'flex', gap: 8, alignItems: 'center',
              maxWidth: 360, width: '100%',
            }}>
              <span style={{ flex: 1 }}>{aiMessage}</span>
              {aiPrev && (
                <button
                  onClick={() => { setSpec(aiPrev); setAiPrev(null); setAiMessage(null) }}
                  style={{ ...chipStyle(false), fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── TIMELINE STRIP ───────────────────────────────────────────────────── */}
      <div style={{
        height: 76, flexShrink: 0,
        borderTop: '1px solid ' + T.border,
        background: T.surface,
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12,
      }}>
        <span style={{ fontSize: 9, color: T.muted, flexShrink: 0, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Timeline</span>

        <div
          ref={trimBarRef}
          onPointerMove={onTrimPointerMove}
          onPointerUp={onTrimPointerUp}
          style={{
            flex: 1, height: 44, background: T.card,
            borderRadius: 8, border: '1px solid ' + T.border,
            position: 'relative', cursor: 'default', userSelect: 'none', overflow: 'hidden',
          }}
        >
          {/* Active range highlight */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: trimStartPct + '%',
            width: (trimEndPct - trimStartPct) + '%',
            background: T.accentD + '90', borderRadius: 4,
          }} />
          {/* Start handle */}
          <div
            onPointerDown={e => onTrimPointerDown(e, 'start')}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: 'calc(' + trimStartPct + '% - 5px)',
              width: 10, background: T.accent, borderRadius: 4,
              cursor: 'ew-resize', zIndex: 2,
            }}
          />
          {/* End handle */}
          <div
            onPointerDown={e => onTrimPointerDown(e, 'end')}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: 'calc(' + trimEndPct + '% - 5px)',
              width: 10, background: T.accent, borderRadius: 4,
              cursor: 'ew-resize', zIndex: 2,
            }}
          />
          {/* Time labels */}
          <div style={{
            position: 'absolute', bottom: 5, left: 10, right: 10,
            display: 'flex', justifyContent: 'space-between', pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 9, color: T.muted }}>{(spec.trimStartFrame / FPS).toFixed(1)}s</span>
            <span style={{ fontSize: 10, color: T.accent, fontWeight: 700 }}>{durationSec}s</span>
            <span style={{ fontSize: 9, color: T.muted }}>{(spec.trimEndFrame / FPS).toFixed(1)}s</span>
          </div>
        </div>

        <button
          onClick={() => setTab('export')}
          style={{ ...btnStyle('primary'), padding: '8px 14px', fontSize: 12, flexShrink: 0 }}
        >
          Export
        </button>
      </div>

      {/* ── V2V COST CONFIRM MODAL ────────────────────────────────────────────── */}
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

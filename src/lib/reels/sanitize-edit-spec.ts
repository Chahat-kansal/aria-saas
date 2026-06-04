import type { EditSpec, Filter, TextLayer, SpeedSegment } from '@/remotion/types'

const VALID_FILTERS = new Set<Filter>([
  'none', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia',
  'warm', 'cool', 'dramatic', 'vivid', 'noir', 'golden',
])

const VALID_ANIMS = new Set<string>(['none', 'fade', 'slide-up', 'pop'])
const VALID_TRANSITIONS = new Set<string>(['none', 'fade', 'whip'])

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function toInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? Math.round(n) : fallback
}

function toFloat(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return isFinite(n) ? n : fallback
}

function sanitizeTextLayers(raw: unknown, maxFrame: number): TextLayer[] {
  if (!Array.isArray(raw)) return []
  const out: TextLayer[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const l = item as Record<string, unknown>
    // Required fields — drop the layer if any are missing/wrong type
    if (typeof l.id !== 'string' || !l.id) continue
    if (typeof l.text !== 'string') continue
    if (typeof l.fontSize !== 'number' && typeof l.fontSize !== 'string') continue
    if (typeof l.color !== 'string') continue
    if (typeof l.fontFamily !== 'string') continue

    const start = clamp(toInt(l.startFrame), 0, maxFrame)
    let end = clamp(toInt(l.endFrame, maxFrame), 0, maxFrame)
    if (end <= start) end = Math.min(maxFrame, start + 30)

    out.push({
      id: l.id,
      text: l.text,
      startFrame: start,
      endFrame: end,
      fontSize: clamp(toFloat(l.fontSize, 48), 8, 300),
      color: typeof l.color === 'string' ? l.color : '#ffffff',
      fontFamily: typeof l.fontFamily === 'string' ? l.fontFamily : 'Inter',
      x: clamp(toFloat(l.x, 50), 0, 100),
      y: clamp(toFloat(l.y, 80), 0, 100),
      bold: !!l.bold,
      shadow: !!l.shadow,
      background: !!l.background,
      backgroundColor: typeof l.backgroundColor === 'string' ? l.backgroundColor : 'rgba(0,0,0,0.5)',
      anim: VALID_ANIMS.has(l.anim as string) ? (l.anim as TextLayer['anim']) : 'none',
    })
  }
  return out
}

function sanitizeSpeedSegments(raw: unknown, maxFrame: number): SpeedSegment[] {
  if (!Array.isArray(raw)) return []
  const out: SpeedSegment[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const s = item as Record<string, unknown>
    const start = clamp(toInt(s.startFrame), 0, maxFrame)
    let end = clamp(toInt(s.endFrame, maxFrame), 0, maxFrame)
    if (end <= start) end = Math.min(maxFrame, start + 10)
    const speed = clamp(toFloat(s.speed, 1), 0.25, 4)
    const transition = VALID_TRANSITIONS.has(s.transition as string)
      ? (s.transition as SpeedSegment['transition'])
      : 'none'
    out.push({ startFrame: start, endFrame: end, speed, transition })
  }
  return out
}

/**
 * Clamps and validates a raw (possibly LLM-generated) object into a safe EditSpec.
 * NEVER throws. If anything is wrong, returns `fallback` unchanged.
 * AI cannot change: videoUrl, outputWidth, outputHeight, outputFps, audioLayers.
 */
export function sanitizeEditSpec(
  raw: unknown,
  meta: { durationFrames: number; fps: number },
  fallback: EditSpec,
): EditSpec {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
    const r = raw as Record<string, unknown>
    const maxFrame = Math.max(1, meta.durationFrames)

    const trimStart = clamp(toInt(r.trimStartFrame), 0, maxFrame)
    let trimEnd = clamp(toInt(r.trimEndFrame, maxFrame), 0, maxFrame)
    if (trimEnd <= trimStart) trimEnd = Math.min(maxFrame, trimStart + 10)

    const filter: Filter = VALID_FILTERS.has(r.filter as Filter)
      ? (r.filter as Filter)
      : 'none'

    const filterIntensity = clamp(toFloat(r.filterIntensity, 1), 0, 1)
    const speed = clamp(toFloat(r.speed, 1), 0.25, 4)

    return {
      // Locked — AI cannot modify these
      videoUrl:     fallback.videoUrl,
      outputWidth:  fallback.outputWidth,
      outputHeight: fallback.outputHeight,
      outputFps:    fallback.outputFps,
      audioLayers:  fallback.audioLayers,
      // Sanitized
      trimStartFrame:  trimStart,
      trimEndFrame:    trimEnd,
      speed,
      filter,
      filterIntensity,
      watermark: typeof r.watermark === 'boolean' ? r.watermark : fallback.watermark,
      textLayers:    sanitizeTextLayers(r.textLayers, maxFrame),
      speedSegments: sanitizeSpeedSegments(r.speedSegments, maxFrame),
    }
  } catch {
    return fallback
  }
}

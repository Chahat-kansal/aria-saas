import React from 'react'
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion'
import { type EditSpec, type SpeedSegment, FILTER_CSS } from './types'

interface Props {
  spec: EditSpec
}

// Interpolate each CSS filter parameter toward neutral by (1 - intensity)
function scaleFilter(css: string, intensity: number): string {
  if (!css || intensity <= 0) return ''
  if (intensity >= 1) return css
  // Filters whose neutral value is 0 (not 1)
  const zeroNeutral = new Set(['grayscale', 'sepia', 'invert', 'blur', 'opacity'])
  return css.replace(/([a-z-]+)\(([\d.]+)(deg)?\)/g, (_, fn, valStr, deg) => {
    const val = parseFloat(valStr)
    const neutral = zeroNeutral.has(fn) ? 0 : 1
    const scaled = neutral + (val - neutral) * intensity
    return fn + '(' + scaled.toFixed(4) + (deg || '') + ')'
  })
}

// Compute per-segment output frame offsets (pure, no side-effects)
function buildSegmentRanges(segments: SpeedSegment[]) {
  return segments.reduce<Array<{ seg: SpeedSegment; from: number; outputFrames: number }>>(
    (acc, seg) => {
      const prev = acc[acc.length - 1]
      const from = prev ? prev.from + prev.outputFrames : 0
      const outputFrames = Math.ceil((seg.endFrame - seg.startFrame) / seg.speed)
      return [...acc, { seg, from, outputFrames }]
    },
    [],
  )
}

export function ReelComposition({ spec }: Props) {
  const frame = useCurrentFrame()

  const filterCss = scaleFilter(FILTER_CSS[spec.filter] || '', spec.filterIntensity ?? 1)
  const hasSegments = spec.speedSegments && spec.speedSegments.length > 0
  const segmentRanges = hasSegments ? buildSegmentRanges(spec.speedSegments) : []

  const totalOutputFrames = hasSegments
    ? segmentRanges.reduce((sum, r) => sum + r.outputFrames, 0)
    : (spec.trimEndFrame >= 0 ? spec.trimEndFrame - spec.trimStartFrame : 300)

  return (
    <AbsoluteFill style={{ background: '#000' }}>

      {/* ── Video: per-segment Sequences or single OffthreadVideo ── */}
      {hasSegments ? (
        segmentRanges.map(({ seg, from, outputFrames }, i) => (
          <Sequence key={i} from={from} durationInFrames={outputFrames}>
            <OffthreadVideo
              src={spec.videoUrl}
              startFrom={seg.startFrame}
              endAt={seg.endFrame}
              playbackRate={seg.speed}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: filterCss || undefined,
              }}
            />
          </Sequence>
        ))
      ) : (
        <OffthreadVideo
          src={spec.videoUrl}
          startFrom={spec.trimStartFrame}
          endAt={spec.trimEndFrame >= 0 ? spec.trimEndFrame : undefined}
          playbackRate={spec.speed}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: filterCss || undefined,
          }}
        />
      )}

      {/* ── Text layers ── */}
      {spec.textLayers.map(layer => {
        if (frame < layer.startFrame || frame > layer.endFrame) return null

        const span = layer.endFrame - layer.startFrame
        const animFrames = Math.max(1, Math.min(10, Math.floor(span * 0.15)))
        const relFrame = frame - layer.startFrame

        const opacity = interpolate(
          frame,
          [layer.startFrame, layer.startFrame + animFrames, layer.endFrame - animFrames, layer.endFrame],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )

        let transform = 'translate(-50%, -50%)'
        if (layer.anim === 'slide-up') {
          const slideY = interpolate(relFrame, [0, animFrames], [20, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })
          transform = 'translate(-50%, calc(-50% + ' + slideY + 'px))'
        } else if (layer.anim === 'pop') {
          const mid = Math.max(1, Math.floor(animFrames * 0.6))
          const scale = interpolate(relFrame, [0, mid, animFrames], [0.8, 1.05, 1.0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          })
          transform = 'translate(-50%, -50%) scale(' + scale + ')'
        }

        return (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: layer.x + '%',
              top: layer.y + '%',
              transform,
              opacity,
              fontSize: layer.fontSize,
              color: layer.color,
              fontFamily: layer.fontFamily,
              fontWeight: layer.bold ? 700 : 400,
              textShadow: layer.shadow ? '0 2px 8px rgba(0,0,0,0.8)' : undefined,
              background: layer.background ? layer.backgroundColor : 'transparent',
              padding: layer.background ? '4px 12px' : undefined,
              borderRadius: layer.background ? 6 : undefined,
              whiteSpace: 'pre-wrap',
              maxWidth: '80%',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {layer.text}
          </div>
        )
      })}

      {/* ── Audio layers ── */}
      {spec.audioLayers.map(layer => {
        if (frame < layer.startFrame) return null
        const vol = interpolate(
          frame,
          [
            layer.startFrame,
            layer.startFrame + layer.fadeIn,
            totalOutputFrames - layer.fadeOut,
            totalOutputFrames,
          ],
          [0, layer.volume, layer.volume, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
        return (
          <Audio
            key={layer.id}
            src={layer.src}
            startFrom={layer.startFrame}
            volume={vol}
          />
        )
      })}

      {/* ── Watermark ── */}
      {spec.watermark && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 18,
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'Inter, sans-serif',
            letterSpacing: 1,
          }}
        >
          aria
        </div>
      )}
    </AbsoluteFill>
  )
}

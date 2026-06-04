import React from 'react'
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { type EditSpec, FILTER_CSS } from './types'

interface Props {
  spec: EditSpec
}

export function ReelComposition({ spec }: Props) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const filterCss = FILTER_CSS[spec.filter] || ''

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Main video with trim handled via startFrom/endAt on the composition */}
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

      {/* Text layers */}
      {spec.textLayers.map(layer => {
        if (frame < layer.startFrame || frame > layer.endFrame) return null
        const opacity = interpolate(
          frame,
          [layer.startFrame, layer.startFrame + 8, layer.endFrame - 8, layer.endFrame],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
        return (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: layer.x + '%',
              top: layer.y + '%',
              transform: 'translate(-50%, -50%)',
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

      {/* Audio layers */}
      {spec.audioLayers.map(layer => {
        if (frame < layer.startFrame) return null
        const totalFrames = spec.trimEndFrame >= 0
          ? spec.trimEndFrame - spec.trimStartFrame
          : 300
        const endFrame = totalFrames
        const vol = interpolate(
          frame,
          [
            layer.startFrame,
            layer.startFrame + layer.fadeIn,
            endFrame - layer.fadeOut,
            endFrame,
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

      {/* Watermark */}
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

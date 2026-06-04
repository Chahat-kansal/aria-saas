'use client'
import React, { useMemo } from 'react'
import { Player } from '@remotion/player'
import { ReelComposition } from '@/remotion/ReelComposition'
import { type EditSpec } from '@/remotion/types'

interface Props {
  spec: EditSpec
  width?: number
}

export function RemotionPreview({ spec, width = 270 }: Props) {
  const height = Math.round(width * 16 / 9)
  const fps = spec.outputFps || 30

  const durationInFrames = useMemo(() => {
    if (spec.speedSegments && spec.speedSegments.length > 0) {
      return Math.max(1, spec.speedSegments.reduce((sum, seg) =>
        sum + Math.ceil((seg.endFrame - seg.startFrame) / seg.speed), 0))
    }
    if (spec.trimEndFrame >= 0 && spec.trimStartFrame >= 0) {
      const rawFrames = spec.trimEndFrame - spec.trimStartFrame
      return Math.max(1, Math.round(rawFrames / (spec.speed || 1)))
    }
    return 300
  }, [spec.trimStartFrame, spec.trimEndFrame, spec.speed, spec.speedSegments])

  return (
    <Player
      component={ReelComposition}
      inputProps={{ spec }}
      durationInFrames={durationInFrames}
      compositionWidth={spec.outputWidth || 1080}
      compositionHeight={spec.outputHeight || 1920}
      fps={fps}
      style={{ width, height, borderRadius: 16, overflow: 'hidden' }}
      controls
      loop
    />
  )
}

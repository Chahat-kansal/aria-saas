import React from 'react'
import { Composition } from 'remotion'
import { ReelComposition } from './ReelComposition'
import { type EditSpec } from './types'

const DEFAULT_SPEC: EditSpec = {
  videoUrl: '',
  trimStartFrame: 0,
  trimEndFrame: -1,
  speed: 1,
  filter: 'none',
  filterIntensity: 1,
  textLayers: [],
  audioLayers: [],
  watermark: true,
  outputFps: 30,
  outputWidth: 1080,
  outputHeight: 1920,
}

export function RemotionRoot() {
  return (
    <Composition
      id="ReelComposition"
      component={ReelComposition}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ spec: DEFAULT_SPEC }}
      calculateMetadata={({ props }) => {
        const spec = props.spec as EditSpec
        const fps = spec.outputFps || 30
        let durationFrames = 300
        if (spec.trimEndFrame >= 0 && spec.trimStartFrame >= 0) {
          const rawFrames = spec.trimEndFrame - spec.trimStartFrame
          durationFrames = Math.max(1, Math.round(rawFrames / (spec.speed || 1)))
        }
        return {
          durationInFrames: durationFrames,
          fps,
          width: spec.outputWidth || 1080,
          height: spec.outputHeight || 1920,
          props,
        }
      }}
    />
  )
}

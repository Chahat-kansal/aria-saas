'use client'
import type { ComponentType } from 'react'

interface Props {
  component: ComponentType
  durationInFrames: number
  fps: number
  compositionWidth: number
  compositionHeight: number
  style?: React.CSSProperties
  loop?: boolean
  autoPlay?: boolean
}

export default function RemotionPlayerInner({ component: Component, style, compositionWidth, compositionHeight }: Props) {
  return (
    <div style={{
      ...style,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <Component />
    </div>
  )
}

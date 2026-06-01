'use client'
import React from 'react'

interface Props {
  component: React.ComponentType
  durationInFrames: number
  fps: number
  compositionWidth: number
  compositionHeight: number
  style?: React.CSSProperties
  loop?: boolean
  autoPlay?: boolean
}

export default function RemotionPlayerInner({ component: Component, style }: Props) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <Component />
    </div>
  )
}

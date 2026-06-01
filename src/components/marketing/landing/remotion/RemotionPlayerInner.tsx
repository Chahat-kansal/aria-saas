'use client'
import { Player } from '@remotion/player'
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

export default function RemotionPlayerInner(props: Props) {
  return (
    <Player
      component={props.component}
      durationInFrames={props.durationInFrames}
      fps={props.fps}
      compositionWidth={props.compositionWidth}
      compositionHeight={props.compositionHeight}
      style={props.style}
      loop={props.loop}
      autoPlay={props.autoPlay}
    />
  )
}

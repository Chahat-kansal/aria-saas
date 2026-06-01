'use client'
import { Player } from '@remotion/player'
import { WinbackComp } from '../remotion/WinbackComp'

export default function ReorderScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Customer retention</div>
      <h2>Win back customers before <em>they're gone.</em></h2>
      <Player
        component={WinbackComp}
        durationInFrames={140}
        fps={30}
        compositionWidth={600}
        compositionHeight={340}
        style={{
          width: '100%',
          maxWidth: 600,
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(127,184,151,0.18)',
        }}
        loop
        autoPlay
      />
    </>
  )
}

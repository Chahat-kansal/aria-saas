'use client'
import { Player } from '@remotion/player'
import { BrainOrbComp } from '../remotion/BrainOrbComp'

export default function BrainScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>One operating system</div>
      <h2>Ten dashboards. <em>One brain. Yours.</em></h2>
      <Player
        component={BrainOrbComp}
        durationInFrames={200}
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

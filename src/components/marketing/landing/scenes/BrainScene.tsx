'use client'
import { BrainOrbComp } from '../remotion/BrainOrbComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

export default function BrainScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>One operating system</div>
      <h2>Ten dashboards. <em>One brain. Yours.</em></h2>
      <RemotionPlayer
        component={BrainOrbComp}
        durationInFrames={200}
        fps={30}
        compositionWidth={640}
        compositionHeight={360}
        style={{ width: '100%', maxWidth: 640, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
        loop
        autoPlay
      />
    </>
  )
}

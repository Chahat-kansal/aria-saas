'use client'
import { RevenueChartComp } from '../remotion/RevenueChartComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

export default function ProblemSceneNew() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Profit intelligence</div>
      <h2>Know exactly where <em>your money goes.</em></h2>
      <RemotionPlayer
        component={RevenueChartComp}
        durationInFrames={120}
        fps={30}
        compositionWidth={640}
        compositionHeight={320}
        style={{ width: '100%', maxWidth: 640, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
        loop
        autoPlay
      />
    </>
  )
}

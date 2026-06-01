'use client'
import { WinbackComp } from '../remotion/WinbackComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

export default function ReorderScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Customer retention</div>
      <h2>Win back customers before <em>they&apos;re gone.</em></h2>
      <RemotionPlayer
        component={WinbackComp}
        durationInFrames={140}
        fps={30}
        compositionWidth={640}
        compositionHeight={340}
        style={{ width: '100%', maxWidth: 640, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
        loop
        autoPlay
      />
    </>
  )
}

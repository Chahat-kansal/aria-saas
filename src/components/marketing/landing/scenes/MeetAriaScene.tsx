'use client'
import { DailyBriefingComp } from '../remotion/DailyBriefingComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

export default function MeetAriaScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Meet Aria</div>
      <h2 dangerouslySetInnerHTML={{ __html: 'One AI that knows your <em>entire business</em>' }} />
      <RemotionPlayer
        component={DailyBriefingComp}
        durationInFrames={160}
        fps={30}
        compositionWidth={600}
        compositionHeight={340}
        style={{ width: '100%', maxWidth: 600, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
        loop
        autoPlay
      />
    </>
  )
}

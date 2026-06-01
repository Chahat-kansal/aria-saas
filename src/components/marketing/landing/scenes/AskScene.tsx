'use client'
import { Player } from '@remotion/player'
import { AskAriaComp } from '../remotion/AskAriaComp'

export default function AskScene() {
  return (
    <>
      <div className="scene-label">05 · Ask Aria</div>
      <h2>Ask in plain English. <em>Get answers in seconds.</em></h2>
      <Player
        component={AskAriaComp}
        durationInFrames={540}
        fps={30}
        compositionWidth={560}
        compositionHeight={300}
        style={{ width: '100%', maxWidth: 480, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)', marginInline: 'auto' }}
        loop
        autoPlay
      />
      <p className="body-copy" style={{ margin: '0 auto' }}>No SQL. No reports menu. Just ask.</p>
    </>
  )
}

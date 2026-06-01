'use client'
import { Player } from '@remotion/player'
import { AskAriaComp } from '../remotion/AskAriaComp'

export default function AskScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Ask Aria anything</div>
      <h2>Ask in plain English. <em>Get answers in seconds.</em></h2>
      <Player
        component={AskAriaComp}
        durationInFrames={540}
        fps={30}
        compositionWidth={600}
        compositionHeight={360}
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

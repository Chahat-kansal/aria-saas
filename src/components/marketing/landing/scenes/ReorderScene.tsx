'use client'
import { Player } from '@remotion/player'
import { WinbackComp } from '../remotion/WinbackComp'

export default function ReorderScene() {
  return (
    <>
      <div className="text-side">
        <div className="scene-label">03 · Reorder Agent</div>
        <h2>Stop running to the supplier. <em>Aria just knows.</em></h2>
        <p className="body-copy">Watches your sales velocity hour by hour, compares to last 90 days, and proposes orders before you run out. You approve in one tap.</p>
      </div>
      <div className="mockup-side">
        <Player
          component={WinbackComp}
          durationInFrames={140}
          fps={30}
          compositionWidth={560}
          compositionHeight={300}
          style={{ width: '100%', maxWidth: 420, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)', marginInline: 'auto' }}
          loop
          autoPlay
        />
      </div>
    </>
  )
}

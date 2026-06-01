'use client'
import React from 'react'
import { WinbackComp } from '../remotion/WinbackComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

export default function ReorderScene() {
  return (
    <>
      <div className="text-side">
        <div className="scene-label">Customer retention</div>
        <h2>Win back customers before <em>they&apos;re gone.</em></h2>
        <p className="body-copy">Aria watches who hasn&apos;t visited in 30, 60, 90 days — drafts a personalised SMS, you approve in one tap. Emma came back and spent $28.50.</p>
      </div>
      <div className="mockup-side">
        <RemotionPlayer
          component={WinbackComp}
          durationInFrames={140}
          fps={30}
          compositionWidth={480}
          compositionHeight={340}
          style={{ width: '100%', maxWidth: 480, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
          loop
          autoPlay
        />
      </div>
    </>
  )
}

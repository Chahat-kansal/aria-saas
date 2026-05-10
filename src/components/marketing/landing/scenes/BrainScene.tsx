export default function BrainScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>02 · Meet Aria</div>
      <h2 style={{ textAlign: 'center' }}>Five agents. <em>One brain. Yours.</em></h2>
      <div className="brain-system">
        <div className="brain-core" />
        <div className="orbit-ring">
          <div className="orbit-orb">Reorder</div>
          <div className="orbit-orb">Pricing</div>
          <div className="orbit-orb">Schedule</div>
          <div className="orbit-orb">Reports</div>
          <div className="orbit-orb">Ask</div>
        </div>
      </div>
      <p className="brain-caption">Aria runs in the background while you serve customers.</p>
    </>
  )
}

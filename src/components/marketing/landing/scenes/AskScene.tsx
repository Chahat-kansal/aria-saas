export default function AskScene() {
  return (
    <>
      <div className="scene-label">05 · Ask Aria</div>
      <h2>Ask in plain English. <em>Get answers in seconds.</em></h2>
      <div className="conversation">
        <div className="bubble user">How was last Friday?</div>
        <div className="bubble aria">
          <div className="bubble-meta">Aria</div>
          Strongest Friday this month — <span className="stat">$4,287</span>. Carlton Dry sold <span className="stat">47 units</span>, beating last Friday by <span className="stat">22%</span>.
          <div className="mini-chart">
            <div className="bar" style={{ height: '35%' }} />
            <div className="bar" style={{ height: '48%' }} />
            <div className="bar" style={{ height: '42%' }} />
            <div className="bar" style={{ height: '60%' }} />
            <div className="bar" style={{ height: '70%' }} />
            <div className="bar" style={{ height: '88%' }} />
            <div className="bar" style={{ height: '100%', background: 'linear-gradient(to top, var(--sage-dark), var(--sage-light))' }} />
          </div>
        </div>
      </div>
      <p className="body-copy" style={{ margin: '0 auto' }}>No SQL. No reports menu. Just ask.</p>
    </>
  )
}

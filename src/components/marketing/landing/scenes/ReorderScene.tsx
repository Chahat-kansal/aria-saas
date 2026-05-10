export default function ReorderScene() {
  return (
    <>
      <div className="text-side">
        <div className="scene-label">03 · Reorder Agent</div>
        <h2>Stop running to the supplier. <em>Aria just knows.</em></h2>
        <p className="body-copy">Watches your sales velocity hour by hour, compares to last 90 days, and proposes orders before you run out. You approve in one tap.</p>
      </div>
      <div className="mockup-side">
        <div className="notification-card">
          <div className="notif-row">
            <div className="notif-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </div>
            <div><div className="notif-meta">Reorder Agent</div></div>
            <div className="notif-time">just now</div>
          </div>
          <div className="notif-title">Reorder Carlton Dry · 24 cases</div>
          <p className="notif-subtitle">Stock will run out Sunday at 2pm based on this week&apos;s pace.</p>
          <div className="notif-actions">
            <button className="notif-btn primary">Approve</button>
            <button className="notif-btn secondary">Edit</button>
          </div>
          <div className="notif-confidence"><span className="confidence-dot" />97% confidence · Reasoning →</div>
        </div>
      </div>
    </>
  )
}

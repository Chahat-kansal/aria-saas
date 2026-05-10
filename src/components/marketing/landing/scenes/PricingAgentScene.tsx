export default function PricingAgentScene() {
  return (
    <>
      <div className="text-side">
        <div className="scene-label">04 · Pricing Agent</div>
        <h2>Match competitors <em>before</em> they take your customers.</h2>
        <p className="body-copy">Aria watches your competitors and proposes price moves before your customers walk down the road. You stay in control.</p>
      </div>
      <div className="mockup-side">
        <div className="pricing-mockup">
          <div className="notif-row">
            <div className="notif-icon" style={{ background: 'linear-gradient(135deg, #D4A95E, #B0884A)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            </div>
            <div><div className="notif-meta">Pricing Agent</div></div>
            <div className="notif-time">8m ago</div>
          </div>
          <div className="price-shift">Wakefield Sav Blanc <span className="old">$18.99</span> <span className="new">→ $17.49</span></div>
          <p className="notif-subtitle" style={{ marginTop: 8 }}>Cellars East dropped to $17.50 yesterday. Match for the weekend?</p>
          <div className="notif-actions">
            <button className="notif-btn primary">Match</button>
            <button className="notif-btn secondary">Hold</button>
          </div>
          <div className="notif-confidence"><span className="confidence-dot" />91% confidence · 2 stores compared</div>
        </div>
      </div>
    </>
  )
}

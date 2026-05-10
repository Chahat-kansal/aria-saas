import Link from 'next/link'

const UTM = '?utm_source=landing&utm_medium=pricing_card&utm_campaign=v3'

export default function PricingTiersScene() {
  return (
    <>
      <div className="scene-label">10 · Plans</div>
      <h2><em>Ready</em> when you are.</h2>
      <div className="pricing-banner">First 100 customers · 60 days free + free import</div>
      <div className="pricing-grid">
        <div className="price-card dim">
          <div className="tier-name">Starter</div>
          <div className="tier-tagline">Single shop just getting started</div>
          <div className="tier-price"><span className="currency">$</span>59</div>
          <div className="tier-period">/month per outlet</div>
          <ul className="tier-features">
            <li>Terminal + 5 layouts</li>
            <li>Reports + dashboards</li>
            <li>Customer database</li>
            <li>1 outlet</li>
          </ul>
          <Link href={`/signup${UTM}&plan=starter`} className="tier-btn outline">Start trial</Link>
        </div>
        <div className="price-card recommended">
          <div className="recommended-badge">Recommended</div>
          <div className="tier-name">Growth</div>
          <div className="tier-tagline">Most shops scale to this within 60 days</div>
          <div className="tier-price"><span className="currency">$</span>129</div>
          <div className="tier-period">/month per outlet</div>
          <ul className="tier-features">
            <li>Everything in Starter</li>
            <li>3 AI agents (Reorder, Pricing, Schedule)</li>
            <li>Conversation Reports</li>
            <li>Multi-outlet support</li>
          </ul>
          <Link href={`/signup${UTM}&plan=growth`} className="tier-btn filled">Start trial</Link>
        </div>
        <div className="price-card dim">
          <div className="tier-name">Autonomous</div>
          <div className="tier-tagline">Multi-store, full autonomy</div>
          <div className="tier-price"><span className="currency">$</span>249</div>
          <div className="tier-period">/month per outlet</div>
          <ul className="tier-features">
            <li>Everything in Growth</li>
            <li>All 5 AI agents</li>
            <li>API access</li>
            <li>Priority support + Tyro</li>
          </ul>
          <Link href={`/signup${UTM}&plan=autonomous`} className="tier-btn outline">Start trial</Link>
        </div>
      </div>
    </>
  )
}

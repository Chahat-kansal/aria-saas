import Link from 'next/link'

const UTM = '?utm_source=landing&utm_medium=pricing_card&utm_campaign=v3'

export default function PricingTiersScene() {
  return (
    <>
      <div className="scene-label">10 · Plans</div>
      <h2><em>Ready</em> when you are.</h2>
      <div className="pricing-banner">14-day free trial · No credit card required</div>
      <div className="pricing-grid">
        <div className="price-card dim">
          <div className="tier-name">Starter</div>
          <div className="tier-tagline">Get started with AI-powered insights</div>
          <div className="tier-price"><span className="currency">$</span>297</div>
          <div className="tier-period">/month</div>
          <ul className="tier-features">
            <li>Daily Briefings</li>
            <li>Profit-Leak Analysis</li>
            <li>Customer Win-back</li>
            <li>Point-of-Sale</li>
          </ul>
          <Link href={`/signup${UTM}&plan=starter`} className="tier-btn outline">Start trial</Link>
        </div>
        <div className="price-card recommended">
          <div className="recommended-badge">Recommended</div>
          <div className="tier-name">Growth</div>
          <div className="tier-tagline">Full back-office automation</div>
          <div className="tier-price"><span className="currency">$</span>597</div>
          <div className="tier-period">/month</div>
          <ul className="tier-features">
            <li>Everything in Starter</li>
            <li>Reviews &amp; Compliance</li>
            <li>Bookings &amp; Scheduling</li>
            <li>Competitor Tracking</li>
          </ul>
          <Link href={`/signup${UTM}&plan=growth`} className="tier-btn filled">Start trial</Link>
        </div>
        <div className="price-card dim">
          <div className="tier-name">Pro</div>
          <div className="tier-tagline">Fully autonomous AI co-owner</div>
          <div className="tier-price"><span className="currency">$</span>997</div>
          <div className="tier-period">/month</div>
          <ul className="tier-features">
            <li>Everything in Growth</li>
            <li>Marketing automation</li>
            <li>API access + Tyro</li>
            <li>Priority support</li>
          </ul>
          <Link href={`/signup${UTM}&plan=pro`} className="tier-btn outline">Start trial</Link>
        </div>
      </div>
    </>
  )
}

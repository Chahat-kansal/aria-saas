'use client'
import { forwardRef } from 'react'

const HeroAct = forwardRef<HTMLDivElement>((_, ref) => (
  <div className="hero-act" ref={ref}>
    <div className="hero-aurora" />

    <div className="hero-particles">
      {[...Array(6)].map((_, i) => <span key={i} className="particle" />)}
    </div>

    <div className="hero-text-layer">
      <span className="hero-pill">Built for Australian small business</span>
      <h1 className="hero-h1">
        Your AI co-owner.
        <em>Running the back office.</em>
      </h1>
      <p className="hero-subhead">Daily briefings, customer win-back, reviews, profit-leak analysis, compliance, competitor tracking, marketing, bookings — and point-of-sale among them.</p>
    </div>

    <div className="hero-dashboard-stage">
      <div className="hero-dashboard">
        <div className="hero-dash-sidebar">
          <div className="hero-dash-logo">Aria</div>
          {['Morning Briefing', 'Ask Aria', 'Customers', 'Point of Sale', 'Marketing', 'Compliance', 'Bookings'].map((item, i) => (
            <div key={item} className={'hero-dash-nav' + (i === 0 ? ' active' : '')}>{item}</div>
          ))}
        </div>
        <div className="hero-dash-main">
          <div className="hero-dash-topbar">
            <span className="hero-dash-greeting">Good morning, Chahat</span>
            <span className="hero-dash-date">Monday, 2 June · 8:04 AM</span>
          </div>
          <div className="hero-dash-kpis">
            {[
              { label: 'Revenue today', val: '$2,847', delta: '↑ 18% vs last Mon' },
              { label: 'At-risk customers', val: '3', delta: 'Win-backs drafted' },
              { label: 'Compliance alerts', val: '1', delta: 'BAS due in 14 days' },
            ].map(k => (
              <div key={k.label} className="hero-kpi-card">
                <div className="hero-kpi-label">{k.label}</div>
                <div className="hero-kpi-val">{k.val}</div>
                <div className="hero-kpi-delta">{k.delta}</div>
              </div>
            ))}
          </div>
          <div className="hero-aria-briefing">
            <div className="hero-aria-av">A</div>
            <div>
              <div className="hero-aria-name">Aria says</div>
              <div className="hero-aria-text">
                Your Tuesday revenue is running 18% above last week. Acai Bowl is your top product.
                3 customers have not returned in 60+ days — win-back messages ready for approval.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="hero-scroll-cue">Scroll to begin</div>
  </div>
))

HeroAct.displayName = 'HeroAct'
export default HeroAct

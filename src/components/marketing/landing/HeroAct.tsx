'use client'
import { forwardRef } from 'react'

const TILES = [
  { color: '#B8854A', name: 'Carlton Dry', price: '$58.99' },
  { color: '#94795E', name: 'Wild Turkey', price: '$72.00' },
  { color: '#9C9560', name: 'Wakefield SB', price: '$17.49' },
  { color: '#7B4754', name: 'Penfolds 389', price: '$89.00' },
  { color: '#6B4423', name: 'Coopers Pale', price: '$22.50' },
  { color: '#B8854A', name: 'VB 6-pack', price: '$24.99' },
]

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
      <p className="hero-subhead">Daily briefings, customer win-back, compliance, bookings, profit-leak analysis — and yes, a POS too.</p>
    </div>

    <div className="hero-ipad-stage">
      <div className="hero-ipad">
        <div className="hero-ipad-frame">
          <div className="hero-ipad-content">
            <div className="hero-ipad-topbar">
              <span className="hero-live-dot" />
              <span style={{ color: 'var(--text-secondary)' }}>Bentleigh Cellars · Reg 1</span>
              <span style={{ marginLeft: 'auto' }}>$2,847.20 today</span>
            </div>
            <div className="hero-ipad-sidebar">
              <div className="hero-sidebar-icon active">A</div>
              <div className="hero-sidebar-icon">▦</div>
              <div className="hero-sidebar-icon">◯</div>
              <div className="hero-sidebar-icon">⊞</div>
            </div>
            <div className="hero-ipad-grid">
              {TILES.map((t, i) => (
                <div key={i} className="hero-product-tile">
                  <div className="swatch" style={{ background: t.color }} />
                  <div className="name">{t.name}</div>
                  <div className="price">{t.price}</div>
                </div>
              ))}
            </div>
            <div className="hero-ipad-cart">
              <div className="hero-cart-header">Cart · 3 items</div>
              <div className="hero-cart-line"><span>Carlton Dry × 2</span><span>$117.98</span></div>
              <div className="hero-cart-line"><span>Wakefield SB</span><span>$17.49</span></div>
              <div className="hero-cart-line"><span>Coopers Pale</span><span>$22.50</span></div>
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'right' }}>Trade −10%</div>
                <div className="hero-cart-total">$142.17</div>
                <div className="hero-charge-btn">Charge</div>
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

'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

const G = '#7FB897'
const BG = '#0a0a0f'
const CARD = 'rgba(255,255,255,0.04)'
const BORDER = 'rgba(255,255,255,0.08)'
const MUTED = 'rgba(255,255,255,0.55)'

const FEATURES = [
  { icon: '📋', title: 'Daily Briefing', desc: 'Every morning, Aria analyses sales, stock, customers and competitors — then tells you exactly what needs attention today.' },
  { icon: '💬', title: 'Ask Aria', desc: 'Ask anything about your business. Get specific, data-backed answers — not generic advice.' },
  { icon: '🖥️', title: 'POS System', desc: 'Full point-of-sale built in. Sales, inventory, loyalty, receipts — all feeding Aria\'s brain automatically.' },
  { icon: '👁️', title: 'Competitor Intelligence', desc: 'Aria monitors nearby competitors daily — prices, promotions, reviews — and alerts you to opportunities.' },
  { icon: '🔔', title: 'Smart Alerts', desc: 'Low stock, revenue drops, lapsed customers, compliance expiries — Aria spots them before they cost you.' },
  { icon: '📈', title: 'Weekly Report', desc: 'Every Monday, a full business intelligence report lands in your inbox. No spreadsheets needed.' },
]

const STEPS = [
  { n: '01', title: 'Connect your business', desc: 'Enter your details, industry, and address. Aria sets up your dashboard instantly.' },
  { n: '02', title: 'Aria learns your business', desc: 'Connect your POS, suppliers, and integrations. Aria starts analysing immediately.' },
  { n: '03', title: 'Get your first briefing', desc: 'Tomorrow morning, your first Aria briefing arrives. It already knows what to focus on.' },
]

const INDUSTRIES = [
  { icon: '🍷', title: 'Liquor stores', features: ['RSA compliance & age verify', 'ALM/ILG supplier orders', 'WET tax tracking built in'] },
  { icon: '☕', title: 'Cafés', features: ['Table management & KDS', 'Modifier groups (milk, shots)', 'Recipe costing & waste'] },
  { icon: '🛒', title: 'Retail', features: ['Barcode scanning & stocktake', 'Supplier orders & promotions', 'Multi-outlet support'] },
  { icon: '🏪', title: 'Any small business', features: ['Customisable for your industry', 'Flexible product setup', 'Works offline'] },
]

const PLANS = [
  { name: 'Starter', price: '$59', period: '/mo', highlight: false, desc: 'Core AI + POS + Dashboard' },
  { name: 'Growth', price: '$129', period: '/mo', highlight: true, tag: 'Most Popular', desc: 'Everything + advanced AI + integrations' },
  { name: 'Pro', price: '$249', period: '/mo', highlight: false, desc: 'Full platform + warehouse + custom features' },
]

const FAQS = [
  { q: 'Do I need to replace my existing POS?', a: 'No. Connect your existing Square or Lightspeed and Aria adds the AI layer on top. Or use Aria\'s built-in POS — it\'s included on every plan.' },
  { q: 'How long does setup take?', a: '10 minutes. Enter your business details and Aria starts your first briefing tonight.' },
  { q: 'Is my data safe?', a: 'Yes. Bank-level encryption, Australian data residency, and your data never trains AI models. You own it — always.' },
  { q: 'Can I cancel anytime?', a: 'Yes. No lock-in contracts. Cancel from your settings page anytime. No questions asked.' },
  { q: 'Does it work for my industry?', a: 'Aria supports retail, liquor, cafés, restaurants, and any small business. More industries being added regularly.' },
]

const TRUST = [
  { icon: '🔒', title: 'Bank-level encryption', desc: 'AES-256 at rest, TLS 1.3 in transit' },
  { icon: '🇦🇺', title: 'Australian-built', desc: 'Data hosted in Australian data centres' },
  { icon: '📋', title: 'GDPR compliant', desc: 'Full data portability and right to erasure' },
  { icon: '🛡️', title: 'SOC 2 ready', desc: 'Enterprise-grade security controls' },
]

const CSS = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fi { opacity: 0; }
  .fi.visible { animation: fadeInUp 0.55s ease forwards; }
  @media (max-width: 768px) {
    .land-grid-2 { grid-template-columns: 1fr !important; }
    .land-grid-3 { grid-template-columns: 1fr !important; }
    .land-grid-4 { grid-template-columns: 1fr 1fr !important; }
    .land-hero-h { font-size: 36px !important; line-height: 1.15 !important; }
    .land-split  { flex-direction: column !important; }
    .land-nav-links { display: none !important; }
    .land-hamburger { display: flex !important; }
  }
`

export default function LandingShell() {
  const [scrolled, setScrolled]   = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [openFaq,  setOpenFaq]    = useState<number | null>(null)
  const obsRef                    = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })

    obsRef.current = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.1 }
    )
    document.querySelectorAll('.fi').forEach(el => obsRef.current!.observe(el))

    return () => {
      window.removeEventListener('scroll', onScroll)
      obsRef.current?.disconnect()
    }
  }, [])

  const sec = (extra?: object): React.CSSProperties => ({
    padding: '96px 24px', maxWidth: 1100, margin: '0 auto', ...extra,
  })

  const card = (extra?: object): React.CSSProperties => ({
    background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '28px 24px', ...extra,
  })

  return (
    <div style={{ background: BG, color: '#fff', fontFamily: "'Manrope', system-ui, sans-serif", overflowX: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(10,10,15,0.85)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? `1px solid ${BORDER}` : 'none',
        transition: 'all 0.3s ease',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ textDecoration: 'none', fontSize: 20, fontWeight: 800, color: '#fff' }}>
            aria<span style={{ color: G }}>OS</span>
          </Link>
          <div className="land-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            <a href="#features" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Features</a>
            <a href="#pricing" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Pricing</a>
            <Link href="/login" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Login</Link>
            <Link href="/signup" style={{
              background: '#1a3d2b', color: G, border: `1px solid rgba(127,184,151,0.3)`,
              borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}>Start free trial →</Link>
          </div>
          <button className="land-hamburger" onClick={() => setMenuOpen(m => !m)}
            style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: 4 }}>
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: 'rgba(10,10,15,0.97)', borderTop: `1px solid ${BORDER}`, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <a href="#features" onClick={() => setMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>Features</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} style={{ color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>Pricing</a>
            <Link href="/login" style={{ color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>Login</Link>
            <Link href="/signup" style={{ display: 'inline-block', background: G, color: '#0a0a0f', borderRadius: 8, padding: '12px 20px', fontSize: 15, fontWeight: 800, textDecoration: 'none', textAlign: 'center' }}>Start free trial →</Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section style={{ paddingTop: 128, paddingBottom: 80, paddingLeft: 24, paddingRight: 24 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.25)', borderRadius: 99, padding: '6px 14px', marginBottom: 28, fontSize: 13, color: G, fontWeight: 600 }}>
            ✦ Built for Australian small business
          </div>
          <h1 className="land-hero-h" style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 20px', maxWidth: 800 }}>
            Your AI business co-operator.
          </h1>
          <p style={{ fontSize: 20, color: MUTED, lineHeight: 1.6, maxWidth: 580, margin: '0 0 36px' }}>
            Aria runs your daily briefing, monitors competitors, manages stock alerts, and tells you exactly what to do — before problems become expensive.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
            <Link href="/signup" style={{ background: G, color: '#0a0a0f', borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 800, textDecoration: 'none' }}>
              Start 14-day free trial
            </Link>
            <a href="#features" style={{ background: 'transparent', color: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
              See how it works ↓
            </a>
          </div>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 56 }}>🔒 No credit card required · Cancel anytime · Australian-built · GDPR compliant</p>

          {/* Mock briefing card */}
          <div style={{ width: '100%', maxWidth: 560, background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}`, borderRadius: 20, padding: 24, textAlign: 'left', backdropFilter: 'blur(8px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: G, display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: G, textTransform: 'uppercase' }}>Aria Briefing</span>
                <span style={{ fontSize: 11, color: MUTED }}>· Council · strategic</span>
              </div>
              <span style={{ fontSize: 12, color: MUTED }}>Wed, 27 May</span>
            </div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, margin: '0 0 18px' }}>
              Revenue is critically low at <span style={{ color: '#ef4444', fontWeight: 700 }}>$188 this week</span> compared to your usual $1,840. 19 Crimes Cab Sav is your top seller but you have only 2 units left. 3 customers haven&apos;t visited in 60+ days.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[['$188', 'today'], ['$1,120', 'this week'], ['3', 'low stock'], ['19 Crimes', 'top seller']].map(([v, l]) => (
                <div key={l} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{v}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '20px 24px', background: 'rgba(255,255,255,0.01)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap' }}>Trusted by Australian retailers, cafés, and liquor stores</span>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {['Sip Café', 'Independent Liquor', 'Local Retail Co.', 'The Corner Store', 'Bay Bistro'].map(name => (
              <span key={name} style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.03em' }}>{name}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── PROBLEM ── */}
      <section className="fi" style={{ padding: '80px 24px' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Running a small business is hard.</h2>
            <p style={{ fontSize: 18, color: MUTED }}>Your current tools make it harder.</p>
          </div>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {[
              { icon: '📊', text: 'You check 6 different apps for sales, stock, reviews, and staff' },
              { icon: '⏰', text: 'You find out about problems after they\'ve already cost you money' },
              { icon: '🤔', text: 'Your accountant tells you what happened last month. Nobody tells you what to do today.' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{icon}</span>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="fi" style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>One AI that knows your entire business</h2>
            <p style={{ fontSize: 18, color: MUTED }}>Meet Aria</p>
          </div>
          <div className="land-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={card()}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{f.icon}</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px', color: '#fff' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="fi" style={{ padding: '80px 24px' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Up and running in 10 minutes</h2>
          </div>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ ...card(), position: 'relative', paddingTop: 32 }}>
                <div style={{ position: 'absolute', top: -16, left: 24, background: G, color: '#0a0a0f', borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 900 }}>{s.n}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 10px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: MUTED, margin: 0, lineHeight: 1.65 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POS DEEP DIVE ── */}
      <section className="fi" style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={sec()}>
          <div className="land-split" style={{ display: 'flex', gap: 56, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>The only POS that gets smarter every day</h2>
              <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: '0 0 28px' }}>Every sale feeds Aria&apos;s brain. By week two, Aria knows your best sellers, your slow days, and your most valuable customers.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Barcode scanning + product search', 'Cash, card, split payments', 'Loyalty points built in', 'Age verification for liquor', 'Receipt email + print', 'Real-time stock updates', 'Offline mode'].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: G, fontWeight: 700, flexShrink: 0 }}>✅</span>{f}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, maxWidth: 380 }}>
              <div style={{ ...card({ borderRadius: 20, padding: 24 }) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: G }}>SALE #1042</span>
                  <span style={{ fontSize: 12, color: MUTED }}>Open session</span>
                </div>
                {[['Coopers Pale ×2', '$9.98'], ['Jim Beam 700ml', '$42.99'], ['Mix 6-Pack ×3', '$54.00']].map(([item, price]) => (
                  <div key={item} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.8)' }}>{item}</span>
                    <span style={{ fontWeight: 700 }}>{price}</span>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${BORDER}`, margin: '14px 0', paddingTop: 14, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>TOTAL</span>
                  <span style={{ fontSize: 17, fontWeight: 900, color: G }}>$106.97</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 8 }}>
                  {['Cash', 'Card', 'Split'].map(m => (
                    <button key={m} style={{ background: m === 'Card' ? G : 'rgba(255,255,255,0.07)', color: m === 'Card' ? '#0a0a0f' : '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{m}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INDUSTRIES ── */}
      <section className="fi" style={{ padding: '80px 24px' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Built for Australian retail and hospitality</h2>
          </div>
          <div className="land-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
            {INDUSTRIES.map(ind => (
              <div key={ind.title} style={card()}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>{ind.icon}</span>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>{ind.title}</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ind.features.map(f => (
                    <li key={f} style={{ fontSize: 13, color: MUTED, display: 'flex', gap: 6 }}>
                      <span style={{ color: G, flexShrink: 0 }}>·</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="fi" style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Simple, transparent pricing</h2>
            <p style={{ fontSize: 16, color: MUTED }}>All plans include 14-day free trial. No credit card required.</p>
          </div>
          <div className="land-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 28 }}>
            {PLANS.map(p => (
              <div key={p.name} style={{ ...card(), border: p.highlight ? `2px solid ${G}` : `1px solid ${BORDER}`, position: 'relative', background: p.highlight ? 'rgba(127,184,151,0.07)' : CARD }}>
                {p.tag && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: G, color: '#0a0a0f', fontSize: 11, fontWeight: 900, padding: '4px 12px', borderRadius: 99, whiteSpace: 'nowrap' }}>{p.tag}</div>
                )}
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
                  <span style={{ fontSize: 36, fontWeight: 900, color: p.highlight ? G : '#fff' }}>{p.price}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>{p.period}</span>
                </div>
                <p style={{ fontSize: 13, color: MUTED, margin: '0 0 20px' }}>{p.desc}</p>
                <Link href="/signup" style={{ display: 'block', textAlign: 'center', background: p.highlight ? G : 'rgba(255,255,255,0.07)', color: p.highlight ? '#0a0a0f' : '#fff', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                  Start free trial →
                </Link>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link href="/pricing" style={{ fontSize: 14, color: G, fontWeight: 700, textDecoration: 'none' }}>See full pricing & feature comparison →</Link>
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="fi" style={{ padding: '80px 24px' }}>
        <div style={sec()}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Your data is safe with Aria</h2>
            <p style={{ fontSize: 15, color: MUTED, maxWidth: 560, margin: '0 auto' }}>Aria uses Supabase PostgreSQL with row-level security. Your business data never trains AI models. You own your data — always.</p>
          </div>
          <div className="land-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
            {TRUST.map(t => (
              <div key={t.title} style={{ ...card(), textAlign: 'center' }}>
                <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{t.icon}</span>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="fi" style={{ padding: '80px 24px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 40px', textAlign: 'center' }}>Frequently asked questions</h2>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: `1px solid ${BORDER}`, cursor: 'pointer' }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', gap: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{faq.q}</span>
                <span style={{ color: G, fontSize: 20, flexShrink: 0, fontWeight: 300 }}>{openFaq === i ? '−' : '+'}</span>
              </div>
              {openFaq === i && (
                <p style={{ fontSize: 14, color: MUTED, padding: '0 0 18px', margin: 0, lineHeight: 1.7 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="fi" style={{ padding: '96px 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 14px' }}>Ready to give your business an AI co-operator?</h2>
          <p style={{ fontSize: 17, color: MUTED, marginBottom: 32 }}>Start your 14-day free trial today. No credit card required.</p>
          <Link href="/signup" style={{ display: 'inline-block', background: G, color: '#0a0a0f', borderRadius: 12, padding: '18px 40px', fontSize: 18, fontWeight: 900, textDecoration: 'none' }}>
            Start free trial →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}`, padding: '48px 24px', background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="land-grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>aria<span style={{ color: G }}>OS</span></div>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0, maxWidth: 220 }}>AI for Australian business</p>
            </div>
            {[
              { title: 'Product', links: [['Features', '#features'], ['Pricing', '/pricing'], ['Integrations', '/integrations']] },
              { title: 'Company', links: [['About', '/about'], ['Contact', '/contact'], ['Blog', '/blog']] },
              { title: 'Legal', links: [['Terms', '/terms'], ['Privacy', '/privacy']] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>{col.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {col.links.map(([label, href]) => (
                    <Link key={label} href={href} style={{ fontSize: 14, color: MUTED, textDecoration: 'none', transition: 'color 0.2s' }}>{label}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontSize: 13, color: MUTED }}>© 2026 Aria OS. Built in Australia.</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>ariaos.site</span>
          </div>
        </div>
      </footer>

      {/* SEO content — visible to crawlers, hidden visually */}
      <div style={{ position: 'absolute', left: -9999, opacity: 0, pointerEvents: 'none' }} aria-hidden="false">
        <h1>Aria OS — The AI co-owner for Australian small business</h1>
        <h2>Your AI co-operator running the back office while you run your business</h2>
        <h2>Daily briefings, customer win-back, profit-leak analysis, compliance, POS</h2>
        <h2>14-day free trial. No card. Cancel anytime.</h2>
      </div>
    </div>
  )
}

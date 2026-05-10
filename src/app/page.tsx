import Link from 'next/link'
import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { FadeUp } from '@/components/marketing/FadeUp'

const CursorAura = dynamic(
  () => import('@/components/marketing/CursorAura').then(m => ({ default: m.CursorAura })),
  { ssr: false }
)
const HeroCards = dynamic(
  () => import('@/components/marketing/HeroCards').then(m => ({ default: m.HeroCards })),
  { ssr: false }
)
const HeroMobileCard = dynamic(
  () => import('@/components/marketing/HeroCards').then(m => ({ default: m.HeroMobileCard })),
  { ssr: false }
)

export const metadata: Metadata = {
  title: 'Aria — The POS that thinks. Built for Australian retail.',
  description: 'AI-powered point-of-sale for Australian small businesses. Aria runs your inventory, prices, schedule, and reports — so you can run your shop. 14-day free trial, no credit card.',
  keywords: 'POS Australia, retail software Australia, AI POS, Shopfront alternative, Square alternative, Lightspeed alternative, bottle shop POS, cafe POS, liquor store software',
  openGraph: {
    title: 'Aria — The POS that thinks',
    description: 'AI-powered POS for Australian retail. 14-day free trial.',
    url: 'https://ariaos.site',
    siteName: 'Aria POS',
    images: [{ url: 'https://ariaos.site/og-image.png', width: 1200, height: 630, alt: 'Aria POS — The POS that thinks' }],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aria — The POS that thinks',
    description: 'AI-powered POS for Australian retail.',
    images: ['https://ariaos.site/og-image.png'],
  },
  alternates: { canonical: 'https://ariaos.site' },
}

const AGENTS = [
  { n: '01', icon: '📦', name: 'Reorder', desc: 'Auto-orders before you run out' },
  { n: '02', icon: '💰', name: 'Pricing', desc: 'Adjusts margins in real time' },
  { n: '03', icon: '📈', name: 'Demand Forecast', desc: 'Predicts what you\'ll sell next week' },
  { n: '04', icon: '🔒', name: 'Loss Prevention', desc: 'Flags unusual voids and overrides' },
  { n: '05', icon: '💬', name: 'Customer Concierge', desc: 'Answers loyalty questions automatically' },
  { n: '06', icon: '🛡️', name: 'Churn Defender', desc: 'Reaches out before customers leave' },
  { n: '07', icon: '✅', name: 'Compliance', desc: 'Tracks RSA, age checks, hour limits' },
  { n: '08', icon: '🎙️', name: 'Voice POS', desc: 'Serve customers hands-free' },
  { n: '09', icon: '📸', name: 'Receipt Scanner', desc: 'Capture supplier invoices instantly' },
  { n: '10', icon: '📅', name: 'Smart Schedule', desc: 'Rostering tied to demand forecast' },
  { n: '11', icon: '🗣️', name: 'Ask Aria', desc: 'Ask anything about your numbers' },
  { n: '12', icon: '🎯', name: 'Promo Engine', desc: 'Auto-launches deals when you\'re slow' },
]

const PLANS = [
  {
    name: 'Starter', price: '$59', period: '/outlet/month',
    desc: 'Full POS + Reorder Agent',
    features: ['Full-featured POS', 'Offline mode', 'Reorder agent', 'Barcode scanning', 'Customer loyalty', 'Basic reports'],
    highlight: false,
  },
  {
    name: 'Growth', price: '$129', period: '/outlet/month',
    desc: '5 AI agents + Voice + Concierge',
    features: ['Everything in Starter', 'Pricing agent', 'Schedule agent', 'Voice POS', 'Customer Concierge', 'Conversation Reports', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Autonomous', price: '$249', period: '/outlet/month',
    desc: 'All 12 agents + full autonomy',
    features: ['Everything in Growth', 'All 12 agents', 'Loss Prevention', 'Churn Defender', 'Auto-approve thresholds', 'CCTV integration (beta)', 'Dedicated onboarding'],
    highlight: false,
  },
]

const AU_FEATURES = [
  { icon: '🍺', label: 'ALM + ILG + LMG supplier sync', desc: 'Native integrations with Australia\'s major liquor distributors' },
  { icon: '📋', label: 'RSA hours per state', desc: 'Compliance tracking for responsible service across all states' },
  { icon: '🧾', label: 'GST handling', desc: '10% GST calculated, reported, and ATO-ready out of the box' },
  { icon: '🌦', label: 'BoM weather correlation', desc: 'Sales forecasts adjust for Bureau of Meteorology patterns' },
  { icon: '🏉', label: 'AFL/NRL footfall', desc: 'Demand spikes flagged before game days and Grand Finals' },
  { icon: '🕐', label: 'AEST/AEDT aware', desc: 'All scheduling and reports in Australian Eastern Time' },
]

const sub: React.CSSProperties = { fontFamily: 'var(--font-body)', fontWeight: 300, letterSpacing: '-0.005em', lineHeight: 1.6 }
const ml: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.16em', color: 'var(--text-tertiary)' }

export default function HomePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: `
        radial-gradient(ellipse 70% 50% at 12% 8%, rgba(127,184,151,0.22), transparent 60%),
        radial-gradient(ellipse 60% 45% at 92% 22%, rgba(58,90,64,0.16), transparent 65%),
        radial-gradient(ellipse 80% 60% at 78% 95%, rgba(101,177,121,0.10), transparent 70%),
        var(--bg-base)
      `,
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-body)',
      position: 'relative',
    }}>
      <CursorAura />

      <style>{`
        @media (max-width: 768px) {
          .hero-3d { display: none !important; }
          .hero-mob { display: block !important; }
          .hero-row { flex-direction: column !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .pc-mid { transform: none !important; }
          .cta-row { flex-direction: column !important; align-items: stretch !important; }
          .nav-links { display: none !important; }
          .h1 { font-size: clamp(36px, 9vw, 52px) !important; }
          .sp { padding-left: 24px !important; padding-right: 24px !important; }
        }
        @media (min-width: 769px) { .hero-mob { display: none !important; } }
        .cta-p:hover { transform: translateY(-2px); box-shadow: 0 8px 32px var(--violet-glow), 0 24px 48px rgba(45,82,64,0.35) !important; }
        .cta-p:active { transform: translateY(0) scale(0.98); }
        .nl:hover { color: var(--text-primary) !important; }
        .ac:hover { background: var(--bg-hover) !important; }
      `}</style>

      {/* NAV */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 48px', position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(14,20,17,0.75)', backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        boxShadow: 'inset 0 -1px 0 var(--divider)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, color: 'var(--violet)', letterSpacing: '-0.01em' }}>Aria</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 4, fontFamily: 'var(--font-body)' }}>POS</span>
        </Link>
        <div className="nav-links" style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
          {[['Agents', '#agents'], ['Pricing', '#pricing'], ['Compare', '/vs/shopfront']].map(([l, h]) => (
            <Link key={h} href={h} className="nl" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 150ms' }}>{l}</Link>
          ))}
          <Link href="/login" className="nl" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none', transition: 'color 150ms' }}>Sign in</Link>
          <Link href="/signup" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--gradient-aria)', padding: '8px 18px', borderRadius: 8, textDecoration: 'none' }}>Start free</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="sp" style={{ padding: '96px 48px 80px', maxWidth: 1180, margin: '0 auto' }}>
        <div className="hero-row" style={{ display: 'flex', alignItems: 'center', gap: 64 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FadeUp>
              <div style={{ marginBottom: 20 }}>
                <span style={{ ...ml, background: 'var(--violet-dim)', color: 'var(--violet)', padding: '4px 12px', borderRadius: 99, display: 'inline-block' }}>
                  Built for Australian retail
                </span>
              </div>
            </FadeUp>
            <FadeUp delay={0.04}>
              <h1 className="h1" style={{
                fontFamily: 'var(--font-display)', fontWeight: 400,
                fontSize: 'clamp(48px, 6vw, 80px)', lineHeight: 1.04,
                letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 20px',
              }}>
                The POS that<br />
                <em style={{ fontStyle: 'italic', fontWeight: 400, background: 'var(--gradient-aria)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  actually thinks.
                </em>
              </h1>
            </FadeUp>
            <FadeUp delay={0.08}>
              <p style={{ ...sub, fontSize: 18, color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 480 }}>
                Aria runs your inventory, prices, schedule, and reports — so you can run your shop.
              </p>
            </FadeUp>
            <FadeUp delay={0.12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
                <div style={{ display: 'flex' }}>
                  {['#7FB897', '#5A9577', '#2D5240', '#65B179'].map((c, i) => (
                    <div key={i} style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${c}, #0A100C)`, border: '2px solid var(--bg-base)', marginLeft: i > 0 ? -8 : 0 }} />
                  ))}
                </div>
                <span style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)' }}>Built with 12 Australian shop owners</span>
              </div>
              <div className="cta-row" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href="/signup" className="cta-p" style={{
                  padding: '14px 28px', fontSize: 15, fontWeight: 600, color: '#fff',
                  background: 'var(--gradient-aria)', border: 'none', borderRadius: 10,
                  boxShadow: '0 4px 16px var(--violet-glow), 0 12px 32px rgba(45,82,64,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                  transition: 'all 200ms cubic-bezier(0.16,1,0.3,1)', letterSpacing: '-0.005em', textDecoration: 'none', display: 'inline-block',
                }}>
                  Start 14-day free trial
                </Link>
                <a href="#demo" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--violet-soft)', color: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▶</span>
                  Watch a 3-min demo
                </a>
              </div>
              <p style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12 }}>No credit card. Free data import. Cancel anytime.</p>
            </FadeUp>
          </div>
          <div className="hero-3d" style={{ flexShrink: 0, display: 'block' }}>
            <HeroCards />
          </div>
        </div>
        <div className="hero-mob" style={{ display: 'none', marginTop: 40 }}>
          <HeroMobileCard />
        </div>
      </section>

      {/* TRUST STRIP */}
      <FadeUp>
        <div className="sp" style={{ padding: '18px 48px', borderTop: '1px solid var(--divider)', borderBottom: '1px solid var(--divider)', textAlign: 'center' }}>
          <p style={{ ...sub, fontSize: 13, color: 'var(--text-tertiary)' }}>
            Built in Melbourne · Data hosted in Sydney · Designed for Australian compliance
            <span style={{ color: 'var(--violet)', fontWeight: 600, marginLeft: 12 }}>14-day trial · No credit card</span>
          </p>
        </div>
      </FadeUp>

      {/* 12 AGENTS */}
      <section id="agents" className="sp" style={{ padding: '88px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={ml}>Autonomous agents</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '8px 0 12px' }}>
              12 agents working<br /><em style={{ fontStyle: 'italic', color: 'var(--violet)' }}>while you sleep.</em>
            </h2>
            <p style={{ ...sub, fontSize: 16, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto' }}>
              Each agent monitors your business 24/7 and acts — not just alerts.
            </p>
          </div>
        </FadeUp>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {AGENTS.map((a, i) => (
            <FadeUp key={a.n} delay={Math.min(i * 0.04, 0.28)}>
              <div className="ac" style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, padding: '18px 16px', boxShadow: 'var(--shadow-card)', transition: 'background 150ms', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>#{a.n}</span>
                  <span style={{ fontSize: 18 }}>{a.icon}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{a.name}</div>
                <div style={{ ...sub, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.desc}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="sp" style={{ padding: '80px 48px', maxWidth: 1000, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={ml}>Getting started</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '8px 0' }}>
              Running in <em style={{ fontStyle: 'italic', color: 'var(--violet)' }}>under an hour.</em>
            </h2>
          </div>
        </FadeUp>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
          {[
            { n: '01', icon: '🔄', title: 'Connect', desc: 'Drop your Shopfront or Square CSV. Aria maps the fields automatically.' },
            { n: '02', icon: '⚡', title: 'Sell', desc: 'Lightning-fast terminal that works offline. Every sale syncs when you reconnect.' },
            { n: '03', icon: '🤖', title: 'Aria learns', desc: 'Reorders stock, adjusts prices, builds next week\'s roster automatically.' },
            { n: '04', icon: '📈', title: 'Grow', desc: 'Save 10+ hours/week. Lift basket size with smart promotions. Ask anything.' },
          ].map((step, i) => (
            <FadeUp key={step.n} delay={i * 0.06}>
              <div style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 16, padding: '24px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ ...ml, marginBottom: 10 }}>Step {step.n}</div>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{step.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{step.title}</div>
                <div style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* AUSTRALIA */}
      <FadeUp>
        <section className="sp" style={{ padding: '72px 48px', borderTop: '1px solid var(--divider)' }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <p style={ml}>Australian-first</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(26px, 3.5vw, 40px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '8px 0 10px' }}>
                Not a US product<br /><em style={{ fontStyle: 'italic', color: 'var(--violet)' }}>with AU pricing bolted on.</em>
              </h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {AU_FEATURES.map((f, i) => (
                <FadeUp key={f.label} delay={i * 0.05}>
                  <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 12, boxShadow: 'var(--shadow-sm)', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{f.label}</div>
                      <div style={{ ...sub, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {/* PRICING */}
      <section id="pricing" className="sp" style={{ padding: '88px 48px', maxWidth: 980, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={ml}>Pricing</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '8px 0 20px' }}>
              <em style={{ fontStyle: 'italic', color: 'var(--violet)' }}>Simple</em> pricing.
            </h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(212,169,94,0.10)', border: '1px solid rgba(212,169,94,0.25)', color: 'var(--warning)', padding: '8px 16px', borderRadius: 99, fontSize: 13 }}>
              <span>✦</span> First 100 customers: 60 days free + free data import
            </div>
          </div>
        </FadeUp>
        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
          {PLANS.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.07}>
              <div className={p.highlight ? 'pc-mid' : ''} style={{
                background: p.highlight ? 'linear-gradient(180deg, var(--bg-elevated), var(--bg-glass))' : 'var(--bg-glass)',
                backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
                borderRadius: 18, padding: '28px 22px',
                boxShadow: p.highlight ? '0 0 0 1px rgba(127,184,151,0.3) inset, 0 24px 64px rgba(127,184,151,0.18), 0 8px 24px rgba(0,0,0,0.3)' : 'var(--shadow-card)',
                transform: p.highlight ? 'scale(1.05) translateY(-10px)' : 'scale(0.97)',
                opacity: p.highlight ? 1 : 0.92,
                position: 'relative',
              }}>
                {p.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--gradient-aria)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 99, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Recommended</div>
                )}
                <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18, fontWeight: 400, color: p.highlight ? 'var(--violet)' : 'var(--text-primary)', marginBottom: 6 }}>{p.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 40, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.04em', lineHeight: 1 }}>{p.price}</div>
                <div style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 6 }}>{p.period}</div>
                <div style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>{p.desc}</div>
                <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 18, marginBottom: 22 }}>
                  {p.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                      <span style={{ color: 'var(--success)', fontSize: 12, marginTop: 1, flexShrink: 0 }}>✓</span>
                      <span style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link href="/signup" style={{
                  display: 'block', textAlign: 'center',
                  background: p.highlight ? 'var(--gradient-aria)' : 'transparent',
                  color: p.highlight ? '#fff' : 'var(--violet)',
                  padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  boxShadow: p.highlight ? '0 4px 16px var(--violet-glow)' : 'none',
                  border: p.highlight ? 'none' : '1px solid rgba(127,184,151,0.35)',
                }}>Get started →</Link>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* VS COMPARE */}
      <FadeUp>
        <div className="sp" style={{ padding: '40px 48px', borderTop: '1px solid var(--divider)', textAlign: 'center' }}>
          <p style={{ ...sub, fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 14 }}>Compare Aria with:</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['/vs/shopfront', '/vs/square', '/vs/lightspeed'].map(href => (
              <Link key={href} href={href} style={{ fontSize: 13, color: 'var(--violet)', textDecoration: 'none', padding: '7px 16px', borderRadius: 8, background: 'var(--violet-soft)', border: '1px solid rgba(127,184,151,0.20)' }}>
                Aria vs {href.split('/')[2].charAt(0).toUpperCase() + href.split('/')[2].slice(1)}
              </Link>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* BOTTOM CTA */}
      <FadeUp>
        <section className="sp" style={{ padding: '88px 48px', textAlign: 'center' }}>
          <p style={ml}>Start today</p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(32px, 4vw, 56px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '8px 0 20px' }}>
            Your shop deserves a<br />
            <em style={{ fontStyle: 'italic', fontWeight: 400, background: 'var(--gradient-aria)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>smarter brain.</em>
          </h2>
          <p style={{ ...sub, fontSize: 16, color: 'var(--text-secondary)', marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
            14-day free trial. Import your products in minutes. No credit card.
          </p>
          <div className="cta-row" style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" className="cta-p" style={{ padding: '15px 32px', fontSize: 16, fontWeight: 600, color: '#fff', background: 'var(--gradient-aria)', border: 'none', borderRadius: 10, boxShadow: '0 4px 16px var(--violet-glow), 0 12px 32px rgba(45,82,64,0.3), inset 0 1px 0 rgba(255,255,255,0.15)', transition: 'all 200ms cubic-bezier(0.16,1,0.3,1)', textDecoration: 'none', display: 'inline-block' }}>
              Start your free trial
            </Link>
            <Link href="/pos" style={{ fontSize: 14, color: 'var(--text-secondary)', textDecoration: 'none' }}>Go to POS →</Link>
          </div>
          <p style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 14 }}>No credit card. Free data import. Cancel anytime.</p>
        </section>
      </FadeUp>

      {/* FOOTER */}
      <footer className="sp" style={{ padding: '48px 48px 32px', borderTop: '1px solid var(--divider)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 32, marginBottom: 48 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16, color: 'var(--violet)', marginBottom: 12 }}>Aria POS</div>
              <div style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>The POS that thinks.<br />Melbourne, Australia.</div>
            </div>
            <div>
              <div style={{ ...ml, marginBottom: 14 }}>Product</div>
              {[['Pricing', '/pricing'], ['Demo', '/demo'], ['Agents', '/pos/agents'], ['Ask Aria', '/pos/ask']].map(([l, h]) => (
                <div key={h} style={{ marginBottom: 10 }}><Link href={h} style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>{l}</Link></div>
              ))}
            </div>
            <div>
              <div style={{ ...ml, marginBottom: 14 }}>Compare</div>
              {[['vs Shopfront', '/vs/shopfront'], ['vs Square', '/vs/square'], ['vs Lightspeed', '/vs/lightspeed']].map(([l, h]) => (
                <div key={h} style={{ marginBottom: 10 }}><Link href={h} style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>{l}</Link></div>
              ))}
            </div>
            <div>
              <div style={{ ...ml, marginBottom: 14 }}>Legal</div>
              {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Security', '/security'], ['Data Deletion', '/data-deletion']].map(([l, h]) => (
                <div key={h} style={{ marginBottom: 10 }}><Link href={h} style={{ ...sub, fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>{l}</Link></div>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)' }}>© 2026 Aria POS Pty Ltd · Melbourne, Australia</div>
            <div style={{ ...sub, fontSize: 12, color: 'var(--text-tertiary)' }}>Data hosted in Sydney · Built for Australian retail</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

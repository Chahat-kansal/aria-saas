'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ScrollPinHero from '@/components/marketing/ScrollPinHero'

const C = {
  bg: '#0a0a0f',
  surface: '#13131a',
  surface2: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  green: '#7FB897',
  greenDark: '#2D5240',
  text: '#ffffff',
  textDim: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)',
}

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"

function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true) }, { threshold: 0.1 })
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return { ref, style: { opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 600ms ease-out, transform 600ms ease-out' } }
}

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: scrolled ? 'rgba(10,10,15,0.78)' : 'transparent', backdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none', WebkitBackdropFilter: scrolled ? 'saturate(140%) blur(14px)' : 'none', borderBottom: '1px solid ' + (scrolled ? C.border : 'transparent'), transition: 'all 240ms ease' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ color: C.text, textDecoration: 'none', fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>
          aria<span style={{ color: C.green }}>OS</span>
        </Link>
        <div className="aria-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#features" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>Features</a>
          <a href="#pricing" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>Pricing</a>
          <Link href="/login" style={{ color: C.textDim, textDecoration: 'none', fontSize: 14 }}>Login</Link>
          <Link href="/signup" style={{ padding: '8px 16px', borderRadius: 8, background: C.greenDark, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700, border: '1px solid rgba(127,184,151,0.4)' }}>Start free trial →</Link>
        </div>
        <button className="aria-nav-burger" onClick={() => setOpen(v => !v)} style={{ display: 'none', background: 'none', border: 'none', color: C.text, fontSize: 22, cursor: 'pointer' }}>☰</button>
      </div>
      {open && (
        <div className="aria-nav-mobile" style={{ display: 'none', flexDirection: 'column', padding: 16, gap: 12, background: C.surface, borderTop: '1px solid ' + C.border }}>
          <a href="#features" onClick={() => setOpen(false)} style={{ color: C.text, textDecoration: 'none', fontSize: 14 }}>Features</a>
          <a href="#pricing" onClick={() => setOpen(false)} style={{ color: C.text, textDecoration: 'none', fontSize: 14 }}>Pricing</a>
          <Link href="/login" style={{ color: C.text, textDecoration: 'none', fontSize: 14 }}>Login</Link>
          <Link href="/signup" style={{ padding: '10px 14px', borderRadius: 8, background: C.greenDark, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>Start free trial →</Link>
        </div>
      )}
    </nav>
  )
}

function BriefingMock() {
  return (
    <div style={{ borderRadius: 16, background: 'linear-gradient(180deg, rgba(127,184,151,0.06), rgba(127,184,151,0.02))', border: '1px solid rgba(127,184,151,0.2)', padding: 22, boxShadow: '0 30px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(127,184,151,0.05)' }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${C.green}, transparent)`, borderRadius: 2, marginBottom: 18 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>♟️</div>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Aria Briefing</p>
          <p style={{ fontSize: 9, color: C.textMuted, margin: '2px 0 0' }}>Council · strategic · Wed, 27 May</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {['🌱','⚠️','🎯'].map((e, i) => (
            <div key={i} style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>{e}</div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.65, marginBottom: 14 }}>
        Revenue is critically low at <strong style={{ color: '#F87171' }}>$188</strong> this week — 84% below your 4-week average. Three top SKUs are at risk of selling out before the weekend.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Today', value: '$188', color: '#F87171' },
          { label: 'Week', value: '$1,120', color: C.green },
          { label: 'Low stock', value: '3', color: '#f59e0b' },
          { label: 'Top SKU', value: '19 Crimes', color: '#A78BFA' },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{m.label}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: m.color, margin: '2px 0 0' }}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function PinnedHero() {
  return (
    <section style={{
      position: 'relative', width: '100%', height: '100%',
      padding: '80px 20px 60px', overflow: 'hidden',
      background: C.bg,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(127,184,151,0.12), transparent 70%)', pointerEvents: 'none', opacity: 'calc(1 - var(--hero-progress, 0))' }} />
      <div className="aria-hero-grid" style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 60, alignItems: 'center', width: '100%' }}>
        <div>
          <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.03em', color: C.text, margin: 0, marginBottom: 18 }}>
            Your AI business co-operator.<br />
            <span style={{ color: C.green }}>Built for Australian small business.</span>
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: C.textDim, margin: 0, marginBottom: 28, maxWidth: 540 }}>
            Aria runs your daily briefing, monitors competitors, manages stock alerts, and tells you exactly what to do — before problems become expensive.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
            <Link href="/signup" style={{ padding: '14px 26px', borderRadius: 10, background: C.green, color: '#0a0a0f', textDecoration: 'none', fontSize: 15, fontWeight: 700, boxShadow: '0 8px 24px rgba(127,184,151,0.25)' }}>Start 14-day free trial</Link>
            <a href="#features" style={{ padding: '14px 22px', borderRadius: 10, background: 'transparent', border: '1px solid ' + C.border, color: C.text, textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>See how it works ↓</a>
          </div>
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>🔒 No credit card required  ·  Cancel anytime  ·  Australian-built  ·  GDPR compliant</p>
        </div>
        <BriefingMock />
      </div>
      <div aria-hidden="true" style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        fontSize: 11, color: C.textMuted, letterSpacing: '0.18em', textTransform: 'uppercase',
        opacity: 'calc(1 - var(--hero-progress, 0))',
        transition: 'opacity 200ms',
      }}>
        Scroll ↓
      </div>
    </section>
  )
}

function SocialProof() {
  return (
    <section style={{ padding: '40px 20px', borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, background: 'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>Trusted by Australian retailers, cafés, and liquor stores</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', opacity: 0.55 }}>
          {['Sip Café','Independent Liquor','Local Retail','Brighton Wines','Sourdough Co.','The Corner Store'].map(n => (
            <span key={n} style={{ fontSize: 14, fontWeight: 600, color: C.textDim, fontFamily: 'serif', fontStyle: 'italic' }}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Problem() {
  const r = useReveal()
  const pains = [
    { icon: '📊', text: 'You check 6 different apps for sales, stock, reviews, and staff' },
    { icon: '⏰', text: 'You find out about problems after they\'ve already cost you money' },
    { icon: '🤔', text: 'Your accountant tells you what happened last month. Nobody tells you what to do today.' },
  ]
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2, color: C.text, textAlign: 'center', margin: 0, marginBottom: 14, letterSpacing: '-0.02em' }}>Running a small business is hard.</h2>
        <p style={{ fontSize: 18, color: C.textDim, textAlign: 'center', margin: 0, marginBottom: 48 }}>Your current tools make it harder.</p>
        <div className="aria-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {pains.map((p, i) => (
            <div key={i} style={{ padding: 24, borderRadius: 14, background: C.surface2, border: '1px solid ' + C.border }}>
              <div style={{ fontSize: 30, marginBottom: 12 }}>{p.icon}</div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: C.text, margin: 0 }}>{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Solution() {
  const r = useReveal()
  const features = [
    { icon: '📋', title: 'Daily Briefing', desc: 'Every morning, Aria analyses your sales, stock, customers and competitors — then tells you exactly what needs attention today' },
    { icon: '💬', title: 'Ask Aria', desc: 'Ask anything about your business. Get specific, data-backed answers — not generic advice' },
    { icon: '🖥️', title: 'POS System', desc: 'Full point-of-sale built in. Sales, inventory, loyalty, receipts — all feeding Aria\'s brain automatically' },
    { icon: '👁️', title: 'Competitor Intelligence', desc: 'Aria monitors nearby competitors daily — prices, promotions, reviews — and alerts you to opportunities' },
    { icon: '🔔', title: 'Smart Alerts', desc: 'Low stock, revenue drops, lapsed customers, compliance expiries — Aria spots them before they cost you' },
    { icon: '📈', title: 'Weekly Report', desc: 'Every Monday, a full business intelligence report lands in your inbox. No spreadsheets needed' },
  ]
  return (
    <section id="features" ref={r.ref} style={{ ...r.style, padding: '80px 20px', background: 'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontSize: 11, color: C.green, textTransform: 'uppercase', letterSpacing: '0.12em', textAlign: 'center', fontWeight: 700, marginBottom: 10 }}>Meet Aria</p>
        <h2 style={{ fontSize: 36, fontWeight: 700, color: C.text, textAlign: 'center', margin: 0, marginBottom: 48, letterSpacing: '-0.02em' }}>One AI that knows your entire business</h2>
        <div className="aria-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {features.map(f => (
            <div key={f.title} style={{ padding: 22, borderRadius: 14, background: C.surface2, border: '1px solid ' + C.border }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0, marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: C.textDim, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const r = useReveal()
  const steps = [
    { n: 1, title: 'Connect your business', desc: 'Enter your details, industry, and address. Aria sets up your dashboard instantly.' },
    { n: 2, title: 'Aria learns your business', desc: 'Connect your POS, suppliers, and integrations. Aria starts analysing immediately.' },
    { n: 3, title: 'Get your first briefing', desc: 'Tomorrow morning, your first Aria briefing arrives. It already knows what to focus on.' },
  ]
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, color: C.text, textAlign: 'center', margin: 0, marginBottom: 48, letterSpacing: '-0.02em' }}>Up and running in 10 minutes</h2>
        <div className="aria-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          {steps.map(s => (
            <div key={s.n} style={{ padding: 24, borderRadius: 14, background: C.surface2, border: '1px solid ' + C.border, position: 'relative' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.greenDark, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, marginBottom: 14 }}>{s.n}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, marginBottom: 6 }}>{s.title}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.55, color: C.textDim, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PosMock() {
  return (
    <div style={{ borderRadius: 16, background: '#0F0D1C', border: '1px solid ' + C.border, padding: 18, boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '0 4px' }}>
        <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cart · 3 items</span>
        <span style={{ fontSize: 11, color: C.green, fontFamily: 'monospace' }}>POS-008</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {[
          { name: 'Coopers Pale Ale × 24', price: '54.00' },
          { name: 'Penfolds Koonunga Hill', price: '38.00' },
          { name: '19 Crimes Red Blend', price: '22.00' },
        ].map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', fontSize: 12 }}>
            <span>{it.name}</span>
            <span style={{ fontFamily: 'monospace', color: C.green }}>A${it.price}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 10px', borderTop: '1px solid ' + C.border, borderBottom: '1px solid ' + C.border, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
        <span style={{ fontSize: 26, fontWeight: 800, color: C.green, fontFamily: 'monospace' }}>A$114.00</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        <button style={{ padding: '12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'default' }}>💵 Cash</button>
        <button style={{ padding: '12px', borderRadius: 8, border: 'none', background: C.green, color: '#0a0a0f', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'default' }}>💳 Card →</button>
      </div>
    </div>
  )
}

function PosDeepDive() {
  const r = useReveal()
  const items = ['Barcode scanning + product search', 'Cash, card, split payments', 'Loyalty points built in', 'Age verification for liquor', 'Receipt email + print', 'Real-time stock updates', 'Offline mode']
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px', background: 'rgba(127,184,151,0.02)' }}>
      <div className="aria-hero-grid" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 50, alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 11, color: C.green, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, marginBottom: 10 }}>POS</p>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: C.text, margin: 0, marginBottom: 22, letterSpacing: '-0.02em', lineHeight: 1.2 }}>The only POS that gets smarter every day</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(it => (
              <li key={it} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text }}>
                <span style={{ color: C.green }}>✅</span>{it}
              </li>
            ))}
          </ul>
        </div>
        <PosMock />
      </div>
    </section>
  )
}

function Industries() {
  const r = useReveal()
  const inds = [
    { icon: '🍷', name: 'Liquor stores', features: ['RSA compliance', 'Age verification', 'ALM/ILG supplier orders'] },
    { icon: '☕', name: 'Cafés', features: ['Table management', 'Modifiers + KDS', 'Recipe costing'] },
    { icon: '🛒', name: 'Retail', features: ['Barcode scanning', 'Stocktake + promotions', 'Supplier orders'] },
    { icon: '🏪', name: 'Any small business', features: ['Customisable', 'Industry-aware AI', 'Custom features on demand'] },
  ]
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: C.text, textAlign: 'center', margin: 0, marginBottom: 48, letterSpacing: '-0.02em' }}>Built for Australian retail and hospitality</h2>
        <div className="aria-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {inds.map(ind => (
            <div key={ind.name} style={{ padding: 22, borderRadius: 14, background: C.surface2, border: '1px solid ' + C.border }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{ind.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, marginBottom: 10 }}>{ind.name}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ind.features.map(f => (
                  <li key={f} style={{ fontSize: 12, color: C.textDim }}>• {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  const r = useReveal()
  const plans = [
    { name: 'Starter', price: '$297', desc: 'Core AI + POS + Dashboard', highlight: false },
    { name: 'Growth', price: '$597', desc: 'Everything + advanced AI + integrations', highlight: true },
    { name: 'Pro', price: '$997', desc: 'Full platform + warehouse + custom features', highlight: false },
  ]
  return (
    <section id="pricing" ref={r.ref} style={{ ...r.style, padding: '80px 20px', background: 'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: C.text, textAlign: 'center', margin: 0, marginBottom: 12, letterSpacing: '-0.02em' }}>Simple, transparent pricing</h2>
        <p style={{ fontSize: 14, color: C.textDim, textAlign: 'center', margin: 0, marginBottom: 36 }}>All plans include 14-day free trial. No credit card required.</p>
        <div className="aria-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {plans.map(p => (
            <div key={p.name} style={{ padding: 24, borderRadius: 14, background: p.highlight ? 'rgba(127,184,151,0.06)' : C.surface2, border: '1px solid ' + (p.highlight ? 'rgba(127,184,151,0.4)' : C.border), position: 'relative' }}>
              {p.highlight && <span style={{ position: 'absolute', top: -10, right: 16, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: C.green, color: '#0a0a0f' }}>POPULAR</span>}
              <p style={{ fontSize: 12, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 }}>{p.name}</p>
              <p style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, marginBottom: 6 }}>{p.price}<span style={{ fontSize: 13, color: C.textMuted, fontWeight: 400 }}>/mo</span></p>
              <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>{p.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <Link href="/pricing" style={{ color: C.green, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>See full pricing →</Link>
        </div>
      </div>
    </section>
  )
}

function Trust() {
  const r = useReveal()
  const badges = [
    { icon: '🔒', label: 'Bank-level encryption' },
    { icon: '🇦🇺', label: 'Australian-built & hosted' },
    { icon: '📋', label: 'GDPR compliant' },
    { icon: '🛡️', label: 'SOC 2 ready' },
  ]
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: C.text, margin: 0, marginBottom: 28, letterSpacing: '-0.02em' }}>Your data is safe with Aria</h2>
        <div className="aria-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {badges.map(b => (
            <div key={b.label} style={{ padding: 18, borderRadius: 12, background: C.surface2, border: '1px solid ' + C.border, textAlign: 'center' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{b.icon}</div>
              <p style={{ fontSize: 12, color: C.text, fontWeight: 600, margin: 0 }}>{b.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.65, maxWidth: 640, margin: '0 auto' }}>
          Aria uses Supabase PostgreSQL with row-level security. Your business data never trains AI models. You own your data — always.
        </p>
      </div>
    </section>
  )
}

function Faq() {
  const r = useReveal()
  const [open, setOpen] = useState<number | null>(0)
  const items = [
    { q: 'Do I need to replace my existing POS?', a: 'No. Connect your existing Square or Lightspeed and Aria adds the AI layer on top.' },
    { q: 'How long does setup take?', a: '10 minutes. Enter your business details and Aria starts your first briefing tonight.' },
    { q: 'Is my data safe?', a: 'Yes. Bank-level encryption, Australian data residency, and your data never trains AI models.' },
    { q: 'Can I cancel anytime?', a: 'Yes. No lock-in contracts. Cancel from your settings page anytime.' },
    { q: 'Does it work for my industry?', a: 'Aria supports retail, liquor, cafés, restaurants, and any small business. More industries coming.' },
  ]
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '80px 20px', background: 'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, color: C.text, textAlign: 'center', margin: 0, marginBottom: 36, letterSpacing: '-0.02em' }}>Frequently asked</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => {
            const isOpen = open === i
            return (
              <div key={i} style={{ borderRadius: 12, background: C.surface2, border: '1px solid ' + C.border, overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? null : i)} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', color: C.text, fontSize: 15, fontWeight: 600, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'inherit' }}>
                  <span>{it.q}</span>
                  <span style={{ color: C.green, fontSize: 18, transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 200ms' }}>+</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 20px 16px', fontSize: 14, color: C.textDim, lineHeight: 1.6 }}>{it.a}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  const r = useReveal()
  return (
    <section ref={r.ref} style={{ ...r.style, padding: '100px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(127,184,151,0.10), transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
        <h2 style={{ fontSize: 42, fontWeight: 800, color: C.text, lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0, marginBottom: 14 }}>Ready to give your business an AI co-operator?</h2>
        <p style={{ fontSize: 17, color: C.textDim, margin: 0, marginBottom: 28 }}>Start your 14-day free trial today. No credit card required.</p>
        <Link href="/signup" style={{ display: 'inline-block', padding: '16px 36px', borderRadius: 12, background: C.green, color: '#0a0a0f', textDecoration: 'none', fontSize: 16, fontWeight: 700, boxShadow: '0 10px 30px rgba(127,184,151,0.3)' }}>Start free trial →</Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer style={{ padding: '50px 20px 30px', borderTop: '1px solid ' + C.border, background: 'rgba(255,255,255,0.01)' }}>
      <div className="aria-footer-grid" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 30 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>aria<span style={{ color: C.green }}>OS</span></p>
          <p style={{ fontSize: 13, color: C.textDim, margin: '8px 0 0' }}>AI for Australian business</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>Product</p>
          <a href="#features" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Features</a>
          <Link href="/pricing" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Pricing</Link>
          <Link href="/integrations" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Integrations</Link>
        </div>
        <div>
          <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>Company</p>
          <Link href="/about" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>About</Link>
          <Link href="/contact" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Contact</Link>
          
        </div>
        <div>
          <p style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>Legal</p>
          <Link href="/terms" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Terms</Link>
          <Link href="/privacy" style={{ display: 'block', fontSize: 13, color: C.textDim, textDecoration: 'none', marginBottom: 6 }}>Privacy</Link>
        </div>
      </div>
      <div style={{ maxWidth: 1100, margin: '30px auto 0', paddingTop: 20, borderTop: '1px solid ' + C.border, textAlign: 'center', fontSize: 12, color: C.textMuted }}>
        © 2026 Aria OS. Built in Australia.
      </div>
    </footer>
  )
}

export default function LandingShell() {
  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: FONT, minHeight: '100vh' }}>
      <style>{`
        html { scroll-behavior: smooth; }
        @media (max-width: 768px) {
          .aria-nav-links { display: none !important; }
          .aria-nav-burger { display: block !important; }
          .aria-nav-mobile { display: flex !important; }
          .aria-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .aria-grid-2 { grid-template-columns: 1fr !important; }
          .aria-grid-3 { grid-template-columns: 1fr !important; }
          .aria-grid-4 { grid-template-columns: 1fr 1fr !important; }
          .aria-footer-grid { grid-template-columns: 1fr 1fr !important; }
          h1 { font-size: 38px !important; }
          h2 { font-size: 26px !important; }
        }
      `}</style>
      <Nav />
      <ScrollPinHero hero={<PinnedHero />}>
        <div style={{ background: C.bg }}>
          <SocialProof />
          <Problem />
          <Solution />
          <HowItWorks />
          <PosDeepDive />
          <Industries />
          <Pricing />
          <Trust />
          <Faq />
          <FinalCta />
          <Footer />
        </div>
      </ScrollPinHero>
    </div>
  )
}

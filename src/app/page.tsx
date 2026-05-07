import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aria POS — AI for Australian Retail',
  description: 'The first POS with autonomous AI agents that reorder stock, adjust prices, schedule staff, and answer questions in plain English. Built for Australian retail.',
};

const AGENTS = [
  { n: '01', name: 'Reorder', icon: '📦', desc: 'Auto-orders before you run out' },
  { n: '02', name: 'Pricing', icon: '💰', desc: 'Adjusts margins in real time' },
  { n: '03', name: 'Demand Forecast', icon: '📈', desc: 'Predicts what you\'ll sell next week' },
  { n: '04', name: 'Loss Prevention', icon: '🔒', desc: 'Flags unusual voids and overrides' },
  { n: '05', name: 'Customer Concierge', icon: '💬', desc: 'Answers loyalty questions automatically' },
  { n: '06', name: 'Churn Defender', icon: '🛡️', desc: 'Reaches out before customers leave' },
  { n: '07', name: 'Compliance', icon: '✅', desc: 'Tracks RSA, age checks, hour limits' },
  { n: '08', name: 'Voice POS', icon: '🎙️', desc: 'Serve customers hands-free' },
  { n: '09', name: 'Screenshot-to-Receipt', icon: '📸', desc: 'Capture supplier invoices instantly' },
  { n: '10', name: 'Smart Schedule', icon: '📅', desc: 'Rostering tied to demand forecast' },
  { n: '11', name: 'Conversation Reports', icon: '🗣️', desc: 'Ask Aria anything about your numbers' },
  { n: '12', name: 'Promotion Engine', icon: '🎯', desc: 'Auto-launches deals when you\'re slow' },
];

const PLANS = [
  { name: 'Starter', price: '$59', period: '/outlet/mo', desc: 'POS + Reorder Agent', highlight: false },
  { name: 'Growth', price: '$129', period: '/outlet/mo', desc: '5 agents + Voice + Concierge', highlight: true },
  { name: 'Autonomous', price: '$249', period: '/outlet/mo', desc: 'All 12 agents + CCTV vision', highlight: false },
];

export default function HomePage() {
  return (
    <div style={{ background: '#08070D', color: '#F0EBFF', fontFamily: "'Manrope',system-ui,sans-serif", minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#F0EBFF', letterSpacing: '-0.02em' }}>Aria POS</div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <Link href="/pos" style={{ fontSize: 13, color: '#918AAE', textDecoration: 'none' }}>POS</Link>
          <Link href="/pos/reports" style={{ fontSize: 13, color: '#918AAE', textDecoration: 'none' }}>Reports</Link>
          <Link href="/login" style={{ fontSize: 13, color: '#F0EBFF', textDecoration: 'none', background: '#8B5CF6', padding: '7px 18px', borderRadius: 8, fontWeight: 600 }}>Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 48px 80px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(139,92,246,0.14)', color: '#B49BFB', padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 24, border: '1px solid rgba(139,92,246,0.28)' }}>
          Built for Australian retail
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: '-0.03em' }}>
          Square sells.<br />Shopfront manages.<br /><span style={{ color: '#8B5CF6' }}>Aria runs your shop.</span>
        </h1>
        <p style={{ fontSize: 18, color: '#918AAE', lineHeight: 1.6, marginBottom: 40, maxWidth: 600, margin: '0 auto 40px' }}>
          The first POS with autonomous AI agents that reorder stock, adjust prices, schedule staff, and answer questions in plain English.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: '#8B5CF6', color: '#fff', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
            Start free 14-day trial
          </Link>
          <Link href="#demo" style={{ background: 'rgba(139,92,246,0.12)', color: '#B49BFB', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none', display: 'inline-block', border: '1px solid rgba(139,92,246,0.28)' }}>
            Watch 2-min demo
          </Link>
        </div>
        <p style={{ fontSize: 12, color: '#5E5878', marginTop: 16 }}>No credit card required · Australian-hosted data</p>
      </section>

      {/* 12 Agents */}
      <section style={{ padding: '60px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 10 }}>12 autonomous AI agents</h2>
          <p style={{ fontSize: 14, color: '#918AAE' }}>Each one works around the clock so you don&apos;t have to.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {AGENTS.map(a => (
            <div key={a.n} style={{ background: '#14111F', borderRadius: 14, padding: '18px 16px', border: '1px solid rgba(139,92,246,0.10)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: '#5E5878', fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>#{a.n}</span>
                <span style={{ fontSize: 18 }}>{a.icon}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F0EBFF', marginBottom: 4 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: '#918AAE', lineHeight: 1.4 }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Social proof */}
      <section style={{ padding: '40px 48px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p style={{ fontSize: 13, color: '#5E5878' }}>Trusted by Australian bottle shops, grocers, and retailers</p>
      </section>

      {/* Pricing */}
      <section style={{ padding: '80px 48px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 40 }}>Simple pricing</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ background: p.highlight ? '#1B1729' : '#14111F', borderRadius: 16, padding: '24px 20px', border: `1px solid ${p.highlight ? '#8B5CF6' : 'rgba(139,92,246,0.10)'}`, position: 'relative' }}>
              {p.highlight && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#8B5CF6', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>MOST POPULAR</div>}
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: p.highlight ? '#B49BFB' : '#F0EBFF' }}>{p.price}<span style={{ fontSize: 13, color: '#918AAE', fontWeight: 400 }}>{p.period}</span></div>
              <p style={{ fontSize: 13, color: '#918AAE', marginTop: 8, marginBottom: 24 }}>{p.desc}</p>
              <Link href="/signup" style={{ display: 'block', textAlign: 'center', background: p.highlight ? '#8B5CF6' : 'rgba(139,92,246,0.12)', color: p.highlight ? '#fff' : '#B49BFB', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: p.highlight ? 'none' : '1px solid rgba(139,92,246,0.28)' }}>
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* vs comparison */}
      <section style={{ padding: '40px 48px', borderTop: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#918AAE', marginBottom: 16 }}>Compare Aria with:</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['/vs/shopfront', '/vs/square', '/vs/lightspeed'].map(href => (
            <Link key={href} href={href} style={{ fontSize: 13, color: '#B49BFB', textDecoration: 'none', padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(139,92,246,0.20)', background: 'rgba(139,92,246,0.06)' }}>
              Aria vs {href.split('/')[2].charAt(0).toUpperCase() + href.split('/')[2].slice(1)}
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '40px 48px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ fontSize: 13, color: '#5E5878' }}>© 2026 Aria POS Pty Ltd · ABN pending · Melbourne, Australia</div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['Privacy', '/privacy'], ['Terms', '/terms'], ['Security', '/security'], ['Data Deletion', '/data-deletion']].map(([label, href]) => (
            <Link key={href} href={href} style={{ fontSize: 12, color: '#5E5878', textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
      </footer>
    </div>
  );
}

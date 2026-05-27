import Link from 'next/link'
import type { Metadata } from 'next'
import ScrollPinHero from '@/components/marketing/ScrollPinHero'
import MarketingPinHero from '@/components/marketing/MarketingPinHero'

export const metadata: Metadata = {
  title: 'About Aria OS — Built for Australian Small Business',
  description: 'Aria OS is an AI business co-operator built specifically for Australian retail, cafe, and hospitality owners.',
}

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#090e0b', color: '#e8f0ea', fontFamily: "'Inter',system-ui,sans-serif" }}>
      <ScrollPinHero
        hero={(
          <MarketingPinHero
            theme="dark"
            eyebrow="About Aria"
            title="Built for Australian small business."
            subtitle="A small Melbourne team building the AI co-operator your shop actually deserves."
            primaryCta={{ label: 'Start free trial', href: '/signup' }}
            secondaryCta={{ label: 'Read our story ↓', href: '#story' }}
          />
        )}
      >
      <div id="story" style={{ background: '#090e0b' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px 96px' }}>

        {/* Nav */}
        <Link href="/" style={{ fontSize: 13, color: 'rgba(127,184,151,0.7)', textDecoration: 'none', display: 'inline-block', marginBottom: 64 }}>
          ← Aria OS
        </Link>

        {/* Hero */}
        <div style={{ marginBottom: 64 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7FB897', marginBottom: 16, fontWeight: 600 }}>
            About
          </p>
          <h1 style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 24px', fontFamily: "'Fraunces',Georgia,serif" }}>
            Built for Australian<br />small business
          </h1>
          <div style={{ width: 48, height: 3, background: '#7FB897', borderRadius: 2 }} />
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 18, lineHeight: 1.75, color: 'rgba(232,240,234,0.8)' }}>
          <p style={{ margin: 0 }}>
            Aria OS is an AI business co-operator built specifically for Australian retail, cafe, and hospitality owners.
            We combine a full point-of-sale system with AI that actually understands your business — helping you reorder
            stock, win back customers, and answer questions in plain English.
          </p>
          <p style={{ margin: 0 }}>
            We're a small team based in Melbourne. We're not a big US company adapting a generic product — we've built
            Aria from the ground up for the Australian market, with GST, EFTPOS, and local suppliers in mind.
          </p>
          <p style={{ margin: 0 }}>
            Most POS software just records transactions. Aria actively helps you run your business — watching margins,
            spotting slow-moving stock before it becomes a problem, and sending purchase orders while you sleep.
          </p>
        </div>

        {/* Values */}
        <div style={{ margin: '56px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 20 }}>
          {[
            { icon: '🇦🇺', label: 'Australian-built', desc: 'GST, EFTPOS, Fair Work — we know the local context.' },
            { icon: '🤖', label: 'AI-first', desc: 'Not a bolt-on chatbot. AI woven into every workflow.' },
            { icon: '🔒', label: 'Your data, your call', desc: 'We never sell your data or train on it without consent.' },
          ].map(v => (
            <div key={v.label} style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.12)', borderRadius: 14, padding: '20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{v.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#e8f0ea' }}>{v.label}</div>
              <p style={{ fontSize: 13, color: 'rgba(232,240,234,0.55)', margin: 0, lineHeight: 1.5 }}>{v.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ borderTop: '1px solid rgba(127,184,151,0.12)', paddingTop: 48, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/signup" style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 12, background: '#7FB897', color: '#0f1a12', fontSize: 15, fontWeight: 800, textDecoration: 'none' }}>
            Start your free 14-day trial →
          </Link>
          <Link href="/contact" style={{ display: 'inline-block', padding: '14px 24px', borderRadius: 12, border: '1px solid rgba(127,184,151,0.2)', color: 'rgba(232,240,234,0.7)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Get in touch
          </Link>
        </div>

        <p style={{ marginTop: 32, fontSize: 12, color: 'rgba(232,240,234,0.2)' }}>
          © {new Date().getFullYear()} Aria OS · Melbourne, Australia · hello@ariaos.site
        </p>
      </div>
      </div>
      </ScrollPinHero>
    </div>
  )
}
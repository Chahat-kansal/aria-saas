'use client';
import { useState } from 'react';
import Link from 'next/link';

const PLANS = [
  {
    id: 'starter', label: 'Starter', price: '$59', period: '/outlet/mo',
    highlight: false,
    features: ['POS terminal', 'Reorder Agent', 'Pricing Agent', 'Basic reports', 'Email support'],
  },
  {
    id: 'growth', label: 'Growth', price: '$129', period: '/outlet/mo',
    highlight: true,
    tag: 'Most Popular',
    features: ['Everything in Starter', 'Smart Schedule', 'Customer CRM + RFM', 'Conversation Reports', 'Migration tools', 'Priority support'],
  },
  {
    id: 'autonomous', label: 'Autonomous', price: '$249', period: '/outlet/mo',
    highlight: false,
    features: ['Everything in Growth', 'All 12 agents', 'Demand Forecasting', 'Loss Prevention', 'Voice POS', 'Dedicated support'],
  },
];

const MATRIX = [
  { feature: 'POS Terminal', starter: true, growth: true, autonomous: true },
  { feature: 'Reorder Agent', starter: true, growth: true, autonomous: true },
  { feature: 'Pricing Agent', starter: true, growth: true, autonomous: true },
  { feature: 'Smart Schedule', starter: false, growth: true, autonomous: true },
  { feature: 'Customer CRM', starter: false, growth: true, autonomous: true },
  { feature: 'Conversation Reports', starter: false, growth: true, autonomous: true },
  { feature: 'Migration Tools', starter: false, growth: true, autonomous: true },
  { feature: 'All 12 Agents', starter: false, growth: false, autonomous: true },
  { feature: 'Priority Support', starter: false, growth: true, autonomous: true },
];

const FAQS = [
  { q: 'Is there a free trial?', a: 'Yes — 14 days free on all plans. No credit card required.' },
  { q: 'Can I import my existing data?', a: 'Yes. Aria supports migration from Shopfront, Square, and Lightspeed X-Series.' },
  { q: 'How does billing work?', a: 'Monthly per outlet in AUD. Cancel at any time — no lock-in contracts.' },
  { q: 'What hardware do I need?', a: 'Any iPad, tablet, or desktop browser. Aria runs entirely in the browser.' },
  { q: 'Is my data secure?', a: 'Yes. Data is stored in Australia (Sydney). AES-256 at rest, TLS in transit. SOC2 in progress.' },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: '100vh', background: '#030510', color: 'rgba(220,240,255,0.93)', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
        <Link href="/" style={{ fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', display: 'inline-block', marginBottom: 48 }}>← Aria</Link>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em' }}>Simple, transparent pricing</h1>
          <p style={{ fontSize: 16, color: 'rgba(130,160,200,0.75)', margin: 0 }}>14-day free trial. No credit card. Cancel anytime.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16, marginBottom: 64 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ background: plan.highlight ? 'rgba(139,92,246,0.12)' : '#0A0E1E', borderRadius: 20, padding: '32px', border: plan.highlight ? '2px solid #8B5CF6' : '1px solid #1A2240', position: 'relative' }}>
              {'tag' in plan && plan.tag && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#8B5CF6', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 99, whiteSpace: 'nowrap' }}>{plan.tag}</div>
              )}
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{plan.label}</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#8B5CF6', marginBottom: 4 }}>{plan.price}<span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(130,160,200,0.5)' }}>{plan.period}</span></div>
              <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.5)', marginBottom: 20 }}>All prices AUD + GST</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'rgba(130,160,200,0.8)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: '#34D399', flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href={`/signup?plan=${plan.id}`} style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, background: plan.highlight ? '#8B5CF6' : '#1A2240', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Start Free Trial →
              </Link>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, textAlign: 'center' }}>What&apos;s included</h2>
        <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #1A2240', marginBottom: 64 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#0A0E1E' }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(130,160,200,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feature</th>
                {['Starter', 'Growth', 'Autonomous'].map(h => (
                  <th key={h} style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(130,160,200,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, i) => (
                <tr key={row.feature} style={{ borderTop: '1px solid #1A2240', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 20px', fontSize: 14, color: 'rgba(220,240,255,0.85)' }}>{row.feature}</td>
                  {(['starter', 'growth', 'autonomous'] as const).map(tier => (
                    <td key={tier} style={{ padding: '12px 20px', textAlign: 'center', fontSize: 16, color: row[tier] ? '#34D399' : 'rgba(130,160,200,0.25)' }}>
                      {row[tier] ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: 'center' }}>Common questions</h2>
        <div style={{ marginBottom: 64 }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: '1px solid #1A2240', cursor: 'pointer' }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{faq.q}</span>
                <span style={{ color: '#8B5CF6', fontSize: 18 }}>{openFaq === i ? '−' : '+'}</span>
              </div>
              {openFaq === i && (
                <p style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', padding: '0 0 18px', margin: 0, lineHeight: 1.65 }}>{faq.a}</p>
              )}
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', padding: '48px', background: '#0A0E1E', borderRadius: 20, border: '1px solid #1A2240' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 12px' }}>Ready to put your shop on autopilot?</h2>
          <p style={{ fontSize: 15, color: 'rgba(130,160,200,0.75)', marginBottom: 28 }}>14 days free. No credit card required.</p>
          <Link href="/signup" style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 12, background: '#8B5CF6', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            Start Free Trial →
          </Link>
        </div>
      </div>
    </div>
  );
}

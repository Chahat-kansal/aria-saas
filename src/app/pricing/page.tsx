'use client';
import { useState } from 'react';
import Link from 'next/link';
import ScrollPinHero from '@/components/marketing/ScrollPinHero';
import MarketingPinHero from '@/components/marketing/MarketingPinHero';

const MONTHLY_PRICES = { starter: 59, growth: 129, autonomous: 249 };
const YEARLY_PRICES  = { starter: 47, growth: 103, autonomous: 199 };

const PLANS = [
  {
    id: 'starter' as const, label: 'Starter', highlight: false,
    features: ['POS terminal (unlimited registers)', 'Reorder Agent', 'Pricing Agent', 'Basic reports', 'Email support', 'Free Shopfront / Square import'],
  },
  {
    id: 'growth' as const, label: 'Growth', highlight: true, tag: 'Most Popular',
    features: ['Everything in Starter', 'Smart Schedule Agent', 'Customer CRM + RFM scoring', 'Conversation Reports (ask Aria)', 'Competitor price monitoring', 'Migration tools', 'Priority support (4-hour response)'],
  },
  {
    id: 'autonomous' as const, label: 'Autonomous', highlight: false,
    features: ['Everything in Growth', 'All 12 autonomous agents', 'Demand Forecasting', 'Loss Prevention', 'Voice POS', 'Dedicated AU support'],
  },
];

const MATRIX = [
  { feature: 'POS Terminal', starter: true, growth: true, autonomous: true },
  { feature: 'Offline mode', starter: true, growth: true, autonomous: true },
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
  { q: 'Do I need a credit card to start the trial?', a: 'No. Your 14-day trial starts immediately after sign-up — no card required. We only ask for payment details when you choose a plan at the end of your trial.' },
  { q: 'Can I switch tiers later?', a: 'Yes, anytime. Upgrades take effect immediately. Downgrades apply at the next billing cycle. Prorated credits are applied automatically.' },
  { q: 'What about transaction fees?', a: 'Zero. Aria charges a flat monthly fee. You keep 100% of every sale. Use any EFTPOS provider — Tyro, Linkly, Square terminal, or your bank — Aria doesn\'t touch the payment layer.' },
  { q: 'Is my data exportable?', a: 'Yes, anytime. Full CSV export from Settings → Data Export. Your data is yours — if you leave, you leave with everything. No lock-in.' },
  { q: 'Do you work offline?', a: 'Yes. Sales queue locally when internet drops. Items, prices, and customer data sync from the last connection. When you reconnect, everything syncs automatically. No lost sales.' },
  { q: 'Can I import from Shopfront, Square, or Lightspeed?', a: 'Yes. Drop your products CSV and Aria maps the fields automatically using AI. Full import takes under 10 minutes for most stores.' },
];

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isYearly, setIsYearly] = useState(false);

  const prices = isYearly ? YEARLY_PRICES : MONTHLY_PRICES;

  return (
    <div style={{ minHeight: '100vh', background: '#030510', color: 'rgba(220,240,255,0.93)', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <ScrollPinHero
        hero={(
          <MarketingPinHero
            theme="deep"
            eyebrow="Pricing"
            title="Built to pay for itself in week one."
            subtitle="Flat monthly fee. Zero transaction fees. 14-day free trial — no credit card."
            primaryCta={{ label: 'Start free trial', href: '/signup' }}
            secondaryCta={{ label: 'Compare plans ↓', href: '#plans' }}
          />
        )}
      >
      <div id="plans" style={{ background: '#030510' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '64px 24px' }}>
        <Link href="/" style={{ fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', display: 'inline-block', marginBottom: 48 }}>← Aria</Link>

        {/* Early customer banner */}
        <div style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: 40, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#34D399' }}>First 100 customers: 60 days free + free data import.</span>
            <span style={{ fontSize: 13, color: 'rgba(130,160,200,0.75)', marginLeft: 8 }}>Limited spots. No credit card required.</span>
          </div>
          <Link href="/signup" style={{ fontSize: 13, fontWeight: 700, color: '#34D399', textDecoration: 'none', whiteSpace: 'nowrap' }}>Claim your spot →</Link>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em' }}>Simple, transparent pricing</h1>
          <p style={{ fontSize: 16, color: 'rgba(130,160,200,0.75)', margin: '0 0 28px' }}>14-day free trial. No credit card. Cancel anytime.</p>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: '#0A0E1E', borderRadius: 99, padding: '6px 8px', border: '1px solid #1A2240' }}>
            <button onClick={() => setIsYearly(false)} style={{ padding: '6px 18px', borderRadius: 99, border: 'none', background: !isYearly ? '#8B5CF6' : 'transparent', color: !isYearly ? '#fff' : 'rgba(130,160,200,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 200ms' }}>
              Monthly
            </button>
            <button onClick={() => setIsYearly(true)} style={{ padding: '6px 18px', borderRadius: 99, border: 'none', background: isYearly ? '#8B5CF6' : 'transparent', color: isYearly ? '#fff' : 'rgba(130,160,200,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 200ms', display: 'flex', alignItems: 'center', gap: 8 }}>
              Yearly
              <span style={{ fontSize: 10, background: 'rgba(52,211,153,0.2)', color: '#34D399', padding: '2px 7px', borderRadius: 99, fontWeight: 800 }}>−20%</span>
            </button>
          </div>
          {isYearly && <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.5)', marginTop: 12 }}>Billed annually · Prices shown per month</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 16, marginBottom: 64 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ background: plan.highlight ? 'rgba(139,92,246,0.12)' : '#0A0E1E', borderRadius: 20, padding: '32px', border: plan.highlight ? '2px solid #8B5CF6' : '1px solid #1A2240', position: 'relative' }}>
              {'tag' in plan && plan.tag && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#8B5CF6', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 99, whiteSpace: 'nowrap' }}>{plan.tag}</div>
              )}
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{plan.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 4 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: '#8B5CF6' }}>${prices[plan.id]}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(130,160,200,0.5)' }}>/outlet/mo</span>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.5)', marginBottom: 20 }}>
                {isYearly ? `A$${prices[plan.id] * 12}/yr · GST extra` : 'AUD + GST · billed monthly'}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'rgba(130,160,200,0.8)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: '#34D399', flexShrink: 0 }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link href={`/signup?plan=${plan.id}&billing=${isYearly ? 'yearly' : 'monthly'}`} style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10, background: plan.highlight ? '#8B5CF6' : '#1A2240', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Start 14-day free trial →
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

        <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: 'center' }}>Frequently asked questions</h2>
        <div style={{ marginBottom: 64 }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: '1px solid #1A2240', cursor: 'pointer' }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{faq.q}</span>
                <span style={{ color: '#8B5CF6', fontSize: 18, flexShrink: 0, marginLeft: 16 }}>{openFaq === i ? '−' : '+'}</span>
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
      </ScrollPinHero>
    </div>
  );
}

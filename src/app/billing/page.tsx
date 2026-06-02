'use client'
import Link from 'next/link'
import { useState } from 'react'

const PLANS = [
  {
    name: 'Starter',
    price: '$297',
    period: '/mo',
    description: 'Perfect for single-location businesses getting started with AI.',
    features: ['Daily AI briefings', 'POS intelligence', 'Ask Aria', 'Market price scanning', 'Email support'],
    plan: 'starter',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$597',
    period: '/mo',
    description: 'For businesses ready to scale with advanced AI and multi-outlet support.',
    features: ['Everything in Starter', 'Multi-outlet POS', 'Council AI (5-brain synthesis)', 'Weekly AI reports', 'Supplier AI reordering', 'Priority support'],
    plan: 'growth',
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$997',
    period: '/mo',
    description: 'Full-stack AI operating system for ambitious operators.',
    features: ['Everything in Growth', 'Unlimited outlets', 'Custom AI workflows', 'Dedicated onboarding', 'SLA support', 'White-label options'],
    plan: 'pro',
    highlight: false,
  },
]

export default function BillingPage({
  searchParams,
}: {
  searchParams: { reason?: string; error?: string }
}) {
  const isExpired = searchParams?.reason === 'trial_expired'
  const [loading, setLoading] = useState('')
  const [error, setError] = useState(searchParams?.error || '')

  async function checkout(plan: string) {
    setLoading(plan)
    setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.error === 'billing_not_configured') {
        setError('Stripe is not yet configured. Add price IDs to Vercel env vars.')
      } else {
        setError(data.message || data.error || 'Something went wrong')
      }
    } catch {
      setError('Could not connect to payment system. Try again.')
    }
    setLoading('')
  }

  return (
    <div
      style={{ background: '#0E1411', minHeight: '100vh' }}
      className="flex flex-col items-center px-6 py-16"
    >
      <div className="text-center mb-12 max-w-xl">
        {isExpired ? (
          <>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              Trial ended
            </div>
            <h1 className="text-2xl font-semibold text-white mb-3">Your 14-day trial has ended</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)' }} className="text-sm leading-relaxed">
              Upgrade to continue using Aria&apos;s AI features. Your data is safe — you can still
              view your dashboard and download your data below.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-white mb-3">Choose your plan</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)' }} className="text-sm">
              All plans include a 14-day free trial. Cancel anytime.
            </p>
          </>
        )}
        {error && (
          <p className="mt-4 text-xs text-red-400 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mb-10">
        {PLANS.map((plan) => (
          <div
            key={plan.plan}
            style={{
              background: plan.highlight ? 'rgba(127,184,151,0.08)' : 'rgba(255,255,255,0.03)',
              border: plan.highlight ? '1px solid rgba(127,184,151,0.4)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
            }}
            className="flex flex-col p-6"
          >
            {plan.highlight && (
              <div className="text-xs font-semibold mb-3 self-start px-2 py-0.5 rounded"
                style={{ background: 'rgba(127,184,151,0.2)', color: '#7FB897' }}>
                Most popular
              </div>
            )}
            <div className="text-white font-semibold text-lg mb-1">{plan.name}</div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-bold text-white">{plan.price}</span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }} className="text-sm">{plan.period}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)' }} className="text-xs mb-5 leading-relaxed">
              {plan.description}
            </p>
            <ul className="flex flex-col gap-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span style={{ color: '#7FB897', flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => checkout(plan.plan)}
              disabled={loading !== ''}
              className="block text-center py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={
                plan.highlight
                  ? { background: '#7FB897', color: '#0E1411' }
                  : { background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.12)' }
              }
            >
              {loading === plan.plan ? 'Redirecting…' : `Get started with ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      {isExpired && (
        <div className="w-full max-w-5xl mb-8 p-4 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-xs text-center mb-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Your data is safe. You can still access your dashboard and download everything.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/dashboard"
              className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)' }}>
              View dashboard (read-only)
            </Link>
            <a href="/api/business/export"
              className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(127,184,151,0.1)', color: '#7FB897', border: '1px solid rgba(127,184,151,0.25)' }}>
              Download all my data ↓
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
        <Link href="/dashboard" className="hover:text-white transition-colors">Back to dashboard</Link>
        <span>·</span>
        <Link href="/dashboard/settings" className="hover:text-white transition-colors">Manage subscription</Link>
        <span>·</span>
        <a href="mailto:support@ariaos.site" className="hover:text-white transition-colors">Contact support</a>
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const PLANS = [
  {
    id: 'starter', label: 'Starter', price: 297,
    features: ['Daily AI briefings', 'POS intelligence', 'Ask Aria', 'Market price scanning', '1 outlet', 'Email support'],
  },
  {
    id: 'growth', label: 'Growth', price: 597,
    features: ['Everything in Starter', 'Multi-outlet POS', 'Council AI (5-brain)', 'Weekly AI reports', 'Supplier AI reordering', 'SMS alerts', 'Priority support'],
  },
  {
    id: 'pro', label: 'Pro', price: 997,
    features: ['Everything in Growth', 'Unlimited outlets', 'Custom AI workflows', 'Dedicated onboarding', 'SLA support', 'White-label options'],
  },
]

interface Sub {
  status: string
  tier?: string
  trial_ends_at?: string
  current_period_end?: string
  stripe_customer_id?: string
  cancel_at_period_end?: boolean
  cancelled_at?: string
}

export default function BillingPage() {
  const [sub, setSub] = useState<Sub | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { setSub(d.subscription ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function checkout(tier: string) {
    setActionLoading(tier); setErrMsg('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
        credentials: 'include',
      })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      if (d.error === 'billing_not_configured') {
        setErrMsg('Stripe price IDs not configured. Add STRIPE_PRICE_ID_STARTER/GROWTH/PRO to Vercel env vars.')
      } else {
        setErrMsg(d.message || d.error || 'Something went wrong')
      }
    } catch {
      setErrMsg('Could not connect. Try again.')
    }
    setActionLoading('')
  }

  async function portal() {
    // No stripe customer yet — send to billing page to subscribe first
    if (!sub?.stripe_customer_id) {
      window.location.href = '/billing'
      return
    }
    setActionLoading('portal'); setErrMsg('')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST', credentials: 'include' })
      const d = await res.json()
      if (d.url) { window.location.href = d.url; return }
      setErrMsg(d.message || 'Could not open billing portal')
    } catch {
      setErrMsg('Could not connect. Try again.')
    }
    setActionLoading('')
  }

  const inTrial = sub?.status === 'trialing'
  const isActive = sub?.status === 'active'
  const isPastDue = sub?.status === 'past_due'
  const isCancelled = sub?.status === 'canceled'
  const hasSubscription = inTrial || isActive || isPastDue
  const planLabel = PLANS.find(p => p.id === sub?.tier)?.label ?? sub?.tier ?? '—'
  const trialEnd = sub?.trial_ends_at
    ? new Date(sub.trial_ends_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const renewDate = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const cancelledAt = sub?.cancelled_at
    ? new Date(sub.cancelled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--divider)',
    borderRadius: 14,
    padding: '24px 28px',
    marginBottom: 20,
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Billing & plan</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>
        Manage your subscription, cancel any time, and download invoices.
      </p>

      {loading ? (
        <div style={{ ...card, height: 90, animation: 'pulse 1.5s ease infinite' }} />
      ) : (
        <>
          {/* ── Current plan card ── */}
          {hasSubscription && (
            <div style={{ ...card, border: '1px solid rgba(127,184,151,0.25)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{planLabel} plan</span>
                    {inTrial && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>
                        Trial
                      </span>
                    )}
                    {isActive && !sub?.cancel_at_period_end && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>
                        Active
                      </span>
                    )}
                    {isPastDue && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 700 }}>
                        Payment failed
                      </span>
                    )}
                    {sub?.cancel_at_period_end && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', color: '#fbbf24', fontWeight: 700 }}>
                        Cancelling
                      </span>
                    )}
                  </div>
                  {inTrial && trialEnd && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      Free trial ends {trialEnd} — card will be charged after
                    </p>
                  )}
                  {isActive && renewDate && !sub?.cancel_at_period_end && (
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                      Renews {renewDate}
                    </p>
                  )}
                  {sub?.cancel_at_period_end && renewDate && (
                    <p style={{ fontSize: 13, color: '#fbbf24', margin: 0 }}>
                      Access ends {renewDate} — subscription will not renew
                    </p>
                  )}
                  {isPastDue && (
                    <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>
                      Last payment failed. Update your card to keep Aria running.
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {/* Manage / Cancel via Stripe portal */}
                  <button
                    onClick={portal}
                    disabled={!!actionLoading}
                    style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: actionLoading === 'portal' ? 0.6 : 1 }}
                  >
                    {actionLoading === 'portal' ? 'Loading…' : 'Manage billing →'}
                  </button>
                </div>
              </div>

              {/* What "Manage billing" does — helps owner know cancel is there */}
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '16px 0 0', lineHeight: 1.6 }}>
                "Manage billing" opens the secure Stripe portal where you can{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>cancel your subscription</strong>,
                change plan, update your card, and download past invoices.
              </p>
            </div>
          )}

          {/* ── Cancelled state ── */}
          {isCancelled && (
            <div style={{ ...card, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>Subscription cancelled</p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                {cancelledAt ? `Cancelled on ${cancelledAt}. ` : ''}
                Choose a plan below to reactivate.
              </p>
            </div>
          )}

          {/* ── No subscription ── */}
          {!hasSubscription && !isCancelled && (
            <div style={{ ...card, background: 'rgba(127,184,151,0.04)', border: '1px solid rgba(127,184,151,0.12)' }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                No active subscription — choose a plan below to get started with a 14-day free trial.
              </p>
            </div>
          )}

          {/* ── Plan cards — show when trialing or no sub ── */}
          {(inTrial || !hasSubscription || isCancelled) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginTop: 8 }}>
              {PLANS.map(plan => {
                const isCurrent = sub?.tier === plan.id
                return (
                  <div key={plan.id} style={{
                    background: 'var(--bg-surface)',
                    border: isCurrent ? '1px solid rgba(127,184,151,0.4)' : '1px solid var(--divider)',
                    borderRadius: 14, padding: 20,
                    display: 'flex', flexDirection: 'column', gap: 14,
                  }}>
                    {isCurrent && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700, alignSelf: 'flex-start' }}>
                        Current plan
                      </span>
                    )}
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{plan.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, margin: '6px 0 0' }}>
                        A${plan.price}
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>/mo</span>
                      </div>
                    </div>
                    <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                      {plan.features.map(f => (
                        <li key={f} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                          <span style={{ color: '#7FB897', flexShrink: 0 }}>✓</span>{f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => checkout(plan.id)}
                      disabled={!!actionLoading || isCurrent}
                      style={{
                        width: '100%', padding: '10px 0', borderRadius: 9,
                        border: isCurrent ? '1px solid rgba(127,184,151,0.3)' : 'none',
                        background: isCurrent ? 'transparent' : '#7FB897',
                        color: isCurrent ? '#7FB897' : '#0E1411',
                        fontSize: 13, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: actionLoading === plan.id ? 0.6 : 1,
                      }}
                    >
                      {actionLoading === plan.id ? 'Loading…' : isCurrent ? 'Current plan' : `Upgrade to ${plan.label}`}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {errMsg && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13, marginTop: 16 }}>
          {errMsg}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 28, lineHeight: 1.6 }}>
        All prices in AUD inc. GST. Cancel any time — no lock-in contracts.{' '}
        <a href="mailto:support@ariaos.site" style={{ color: 'var(--text-tertiary)' }}>support@ariaos.site</a>
      </p>
    </div>
  )
}

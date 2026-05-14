'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const PLANS = [
  { id: 'starter', label: 'Starter', price: 297, features: ['POS Terminal', 'Reorder Agent', 'Basic reporting', '1 outlet'] },
  { id: 'growth',  label: 'Growth',  price: 597, features: ['Everything in Starter', '5 AI agents', 'Voice reports', 'Multi-outlet', 'SMS alerts'] },
  { id: 'pro',     label: 'Pro',     price: 997, features: ['Everything in Growth', 'All 12 agents', 'CCTV vision', 'Dedicated support', 'Custom integrations'] },
]

interface Sub { status: string; tier?: string; trial_ends_at?: string; current_period_end?: string; stripe_customer_id?: string }

export default function BillingPage() {
  const [sub, setSub] = useState<Sub | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [stripeNotConfigured, setStripeNotConfigured] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    fetch('/api/billing/status').then(r => r.json()).then(d => {
      setSub(d.subscription ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  async function checkout(tier: string) {
    setActionLoading(tier); setErrMsg(''); setStripeNotConfigured(false)
    const res = await fetch('/api/billing/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    })
    const d = await res.json()
    if (d.url) { window.location.href = d.url; return }
    if (d.error === 'billing_not_configured') { setStripeNotConfigured(true) }
    else if (d.error) { setErrMsg(d.error) }
    setActionLoading('')
  }

  async function portal() {
    setActionLoading('portal')
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    const d = await res.json()
    if (d.url) window.location.href = d.url
    else setActionLoading('')
  }

  const inTrial = sub?.status === 'trialing'
  const isActive = sub?.status === 'active' || inTrial
  const planLabel = PLANS.find(p => p.id === sub?.tier)?.label ?? sub?.tier ?? 'Free'
  const trialEnd  = sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }) : null
  const renewDate = sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>Billing & Plan</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 32px' }}>Manage your subscription and billing details.</p>

      {loading ? (
        <div style={{ height: 80, background: 'var(--bg-surface)', borderRadius: 12, animation: 'pulse 1.5s ease infinite' }} />
      ) : isActive ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 14, padding: '24px 28px', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{planLabel} Plan</span>
                {inTrial && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(127,184,151,0.15)', color: '#7FB897', fontWeight: 700 }}>Trial</span>}
              </div>
              {inTrial && trialEnd && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>All features unlocked during your trial — trial ends {trialEnd}</p>
              )}
              {!inTrial && renewDate && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Renews {renewDate}</p>
              )}
            </div>
            <button onClick={portal} disabled={!!actionLoading}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {actionLoading === 'portal' ? 'Loading…' : 'Manage billing →'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.15)', borderRadius: 12, padding: '14px 18px', marginBottom: 28, fontSize: 13, color: 'var(--text-secondary)' }}>
          No active subscription — choose a plan below to get started.
        </div>
      )}

      {/* Plan cards */}
      {!isActive && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {PLANS.map(plan => (
            <div key={plan.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{plan.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, margin: '8px 0 0' }}>
                  A${plan.price}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)' }}>/mo</span>
                </div>
              </div>
              <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                    <span style={{ color: '#7FB897' }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => checkout(plan.id)} disabled={!!actionLoading}
                style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: actionLoading === plan.id ? 0.6 : 1 }}>
                {actionLoading === plan.id ? 'Loading…' : 'Start with ' + plan.label}
              </button>
            </div>
          ))}
        </div>
      )}

      {errMsg && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: 13, marginTop: 16 }}>
          {errMsg}
        </div>
      )}

      {stripeNotConfigured && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '24px 28px', marginTop: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: '#F59E0B' }}>⚙️ Set up Stripe Billing</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>Stripe price IDs aren&apos;t configured yet. Follow these steps to enable billing:</p>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>
            <li>Go to <a href="https://dashboard.stripe.com/products" target="_blank" rel="noreferrer" style={{ color: 'var(--violet)' }}>dashboard.stripe.com → Products</a> → Create 3 products</li>
            <li>Name them: <strong style={{ color: 'var(--text-primary)' }}>Starter ($297/mo)</strong>, <strong style={{ color: 'var(--text-primary)' }}>Growth ($597/mo)</strong>, <strong style={{ color: 'var(--text-primary)' }}>Pro ($997/mo)</strong></li>
            <li>Copy the Price IDs (format: <code style={{ fontFamily: 'monospace', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 4 }}>price_xxxx</code>)</li>
            <li>In <a href="https://vercel.com" target="_blank" rel="noreferrer" style={{ color: 'var(--violet)' }}>Vercel Dashboard → Settings → Environment Variables</a> add:<br />
              <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-elevated)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                STRIPE_PRICE_ID_STARTER · STRIPE_PRICE_ID_GROWTH · STRIPE_PRICE_ID_PRO
              </code>
            </li>
            <li>Also add <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>STRIPE_SECRET_KEY</code> and <code style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code></li>
            <li>Redeploy — billing will activate automatically</li>
          </ol>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Need help? Contact <a href="mailto:hello@ariaos.site" style={{ color: 'var(--violet)' }}>hello@ariaos.site</a></p>
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 28 }}>
        All prices in AUD. GST added at checkout. Cancel any time.{' '}
        <Link href="/terms" style={{ color: 'var(--text-tertiary)' }}>Terms apply.</Link>
      </p>
    </div>
  )
}
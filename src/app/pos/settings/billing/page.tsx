'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Sub {
  tier: string
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

const TIERS = [
  {
    id: 'starter', label: 'Starter', price: '$59', period: '/outlet/mo',
    desc: 'POS terminal, Reorder Agent, Pricing Agent, basic reports',
    highlight: false,
  },
  {
    id: 'growth', label: 'Growth', price: '$129', period: '/outlet/mo',
    desc: 'All agents, Conversation Reports, Customer CRM, migration tools, priority support',
    highlight: true,
    tag: 'Most Popular',
  },
  {
    id: 'autonomous', label: 'Autonomous', price: '$249', period: '/outlet/mo',
    desc: 'Everything in Growth + full autonomy, all 12 agents, demand forecasting, loss prevention',
    highlight: false,
  },
]

const statusColor = (s: string) =>
  ({ active: '#34D399', trialing: '#60A5FA', past_due: '#FBBF24', canceled: '#F87171' }[s] ?? '#F87171')

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return Infinity
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export default function BillingPage() {
  const [sub, setSub] = useState<Sub | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/stripe')
      .then(r => r.json())
      .then(d => { setSub(d.subscription); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function openPortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe?action=create_portal', { method: 'POST' })
      const { url, error } = await res.json() as { url?: string; error?: string }
      if (error) { setErrMsg(error); return }
      if (url) window.open(url, '_blank')
    } catch (e) {
      setErrMsg((e as Error).message)
    } finally {
      setPortalLoading(false)
    }
  }

  async function startTrial(tier: string) {
    setCheckoutLoading(tier)
    try {
      const res = await fetch('/api/stripe?action=create_checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const { url, error } = await res.json() as { url?: string; error?: string }
      if (error) { setErrMsg(error); return }
      if (url) window.location.href = url
    } catch (e) {
      setErrMsg((e as Error).message)
    } finally {
      setCheckoutLoading(null)
    }
  }

  const trialDaysLeft = sub?.status === 'trialing' ? daysUntil(sub.trial_ends_at) : null
  const showTrialWarning = trialDaysLeft !== null && trialDaysLeft <= 7

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 820 }}>
      {showTrialWarning && (
        <div style={{ marginBottom: 20, padding: '12px 18px', borderRadius: 10, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#FBBF24', fontWeight: 600 }}>
            Your free trial ends in {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}. Choose a plan below to keep access.
          </span>
          <Link href="#plans" style={{ fontSize: 13, fontWeight: 700, color: '#FBBF24', textDecoration: 'none' }}>Choose plan →</Link>
        </div>
      )}

      {errMsg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#F87171', fontSize: 13 }}>
          ⚠ {errMsg}
        </div>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Billing & Subscription</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>Manage your Aria plan and payment details.</p>

      {loading ? (
        Array.from({ length: 2 }).map((_, i) => <div key={i} style={{ height: 100, background: 'var(--bg-surface)', borderRadius: 14, marginBottom: 12 }} />)
      ) : sub ? (
        <>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '24px', marginBottom: 16, border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 19, fontWeight: 800, textTransform: 'capitalize' }}>{sub.tier} Plan</span>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: statusColor(sub.status) + '22', color: statusColor(sub.status), fontWeight: 700, textTransform: 'capitalize' }}>
                    {sub.status.replace('_', ' ')}
                  </span>
                </div>
                {sub.status === 'trialing' && sub.trial_ends_at && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                    Trial ends: {fmtDate(sub.trial_ends_at)} · {daysUntil(sub.trial_ends_at)} days remaining
                  </p>
                )}
                {sub.current_period_end && sub.status !== 'trialing' && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                    {sub.cancel_at_period_end ? 'Cancels' : 'Renews'}: {fmtDate(sub.current_period_end)}
                  </p>
                )}
              </div>
              <button onClick={openPortal} disabled={portalLoading} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                {portalLoading ? 'Loading…' : 'Manage subscription →'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 6px' }}>Token Usage</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Detailed usage available in <Link href="/pos/settings" style={{ color: 'var(--violet)' }}>Settings → Usage</Link>.
            </p>
          </div>

          {(sub.status === 'trialing' || sub.status === 'canceled') && (
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px' }} id="plans">
              {sub.status === 'trialing' ? 'Ready to subscribe? Choose your plan:' : 'Reactivate your subscription:'}
            </p>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '28px 20px 20px', marginBottom: 20 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Start your 14-day free trial</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>No credit card required. Cancel anytime.</p>
        </div>
      )}

      {(!sub || sub.status === 'trialing' || sub.status === 'canceled') && (
        <div id="plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14 }}>
          {TIERS.map(t => (
            <div key={t.id} style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '22px', border: t.highlight ? '2px solid var(--violet)' : '1px solid var(--border-default)', position: 'relative' }}>
              {t.tag && (
                <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'var(--violet)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 12px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                  {t.tag}
                </div>
              )}
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--violet)' }}>{t.price}</span>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t.period}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.55 }}>{t.desc}</p>
              <button
                onClick={() => startTrial(t.id)}
                disabled={checkoutLoading === t.id}
                style={{ width: '100%', padding: '10px', borderRadius: 9, border: 'none', background: t.highlight ? 'var(--violet)' : 'var(--bg-elevated)', color: t.highlight ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: checkoutLoading === t.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: checkoutLoading === t.id ? 0.6 : 1 }}>
                {checkoutLoading === t.id ? 'Loading…' : 'Start 14-day free trial'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

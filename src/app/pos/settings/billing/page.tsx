'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Subscription {
  tier: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const TIERS = [
  { id: 'starter', label: 'Starter', price: '$59', desc: 'POS terminal + Reorder Agent + Pricing Agent' },
  { id: 'growth', label: 'Growth', price: '$129', desc: 'Everything in Starter + 5 agents, Conversation Reports, Migration tools' },
  { id: 'autonomous', label: 'Autonomous', price: '$249', desc: 'Everything in Growth + all 12 agents, Demand Forecasting, Loss Prevention' },
];

const statusColor = (s: string) => {
  if (s === 'active') return '#34D399';
  if (s === 'trialing') return '#60A5FA';
  if (s === 'past_due') return '#FBBF24';
  return '#F87171';
};

export default function BillingPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/status').then(r => r.json()).then(d => {
      setSub(d.subscription);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const { url } = await res.json();
    if (url) window.location.href = url;
    setPortalLoading(false);
  }

  async function startTrial(tier: string) {
    setCheckoutLoading(tier);
    const res = await fetch('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }) });
    const { url, error } = await res.json();
    if (error) { setCheckoutLoading(null); return; }
    if (url) window.location.href = url;
    setCheckoutLoading(null);
  }

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 800 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Billing & Subscription</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Manage your Aria plan and payment details.</p>
      </div>

      {loading ? (
        <div style={{ height: 160, background: 'var(--bg-surface)', borderRadius: 14 }} />
      ) : sub ? (
        <>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '24px', marginBottom: 16, border: '1px solid var(--border-default)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, textTransform: 'capitalize' }}>{sub.tier} Plan</span>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: statusColor(sub.status) + '22', color: statusColor(sub.status), fontWeight: 700, textTransform: 'capitalize' }}>{sub.status.replace('_', ' ')}</span>
                </div>
                {sub.status === 'trialing' && sub.trial_ends_at && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>Trial ends: {fmtDate(sub.trial_ends_at)}</p>
                )}
                {sub.current_period_end && sub.status !== 'trialing' && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                    {sub.cancel_at_period_end ? 'Cancels' : 'Renews'}: {fmtDate(sub.current_period_end)}
                  </p>
                )}
              </div>
              <button onClick={openPortal} disabled={portalLoading} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {portalLoading ? 'Loading…' : 'Manage Plan'}
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px 24px', marginBottom: 16, border: '1px solid var(--border-default)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>Token Usage</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Detailed token usage is available in <Link href="/pos/settings" style={{ color: 'var(--violet)' }}>Settings → Usage</Link>.</p>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: 'center', padding: '32px 20px 24px', marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Start your 14-day free trial</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>No credit card required. Cancel anytime.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14, marginBottom: 24 }}>
            {TIERS.map(t => (
              <div key={t.id} style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px', border: t.id === 'growth' ? '2px solid var(--violet)' : '1px solid var(--border-default)' }}>
                {t.id === 'growth' && <div style={{ fontSize: 10, color: 'var(--violet)', fontWeight: 800, marginBottom: 8, letterSpacing: '0.08em' }}>MOST POPULAR</div>}
                <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--violet)', marginBottom: 8 }}>{t.price}<span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-tertiary)' }}>/mo</span></div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>{t.desc}</p>
                <button onClick={() => startTrial(t.id)} disabled={checkoutLoading === t.id} style={{ width: '100%', padding: '9px', borderRadius: 9, border: 'none', background: t.id === 'growth' ? 'var(--violet)' : 'var(--bg-elevated)', color: t.id === 'growth' ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {checkoutLoading === t.id ? 'Loading…' : 'Start Free Trial'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

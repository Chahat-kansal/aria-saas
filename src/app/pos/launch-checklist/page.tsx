'use client';
import { useState, useEffect } from 'react';

interface CheckItem {
  id: string;
  label: string;
  category: string;
  testFn?: () => Promise<{ ok: boolean; detail?: string }>;
}

const ITEMS: CheckItem[] = [
  { id: 'stripe_products', category: 'Stripe', label: 'Stripe products configured (starter/growth/autonomous price IDs)' },
  { id: 'stripe_webhook', category: 'Stripe', label: 'Stripe webhook endpoint active (ariaos.site/api/stripe?action=webhook)' },
  { id: 'stripe_env', category: 'Stripe', label: 'STRIPE_* env vars set in Vercel (secret key, webhook secret, 3 price IDs)' },
  { id: 'anthropic_key', category: 'API Keys', label: 'ANTHROPIC_API_KEY set in Vercel' },
  { id: 'resend_key', category: 'API Keys', label: 'RESEND_API_KEY set in Vercel (for PO emails + roster notifications)' },
  { id: 'ssl', category: 'Infrastructure', label: 'Domain ariaos.site SSL active (HTTPS green)' },
  { id: 'vs_shopfront', category: 'Marketing pages', label: '/vs/shopfront comparison page deployed' },
  { id: 'vs_square', category: 'Marketing pages', label: '/vs/square comparison page deployed' },
  { id: 'vs_lightspeed', category: 'Marketing pages', label: '/vs/lightspeed comparison page deployed' },
  { id: 'pos_ask', category: 'Features', label: '/pos/ask working with real data (try asking about yesterday\'s sales)' },
  { id: 'migrate', category: 'Features', label: '/pos/setup/migrate tested with sample Shopfront CSV' },
  { id: 'display', category: 'Features', label: 'Customer display animations playing at /pos/display' },
  { id: 'cron_nightly', category: 'Crons', label: 'nightly-sync cron job scheduled (0 2 * * * UTC)' },
  { id: 'cron_rfm', category: 'Crons', label: 'rfm-daily cron job scheduled (0 16 * * * UTC)' },
  { id: 'cron_reorder', category: 'Crons', label: 'reorder-daily cron job scheduled (0 19 * * * UTC)' },
  { id: 'cron_pricing', category: 'Crons', label: 'pricing-daily cron job scheduled (0 20 * * * UTC)' },
  { id: 'cron_schedule', category: 'Crons', label: 'schedule-weekly cron job scheduled (0 21 * * 0 UTC)' },
  { id: 'cron_briefing', category: 'Crons', label: 'briefing-daily cron job scheduled (0 18 * * * UTC)' },
  { id: 'posthog', category: 'Analytics', label: 'PostHog events firing in dashboard (check signup + agent events)' },
  { id: 'email_po', category: 'Email', label: 'PO email template renders correctly (approve a reorder in /pos/agents/reorder)' },
  { id: 'email_roster', category: 'Email', label: 'Roster email template renders (publish a schedule in /pos/agents/schedule)' },
];

const QUICK_TESTS: Record<string, () => Promise<{ ok: boolean; detail?: string }>> = {
  vs_shopfront: async () => {
    try {
      const r = await fetch('/vs/shopfront', { method: 'HEAD' });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch { return { ok: false, detail: 'Fetch failed' }; }
  },
  vs_square: async () => {
    try {
      const r = await fetch('/vs/square', { method: 'HEAD' });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch { return { ok: false, detail: 'Fetch failed' }; }
  },
  vs_lightspeed: async () => {
    try {
      const r = await fetch('/vs/lightspeed', { method: 'HEAD' });
      return { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch { return { ok: false, detail: 'Fetch failed' }; }
  },
  pos_ask: async () => {
    try {
      const r = await fetch('/api/pos/ask', { method: 'GET' });
      return { ok: r.status !== 500, detail: `API status ${r.status}` };
    } catch { return { ok: false, detail: 'Fetch failed' }; }
  },
  cron_nightly: async () => {
    try {
      const r = await fetch('/api/cron/nightly-sync', { headers: { 'x-cron-secret': '...' } });
      return { ok: r.status !== 500, detail: r.status === 401 ? 'Route exists (401 auth)' : `HTTP ${r.status}` };
    } catch { return { ok: false, detail: 'Fetch failed' }; }
  },
};

const CATEGORIES = [...new Set(ITEMS.map(i => i.category))];

export default function LaunchChecklistPage() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail?: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('');

  useEffect(() => {
    fetch('/api/pos/business').then(r => r.json()).catch(() => null);
    const stored = localStorage.getItem('aria_launch_checklist');
    if (stored) setChecked(new Set(JSON.parse(stored)));
  }, []);

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('aria_launch_checklist', JSON.stringify([...next]));
      return next;
    });
  }

  async function runTest(id: string) {
    const fn = QUICK_TESTS[id];
    if (!fn) return;
    setTesting(id);
    const result = await fn();
    setTestResults(prev => ({ ...prev, [id]: result }));
    setTesting(null);
  }

  const total = ITEMS.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);

  const statusColor = (id: string) => {
    const r = testResults[id];
    if (!r) return 'transparent';
    return r.ok ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)';
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '32px 28px', maxWidth: 780 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Launch Checklist</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Internal use only. Tick items as you verify them.</p>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{done} / {total} complete</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: pct === 100 ? '#34D399' : 'var(--violet)' }}>{pct}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: pct === 100 ? '#34D399' : 'var(--violet)', width: `${pct}%`, transition: 'width 0.3s ease' }} />
          </div>
        </div>
        {pct === 100 && <div style={{ fontSize: 28 }}>🚀</div>}
      </div>

      {CATEGORIES.map(cat => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{cat}</div>
          {ITEMS.filter(i => i.category === cat).map(item => {
            const isChecked = checked.has(item.id);
            const result = testResults[item.id];
            const hasFn = !!QUICK_TESTS[item.id];
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, marginBottom: 6, background: isChecked ? 'rgba(52,211,153,0.06)' : statusColor(item.id) || 'var(--bg-surface)', border: `1px solid ${isChecked ? 'rgba(52,211,153,0.2)' : 'var(--border-default)'}`, cursor: 'pointer', transition: 'all 150ms' }} onClick={() => toggle(item.id)}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${isChecked ? '#34D399' : 'var(--border-default)'}`, background: isChecked ? '#34D399' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff', fontWeight: 800 }}>
                  {isChecked ? '✓' : ''}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: isChecked ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: isChecked ? 'line-through' : 'none', opacity: isChecked ? 0.7 : 1 }}>{item.label}</span>
                {result && (
                  <span style={{ fontSize: 11, color: result.ok ? '#34D399' : '#F87171', fontWeight: 600, flexShrink: 0 }}>
                    {result.ok ? '✓ OK' : '✗ Fail'}{result.detail ? ` · ${result.detail}` : ''}
                  </span>
                )}
                {hasFn && (
                  <button onClick={e => { e.stopPropagation(); runTest(item.id); }} disabled={testing === item.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, fontWeight: 600 }}>
                    {testing === item.id ? '…' : 'Test'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {pct === 100 && (
        <div style={{ textAlign: 'center', padding: '32px', background: 'rgba(52,211,153,0.08)', borderRadius: 16, border: '1px solid rgba(52,211,153,0.25)', marginTop: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: '#34D399' }}>Ready to launch!</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>All items verified. Go ship it.</p>
        </div>
      )}
    </div>
  );
}

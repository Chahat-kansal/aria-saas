'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Customer {
  id: string; name: string; email: string | null; phone: string | null;
  loyalty_points: number; total_spent: number; created_at: string;
}
interface Settings { points_per_dollar?: number; min_redeem?: number; }

function S({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '16px 20px' }}>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 8, fontFamily: 'var(--font-ui)' }}>{label}</p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>{sub}</p>}
    </div>
  );
}

export default function LoyaltyPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings]  = useState<Settings>({ points_per_dollar: 1, min_redeem: 100 });
  const [loading, setLoading]    = useState(true);
  const [search, setSearch]      = useState('');
  const [awardId, setAwardId]    = useState<string | null>(null);
  const [awardPoints, setAwardPoints] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [awarding, setAwarding]  = useState(false);

  const load = useCallback(async () => {
    try {
      const [cr, sr] = await Promise.all([
        fetch('/api/pos/customers?limit=200&sort=loyalty_points').then(r => r.json()),
        fetch('/api/pos/settings').then(r => r.json()),
      ]);
      const all: Customer[] = cr.customers ?? [];
      setCustomers(all.sort((a, b) => b.loyalty_points - a.loyalty_points));
      if (sr.settings?.loyalty_points_per_dollar) setSettings({ points_per_dollar: sr.settings.loyalty_points_per_dollar, min_redeem: sr.settings.min_loyalty_points_redeem ?? 100 });
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? '').includes(search)
  );
  const totalPoints = customers.reduce((s, c) => s + c.loyalty_points, 0);
  const withPoints  = customers.filter(c => c.loyalty_points > 0).length;

  async function awardBonus() {
    if (!awardId || !awardPoints) return;
    setAwarding(true);
    try {
      await fetch(`/api/pos/customers/${awardId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loyalty_points_add: parseInt(awardPoints), reason: awardReason }),
      });
      setAwardId(null); setAwardPoints(''); setAwardReason('');
      await load();
    } catch { /* silent */ }
    setAwarding(false);
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-base)', fontFamily: 'var(--font-ui)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(8,12,16,0.9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Loyalty Program</h1>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{settings.points_per_dollar ?? 1} point per dollar · Redeem from {settings.min_redeem ?? 100} points</p>
        </div>
        <Link href="/pos/loyalty/scan" style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 10, background: '#2D5240', color: '#7FB897', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>📷 Scan loyalty code</Link>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
          <S label="Total points outstanding" value={totalPoints.toLocaleString()} sub="across all customers" />
          <S label="Members with points" value={String(withPoints)} sub="active loyalty members" />
          <S label="Total members" value={String(customers.length)} sub="in database" />
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)' }}
          />
          <a href="/pos/settings/loyalty" style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--violet-dim)', border: '1px solid var(--border-violet)', color: 'var(--violet)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Settings →
          </a>
        </div>

        {/* Leaderboard */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: 'var(--violet)', animation: 'pos-processing 0.7s linear infinite' }} />
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              {['#','Name','Points','Spent',''].map(h => (
                <p key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 700 }}>{h}</p>
              ))}
            </div>
            {filtered.length === 0 ? (
              <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>No customers found</p>
            ) : filtered.slice(0, 100).map((c, i) => {
              const medals = ['🥇','🥈','🥉'];
              return (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 120px 100px', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                  <span style={{ fontSize: i < 3 ? 16 : 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{medals[i] ?? i + 1}</span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.email ?? c.phone ?? ''}</p>
                  </div>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: c.loyalty_points > 0 ? 'var(--violet)' : 'var(--text-tertiary)' }}>{c.loyalty_points.toLocaleString()}</p>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>A${(c.total_spent ?? 0).toFixed(2)}</p>
                  <button onClick={() => setAwardId(c.id)}
                    style={{ background: 'var(--violet-dim)', border: '1px solid var(--border-violet)', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: 'var(--violet)', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                    Award pts
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Award modal */}
      {awardId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,16,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '28px 24px', maxWidth: 360, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16, fontFamily: 'var(--font-ui)' }}>Award Bonus Points</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>Points to award</p>
                <input type="number" min="1" value={awardPoints} onChange={e => setAwardPoints(e.target.value)}
                  placeholder="e.g. 50"
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }}
                  autoFocus />
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>Reason (optional)</p>
                <input value={awardReason} onChange={e => setAwardReason(e.target.value)}
                  placeholder="e.g. Birthday bonus"
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-ui)' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setAwardId(null); setAwardPoints(''); setAwardReason(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
                Cancel
              </button>
              <button onClick={awardBonus} disabled={awarding || !awardPoints}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: awarding ? 'not-allowed' : 'pointer', opacity: (!awardPoints || awarding) ? 0.5 : 1, fontFamily: 'var(--font-ui)' }}>
                {awarding ? 'Awarding…' : 'Award Points'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

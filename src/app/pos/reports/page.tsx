'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import AriaInsightCard from '@/components/reports/AriaInsightCard';

const CARDS = [
  { label: 'Sales', desc: 'Revenue, transactions, top products', href: '/pos/reports/sales', icon: '📈' },
  { label: 'Inventory', desc: 'Stock levels, dead stock, reorder alerts', href: '/pos/reports/inventory', icon: '📦' },
  { label: 'Cashier', desc: 'Per-staff KPIs, voids, hourly performance', href: '/pos/reports/cashier', icon: '👤' },
  { label: 'Commission', desc: 'Commission rules, per-staff earnings', href: '/pos/reports/commission', icon: '💰' },
  { label: 'Closures', desc: 'Register sessions, cash variance', href: '/pos/reports/closures', icon: '🔒' },
  { label: 'Actions', desc: 'Full audit log — voids, overrides, logins', href: '/pos/reports/actions', icon: '📋' },
  { label: 'Advanced', desc: 'Custom builder with group-by and export', href: '/pos/reports/advanced', icon: '🎯' },
];

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

export default function ReportsIndexPage() {
  const [briefing, setBriefing] = useState<string[] | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [briefingError, setBriefingError] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  function loadBriefing() {
    setBriefingLoading(true);
    setBriefingError(false);
    setBriefing(null);
    setGeneratedAt(null);
    fetch('/api/pos/reports/briefing')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then(d => {
        const bullets: string[] = d.bullets ?? [];
        if (bullets.length === 0 && new Date().getDay() === 0) {
          setBriefing(['No sales data recorded yet this week. Check back Monday.']);
        } else {
          setBriefing(bullets.length > 0 ? bullets : null);
        }
        if (d.generated_at) setGeneratedAt(d.generated_at);
        setBriefingLoading(false);
      })
      .catch(() => { setBriefingError(true); setBriefingLoading(false); });
  }

  useEffect(() => { loadBriefing(); }, []);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Reports</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Everything Aria sees in your business.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
        {CARDS.map(c => (
          <Link key={c.href} href={c.href} style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '18px 20px', textDecoration: 'none', display: 'block', boxShadow: 'var(--shadow-card)', transition: 'box-shadow 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-violet)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-card)')}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 8 }}>{c.desc}</div>
            {generatedAt ? (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Updated {timeAgo(generatedAt)}</div>
            ) : briefingLoading ? (
              <div style={{ height: 12, width: 80, borderRadius: 4, background: 'var(--bg-elevated)', animation: 'shimmer 1.4s infinite' }} />
            ) : null}
            <div style={{ fontSize: 12, color: 'var(--violet)', fontWeight: 600, marginTop: 8 }}>View →</div>
          </Link>
        ))}
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Aria&apos;s daily briefing</h2>
        <AriaInsightCard
          bullets={briefing ?? undefined}
          loading={briefingLoading}
          error={briefingError}
          onRetry={loadBriefing}
        />
      </div>
    </div>
  );
}

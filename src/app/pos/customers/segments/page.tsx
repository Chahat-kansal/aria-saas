'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AriaInsightCard from '@/components/reports/AriaInsightCard';

interface Segment { segment: string; count: number; ltv: number; avg_spend: number; top_product: string | null; }

const SEGMENT_COLORS: Record<string, string> = {
  Champions: '#34D399', Loyal: '#60A5FA', Promising: '#A78BFA',
  'At Risk': '#FBBF24', Lost: '#F87171', New: '#94A3B8',
};
const SEGMENT_DESC: Record<string, string> = {
  Champions: 'Bought recently, buy often, spent the most.',
  Loyal: 'Spend consistently — need recognition.',
  Promising: 'Recent first-timers with potential.',
  'At Risk': 'Once great customers going quiet.',
  Lost: "Haven't purchased in 6+ months.",
  New: 'Just joined the club.',
};

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [calculating, setCalculating] = useState(false);

  const loadSegments = useCallback(() => {
    fetch('/api/pos/customers/segments').then(r => r.json()).then(d => {
      setSegments(d.segments ?? []);
      setInsight(d.insight?.bullets ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadSegments(); }, [loadSegments]);

  async function calculateNow() {
    setCalculating(true);
    try {
      await fetch('/api/pos/customers/rfm-trigger', { method: 'POST' });
      await loadSegments();
    } catch {}
    setCalculating(false);
  }

  const allEmpty = !loading && segments.every(s => s.count === 0);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Customer Segments</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>RFM-scored groups · recalculated nightly at 3am AEST</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={calculateNow}
            disabled={calculating}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: calculating ? 'var(--bg-overlay)' : 'var(--bg-elevated)', color: calculating ? 'var(--text-tertiary)' : 'var(--violet)', fontSize: 12, fontWeight: 600, cursor: calculating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {calculating ? (
              <>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--violet)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                Calculating…
              </>
            ) : '⚡ Calculate RFM now'}
          </button>
          <Link href="/pos/customers" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>← All Customers</Link>
        </div>
      </div>

      <AriaInsightCard bullets={insight ?? undefined} loading={loading} />

      {/* Empty state — scores not yet calculated */}
      {allEmpty && (
        <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(167,139,250,0.06) 100%)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: 16, padding: '32px 28px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No RFM scores yet</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 20px' }}>
            RFM scores calculate automatically at 3am each day.<br />
            Click <strong style={{ color: 'var(--violet)' }}>⚡ Calculate RFM now</strong> to run it immediately and populate segments.
          </p>
          <button onClick={calculateNow} disabled={calculating}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: calculating ? 'var(--bg-overlay)' : 'var(--violet)', color: calculating ? 'var(--text-tertiary)' : '#fff', fontSize: 13, fontWeight: 700, cursor: calculating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {calculating ? 'Calculating…' : '⚡ Run RFM calculation now'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 160, background: 'var(--bg-surface)', borderRadius: 14 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {segments.map(s => {
            const color = SEGMENT_COLORS[s.segment] ?? '#94A3B8';
            return (
              <Link key={s.segment} href={`/pos/customers?segment=${encodeURIComponent(s.segment)}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: '20px 22px', border: `1px solid ${s.count > 0 ? color + '33' : 'var(--border-subtle)'}`, boxShadow: 'var(--shadow-card)', transition: 'box-shadow 150ms', opacity: s.count === 0 ? 0.5 : 1 }}
                  onMouseEnter={e => { if (s.count > 0) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${color}33`; }}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-card)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{s.segment}</span>
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: `${color}22`, color, fontWeight: 700 }}>{s.count} customers</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.4 }}>{SEGMENT_DESC[s.segment] ?? ''}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total LTV</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>A${s.ltv.toFixed(0)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Spend</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>A${s.avg_spend.toFixed(0)}</div>
                    </div>
                  </div>
                  {s.top_product && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 10 }}>🏆 {s.top_product}</p>}
                  {s.count > 0 && <div style={{ marginTop: 14, fontSize: 12, color, fontWeight: 600 }}>View customers →</div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

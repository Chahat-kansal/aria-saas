import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aria Demo — See AI POS in Action',
  description: 'Watch Aria run a retail shop automatically — reorder agents, pricing intelligence, conversation reports.',
};

const HIGHLIGHTS = [
  { icon: '📦', title: 'Reorder Agent', desc: 'Wakes up at 6am, checks stock levels, drafts purchase orders. You approve in one tap.' },
  { icon: '💬', title: 'Conversation Reports', desc: 'Ask "why is wine slow this week?" in plain English. Aria answers with charts.' },
  { icon: '📅', title: 'Smart Schedule', desc: 'Rostering tied to demand forecast. Aria schedules your cheapest available staff first.' },
];

export default function DemoPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#030510', color: 'rgba(220,240,255,0.93)', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '64px 24px' }}>
        <Link href="/" style={{ fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', display: 'inline-block', marginBottom: 48 }}>← Aria</Link>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.03em' }}>See Aria in action</h1>
          <p style={{ fontSize: 16, color: 'rgba(130,160,200,0.75)', margin: 0 }}>60 seconds. Free 14-day trial — no credit card required.</p>
        </div>

        <div style={{ aspectRatio: '16/9', background: '#0A0E1E', borderRadius: 20, border: '1px solid #1A2240', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 40, overflow: 'hidden', position: 'relative' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>▶</div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: 'rgba(220,240,255,0.7)' }}>Demo video</p>
          <p style={{ fontSize: 13, color: 'rgba(130,160,200,0.5)', margin: 0 }}>Launching at soft launch — recording in progress</p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Link href="/signup" style={{ display: 'inline-block', padding: '14px 32px', borderRadius: 12, background: '#8B5CF6', color: '#fff', fontSize: 15, fontWeight: 700, textDecoration: 'none', marginRight: 12 }}>
            Start Free Trial →
          </Link>
          <Link href="/signup" style={{ display: 'inline-block', padding: '14px 28px', borderRadius: 12, border: '1px solid #1A2240', color: 'rgba(220,240,255,0.8)', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
            Start Free Trial
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
          {HIGHLIGHTS.map(h => (
            <div key={h.title} style={{ background: '#0A0E1E', borderRadius: 14, padding: '24px', border: '1px solid #1A2240' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{h.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{h.title}</div>
              <p style={{ fontSize: 13, color: 'rgba(130,160,200,0.75)', margin: 0, lineHeight: 1.6 }}>{h.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

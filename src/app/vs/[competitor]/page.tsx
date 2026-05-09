import Link from 'next/link';
import type { Metadata } from 'next';

type Params = { params: Promise<{ competitor: string }> };

const COMPETITORS: Record<string, {
  name: string;
  tagline: string;
  honest: string;
  price: string;
  matrix: { feature: string; aria: string; them: string }[];
  reasons: string[];
}> = {
  shopfront: {
    name: 'Shopfront',
    tagline: 'Aria is Shopfront with a brain that runs your shop automatically.',
    honest: 'Shopfront has broader hardware integrations and a larger AU installer network.',
    price: '$80–$200/mo',
    matrix: [
      { feature: 'Autonomous Reorder Agent', aria: '✓', them: '✗' },
      { feature: 'AI Pricing Intelligence', aria: '✓', them: '✗' },
      { feature: 'Smart Staff Scheduling', aria: '✓', them: '✗' },
      { feature: 'Conversation Reports (ask in English)', aria: '✓', them: '✗' },
      { feature: 'Customer RFM + Churn Defender', aria: '✓', them: 'Basic loyalty only' },
      { feature: 'Free migration from Shopfront', aria: '✓', them: 'N/A' },
      { feature: 'AU-specific retail compliance', aria: '✓', them: '✓' },
      { feature: 'Hardware integrations', aria: 'Browser + iPad', them: 'Broader' },
    ],
    reasons: [
      'Aria\'s agents run your operations — Shopfront just shows you dashboards.',
      'Reorder agent alone saves 3–5 hours per week of manual stock counting.',
      'Migrate from Shopfront in under 5 minutes. Free.',
    ],
  },
  square: {
    name: 'Square',
    tagline: 'Aria does what Square can\'t: autonomous agents that run your shop without you.',
    honest: 'Square has lower card processing fees and a mature global ecosystem.',
    price: '$0–$149/mo + 1.6–1.9% txn',
    matrix: [
      { feature: 'Autonomous Reorder Agent', aria: '✓', them: '✗' },
      { feature: 'AI Pricing Intelligence', aria: '✓', them: '✗' },
      { feature: 'Smart Staff Scheduling', aria: '✓', them: 'Basic only' },
      { feature: 'Conversation Reports', aria: '✓', them: '✗' },
      { feature: 'Built for Australian retail', aria: '✓', them: 'Partial' },
      { feature: 'Free migration from Square', aria: '✓', them: 'N/A' },
      { feature: 'Card processing fees', aria: 'Via your provider', them: '1.6–1.9%' },
      { feature: 'Hardware ecosystem', aria: 'iPad/browser', them: 'Extensive' },
    ],
    reasons: [
      'Square tracks sales. Aria acts on them — without you having to ask.',
      'Conversation Reports let you ask "why is wine slow this week?" and get an answer in seconds.',
      'No transaction fees on Aria — bring your own payment terminal.',
    ],
  },
  lightspeed: {
    name: 'Lightspeed',
    tagline: 'Aria gives you Lightspeed-level features at a fraction of the cost, with AI agents on top.',
    honest: 'Lightspeed has deeper multi-location and franchise features for large operators.',
    price: '$179–$399/mo',
    matrix: [
      { feature: 'Autonomous Reorder Agent', aria: '✓', them: '✗' },
      { feature: 'AI Pricing Intelligence', aria: '✓', them: '✗' },
      { feature: 'Smart Staff Scheduling', aria: '✓', them: 'Basic' },
      { feature: 'Conversation Reports', aria: '✓', them: '✗' },
      { feature: 'Built for Australian retail', aria: '✓', them: 'Partial' },
      { feature: 'Free migration from Lightspeed', aria: 'Coming soon', them: 'N/A' },
      { feature: 'Multi-location management', aria: 'Per outlet', them: 'Enterprise' },
      { feature: 'Monthly price', aria: '$59–$249', them: '$179–$399' },
    ],
    reasons: [
      'Aria is half the price of Lightspeed and does things Lightspeed can\'t.',
      'Every agent runs in the background — no configuration, no consultants.',
      'Start free for 14 days. Migration support included.',
    ],
  },
};

export async function generateStaticParams() {
  return [{ competitor: 'shopfront' }, { competitor: 'square' }, { competitor: 'lightspeed' }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { competitor } = await params;
  const c = COMPETITORS[competitor];
  if (!c) return { title: 'Compare' };
  return {
    title: `Aria vs ${c.name} — AI-Powered POS for Australian Retail`,
    description: c.tagline,
  };
}

export default async function VsPage({ params }: Params) {
  const { competitor } = await params;
  const c = COMPETITORS[competitor];

  if (!c) {
    return (
      <div style={{ minHeight: '100vh', background: '#030510', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(130,160,200,0.6)' }}>Comparison not found.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#030510', color: 'rgba(220,240,255,0.93)', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '64px 24px' }}>
        <Link href="/" style={{ fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', display: 'inline-block', marginBottom: 48 }}>← Aria</Link>

        <div style={{ marginBottom: 56 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 16px', letterSpacing: '-0.03em' }}>Aria vs {c.name}</h1>
          <p style={{ fontSize: 17, color: 'rgba(130,160,200,0.8)', lineHeight: 1.6, margin: 0 }}>{c.tagline}</p>
        </div>

        <div style={{ background: '#0A0E1E', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 12, padding: '16px 20px', marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: 'rgba(251,191,36,0.9)', margin: 0 }}>
            <strong>Honest take:</strong> {c.honest}
          </p>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Feature comparison</h2>
        <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid #1A2240', marginBottom: 56 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#0A0E1E' }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'rgba(130,160,200,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Feature</th>
                <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aria</th>
                <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'rgba(130,160,200,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.name}</th>
              </tr>
            </thead>
            <tbody>
              {c.matrix.map((row, i) => (
                <tr key={row.feature} style={{ borderTop: '1px solid #1A2240' }}>
                  <td style={{ padding: '12px 20px', fontSize: 14 }}>{row.feature}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', fontSize: 14, color: row.aria === '✓' ? '#34D399' : 'rgba(220,240,255,0.8)', fontWeight: row.aria === '✓' ? 700 : 400 }}>{row.aria}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'center', fontSize: 14, color: row.them === '✗' ? 'rgba(130,160,200,0.3)' : 'rgba(220,240,255,0.7)' }}>{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Why operators switch to Aria</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 56px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {c.reasons.map(r => (
            <li key={r} style={{ display: 'flex', gap: 12, fontSize: 15, color: 'rgba(220,240,255,0.85)', lineHeight: 1.6 }}>
              <span style={{ color: '#8B5CF6', flexShrink: 0, fontWeight: 700 }}>→</span>{r}
            </li>
          ))}
        </ul>

        <div style={{ background: '#0A0E1E', borderRadius: 20, border: '1px solid #1A2240', padding: '40px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 10px' }}>Switch from {c.name} for free</h2>
          <p style={{ fontSize: 14, color: 'rgba(130,160,200,0.75)', marginBottom: 28 }}>14-day free trial. Free migration. No credit card required.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: '#8B5CF6', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Start Free Trial →
            </Link>
            {competitor !== 'lightspeed' && (
              <Link href={`/pos/setup/migrate/${competitor}`} style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: 'transparent', color: 'rgba(220,240,255,0.85)', fontSize: 14, fontWeight: 600, textDecoration: 'none', border: '1px solid #1A2240' }}>
                Migrate from {c.name}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

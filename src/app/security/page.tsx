import Link from 'next/link';
import type { Metadata } from 'next';
import ScrollPinHero from '@/components/marketing/ScrollPinHero';
import MarketingPinHero from '@/components/marketing/MarketingPinHero';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How Aria POS protects your business data — encryption, access control, and compliance.',
};

const S: React.CSSProperties = { background: '#0A0E1E', border: '1px solid #1A2240', borderRadius: 16, padding: '28px 32px', marginBottom: 16 };
const H: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: 'rgba(220,240,255,0.93)', marginBottom: 16 };
const P: React.CSSProperties = { fontSize: 14, color: 'rgba(130,160,200,0.75)', lineHeight: 1.75, marginBottom: 10 };

export default function SecurityPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#030510', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <ScrollPinHero
        hero={(
          <MarketingPinHero
            theme="deep"
            eyebrow="Security"
            title="Your business data, protected."
            subtitle="Encryption, access control, RLS, Australian data residency. The detail is below."
            primaryCta={{ label: 'Start free trial', href: '/signup' }}
            secondaryCta={{ label: 'Read the detail ↓', href: '#detail' }}
          />
        )}
      >
      <div id="detail" style={{ background: '#030510' }}>
      <div style={{ maxWidth: 768, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link href="/" style={{ display: 'inline-block', fontSize: 13, color: 'rgba(130,160,200,0.6)', textDecoration: 'none', marginBottom: 40 }}>← Back to Aria</Link>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: '#F0EBFF', marginBottom: 8 }}>Security</h1>
        <p style={{ fontSize: 13, color: 'rgba(130,160,200,0.5)', marginBottom: 48 }}>How we protect your business data.</p>

        <div style={S}>
          <h2 style={H}>Encryption at Rest</h2>
          <p style={P}>All data is stored in Supabase (PostgreSQL) with AES-256 encryption at rest. Database backups are encrypted and retained for 30 days. Point-in-time recovery is available.</p>
        </div>

        <div style={S}>
          <h2 style={H}>Encryption in Transit</h2>
          <p style={P}>All connections use TLS 1.3. The POS terminal, API routes, and admin dashboard enforce HTTPS. Certificate transparency logging is enabled. HSTS headers are set with a 1-year max-age.</p>
        </div>

        <div style={S}>
          <h2 style={H}>Role-Based Access Control</h2>
          <p style={P}>Aria enforces three access levels:</p>
          <p style={P}><strong>Owner</strong> — full access including billing, AI agent config, and all reports.</p>
          <p style={P}><strong>Manager</strong> — reports, overrides, staff management. No billing access.</p>
          <p style={P}><strong>Staff</strong> — POS terminal only, 4-digit PIN authentication, 12-hour sessions.</p>
          <p style={P}>All privilege escalations are logged in the Actions audit log.</p>
        </div>

        <div style={S}>
          <h2 style={H}>AI Agent Security</h2>
          <p style={P}>Autonomous agents operate under least-privilege: each agent only has read/write access to the data required for its function. Agent credentials are scoped API keys, rotated monthly. Agent decision logs are immutable once written.</p>
        </div>

        <div style={S}>
          <h2 style={H}>SOC 2 Commitment</h2>
          <p style={P}>Aria is targeting SOC 2 Type I certification by Q4 2026 and Type II by Q2 2027. Our infrastructure (Supabase/Vercel) is already SOC 2 certified. We will share our audit report with enterprise customers under NDA.</p>
        </div>

        <div style={S}>
          <h2 style={H}>Responsible Disclosure</h2>
          <p style={P}>Found a vulnerability? Email <a href="mailto:cnkansal1105@gmail.com" style={{ color: '#8B5CF6' }}>cnkansal1105@gmail.com</a> with subject &quot;Security Report&quot;. We respond within 48 hours. We do not take legal action against good-faith researchers.</p>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(130,160,200,0.35)', textAlign: 'center', marginTop: 40 }}>
          Security questions? <a href="mailto:cnkansal1105@gmail.com" style={{ color: 'rgba(130,160,200,0.5)', textDecoration: 'none' }}>cnkansal1105@gmail.com</a>
        </p>
      </div>
      </div>
      </ScrollPinHero>
    </div>
  );
}

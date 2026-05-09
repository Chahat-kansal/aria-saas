import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lightspeed Migration — Coming Soon' };

export default function LightspeedMigratePage() {
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⚡</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 12px' }}>Lightspeed Migration</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
          Lightspeed X-Series integration is coming this month. We&apos;re awaiting app approval from Lightspeed.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 28 }}>
          Join the waitlist and we&apos;ll email you the moment it&apos;s live.
        </p>
        <a href="mailto:hello@ariaos.site?subject=Lightspeed%20Migration%20Waitlist" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 10, background: 'var(--violet)', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          Join the Waitlist
        </a>
        <div style={{ marginTop: 24 }}>
          <Link href="/pos/setup/migrate" style={{ fontSize: 13, color: 'var(--text-tertiary)', textDecoration: 'none' }}>
            ← Back to Migration Hub
          </Link>
        </div>
      </div>
    </div>
  );
}

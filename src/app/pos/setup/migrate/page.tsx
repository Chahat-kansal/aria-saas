import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Migrate to Aria' };

const SOURCES = [
  {
    id: 'shopfront',
    icon: '🛒',
    label: 'Shopfront',
    desc: 'Import products, customers, and sales from Shopfront POS CSV exports. Three files, five minutes.',
    cta: 'Start Migration',
    href: '/pos/setup/migrate/shopfront',
    disabled: false,
  },
  {
    id: 'square',
    icon: '◻',
    label: 'Square',
    desc: 'Connect your Square account via OAuth and import your full catalogue, customers, and order history.',
    cta: 'Connect Square',
    href: '/pos/setup/migrate/square',
    disabled: false,
  },
  {
    id: 'lightspeed',
    icon: '⚡',
    label: 'Lightspeed',
    desc: 'Lightspeed X-Series integration coming this month. Join the waitlist to be notified when it launches.',
    cta: 'Join Waitlist',
    href: 'mailto:hello@ariaos.site?subject=Lightspeed%20waitlist',
    disabled: true,
  },
];

export default function MigrateHubPage() {
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '40px 28px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>Bring your business to Aria</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 40 }}>Import your existing data in minutes. Aria maps your fields automatically.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
          {SOURCES.map(s => (
            <div key={s.id} style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: '24px', border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>{s.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{s.label}</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, flex: 1, marginBottom: 20 }}>{s.desc}</p>
              {s.disabled ? (
                <span style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
                  {s.cta}
                </span>
              ) : (
                <Link href={s.href} style={{ display: 'block', padding: '9px 18px', borderRadius: 9, background: 'var(--violet)', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', textAlign: 'center' }}>
                  {s.cta} →
                </Link>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: '20px 24px', background: 'rgba(139,92,246,0.07)', borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            ✨ <strong style={{ color: 'var(--text-primary)' }}>Aria maps your fields automatically</strong> — she reads your CSV headers and suggests the correct mapping. You review and confirm before anything imports.
          </p>
        </div>
      </div>
    </div>
  );
}

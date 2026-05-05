import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, isAdminEmail } from '@/lib/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';

const NAV = [
  { href: '/admin',              label: 'Overview',       icon: '⚡' },
  { href: '/admin/businesses',   label: 'Businesses',     icon: '🏢' },
  { href: '/admin/users',        label: 'Users',          icon: '👥' },
  { href: '/admin/billing',      label: 'Billing',        icon: '💳' },
  { href: '/admin/features',     label: 'Feature Flags',  icon: '🚩' },
  { href: '/admin/usage',        label: 'Usage & API',    icon: '📊' },
  { href: '/admin/support',      label: 'Support',        icon: '🎧' },
  { href: '/admin/announcements',label: 'Announcements',  icon: '📢' },
  { href: '/admin/audit',        label: 'Audit Log',      icon: '🔍' },
  { href: '/admin/system',       label: 'System',         icon: '⚙️' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect('/dashboard');

  const db = getAdminClient();
  const { data: adminUser } = await db.from('admin_users').select('role').eq('email', user.email!).maybeSingle();
  const role = (adminUser?.role as string) || 'owner';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080C10', color: '#E8F4F8', fontFamily: "'Manrope',system-ui,sans-serif" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: '#0A0E1A', borderRight: '1px solid rgba(0,229,255,0.08)', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }}>
        {/* Logo */}
        <div style={{ padding: '20px 18px', borderBottom: '1px solid rgba(0,229,255,0.06)' }}>
          <div style={{ fontSize: 10, color: 'rgba(0,229,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Aria</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#E8F4F8', letterSpacing: '-0.02em' }}>Admin Console</div>
          <div style={{ fontSize: 10, color: 'rgba(130,160,200,0.4)', marginTop: 3 }}>{role.toUpperCase()} · {user.email}</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, marginBottom: 1, color: 'rgba(130,160,200,0.7)', fontSize: 13, fontWeight: 600, transition: 'all 150ms' }}>
                <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(0,229,255,0.06)', fontSize: 10, color: 'rgba(130,160,200,0.3)' }}>
          Aria Admin · v1.0
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: '32px 36px' }}>
        {children}
      </main>
    </div>
  );
}

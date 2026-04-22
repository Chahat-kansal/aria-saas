'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props { alertCount: number; pendingApps: number; }

const NAV = [
  { group: 'Overview', items: [
    { href: '/visa', label: 'Dashboard', icon: '⬡', exact: true },
    { href: '/visa/alerts', label: 'Live alerts', icon: '🔔', badgeKey: 'alerts', badgeColor: 'red' },
  ]},
  { group: 'Clients', items: [
    { href: '/visa/clients', label: 'All clients', icon: '👥', exact: false },
    { href: '/visa/clients/new', label: 'Add client', icon: '+', exact: true },
    { href: '/visa/applications', label: 'Applications', icon: '📋', badgeKey: 'apps', badgeColor: 'green' },
  ]},
  { group: 'Documents', items: [
    { href: '/visa/documents', label: 'Document vault', icon: '📁' },
  ]},
  { group: 'Intelligence', items: [
    { href: '/visa/news', label: 'News monitor', icon: '📡' },
    { href: '/visa/ask', label: 'Ask VisaAI', icon: '✦' },
  ]},
] as const;

export function VisaSidebar({ alertCount, pendingApps }: Props) {
  const pathname = usePathname();
  const badges: Record<string, number> = { alerts: alertCount, apps: pendingApps };

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-[#111118] border-r border-white/5" style={{ height: '100%' }}>
      <div className="px-4 py-4 border-b border-white/5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#7F77DD,#5f57c0)' }}>V</div>
        <div>
          <div className="text-sm font-semibold text-white leading-none">VisaAI</div>
          <div className="text-[10px] text-[rgba(255,255,255,.3)] mt-0.5">Migration Agent</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[9px] text-[rgba(255,255,255,.25)] uppercase tracking-widest px-2 mb-1.5">{group}</p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const active = (item as any).exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const badgeKey = (item as any).badgeKey as string | undefined;
                const badge = badgeKey ? badges[badgeKey] : 0;
                const badgeColor = (item as any).badgeColor as string | undefined;
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all border
                      ${active
                        ? 'bg-[rgba(127,119,221,.15)] text-[#c4c0f7] border-[rgba(127,119,221,.3)]'
                        : 'text-[rgba(255,255,255,.45)] hover:bg-white/5 hover:text-[rgba(255,255,255,.8)] border-transparent'
                      }`}>
                    <span className="w-4 text-sm leading-none text-center flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${badgeColor === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-white/5 pt-3">
        <Link href="/dashboard" className="text-xs text-[rgba(255,255,255,.3)] hover:text-white transition-colors flex items-center gap-1.5">
          ← Back to Aria OS
        </Link>
      </div>
    </aside>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props { openSession: boolean; pendingSales: number; }

const NAV = [
  { group: 'Register', items: [
    { href: '/pos', label: 'Dashboard', icon: '⬡', exact: true },
    { href: '/pos/terminal', label: 'POS Terminal', icon: '🖥', exact: true },
    { href: '/pos/sessions', label: 'Cash sessions', icon: '💵', exact: false },
  ]},
  { group: 'Catalogue', items: [
    { href: '/pos/products', label: 'Products', icon: '📦', exact: false },
    { href: '/pos/products/new', label: 'Add product', icon: '+', exact: true },
  ]},
  { group: 'Sales', items: [
    { href: '/pos/sales', label: 'Sales history', icon: '🧾', badgeKey: 'sales', badgeColor: 'orange', exact: false },
    { href: '/pos/customers', label: 'Customers', icon: '👤', exact: false },
  ]},
] as const;

export function PosSidebar({ openSession, pendingSales }: Props) {
  const pathname = usePathname();
  const badges: Record<string, number> = { sales: pendingSales };

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-[#111118] border-r border-white/5" style={{ height: '100%' }}>
      <div className="px-4 py-4 border-b border-white/5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>P</div>
        <div>
          <div className="text-sm font-semibold text-white leading-none">AriaPOS</div>
          <div className="text-[10px] text-[rgba(255,255,255,.3)] mt-0.5">
            {openSession ? (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                Session open
              </span>
            ) : 'No session'}
          </div>
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
                        ? 'bg-[rgba(249,115,22,.15)] text-[#fdba74] border-[rgba(249,115,22,.3)]'
                        : 'text-[rgba(255,255,255,.45)] hover:bg-white/5 hover:text-[rgba(255,255,255,.8)] border-transparent'
                      }`}>
                    <span className="w-4 text-sm leading-none text-center flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-orange-500/20 text-orange-400">
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
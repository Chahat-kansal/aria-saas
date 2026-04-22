'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props { openSession: boolean; }

const NAV = [
  { group: 'Register', items: [
    { href: '/pos',          label: 'POS Terminal',   icon: '🖥',  exact: true  },
    { href: '/pos/sessions', label: 'Cash sessions',  icon: '💵',  exact: false },
  ]},
  { group: 'Catalogue', items: [
    { href: '/pos/products',     label: 'Products',    icon: '📦', exact: false },
    { href: '/pos/products/new', label: 'Add product', icon: '+',  exact: true  },
  ]},
  { group: 'Sales', items: [
    { href: '/pos/sales',     label: 'Sales history', icon: '🧾', exact: false },
    { href: '/pos/customers', label: 'Customers',     icon: '👤', exact: false },
  ]},
] as const;

export function PosSidebar({ openSession }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-white border-r border-[rgba(0,0,0,.07)]" style={{ height: '100%' }}>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[rgba(0,0,0,.06)] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#1D9E75,#0fa86d)' }}>P</div>
        <div>
          <div className="text-sm font-semibold text-[#1a1a16] leading-none">AriaPOS</div>
          <div className="text-[10px] mt-0.5 flex items-center gap-1">
            {openSession
              ? <><span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] inline-block" /><span className="text-[#1D9E75]">Session open</span></>
              : <span className="text-[rgba(26,26,22,.35)]">No session</span>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[9px] text-[rgba(26,26,22,.3)] uppercase tracking-widest px-2 mb-1.5">{group}</p>
            <div className="space-y-0.5">
              {items.map(item => {
                const active = (item as any).exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all ${
                      active
                        ? 'bg-[#1D9E75] text-white'
                        : 'text-[rgba(26,26,22,.5)] hover:bg-[rgba(0,0,0,.04)] hover:text-[#1a1a16]'
                    }`}>
                    <span className="w-4 text-sm leading-none text-center flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-[rgba(0,0,0,.06)] pt-3">
        <Link href="/dashboard" className="text-xs text-[rgba(26,26,22,.35)] hover:text-[#1a1a16] transition-colors flex items-center gap-1.5">
          ← Back to Aria OS
        </Link>
      </div>
    </aside>
  );
}
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

const NAV_TABS = [
  { label: 'Terminal', href: '/pos/terminal' },
  { label: 'Products', href: '/pos/products' },
  { label: 'Customers', href: '/pos/customers' },
  { label: 'Reports', href: '/pos/reports' },
  { label: 'Settings', href: '/pos/settings' },
];

export function POSTopNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null);
  const [sessionRevenue, setSessionRevenue] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch('/api/pos/sessions')
      .then(r => r.json())
      .then(d => {
        const s = d.openSession;
        setSessionOpen(!!s);
        if (s) setSessionRevenue((s.total_cash_sales ?? 0) + (s.total_card_sales ?? 0));
      })
      .catch(() => setSessionOpen(false));
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="h-14 bg-[#111827] flex items-center justify-between px-6 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-white text-lg tracking-tight flex-shrink-0">AriaPOS</span>
          <div className="hidden md:flex items-center">
            {NAV_TABS.map(tab => {
              const isActive = pathname === tab.href || (tab.href !== '/pos/terminal' && pathname.startsWith(tab.href));
              return (
                <Link key={tab.href} href={tab.href}
                  className={`px-4 py-2 text-sm rounded-md transition-colors ${
                    isActive ? 'text-white bg-white/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {sessionOpen !== null && (
            <div className="hidden sm:flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sessionOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-gray-300 text-sm">
                {sessionOpen ? `Open · A$${sessionRevenue.toFixed(2)} today` : 'Register closed'}
              </span>
            </div>
          )}
          <span className="hidden sm:block text-gray-600">|</span>
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-200 transition-colors whitespace-nowrap hidden sm:block">
            ← Dashboard
          </Link>
          <button onClick={() => setMobileOpen(v => !v)} className="md:hidden text-gray-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            {NAV_TABS.map(tab => (
              <Link key={tab.href} href={tab.href} onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-xl text-sm font-medium mb-1 transition-colors ${
                  pathname === tab.href ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                }`}>
                {tab.label}
              </Link>
            ))}
            <Link href="/dashboard" onClick={() => setMobileOpen(false)}
              className="block px-4 py-3 rounded-xl text-sm text-gray-500 hover:bg-gray-50 mt-2 border-t border-gray-100 pt-4">
              ← Dashboard
            </Link>
          </div>
        </div>
      )}

      <main className="pt-14" style={{ height: '100dvh', overflowY: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}

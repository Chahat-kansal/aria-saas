'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

type NavItem = { label: string; href: string };
type NavGroup = { label: string; href?: string; items?: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: 'Terminal', href: '/pos/terminal' },
  {
    label: 'Inventory',
    items: [
      { label: 'Products', href: '/pos/products' },
      { label: 'Categories', href: '/pos/categories' },
      { label: 'Variants & Modifiers', href: '/pos/modifiers' },
      { label: 'Suppliers', href: '/pos/suppliers' },
      { label: 'Purchase Orders', href: '/pos/orders' },
      { label: 'Stocktake', href: '/pos/stocktake' },
      { label: 'Transfers', href: '/pos/transfers' },
      { label: 'Price Lists', href: '/pos/price-lists' },
      { label: 'Barcodes', href: '/pos/barcodes' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'All Customers', href: '/pos/customers' },
      { label: 'Customer Groups', href: '/pos/customer-groups' },
      { label: 'Loyalty Program', href: '/pos/settings/loyalty' },
      { label: 'Gift Cards', href: '/pos/gift-cards' },
      { label: 'Promotions', href: '/pos/promotions' },
      { label: 'Winback', href: '/dashboard/winback' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Sales Report', href: '/pos/reports/sales' },
      { label: 'Inventory Report', href: '/pos/reports/inventory' },
      { label: 'Purchase Report', href: '/pos/reports/purchases' },
      { label: 'Cashier Report', href: '/pos/reports/cashier' },
      { label: 'Register Closures', href: '/pos/reports/closures' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'General', href: '/pos/settings' },
      { label: 'Receipt', href: '/pos/settings/receipts' },
      { label: 'Payments', href: '/pos/settings/payments' },
      { label: 'Tax', href: '/pos/settings/tax' },
      { label: 'Loyalty', href: '/pos/settings/loyalty' },
      { label: 'Surcharging', href: '/pos/settings/surcharging' },
      { label: 'Staff & Users', href: '/pos/settings/users' },
      { label: 'Integrations', href: '/pos/settings/integrations' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Kitchen Display', href: '/pos/kitchen' },
      { label: 'Table Management', href: '/pos/tables' },
      { label: 'Timesheets', href: '/pos/timesheets' },
      { label: 'Customer Display', href: '/pos/display' },
      { label: 'Cash Management', href: '/pos/cash' },
      { label: 'Sessions', href: '/pos/sessions' },
      { label: 'Open/Close Register', href: '/pos' },
    ],
  },
];

// Mobile accordion sections mirror desktop groups
const MOBILE_SECTIONS = NAV_GROUPS;

export function POSTopNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null);
  const [sessionRevenue, setSessionRevenue] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close dropdown on route change
  useEffect(() => { setOpenMenu(null); setMobileOpen(false); }, [pathname]);

  function isGroupActive(group: NavGroup): boolean {
    if (group.href) return pathname === group.href;
    return group.items?.some(item => pathname === item.href || pathname.startsWith(item.href + '/')) ?? false;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav ref={navRef} className="h-14 bg-[#111827] flex items-center justify-between px-4 fixed top-0 left-0 right-0 z-40">
        {/* Left: wordmark + desktop nav */}
        <div className="flex items-center gap-4">
          <Link href="/pos" className="font-semibold text-white text-lg tracking-tight flex-shrink-0">AriaPOS</Link>

          {/* Desktop dropdown nav */}
          <div className="hidden md:flex items-center">
            {NAV_GROUPS.map(group => {
              const active = isGroupActive(group);
              const isOpen = openMenu === group.label;

              if (!group.items) {
                // Direct link (Terminal)
                return (
                  <Link key={group.label} href={group.href!}
                    className={`px-3 py-2 text-sm rounded-md transition-colors ${
                      active ? 'text-white bg-white/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}>
                    {group.label}
                  </Link>
                );
              }

              return (
                <div key={group.label} className="relative">
                  <button
                    onClick={() => setOpenMenu(isOpen ? null : group.label)}
                    className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
                      active || isOpen ? 'text-white bg-white/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                    }`}>
                    {group.label}
                    <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-48 py-1 overflow-hidden">
                      {group.items.map((item, idx) => {
                        const itemActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                          <Link key={item.href} href={item.href}
                            className={`block px-4 py-2.5 text-sm transition-colors ${
                              itemActive
                                ? 'text-[#059669] font-medium bg-emerald-50'
                                : 'text-gray-700 hover:bg-gray-50'
                            } ${idx === 0 ? 'rounded-t-xl' : ''} ${idx === group.items!.length - 1 ? 'rounded-b-xl' : ''}`}>
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: session + dashboard + hamburger */}
        <div className="flex items-center gap-3">
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

      {/* Mobile bottom sheet with accordion */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto my-3" />
            <div className="pb-8 px-3">
              {MOBILE_SECTIONS.map(group => {
                if (!group.items) {
                  return (
                    <Link key={group.label} href={group.href!} onClick={() => setMobileOpen(false)}
                      className={`block px-4 py-3 rounded-xl text-sm font-medium mb-1 ${
                        pathname === group.href ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                      }`}>
                      {group.label}
                    </Link>
                  );
                }
                const expanded = mobileExpanded === group.label;
                return (
                  <div key={group.label} className="mb-1">
                    <button
                      onClick={() => setMobileExpanded(expanded ? null : group.label)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                        isGroupActive(group) ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                      }`}>
                      <span>{group.label}</span>
                      <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {expanded && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {group.items.map(item => {
                          const active = pathname === item.href;
                          return (
                            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                              className={`block px-4 py-2.5 rounded-lg text-sm ${
                                active ? 'text-[#059669] font-medium bg-emerald-50' : 'text-gray-600 hover:bg-gray-50'
                              }`}>
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <Link href="/dashboard" onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 rounded-xl text-sm text-gray-500 hover:bg-gray-50 mt-2 border-t border-gray-100 pt-4">
                ← Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      <main className="pt-14" style={{ height: '100dvh', overflowY: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

/* ─── Nav data ──────────────────────────────────────────────────── */
type NavItem = { label: string; href: string };
type NavSection =
  | { type: 'link';  id: string; label: string; icon: React.ReactNode; href: string }
  | { type: 'group'; id: string; label: string; icon: React.ReactNode; items: NavItem[] }
  | { type: 'spacer' };

const NAV: NavSection[] = [
  { type: 'link',  id: 'sell',      label: 'Sell',        icon: <BagIcon />,   href: '/pos/terminal'  },
  { type: 'link',  id: 'dashboard', label: 'Dashboard',   icon: <ChartIcon />, href: '/pos/dashboard' },
  {
    type: 'group', id: 'register', label: 'Register', icon: <CashIcon />,
    items: [
      { label: 'Manage Cash',            href: '/pos/cash'     },
      { label: 'Close Register',         href: '/pos/close'    },
      { label: 'Sales History',          href: '/pos/sales'    },
      { label: 'Open Customer Display',  href: '/pos/display'  },
    ],
  },
  {
    type: 'group', id: 'stock', label: 'Stock Management', icon: <BoxIcon />,
    items: [
      { label: 'Products',          href: '/pos/products'    },
      { label: 'Classifications',   href: '/pos/categories'  },
      { label: 'Suppliers',         href: '/pos/suppliers'   },
      { label: 'Orders & Invoices', href: '/pos/orders'      },
      { label: 'Stocktake',         href: '/pos/stocktake'   },
    ],
  },
  {
    type: 'group', id: 'customers', label: 'Customer Management', icon: <UsersIcon />,
    items: [
      { label: 'Customers',       href: '/pos/customers'        },
      { label: 'Customer Groups', href: '/pos/customer-groups'  },
      { label: 'Price Lists',     href: '/pos/price-lists'      },
      { label: 'Balances',        href: '/pos/balances'         },
      { label: 'Gift Cards',      href: '/pos/gift-cards'       },
    ],
  },
  {
    type: 'group', id: 'marketing', label: 'Marketing', icon: <MegaphoneIcon />,
    items: [
      { label: 'Promotions',    href: '/pos/promotions'     },
      { label: 'Shelf Tickets', href: '/pos/shelf-tickets'  },
      { label: 'Media Centre',  href: '/pos/media'          },
    ],
  },
  {
    type: 'group', id: 'reporting', label: 'Reporting', icon: <ReportIcon />,
    items: [
      { label: 'Reporting Dashboard', href: '/pos/reports'             },
      { label: 'Sales Reports',       href: '/pos/reports/sales'       },
      { label: 'Inventory Reports',   href: '/pos/reports/inventory'   },
      { label: 'Purchase Reports',    href: '/pos/reports/purchases'   },
      { label: 'Transfer Reports',    href: '/pos/reports/transfers'   },
      { label: 'Register Closures',   href: '/pos/reports/closures'    },
    ],
  },
  {
    type: 'group', id: 'setup', label: 'Setup', icon: <GearIcon />,
    items: [
      { label: 'General',              href: '/pos/settings'                },
      { label: 'Payment Methods',      href: '/pos/settings/payments'       },
      { label: 'Tax Rates',            href: '/pos/settings/tax'            },
      { label: 'Sale Keys',            href: '/pos/sale-keys'               },
      { label: 'Receipts',             href: '/pos/settings/receipts'       },
      { label: 'Users',                href: '/pos/settings/users'          },
      { label: 'Loyalty',              href: '/pos/settings/loyalty'        },
      { label: 'Surcharging',          href: '/pos/settings/surcharging'    },
      { label: 'Registers & Outlets',  href: '/pos/outlets'                 },
      { label: 'Integrations',         href: '/pos/settings/integrations'   },
      { label: 'Barcode Templates',    href: '/pos/barcodes'                },
      { label: 'Price Sets',           href: '/pos/price-lists'             },
      { label: 'Transfer List',        href: '/pos/transfers'               },
      { label: 'Enterprise Policies',  href: '/pos/settings/enterprise'     },
    ],
  },
  {
    type: 'group', id: 'utilities', label: 'Utilities', icon: <WrenchIcon />,
    items: [
      { label: 'Future Prices',     href: '/pos/future-prices'        },
      { label: 'Future Costs',      href: '/pos/settings/future-costs'},
      { label: 'Mail Log',          href: '/pos/utilities/mail-log'   },
      { label: 'Vendor Connections',href: '/pos/settings/vendors'     },
      { label: 'Trashed Items',     href: '/pos/utilities/trash'      },
      { label: 'Barcodes',          href: '/pos/utilities/barcodes'   },
    ],
  },
  { type: 'spacer' },
  { type: 'link', id: 'online', label: 'Online Store', icon: <GlobeIcon />, href: '/pos/online' },
];

const LS_KEY = 'pos_nav_expanded';

/* ─── Main layout ───────────────────────────────────────────────── */
export function POSLayout({ children, userName }: { children: React.ReactNode; userName: string }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  // Hydrate localStorage state
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setExpanded(JSON.parse(stored));
    } catch {}
    setMounted(true);
  }, []);

  // Auto-expand section containing current route
  useEffect(() => {
    if (!mounted) return;
    const autoExpand: Record<string, boolean> = { ...expanded };
    let changed = false;
    for (const s of NAV) {
      if (s.type === 'group') {
        if (s.items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))) {
          if (!autoExpand[s.id]) { autoExpand[s.id] = true; changed = true; }
        }
      }
    }
    if (changed) {
      setExpanded(autoExpand);
      try { localStorage.setItem(LS_KEY, JSON.stringify(autoExpand)); } catch {}
    }
  }, [pathname, mounted]);

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#f5f4ef] overflow-hidden">

      {/* ── Top header ─────────────────────────────────────────────── */}
      <header className="h-11 flex-shrink-0 flex items-center gap-3 px-4 bg-[#1a1a1a] border-b border-[rgba(255,255,255,0.06)]">
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors flex-shrink-0"
          aria-label="Toggle sidebar"
        >
          <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4 opacity-70">
            <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" clipRule="evenodd"/>
          </svg>
        </button>

        {/* Help text */}
        <p className="text-[11px] text-[rgba(255,255,255,0.35)] hidden sm:block">
          Need assistance?{' '}
          <a href="#" className="text-[rgba(255,255,255,0.55)] hover:text-white underline underline-offset-2 transition-colors">Check out our help center</a>
        </p>

        <div className="flex-1" />

        {/* Right icons */}
        <div className="flex items-center gap-0.5">
          <HeaderBtn label="Help" icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/></svg>
          } />
          <HeaderBtn label="Display" icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd"/></svg>
          } />
          <HeaderBtn label="Sound" icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" clipRule="evenodd"/><path d="M12.828 4.172a1 1 0 011.415 0 8 8 0 010 11.314 1 1 0 01-1.415-1.414 6 6 0 000-8.486 1 1 0 010-1.414z"/></svg>
          } />

          {/* ONLINE badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 mx-1 rounded-full bg-[rgba(29,158,117,0.15)] border border-[rgba(29,158,117,0.3)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1D9E75] animate-pulse flex-shrink-0" />
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-[#1D9E75]"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd"/></svg>
            <span className="text-[10px] text-[#1D9E75] font-medium">ONLINE</span>
          </div>

          <HeaderBtn label="Notifications" icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
          } />

          {/* User avatar */}
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-[rgba(255,255,255,0.1)]">
            <div className="w-7 h-7 rounded-full bg-[rgba(37,99,235,0.4)] flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] text-[rgba(255,255,255,0.65)] hidden md:block max-w-[100px] truncate">{userName}</span>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-[220px] flex-shrink-0 bg-white border-r border-[rgba(0,0,0,0.08)] flex flex-col overflow-hidden">

            {/* Logo row */}
            <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] flex items-center gap-2.5 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>P</div>
              <div>
                <div className="text-[13px] font-semibold text-[#1a1a16] leading-none">AriaPOS</div>
                <div className="text-[10px] text-[rgba(26,26,22,.35)] mt-0.5">Point of Sale</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-2 px-2">
              {NAV.map((section, i) => {
                if (section.type === 'spacer') {
                  return <div key={`spacer-${i}`} className="my-2 border-t border-[rgba(0,0,0,0.06)]" />;
                }

                if (section.type === 'link') {
                  const active = section.href === '/pos/terminal'
                    ? pathname === section.href || pathname === '/pos'
                    : pathname === section.href || pathname.startsWith(section.href + '/');
                  const isOnline = section.id === 'online';
                  return (
                    <Link key={section.id} href={section.href}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium mb-0.5 transition-all ${
                        active
                          ? 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]'
                          : isOnline
                          ? 'text-[#2563eb] hover:bg-[rgba(37,99,235,0.06)]'
                          : 'text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a16]'
                      }`}>
                      <span className={`flex-shrink-0 ${active || isOnline ? 'text-[#2563eb]' : 'text-[rgba(26,26,22,0.4)]'}`}>{section.icon}</span>
                      <span>{section.label}</span>
                      {isOnline && <span className="ml-auto text-[9px] bg-[rgba(37,99,235,0.12)] text-[#2563eb] px-1.5 py-0.5 rounded-full">New</span>}
                    </Link>
                  );
                }

                // Group
                const isOpen = !!expanded[section.id];
                const hasActive = section.items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'));

                return (
                  <div key={section.id} className="mb-0.5">
                    <button
                      onClick={() => toggle(section.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium transition-all ${
                        hasActive && !isOpen
                          ? 'bg-[rgba(37,99,235,0.1)] text-[#2563eb]'
                          : 'text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.04)] hover:text-[#1a1a16]'
                      }`}
                    >
                      <span className={`flex-shrink-0 ${hasActive ? 'text-[#2563eb]' : 'text-[rgba(26,26,22,0.4)]'}`}>{section.icon}</span>
                      <span className="flex-1 text-left">{section.label}</span>
                      <svg viewBox="0 0 20 20" fill="currentColor"
                        className={`w-3.5 h-3.5 flex-shrink-0 text-[rgba(26,26,22,0.3)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                      </svg>
                    </button>

                    {isOpen && (
                      <div className="ml-[26px] mt-0.5 mb-1 pl-2.5 border-l border-[rgba(0,0,0,0.07)] space-y-0.5">
                        {section.items.map(item => {
                          const active = pathname === item.href || pathname.startsWith(item.href + '/');
                          return (
                            <Link key={item.href} href={item.href}
                              className={`block px-2 py-[5px] rounded-md text-[12px] transition-all ${
                                active
                                  ? 'text-[#2563eb] font-medium bg-[rgba(37,99,235,0.08)]'
                                  : 'text-[rgba(26,26,22,0.5)] hover:text-[#1a1a16] hover:bg-[rgba(0,0,0,0.03)]'
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
            </nav>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-[rgba(0,0,0,0.07)] flex-shrink-0">
              <Link href="/dashboard"
                className="flex items-center gap-1.5 text-[11px] text-[rgba(26,26,22,0.35)] hover:text-[#1a1a16] transition-colors">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
                </svg>
                Back to Aria OS
              </Link>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ─── Header icon button ─────────────────────────────────────────── */
function HeaderBtn({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button aria-label={label}
      className="w-8 h-8 flex items-center justify-center rounded text-[rgba(255,255,255,0.45)] hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors">
      {icon}
    </button>
  );
}

/* ─── Sidebar icons ──────────────────────────────────────────────── */
function BagIcon()       { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd"/></svg>; }
function ChartIcon()     { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>; }
function CashIcon()      { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg>; }
function BoxIcon()       { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z"/><path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd"/></svg>; }
function UsersIcon()     { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>; }
function MegaphoneIcon() { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z"/></svg>; }
function ReportIcon()    { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm4-1a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1zm-2-6a1 1 0 10-2 0v2a1 1 0 102 0V5z" clipRule="evenodd"/></svg>; }
function GearIcon()      { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>; }
function WrenchIcon()    { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>; }
function GlobeIcon()     { return <svg viewBox="0 0 20 20" fill="currentColor" className="w-[15px] h-[15px]"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd"/></svg>; }
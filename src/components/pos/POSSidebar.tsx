'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoMark from './LogoMark';

const COLLAPSED_W = 64;
const EXPANDED_W  = 228;

const NAV_SECTIONS = [
  {
    title: 'POS',
    items: [
      { href: '/pos',         label: 'Register',  icon: '🏠', exact: true },
      { href: '/pos/terminal',label: 'Terminal',  icon: '🛒' },
      { href: '/pos/mobile',  label: 'Mobile',    icon: '📱' },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { href: '/pos/products',    label: 'Products',        icon: '📦' },
      { href: '/pos/categories',  label: 'Categories',      icon: '📋' },
      { href: '/pos/suppliers',   label: 'Suppliers',       icon: '🚚' },
      { href: '/pos/orders',      label: 'Purchase Orders', icon: '📄' },
      { href: '/pos/stocktake',   label: 'Stocktake',       icon: '✅' },
      { href: '/pos/transfers',   label: 'Transfers',       icon: '↔️' },
      { href: '/pos/price-lists', label: 'Price Lists',     icon: '🏷️' },
      { href: '/pos/barcodes',    label: 'Barcodes',        icon: '▦' },
    ],
  },
  {
    title: 'Customers',
    items: [
      { href: '/pos/customers',       label: 'Customers',   icon: '👤' },
      { href: '/pos/customer-groups', label: 'Groups',      icon: '👥' },
      { href: '/pos/gift-cards',      label: 'Gift Cards',  icon: '🎁' },
      { href: '/pos/promotions',      label: 'Promotions',  icon: '%' },
      { href: '/pos/loyalty',         label: 'Loyalty',     icon: '⭐' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/pos/kitchen',    label: 'Kitchen (KDS)',  icon: '🍳' },
      { href: '/pos/tables',     label: 'Tables',         icon: '⊞' },
      { href: '/pos/timesheets', label: 'Timesheets',     icon: '⏰' },
      { href: '/pos/cash',       label: 'Cash',           icon: '💰' },
      { href: '/pos/close',      label: 'Close Register', icon: '🔒' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { href: '/pos/reports/sales',      label: 'Sales',       icon: '📈' },
      { href: '/pos/reports/inventory',  label: 'Inventory',   icon: '📊' },
      { href: '/pos/reports/cashier',    label: 'Cashier',     icon: '👤' },
      { href: '/pos/reports/commission', label: 'Commission',  icon: '%' },
      { href: '/pos/reports/closures',   label: 'Closures',    icon: '📅' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/pos/settings',       label: 'Settings',    icon: '⚙️' },
      { href: '/pos/settings/users', label: 'Staff PINs',  icon: '🔑' },
      { href: '/pos/void',           label: 'Void/Refund', icon: '↩️' },
    ],
  },
];

interface Props {
  businessName?:  string;
  // Accept both old (posUser) and new (currentUser) prop names
  posUser?:       { name: string; initials: string; role: string } | null;
  currentUser?:   { name: string; initials: string; role: string } | null;
  onAriaToggle?:  () => void;
  ariaOpen?:      boolean;
  onUserSwitch?:  () => void;
  sessionOpen?:   boolean;
}

export default function POSSidebar({
  businessName = '',
  posUser,
  currentUser,
  onAriaToggle,
  ariaOpen = false,
  onUserSwitch,
}: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [tooltip,   setTooltip]   = useState<string | null>(null);
  const [tooltipY,  setTooltipY]  = useState(0);
  const pathname = usePathname();

  const user = currentUser ?? posUser ?? null;

  useEffect(() => {
    try {
      const s = localStorage.getItem('aria_pos_sidebar');
      if (s === 'expanded') setCollapsed(false);
    } catch { /* ignore */ }
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('aria_pos_sidebar', next ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
  }

  function isActive(href: string, exact = false) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  function openDisplay() {
    try { localStorage.setItem('aria_display_state', JSON.stringify({ status: 'idle', business_name: businessName, timestamp: Date.now() })); } catch { /* ignore */ }
    const w = window.open('/pos/display', 'AriaCustomerDisplay', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes');
    if (w) w.focus();
  }

  const W = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <nav style={{
      width: W, minWidth: W,
      transition: 'width 280ms var(--ease,cubic-bezier(0.16,1,0.3,1)), min-width 280ms var(--ease,cubic-bezier(0.16,1,0.3,1))',
      background: 'var(--bg-base)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex', flexDirection: 'column',
      height: '100vh',
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
      zIndex: 10,
    }}>

      {/* Collapse/expand tab */}
      <div
        onClick={toggle}
        style={{
          position: 'absolute', right: -1, top: '50%',
          transform: 'translateY(-50%)',
          width: 16, height: 44,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)', borderLeft: 'none',
          borderRadius: '0 8px 8px 0',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20,
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--violet)', fontWeight: 800 }}>
          {collapsed ? '›' : '‹'}
        </span>
      </div>

      {/* Logo */}
      <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0 }}><LogoMark size={24} /></div>
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 15, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontWeight: 400 }}>
            AriaPOS
          </span>
        )}
      </div>

      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 8px' }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} style={{ marginBottom: 4 }}>
            {/* Section header */}
            {!collapsed ? (
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', padding: '8px 8px 4px', whiteSpace: 'nowrap' }}>
                {section.title}
              </div>
            ) : (
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 6px' }} />
            )}

            {section.items.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <div
                  key={item.href}
                  style={{ position: 'relative' }}
                  onMouseEnter={(e) => {
                    if (collapsed) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setTooltip(item.label);
                      setTooltipY(rect.top + rect.height / 2);
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <Link href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      gap: collapsed ? 0 : 10,
                      padding: collapsed ? '9px 14px' : '9px 10px',
                      borderRadius: 10, marginBottom: 1,
                      cursor: 'pointer',
                      border: `1px solid ${active ? 'rgba(139,92,246,0.28)' : 'transparent'}`,
                      background: active ? 'rgba(139,92,246,0.13)' : 'transparent',
                      animation: active ? 'nav-glow 2s ease-in-out infinite' : 'none',
                      transition: 'all 150ms cubic-bezier(0.16,1,0.3,1)',
                      overflow: 'hidden', whiteSpace: 'nowrap',
                    }}>
                      <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center', filter: active ? 'none' : 'saturate(0.3) brightness(0.6)' }}>
                        {item.icon}
                      </span>
                      {!collapsed && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--violet)' : 'rgba(237,232,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </span>
                      )}
                    </div>
                  </Link>

                  {/* Tooltip */}
                  {collapsed && tooltip === item.label && (
                    <div style={{
                      position: 'fixed', left: COLLAPSED_W + 8, top: tooltipY,
                      transform: 'translateY(-50%)',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                      borderRadius: 8, padding: '6px 12px',
                      fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                      whiteSpace: 'nowrap', zIndex: 1000, pointerEvents: 'none',
                    }}>
                      {item.label}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-subtle)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>

        {/* Customer Display */}
        <div onClick={openDisplay} style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, padding: collapsed ? '9px 14px' : '9px 10px', borderRadius: 10, cursor: 'pointer', border: '1px solid transparent', background: 'rgba(56,189,248,0.06)' }}>
          <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>🖥️</span>
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--info)' }}>Customer Display</span>}
        </div>

        {/* Ask Aria */}
        <div onClick={onAriaToggle} style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, padding: collapsed ? '9px 14px' : '9px 10px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${ariaOpen ? 'rgba(139,92,246,0.38)' : 'rgba(139,92,246,0.14)'}`, background: ariaOpen ? 'rgba(139,92,246,0.16)' : 'rgba(139,92,246,0.07)', boxShadow: ariaOpen ? '0 0 24px rgba(139,92,246,0.3)' : '0 0 10px rgba(139,92,246,0.1)', transition: 'all 200ms' }}>
          <span style={{ fontSize: 15, flexShrink: 0, width: 20, textAlign: 'center' }}>✨</span>
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 700, color: ariaOpen ? '#8B5CF6' : 'rgba(139,92,246,0.8)' }}>Ask Aria</span>}
        </div>

        {/* User */}
        <div onClick={onUserSwitch} style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8, padding: collapsed ? '6px 14px' : '6px 10px', borderRadius: 10, cursor: 'pointer' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: 'rgba(139,92,246,0.1)', border: '1.5px solid rgba(139,92,246,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#8B5CF6' }}>
            {user?.initials || '?'}
          </div>
          {!collapsed && user && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{user.role}</div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

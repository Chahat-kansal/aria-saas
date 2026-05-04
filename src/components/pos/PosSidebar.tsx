'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const COLLAPSED_W = 60;
const EXPANDED_W  = 224;
const STORAGE_KEY = 'aria_pos_sidebar_collapsed';

interface NavItem { href: string; label: string; icon: string; exact?: boolean; }
interface Props {
  businessName: string;
  posUser: { name: string; role: string; initials: string };
  ariaOpen: boolean;
  onAriaToggle: () => void;
  onUserSwitch: () => void;
}

/* ── Inline SVG icon set ─────────────────────────────────────────── */
function PosIcon({ name, size = 15, color }: { name: string; size?: number; color?: string }) {
  const c = color ?? 'currentColor';
  const p: Record<string, React.ReactNode> = {
    home:     <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
    terminal: <><rect x="3" y="4" width="18" height="14" rx="2"/><path strokeLinecap="round" d="M7 9l2 2-2 2M11 13h3"/></>,
    package:  <><path strokeLinecap="round" d="M12 2l-7 4v6l7 4 7-4V6z"/><line x1="12" y1="12" x2="12" y2="22"/><path strokeLinecap="round" d="M3.3 7l8.7 5 8.7-5"/></>,
    grid:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
    users:    <><path strokeLinecap="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
    tag:      <><path strokeLinecap="round" d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    percent:  <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    star:     <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    truck:    <><rect x="1" y="3" width="15" height="13" rx="1"/><path strokeLinecap="round" d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    clipboard:<><path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></>,
    barcode:  <><line x1="3" y1="5" x2="3" y2="19"/><line x1="6" y1="5" x2="6" y2="19"/><line x1="10" y1="5" x2="10" y2="19"/><line x1="14" y1="5" x2="14" y2="19"/><line x1="18" y1="5" x2="18" y2="19"/><line x1="21" y1="5" x2="21" y2="19"/></>,
    fire:     <path strokeLinecap="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>,
    layout:   <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>,
    clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    banknote: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    logout:   <><path strokeLinecap="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></>,
    trending: <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    barchart: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    monitor:  <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    sparkles: <><path strokeLinecap="round" d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path strokeLinecap="round" d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5z"/></>,
    chevronR: <polyline points="9 18 15 12 9 6"/>,
    chevronL: <polyline points="15 18 9 12 15 6"/>,
    refund:   <><polyline points="1 4 1 10 7 10"/><path strokeLinecap="round" d="M3.51 15a9 9 0 101.85-5.28L1 10"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {p[name] ?? p.package}
    </svg>
  );
}

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(20,184,166,0.15)" stroke="#14B8A6" strokeWidth="1.5"/>
      <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(20,184,166,0.25)" stroke="#14B8A6" strokeWidth="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#14B8A6"/>
    </svg>
  );
}

const MAIN_ITEMS: NavItem[] = [
  { href: '/pos',             label: 'Register',       icon: 'home',      exact: true },
  { href: '/pos/terminal',    label: 'Terminal',       icon: 'terminal'   },
  { href: '/pos/products',    label: 'Products',       icon: 'package'    },
  { href: '/pos/categories',  label: 'Categories',     icon: 'grid'       },
  { href: '/pos/customers',   label: 'Customers',      icon: 'users'      },
  { href: '/pos/gift-cards',  label: 'Gift Cards',     icon: 'tag'        },
  { href: '/pos/promotions',  label: 'Promotions',     icon: 'percent'    },
  { href: '/pos/loyalty',     label: 'Loyalty',        icon: 'star'       },
  { href: '/pos/suppliers',   label: 'Suppliers',      icon: 'truck'      },
  { href: '/pos/orders',      label: 'Purchase Orders',icon: 'clipboard'  },
  { href: '/pos/stocktake',   label: 'Stocktake',      icon: 'clipboard'  },
  { href: '/pos/transfers',   label: 'Transfers',      icon: 'clipboard'  },
  { href: '/pos/price-lists', label: 'Price Lists',    icon: 'tag'        },
  { href: '/pos/barcodes',    label: 'Barcodes',       icon: 'barcode'    },
  { href: '/pos/void',        label: 'Void / Refund',  icon: 'refund'     },
];

const OPS_ITEMS: NavItem[] = [
  { href: '/pos/kitchen',     label: 'Kitchen (KDS)',  icon: 'fire'       },
  { href: '/pos/tables',      label: 'Tables',         icon: 'layout'     },
  { href: '/pos/timesheets',  label: 'Timesheets',     icon: 'clock'      },
  { href: '/pos/cash',        label: 'Cash',           icon: 'banknote'   },
  { href: '/pos/close',       label: 'Close Register', icon: 'logout'     },
];

const REPORT_ITEMS: NavItem[] = [
  { href: '/pos/reports/sales',     label: 'Sales',       icon: 'trending'  },
  { href: '/pos/reports/inventory', label: 'Inventory',   icon: 'barchart'  },
  { href: '/pos/reports/cashier',   label: 'Cashier',     icon: 'users'     },
  { href: '/pos/reports/commission',label: 'Commission',  icon: 'percent'   },
  { href: '/pos/reports/closures',  label: 'Closures',    icon: 'calendar'  },
];

function NavItemRow({
  item, active, collapsed, tooltipKey, hoveredKey, setHoveredKey,
}: {
  item: NavItem; active: boolean; collapsed: boolean;
  tooltipKey: string; hoveredKey: string | null;
  setHoveredKey: (k: string | null) => void;
}) {
  const showTip = collapsed && hoveredKey === tooltipKey;
  const iconColor = active ? 'var(--pos-teal)' : 'var(--pos-text-tertiary)';

  const inner = (
    <div
      onMouseEnter={() => setHoveredKey(tooltipKey)}
      onMouseLeave={() => setHoveredKey(null)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10,
        padding: collapsed ? '0' : '8px 10px', cursor: 'pointer', marginBottom: 2,
        justifyContent: collapsed ? 'center' : 'flex-start', transition: 'all 150ms ease',
        background: active ? 'var(--pos-teal-dim)' : 'transparent',
        border: active ? '1px solid var(--pos-border-teal)' : '1px solid transparent',
        animation: active ? 'pos-nav-glow 2s ease-in-out infinite' : 'none',
        position: 'relative',
      }}
    >
      <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <PosIcon name={item.icon} size={15} color={iconColor} />
      </div>
      {!collapsed && (
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--pos-teal)' : 'var(--pos-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', fontFamily: 'var(--pos-font-ui)' }}>
          {item.label}
        </span>
      )}
      {showTip && (
        <div style={{ position: 'fixed', left: 66, zIndex: 9999, background: 'var(--pos-elevated)', border: '1px solid var(--pos-border-default)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--pos-text-primary)', fontFamily: 'var(--pos-font-ui)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {item.label}
        </div>
      )}
    </div>
  );

  return <Link href={item.href} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>;
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div style={{ height: 1, background: 'var(--pos-border-subtle)', margin: '6px 4px' }} />;
  return <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--pos-text-tertiary)', fontFamily: 'var(--pos-font-ui)', fontWeight: 700, padding: '10px 10px 4px' }}>{label}</p>;
}

export default function POSSidebar({ businessName, posUser, ariaOpen, onAriaToggle, onUserSwitch }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s !== null) setCollapsed(s === 'true');
    } catch { /* ignore */ }
  }, []);

  function toggle() {
    setCollapsed(v => {
      const n = !v;
      try { localStorage.setItem(STORAGE_KEY, String(n)); } catch { /* ignore */ }
      return n;
    });
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  function openDisplay() {
    try { localStorage.setItem('aria_display_state', JSON.stringify({ status: 'idle', business_name: businessName, timestamp: Date.now() })); } catch { /* ignore */ }
    const w = window.open('/pos/display', 'AriaCustomerDisplay', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes');
    if (w) w.focus();
  }

  const renderItems = (items: NavItem[]) => items.map(item => (
    <NavItemRow key={item.href} item={item} active={isActive(item)} collapsed={collapsed} tooltipKey={item.href} hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} />
  ));

  const settingsActive = pathname.startsWith('/pos/settings');

  return (
    <div style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W, transition: `width 280ms var(--pos-ease)`, background: 'var(--pos-base)', borderRight: '1px solid var(--pos-border-subtle)', display: 'flex', flexDirection: 'column', height: '100dvh', flexShrink: 0, position: 'relative', overflow: 'visible', zIndex: 50 }}>

      {/* Collapse/expand tab */}
      <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{ position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)', width: 20, height: 38, borderRadius: 5, cursor: 'pointer', background: 'var(--pos-elevated)', border: '1px solid var(--pos-border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
        <PosIcon name={collapsed ? 'chevronR' : 'chevronL'} size={10} color="var(--pos-teal)" />
      </button>

      {/* Logo */}
      <div style={{ padding: '14px 12px', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, overflow: 'hidden', flexShrink: 0, borderBottom: '1px solid var(--pos-border-subtle)' }}>
        <LogoMark size={26} />
        {!collapsed && <span style={{ fontFamily: 'var(--pos-font-disp)', fontStyle: 'italic', fontSize: 17, color: 'var(--pos-text-primary)', whiteSpace: 'nowrap' }}>AriaPOS</span>}
      </div>

      {/* Nav */}
      <div className="pos-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 8px' }}>
        <SectionLabel label="Navigation" collapsed={collapsed} />
        {renderItems(MAIN_ITEMS)}

        <SectionLabel label="Operations" collapsed={collapsed} />
        {renderItems(OPS_ITEMS)}

        {/* Customer Display */}
        <button onClick={openDisplay} style={{ display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <div onMouseEnter={() => setHoveredKey('#display')} onMouseLeave={() => setHoveredKey(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: collapsed ? '0' : '8px 10px', cursor: 'pointer', marginBottom: 2, justifyContent: collapsed ? 'center' : 'flex-start', border: '1px solid transparent', position: 'relative' }}>
            <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PosIcon name="monitor" size={15} color="var(--pos-text-tertiary)" />
            </div>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pos-text-secondary)', whiteSpace: 'nowrap', fontFamily: 'var(--pos-font-ui)' }}>Customer Display</span>}
            {collapsed && hoveredKey === '#display' && (
              <div style={{ position: 'fixed', left: 66, zIndex: 9999, background: 'var(--pos-elevated)', border: '1px solid var(--pos-border-default)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--pos-text-primary)', fontFamily: 'var(--pos-font-ui)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>Customer Display ↗</div>
            )}
          </div>
        </button>

        <SectionLabel label="Reports" collapsed={collapsed} />
        {renderItems(REPORT_ITEMS)}
      </div>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--pos-border-subtle)', padding: '8px' }}>

        {/* Aria */}
        <button onClick={onAriaToggle} title="Ask Aria (Ctrl+K)"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '0' : '8px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 2, border: ariaOpen ? '1px solid rgba(20,184,166,0.4)' : '1px solid rgba(20,184,166,0.15)', background: ariaOpen ? 'rgba(20,184,166,0.12)' : 'var(--pos-teal-dim)', justifyContent: collapsed ? 'center' : 'flex-start', transition: 'all 150ms ease' }}>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PosIcon name="sparkles" size={15} color="var(--pos-teal)" />
          </div>
          {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pos-teal)', fontFamily: 'var(--pos-font-ui)', whiteSpace: 'nowrap' }}>Ask Aria</span>}
        </button>

        {/* Settings */}
        <Link href="/pos/settings" style={{ display: 'block', textDecoration: 'none', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '0' : '8px 10px', borderRadius: 10, justifyContent: collapsed ? 'center' : 'flex-start', border: settingsActive ? '1px solid var(--pos-border-teal)' : '1px solid transparent', background: settingsActive ? 'var(--pos-teal-dim)' : 'transparent' }}>
            <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PosIcon name="settings" size={15} color={settingsActive ? 'var(--pos-teal)' : 'var(--pos-text-tertiary)'} />
            </div>
            {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, color: settingsActive ? 'var(--pos-teal)' : 'var(--pos-text-secondary)', fontFamily: 'var(--pos-font-ui)', whiteSpace: 'nowrap' }}>Settings</span>}
          </div>
        </Link>

        {/* User */}
        {collapsed ? (
          <button onClick={onUserSwitch} title={`${posUser.name} — click to switch user`}
            style={{ width: 34, height: 34, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,184,166,0.1)', border: '1.5px solid rgba(20,184,166,0.3)', cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--pos-teal)', fontFamily: 'var(--pos-font-ui)' }}>
            {posUser.initials}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pos-border-subtle)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,184,166,0.1)', border: '1.5px solid rgba(20,184,166,0.3)', fontSize: 11, fontWeight: 800, color: 'var(--pos-teal)', fontFamily: 'var(--pos-font-ui)' }}>
              {posUser.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pos-text-primary)', fontFamily: 'var(--pos-font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{posUser.name}</p>
              <p style={{ fontSize: 10, color: 'var(--pos-text-tertiary)', textTransform: 'capitalize', fontFamily: 'var(--pos-font-ui)' }}>{posUser.role}</p>
            </div>
            <button onClick={onUserSwitch} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--pos-teal)', fontFamily: 'var(--pos-font-ui)', fontWeight: 600, flexShrink: 0 }}>Switch</button>
          </div>
        )}
      </div>
    </div>
  );
}

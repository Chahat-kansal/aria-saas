'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const COLLAPSED_W = 60;
const EXPANDED_W  = 220;
const STORAGE_KEY = 'pos_sidebar';

interface NavItem {
  section: string; href: string; label: string; icon: string; exact?: boolean;
}
interface Props {
  businessName: string;
  posUser: { name: string; role: string; initials: string };
  ariaOpen: boolean;
  onAriaToggle: () => void;
  onUserSwitch: () => void;
}

/* ── Icon set ────────────────────────────────────────────────────── */
function PosIcon({ name, size = 15, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const p: Record<string, React.ReactNode> = {
    home:        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>,
    shoppingCart:<><path strokeLinecap="round" d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path strokeLinecap="round" d="M16 10a4 4 0 01-8 0"/></>,
    package:     <><path strokeLinecap="round" d="M12 2l-7 4v6l7 4 7-4V6z"/><line x1="12" y1="12" x2="12" y2="22"/><path strokeLinecap="round" d="M3.3 7l8.7 5 8.7-5"/></>,
    grid:        <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
    truck:       <><rect x="1" y="3" width="15" height="13" rx="1"/><path strokeLinecap="round" d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
    clipboard:   <><path strokeLinecap="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/></>,
    checkSquare: <><polyline points="9 11 12 14 22 4"/><path strokeLinecap="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></>,
    arrowsRL:    <><polyline points="17 1 21 5 17 9"/><path strokeLinecap="round" d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path strokeLinecap="round" d="M21 13v2a4 4 0 01-4 4H3"/></>,
    tag:         <><path strokeLinecap="round" d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    barcode:     <><line x1="3" y1="5" x2="3" y2="19"/><line x1="6" y1="5" x2="6" y2="19"/><line x1="10" y1="5" x2="10" y2="19"/><line x1="14" y1="5" x2="14" y2="19"/><line x1="18" y1="5" x2="18" y2="19"/><line x1="21" y1="5" x2="21" y2="19"/></>,
    user:        <><path strokeLinecap="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users:       <><path strokeLinecap="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></>,
    gift:        <><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path strokeLinecap="round" d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></>,
    percent:     <><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
    star:        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
    fire:        <path strokeLinecap="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"/>,
    layoutGrid:  <><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>,
    clock:       <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    banknote:    <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    trendingUp:  <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
    barChart:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    userCheck:   <><path strokeLinecap="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></>,
    calendar:    <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    settings:    <><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    lock:        <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path strokeLinecap="round" d="M7 11V7a5 5 0 0110 0v4"/></>,
    monitor:     <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
    sparkles:    <><path strokeLinecap="round" d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path strokeLinecap="round" d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5z"/></>,
    chevronR:    <polyline points="9 18 15 12 9 6"/>,
    chevronL:    <polyline points="15 18 9 12 15 6"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {p[name] ?? p.package}
    </svg>
  );
}

/* ── LogoMark ────────────────────────────────────────────────────── */
function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <rect x="16" y="2" width="19" height="19" rx="3" transform="rotate(45 16 2)"
        stroke="#8B5CF6" strokeWidth="1.8" fill="none"/>
      <circle cx="16" cy="16" r="3" fill="#8B5CF6"/>
      <circle cx="16" cy="4.5" r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="27.5" cy="16" r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="16" cy="27.5" r="1.8" fill="#8B5CF6" opacity="0.4"/>
      <circle cx="4.5" cy="16" r="1.8" fill="#8B5CF6" opacity="0.4"/>
    </svg>
  );
}

/* ── Nav items ────────────────────────────────────────────────────── */
const ALL_NAV: NavItem[] = [
  { section: 'POS',       href: '/pos',                    label: 'Register',       icon: 'home',        exact: true },
  { section: 'POS',       href: '/pos/terminal',           label: 'Terminal',       icon: 'shoppingCart' },
  { section: 'Inventory', href: '/pos/products',           label: 'Products',       icon: 'package'      },
  { section: 'Inventory', href: '/pos/categories',         label: 'Categories',     icon: 'grid'         },
  { section: 'Inventory', href: '/pos/suppliers',          label: 'Suppliers',      icon: 'truck'        },
  { section: 'Inventory', href: '/pos/orders',             label: 'Purchase Orders',icon: 'clipboard'    },
  { section: 'Inventory', href: '/pos/stocktake',          label: 'Stocktake',      icon: 'checkSquare'  },
  { section: 'Inventory', href: '/pos/transfers',          label: 'Transfers',      icon: 'arrowsRL'     },
  { section: 'Inventory', href: '/pos/price-lists',        label: 'Price Lists',    icon: 'tag'          },
  { section: 'Inventory', href: '/pos/barcodes',           label: 'Barcodes',       icon: 'barcode'      },
  { section: 'Customers', href: '/pos/customers',          label: 'Customers',      icon: 'user'         },
  { section: 'Customers', href: '/pos/customer-groups',    label: 'Groups',         icon: 'users'        },
  { section: 'Customers', href: '/pos/gift-cards',         label: 'Gift Cards',     icon: 'gift'         },
  { section: 'Customers', href: '/pos/promotions',         label: 'Promotions',     icon: 'percent'      },
  { section: 'Customers', href: '/pos/loyalty',            label: 'Loyalty',        icon: 'star'         },
  { section: 'Operations',href: '/pos/kitchen',            label: 'Kitchen (KDS)',  icon: 'fire'         },
  { section: 'Operations',href: '/pos/tables',             label: 'Tables',         icon: 'layoutGrid'   },
  { section: 'Operations',href: '/pos/timesheets',         label: 'Timesheets',     icon: 'clock'        },
  { section: 'Operations',href: '/pos/cash',               label: 'Cash',           icon: 'banknote'     },
  { section: 'Operations',href: '/pos/void',               label: 'Void / Refund',  icon: 'arrowsRL'     },
  { section: 'Reports',   href: '/pos/reports/sales',      label: 'Sales',          icon: 'trendingUp'   },
  { section: 'Reports',   href: '/pos/reports/inventory',  label: 'Inventory',      icon: 'barChart'     },
  { section: 'Reports',   href: '/pos/reports/cashier',    label: 'Cashier',        icon: 'userCheck'    },
  { section: 'Reports',   href: '/pos/reports/commission', label: 'Commission',     icon: 'percent'      },
  { section: 'Reports',   href: '/pos/reports/closures',   label: 'Closures',       icon: 'calendar'     },
  { section: 'Settings',  href: '/pos/settings',           label: 'Settings',       icon: 'settings'     },
  { section: 'Settings',  href: '/pos/settings/users',     label: 'Staff PINs',     icon: 'lock'         },
];

const SECTIONS = ['POS', 'Inventory', 'Customers', 'Operations', 'Reports', 'Settings'];

/* ── NavRow ──────────────────────────────────────────────────────── */
function NavRow({
  item, active, collapsed, showTooltip, onEnter, onLeave,
}: {
  item: NavItem; active: boolean; collapsed: boolean;
  showTooltip: boolean; onEnter: () => void; onLeave: () => void;
}) {
  const accent = '#8B5CF6';
  const iconColor = active ? accent : 'rgba(139,133,168,0.45)';

  return (
    <Link href={item.href} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{
          display: 'flex', alignItems: 'center',
          gap: collapsed ? 0 : 10,
          padding: '9px 10px',
          borderRadius: 10, marginBottom: 1,
          cursor: 'pointer', position: 'relative',
          border: active ? '1px solid rgba(139,92,246,0.28)' : '1px solid transparent',
          background: active ? 'rgba(139,92,246,0.13)' : 'transparent',
          animation: active ? 'pos-nav-glow 2s ease-in-out infinite' : 'none',
          transition: 'all 150ms var(--pos-ease)',
          overflow: 'hidden',
        }}
      >
        {/* Icon */}
        <div style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
          <PosIcon name={item.icon} size={15} color={iconColor} />
        </div>

        {/* Label */}
        {!collapsed && (
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: active ? accent : 'rgba(237,232,255,0.75)',
            whiteSpace: 'nowrap', overflow: 'hidden',
            fontFamily: 'var(--pos-ui)',
            opacity: collapsed ? 0 : 1,
            maxWidth: collapsed ? 0 : 140,
            transition: 'opacity 200ms, maxWidth 200ms',
          }}>
            {item.label}
          </span>
        )}

        {/* Tooltip */}
        {collapsed && showTooltip && (
          <div style={{
            position: 'fixed', left: 64, zIndex: 9999,
            background: 'var(--pos-elevated)', border: '1px solid var(--pos-border-default)',
            borderRadius: 8, padding: '6px 10px',
            fontSize: 12, fontWeight: 600, color: 'var(--pos-text-1)',
            fontFamily: 'var(--pos-ui)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {item.label}
          </div>
        )}
      </div>
    </Link>
  );
}

/* ── Section label ────────────────────────────────────────────────── */
function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div style={{ height: 1, background: 'var(--pos-border-subtle)', margin: '5px 6px' }} />;
  }
  return (
    <p style={{
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--pos-text-3)', fontFamily: 'var(--pos-ui)', fontWeight: 700,
      padding: '8px 10px 3px',
    }}>
      {label}
    </p>
  );
}

/* ── Bottom action button ─────────────────────────────────────────── */
function BottomBtn({
  icon, label, collapsed, onClick, accentBg, tooltipKey, hoveredKey, setHoveredKey,
}: {
  icon: string; label: string; collapsed: boolean; onClick: () => void;
  accentBg?: boolean; tooltipKey: string; hoveredKey: string | null;
  setHoveredKey: (k: string | null) => void;
}) {
  const showTip = collapsed && hoveredKey === tooltipKey;
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, padding: '9px 10px', borderRadius: 10, marginBottom: 2, cursor: 'pointer', border: accentBg ? '1px solid rgba(139,92,246,0.14)' : '1px solid transparent', background: accentBg ? 'rgba(139,92,246,0.07)' : 'transparent', transition: 'all 150ms ease', justifyContent: collapsed ? 'center' : 'flex-start', position: 'relative' }}
      onMouseEnter={() => setHoveredKey(tooltipKey)} onMouseLeave={() => setHoveredKey(null)}>
      <div style={{ width: 36, height: 36, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
        <PosIcon name={icon} size={15} color="#8B5CF6" />
      </div>
      {!collapsed && <span style={{ fontSize: 13, fontWeight: 600, color: '#8B5CF6', fontFamily: 'var(--pos-ui)', whiteSpace: 'nowrap' }}>{label}</span>}
      {showTip && (
        <div style={{ position: 'fixed', left: 64, zIndex: 9999, background: 'var(--pos-elevated)', border: '1px solid var(--pos-border-default)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: 'var(--pos-text-1)', fontFamily: 'var(--pos-ui)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          {label}
        </div>
      )}
    </button>
  );
}

/* ── POSSidebar ───────────────────────────────────────────────────── */
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
      setCollapsed(s !== 'expanded');
    } catch { /* ignore */ }
  }, []);

  function toggle() {
    setCollapsed(v => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
      return next;
    });
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  function openDisplay() {
    try { localStorage.setItem('aria_display_state', JSON.stringify({ status: 'idle', business_name: businessName, timestamp: Date.now() })); } catch { /* ignore */ }
    const w = window.open('/pos/display', 'AriaDisplay', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes');
    if (w) w.focus();
  }

  // Group nav by section
  const grouped = SECTIONS.map(s => ({ section: s, items: ALL_NAV.filter(n => n.section === s) }));

  return (
    <div style={{
      width: collapsed ? COLLAPSED_W : EXPANDED_W,
      transition: `width 280ms var(--pos-ease)`,
      background: 'var(--pos-base)',
      borderRight: '1px solid var(--pos-border-subtle)',
      display: 'flex', flexDirection: 'column',
      height: '100dvh', flexShrink: 0,
      position: 'relative', overflow: 'visible', zIndex: 50,
    }}>

      {/* Collapse/expand tab */}
      <button onClick={toggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          position: 'absolute', right: -1, top: '50%', transform: 'translateY(-50%)',
          width: 16, height: 40,
          background: 'var(--pos-elevated)',
          border: '1px solid var(--pos-border-default)', borderLeft: 'none',
          borderRadius: '0 6px 6px 0',
          cursor: 'pointer', zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <PosIcon name={collapsed ? 'chevronR' : 'chevronL'} size={10} color="var(--pos-accent)" />
      </button>

      {/* Logo */}
      <div style={{ padding: '13px 10px', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10, overflow: 'hidden', flexShrink: 0, borderBottom: '1px solid var(--pos-border-subtle)' }}>
        <LogoMark size={24} />
        {!collapsed && (
          <span style={{ fontFamily: 'var(--pos-disp)', fontStyle: 'italic', fontSize: 15, color: 'var(--pos-text-1)', fontWeight: 400, whiteSpace: 'nowrap', overflow: 'hidden', opacity: collapsed ? 0 : 1, transition: 'opacity 200ms' }}>
            AriaPOS
          </span>
        )}
      </div>

      {/* Scrollable nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 8px' }}
        className="pos-scroll">
        {grouped.map(({ section, items }) => (
          <div key={section}>
            <SectionLabel label={section} collapsed={collapsed} />
            {items.map(item => (
              <NavRow
                key={item.href}
                item={item}
                active={isActive(item)}
                collapsed={collapsed}
                showTooltip={hoveredKey === item.href && collapsed}
                onEnter={() => setHoveredKey(item.href)}
                onLeave={() => setHoveredKey(null)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div style={{ borderTop: '1px solid var(--pos-border-subtle)', padding: '8px', flexShrink: 0 }}>
        <BottomBtn icon="sparkles" label="Ask Aria" collapsed={collapsed} onClick={onAriaToggle} accentBg tooltipKey="#aria" hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} />
        <BottomBtn icon="monitor" label="Customer Display" collapsed={collapsed} onClick={openDisplay} tooltipKey="#display" hoveredKey={hoveredKey} setHoveredKey={setHoveredKey} />

        {/* User */}
        {collapsed ? (
          <button onClick={onUserSwitch} title={`${posUser.name} — switch user`}
            style={{ width: 36, height: 36, borderRadius: '50%', margin: '4px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.1)', border: '1.5px solid rgba(139,92,246,0.22)', cursor: 'pointer', fontSize: 9, fontWeight: 800, color: 'var(--pos-accent)', fontFamily: 'var(--pos-ui)' }}>
            {posUser.initials}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginTop: 2, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--pos-border-subtle)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.1)', border: '1.5px solid rgba(139,92,246,0.22)', fontSize: 9, fontWeight: 800, color: 'var(--pos-accent)', fontFamily: 'var(--pos-ui)' }}>
              {posUser.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--pos-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--pos-ui)' }}>{posUser.name}</p>
              <p style={{ fontSize: 10, color: 'var(--pos-text-3)', textTransform: 'capitalize', fontFamily: 'var(--pos-ui)' }}>{posUser.role}</p>
            </div>
            <button onClick={onUserSwitch} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--pos-accent)', fontFamily: 'var(--pos-ui)', fontWeight: 600 }}>Switch</button>
          </div>
        )}
      </div>
    </div>
  );
}

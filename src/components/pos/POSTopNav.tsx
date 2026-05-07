'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

/* ─── Icon SVGs ────────────────────────────────────────────────── */
function IconHome({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
}
function IconRotateCcw({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 101.85-5.28L1 10"/></svg>;
}
function IconBarChart({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
}
function IconMonitor({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
}
function IconGrid({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
}
function IconClock({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IconTrendingUp({ active }: { active: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#8B5CF6' : 'rgba(139,133,168,0.45)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
}
function IconSparkles() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5z"/></svg>;
}
function IconBell({ muted }: { muted?: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted ? 'var(--text-tertiary)' : 'rgba(237,232,255,0.7)'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
}

/* ─── LogoMark ─────────────────────────────────────────────────── */
function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5"/>
      <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(139,92,246,0.25)" stroke="#8B5CF6" strokeWidth="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#8B5CF6"/>
    </svg>
  );
}

/* ─── Clock ────────────────────────────────────────────────────── */
function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time}</span>;
}

/* ─── NavItem ──────────────────────────────────────────────────── */
function NavItem({ href, active, children, onClick, title }: { href?: string; active: boolean; children: React.ReactNode; onClick?: () => void; title?: string }) {
  const style: React.CSSProperties = active
    ? { background: 'rgba(139,92,246,0.13)', border: '1px solid rgba(139,92,246,0.28)', animation: 'nav-glow 2s ease-in-out infinite' }
    : { background: 'transparent', border: '1px solid transparent' };

  const cls = 'w-10 h-10 rounded-[11px] flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.06)]';

  if (onClick) return (
    <button onClick={onClick} title={title} className={cls} style={style}>{children}</button>
  );
  return (
    <Link href={href ?? '/'} title={title} className={cls} style={style}>{children}</Link>
  );
}

/* ─── POSTopNav (new: sidebar + topbar layout) ─────────────────── */
export function POSTopNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null);
  const [sessionRevenue, setSessionRevenue] = useState(0);
  const [posUser, setPosUser] = useState<{ name: string } | null>(null);
  const [ariaActive, setAriaActive] = useState(false);

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

  useEffect(() => {
    try {
      const u = localStorage.getItem('aria_pos_user');
      if (u) setPosUser(JSON.parse(u));
    } catch { /* ignore */ }
  }, [pathname]);

  function openCustomerDisplay() {
    try {
      localStorage.setItem('aria_pos_display_state', JSON.stringify({ status: 'idle', timestamp: Date.now() }));
    } catch { /* ignore */ }
    const w = window.open('/pos/display', 'AriaCustomerDisplay', 'width=1280,height=800,menubar=no,toolbar=no,location=no');
    if (w) w.focus();
  }

  function toggleAria() {
    setAriaActive(v => !v);
    window.dispatchEvent(new CustomEvent('pos-aria-toggle'));
  }

  const navItems = [
    { href: '/pos/terminal', icon: (a: boolean) => <IconHome active={a} />, title: 'Terminal' },
    { href: '/pos/close', icon: (a: boolean) => <IconBarChart active={a} />, title: 'End of Day' },
    { href: undefined, icon: (a: boolean) => <IconMonitor active={a} />, title: 'Customer Display', onClick: openCustomerDisplay },
    { href: '/pos/kitchen', icon: (a: boolean) => <IconGrid active={a} />, title: 'Kitchen' },
    { href: '/pos/tables', icon: (a: boolean) => <IconGrid active={false} />, title: 'Tables' },
    { href: '/pos/timesheets', icon: (a: boolean) => <IconClock active={a} />, title: 'Timesheets' },
    { href: '/pos/reports', icon: (a: boolean) => <IconTrendingUp active={a} />, title: 'Reports' },
  ];

  const isActive = (href?: string) => !!href && (pathname === href || pathname.startsWith(href + '/'));

  const screenLabel: Record<string, string> = {
    '/pos/terminal': 'Terminal',
    '/pos/close': 'End of Day',
    '/pos/products': 'Products',
    '/pos/customers': 'Customers',
    '/pos/reports': 'Reports',
    '/pos/settings': 'Settings',
    '/pos/kitchen': 'Kitchen Display',
    '/pos/tables': 'Table Management',
    '/pos/timesheets': 'Timesheets',
    '/pos': 'Register',
  };
  const currentLabel = Object.entries(screenLabel).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] ?? 'POS';

  const initials = posUser?.name?.slice(0, 2).toUpperCase() ?? 'ME';

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--bg-base)', fontFamily: "'Manrope', system-ui, sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div style={{ width: 60, flexShrink: 0, height: '100%', background: 'var(--bg-base)', borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 14, paddingBottom: 14, gap: 0, zIndex: 40 }}>

        {/* Logo */}
        <div style={{ marginBottom: 16 }}>
          <Link href="/pos"><LogoMark size={28} /></Link>
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, alignItems: 'center', width: '100%', paddingLeft: 10, paddingRight: 10, paddingTop: 4 }}>
          {navItems.map((item, i) => {
            const active = isActive(item.href);
            return (
              <NavItem key={i} href={item.href} active={active} onClick={item.onClick} title={item.title}>
                {item.icon(active)}
              </NavItem>
            );
          })}
          {/* Void / Refund */}
          <NavItem href={undefined} active={false} title="Refund / Void" onClick={() => window.dispatchEvent(new CustomEvent('pos-refund-toggle'))}>
            <IconRotateCcw active={false} />
          </NavItem>
        </div>

        {/* Bottom: Aria, time, user */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {/* Aria button */}
          <button
            onClick={toggleAria}
            title="Aria AI (⌘K)"
            style={{
              width: 40, height: 40, borderRadius: 11,
              background: ariaActive ? 'rgba(139,92,246,0.16)' : 'rgba(139,92,246,0.07)',
              border: ariaActive ? '1px solid rgba(139,92,246,0.38)' : '1px solid rgba(139,92,246,0.14)',
              boxShadow: ariaActive ? '0 0 24px rgba(139,92,246,0.3)' : '0 0 10px rgba(139,92,246,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              transition: 'all 200ms ease',
            }}
            onMouseEnter={e => { if (!ariaActive) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 20px rgba(139,92,246,0.22)'; }}
            onMouseLeave={e => { if (!ariaActive) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 10px rgba(139,92,246,0.1)'; }}
          >
            <IconSparkles />
          </button>

          {/* Time */}
          <span style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: 'rgba(139,133,168,0.25)', letterSpacing: '0.02em' }}>
            <LiveClock />
          </span>

          {/* User avatar */}
          <button
            onClick={() => { localStorage.removeItem('aria_pos_user'); setPosUser(null); window.location.reload(); }}
            title={posUser?.name ?? 'Switch user'}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(139,92,246,0.1)',
              border: '1.5px solid rgba(139,92,246,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#8B5CF6', fontSize: 9, fontWeight: 800,
            }}
          >
            {initials}
          </button>

          {/* Back to Dashboard */}
          <Link href="/dashboard" title="Dashboard" style={{ opacity: 0.25, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B85A8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Right section ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          height: 46, flexShrink: 0,
          background: 'rgba(8,6,16,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center',
          paddingLeft: 20, paddingRight: 16,
          gap: 10,
          zIndex: 30,
        }}>
          {/* Left: screen label + business name */}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(237,232,255,0.88)', letterSpacing: '-0.02em' }}>
            {currentLabel}
          </span>

          <span style={{ flex: 1 }} />

          {/* LIVE badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 20, padding: '3px 9px',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', display: 'block', animation: 'pulse-ring 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: '#22C55E' }}>LIVE</span>
          </div>

          {/* Revenue */}
          {sessionOpen && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '3px 10px',
            }}>
              <span style={{ fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>TODAY</span>
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'rgba(237,232,255,0.75)' }}>
                A${sessionRevenue.toFixed(2)}
              </span>
            </div>
          )}

          {/* Bell */}
          <button style={{ width: 27, height: 27, borderRadius: 7, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IconBell muted />
          </button>
        </div>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
}

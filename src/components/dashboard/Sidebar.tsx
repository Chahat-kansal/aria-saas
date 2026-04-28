'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { industryConfig, type Industry } from '@/lib/industry-config';
import { supabase } from '@/lib/supabase';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { useState, useRef, useEffect } from 'react';

/* ─── Nav item registry ─────────────────────────────────────────── */
type NavItemDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  section: string;
};

const ALL_ITEMS: Record<string, NavItemDef> = {
  'dashboard':                  { href: '/dashboard',                          label: 'Dashboard',         icon: GridIcon,           section: 'Overview'     },
  'pos':                        { href: '/pos',                                label: 'AriaPOS',           icon: RegisterIcon,       badge: 'New', section: 'Modules' },
  'winback':                    { href: '/dashboard/winback',                  label: 'Customer winback',  icon: UsersIcon,          section: 'Revenue'      },
  'slow-day':                   { href: '/dashboard/churn',                    label: 'Slow day filler',   icon: DollarIcon,         badge: '⚡', section: 'Revenue' },
  'reviews':                    { href: '/dashboard/reviews',                  label: 'Reviews',           icon: StarIcon,           section: 'Reputation'   },
  'profit-leaks':               { href: '/dashboard/profit-leaks',             label: 'Profit leaks',      icon: AlertIcon,          section: 'Intelligence' },
  'competitors':                { href: '/dashboard/competitors',              label: 'Competitor watch',  icon: SearchIcon,         section: 'Reputation'   },
  'churn':                      { href: '/dashboard/churn',                    label: 'Churn prevention',  icon: TrendingDownIcon,   section: 'Intelligence' },
  'bookings':                   { href: '/dashboard/bookings',                 label: 'Bookings + sales',  icon: CalendarIcon,       section: 'Revenue'      },
  'quote-builder':              { href: '/dashboard/quote-builder',            label: 'Quote builder',     icon: FileTextIcon,       section: 'Pro tools'    },
  'compliance':                 { href: '/dashboard/compliance',               label: 'Compliance',        icon: CheckSquareIcon,    section: 'Pro tools'    },
  'website-chat':               { href: '/dashboard/website-chat',             label: 'Website chat',      icon: GlobeIcon,          badge: 'New', section: 'Modules' },
  'receipt-scan':               { href: '/dashboard/receipt-scan',             label: 'Receipt scan',      icon: CameraIcon,         badge: 'New', section: 'Modules' },
  'reorder':                    { href: '/dashboard/reorder',                  label: 'Smart reorder',     icon: TruckIcon,          badge: 'AI',  section: 'Intelligence' },
  'variance':                   { href: '/dashboard/variance',                 label: 'Variance & shrinkage', icon: AlertTriangleIcon, badge: 'AI', section: 'Intelligence' },
  'visa/clients':               { href: '/visa/clients',                       label: 'Clients',           icon: UsersIcon,          section: 'VisaAI'       },
  'visa/applications':          { href: '/visa/applications',                  label: 'Applications',      icon: FileTextIcon,       section: 'VisaAI'       },
  'visa/documents':             { href: '/visa/documents',                     label: 'Documents',         icon: FolderIcon,         section: 'VisaAI'       },
  'visa/alerts':                { href: '/visa/alerts',                        label: 'Alerts',            icon: AlertIcon,          section: 'VisaAI'       },
  'visa/news':                  { href: '/visa/news',                          label: 'News',              icon: NewsIcon,           section: 'VisaAI'       },
  'visa/ask':                   { href: '/visa/ask',                           label: 'Ask VisaAI',        icon: ChatIcon,           badge: 'AI', section: 'VisaAI' },
  'warehouse/inbound':          { href: '/dashboard/warehouse/inbound',        label: 'Inbound GRN',       icon: InboxIcon,          section: 'Warehouse'    },
  'warehouse/stock':            { href: '/dashboard/warehouse/stock',          label: 'Stock overview',    icon: BoxIcon,            section: 'Warehouse'    },
  'warehouse/locations':        { href: '/dashboard/warehouse/locations',      label: 'Bin locations',     icon: MapPinIcon,         section: 'Warehouse'    },
  'warehouse/purchase-orders':  { href: '/dashboard/warehouse/purchase-orders',label: 'Purchase orders',   icon: ClipboardIcon,      badge: 'AI', section: 'Warehouse' },
  'warehouse/cycle-count':      { href: '/dashboard/warehouse/cycle-count',    label: 'Cycle count',       icon: ScanIcon,           badge: 'AI', section: 'Warehouse' },
  'warehouse/lots':             { href: '/dashboard/warehouse/lots',           label: 'Lots & batches',    icon: TagIcon,            section: 'Warehouse'    },
  'warehouse/suppliers':        { href: '/dashboard/warehouse/suppliers',      label: 'Suppliers',         icon: BuildingIcon,       section: 'Warehouse'    },
  'warehouse/transfers':        { href: '/dashboard/warehouse/transfers',      label: 'Transfers',         icon: ArrowsIcon,         section: 'Warehouse'    },
};

const SECTION_ORDER = ['Overview', 'Warehouse', 'Revenue', 'Reputation', 'Intelligence', 'Pro tools', 'VisaAI', 'Modules'];

/* ─── Component ─────────────────────────────────────────────────── */
export function Sidebar() {
  const { business: b, allBusinesses, switchBusiness } = useBusinessContext();
  const business = b!;
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const industry = (business.industry ?? 'professional') as Industry;
  const config = industryConfig[industry] ?? industryConfig.professional;

  // Close switcher on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleSwitch(id: string) {
    if (id === business.id) { setSwitcherOpen(false); return; }
    setSwitching(id);
    await fetch('/api/businesses/switch', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: id }),
    });
    await switchBusiness(id);
    setSwitching(null);
    setSwitcherOpen(false);
    router.refresh();
  }

  // Build sections from the industry's sidebar list
  const sections: Record<string, NavItemDef[]> = {};

  sections['Overview'] = [
    ALL_ITEMS['dashboard'],
    { href: '/dashboard/ask-aria', label: 'Ask Aria', icon: ChatIcon, badge: 'AI', section: 'Overview' },
    { href: '/dashboard/integrations', label: 'Integrations', icon: PlugIcon, badge: business?.square_connected ? '●' : undefined, section: 'Overview' },
  ];

  for (const key of config.sidebar as readonly string[]) {
    if (key === 'dashboard') continue;
    const item = ALL_ITEMS[key];
    if (!item) continue;
    if (!sections[item.section]) sections[item.section] = [];
    if (!sections[item.section].some(i => i.href === item.href)) {
      sections[item.section].push(item);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    localStorage.removeItem('aria_active_business_id');
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // Initials for avatar
  const initials = (business.owner_name ?? business.name)
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#13131a] h-screen flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="px-5 pt-[22px] pb-3 flex-shrink-0">
        <div className="text-lg font-medium tracking-tight">
          <span className="text-white">aria</span>
          <span className="text-[#1D9E75]">OS</span>
        </div>
        <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]">
          <span className="text-[10px] text-[rgba(255,255,255,0.45)]">{config.label}</span>
        </div>
      </div>

      {/* Business switcher */}
      <div className="px-3 mb-3 flex-shrink-0 relative" ref={switcherRef}>
        <button
          onClick={() => setSwitcherOpen(o => !o)}
          className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 hover:border-[rgba(255,255,255,0.12)] transition-colors"
        >
          <div className="min-w-0 text-left">
            <div className="text-[12px] font-semibold text-[rgba(255,255,255,0.85)] truncate leading-tight">
              {business.name}
            </div>
            <div className="text-[10px] text-[rgba(255,255,255,0.35)] mt-0.5 capitalize">
              {config.label}
            </div>
          </div>
          <SwitchIcon />
        </button>

        {switcherOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-[#1e1e28] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl overflow-hidden">
            {allBusinesses.map(biz => {
              const isActive = biz.id === business.id;
              return (
                <button
                  key={biz.id}
                  onClick={() => handleSwitch(biz.id)}
                  disabled={switching === biz.id}
                  className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-[rgba(29,158,117,0.1)]'
                      : 'hover:bg-[rgba(255,255,255,0.04)]'
                  }`}
                >
                  {switching === biz.id ? (
                    <Spinner />
                  ) : (
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-[#1D9E75]' : 'bg-[rgba(255,255,255,0.2)]'}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[rgba(255,255,255,0.8)] truncate">{biz.name}</div>
                    <div className="text-[10px] text-[rgba(255,255,255,0.3)] capitalize">{biz.industry}</div>
                  </div>
                  {isActive && (
                    <span className="text-[9px] font-semibold text-[#1D9E75] flex-shrink-0">Active</span>
                  )}
                </button>
              );
            })}
            <div className="border-t border-[rgba(255,255,255,0.06)] px-3 py-2">
              <Link
                href="/businesses"
                onClick={() => setSwitcherOpen(false)}
                className="text-[10px] text-[rgba(255,255,255,0.35)] hover:text-[#1D9E75] transition-colors flex items-center gap-1"
              >
                Manage all businesses →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Plan badge */}
      <div className="px-4 mb-4">
        <div className="bg-[rgba(29,158,117,0.12)] border border-[rgba(29,158,117,0.25)] rounded-lg px-3 py-2">
          <div className="text-[11px] font-medium text-[#1D9E75] capitalize">{business.plan} plan</div>
          <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-0.5">All features unlocked</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 pb-4">
        {SECTION_ORDER.map(sectionName => {
          const items = sections[sectionName];
          if (!items?.length) return null;
          return (
            <div key={sectionName} className="mb-3">
              <div className="px-3 py-1.5 text-[9px] uppercase tracking-[.1em] text-[rgba(255,255,255,0.25)] font-medium">
                {sectionName}
              </div>
              {items.map(item => {
                const isActive = item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-[12.5px] transition-colors mb-0.5 ${
                      isActive
                        ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75]'
                        : 'text-[rgba(255,255,255,0.45)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.8)]'
                    }`}
                  >
                    <item.icon className="w-[13px] h-[13px] flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        item.badge === 'AI'  ? 'bg-[rgba(29,158,117,0.2)] text-[#1D9E75]' :
                        item.badge === 'New' ? 'bg-[rgba(249,115,22,0.2)] text-orange-400' :
                        'bg-[rgba(245,158,11,0.2)] text-amber-400'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User footer — always visible */}
      <div className="px-3 py-3 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-[rgba(29,158,117,0.2)] border border-[rgba(29,158,117,0.3)] flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-[#1D9E75]">{initials || '?'}</span>
          </div>
          {/* Name + email truncated */}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[rgba(255,255,255,0.75)] truncate leading-tight">
              {business.owner_name || business.name}
            </div>
            {business.city && (
              <div className="text-[10px] text-[rgba(255,255,255,0.3)] truncate">{business.city}</div>
            )}
          </div>
          {/* Action icons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              href="/profile"
              title="Profile &amp; settings"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
            >
              <ProfileIcon />
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign out"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[rgba(255,255,255,0.3)] hover:text-red-400 hover:bg-[rgba(239,68,68,0.08)] transition-colors disabled:opacity-40"
            >
              {signingOut ? <Spinner /> : <SignOutIcon />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────── */
function GridIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function UsersIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>;
}
function DollarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><line x1="12" y1="1" x2="12" y2="23"/><path strokeLinecap="round" d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>;
}
function StarIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function AlertIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
}
function TrendingDownIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
}
function FileTextIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}
function FolderIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>;
}
function NewsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v10a2 2 0 01-2 2z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>;
}
function CheckSquareIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><polyline points="9 11 12 14 22 4"/><path strokeLinecap="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>;
}
function RegisterIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
}
function ProfileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5"><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function SignOutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>;
}
function SwitchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>;
}
function GlobeIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path strokeLinecap="round" d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
}
function PlugIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>;
}
function CameraIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>;
}
function AlertTriangleIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.95 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>;
}
function TruckIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/></svg>;
}
function Spinner() {
  return <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
function InboxIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z"/></svg>;
}
function BoxIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>;
}
function MapPinIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>;
}
function ClipboardIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>;
}
function ScanIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"/></svg>;
}
function TagIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z"/></svg>;
}
function BuildingIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/></svg>;
}
function ArrowsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>;
}
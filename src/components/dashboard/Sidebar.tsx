'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { industryConfig, type Industry } from '@/lib/industry-config';

interface Business {
  id: string;
  name: string;
  owner_name: string | null;
  industry: string | null;
  plan: string;
  city: string | null;
}

/* ─── Nav item registry ─────────────────────────────────────────── */
type NavItemDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  section: string;
};

const ALL_ITEMS: Record<string, NavItemDef> = {
  'dashboard':          { href: '/dashboard',               label: 'Dashboard',         icon: GridIcon,         section: 'Overview'     },
  'pos':                { href: '/pos',                     label: 'AriaPOS',           icon: RegisterIcon,     badge: 'New', section: 'Modules' },
  'winback':            { href: '/dashboard/winback',       label: 'Customer winback',  icon: UsersIcon,        section: 'Revenue'      },
  'slow-day':           { href: '/dashboard/churn',         label: 'Slow day filler',   icon: DollarIcon,       badge: '⚡', section: 'Revenue' },
  'reviews':            { href: '/dashboard/reviews',       label: 'Reviews',           icon: StarIcon,         section: 'Reputation'   },
  'profit-leaks':       { href: '/dashboard/profit-leaks',  label: 'Profit leaks',      icon: AlertIcon,        section: 'Intelligence' },
  'competitors':        { href: '/dashboard/competitors',   label: 'Competitor watch',  icon: SearchIcon,       section: 'Reputation'   },
  'churn':              { href: '/dashboard/churn',         label: 'Churn prevention',  icon: TrendingDownIcon, section: 'Intelligence' },
  'bookings':           { href: '/dashboard/bookings',      label: 'Bookings + sales',  icon: CalendarIcon,     section: 'Revenue'      },
  'quote-builder':      { href: '/dashboard/quote-builder', label: 'Quote builder',     icon: FileTextIcon,     section: 'Pro tools'    },
  'compliance':         { href: '/dashboard/compliance',    label: 'Compliance',        icon: CheckSquareIcon,  section: 'Pro tools'    },
  'visa/clients':       { href: '/visa/clients',            label: 'Clients',           icon: UsersIcon,        section: 'VisaAI'       },
  'visa/applications':  { href: '/visa/applications',       label: 'Applications',      icon: FileTextIcon,     section: 'VisaAI'       },
  'visa/documents':     { href: '/visa/documents',          label: 'Documents',         icon: FolderIcon,       section: 'VisaAI'       },
  'visa/alerts':        { href: '/visa/alerts',             label: 'Alerts',            icon: AlertIcon,        section: 'VisaAI'       },
  'visa/news':          { href: '/visa/news',               label: 'News',              icon: NewsIcon,         section: 'VisaAI'       },
  'visa/ask':           { href: '/visa/ask',                label: 'Ask VisaAI',        icon: ChatIcon,         badge: 'AI', section: 'VisaAI' },
};

const SECTION_ORDER = ['Overview', 'Revenue', 'Reputation', 'Intelligence', 'Pro tools', 'VisaAI', 'Modules'];

/* ─── Component ─────────────────────────────────────────────────── */
export function Sidebar({ business }: { business: Business }) {
  const pathname = usePathname();
  const industry = (business.industry ?? 'professional') as Industry;
  const config = industryConfig[industry] ?? industryConfig.professional;

  // Build sections from the industry's sidebar list
  const sections: Record<string, NavItemDef[]> = {};

  // Always include Ask Aria in Overview
  sections['Overview'] = [
    ALL_ITEMS['dashboard'],
    { href: '/dashboard/ask-aria', label: 'Ask Aria', icon: ChatIcon, badge: 'AI', section: 'Overview' },
  ];

  for (const key of config.sidebar as readonly string[]) {
    if (key === 'dashboard') continue; // already in Overview
    const item = ALL_ITEMS[key];
    if (!item) continue;
    if (!sections[item.section]) sections[item.section] = [];
    // Avoid duplicates
    if (!sections[item.section].some(i => i.href === item.href)) {
      sections[item.section].push(item);
    }
  }

  return (
    <aside className="w-[220px] flex-shrink-0 bg-[#13131a] h-screen flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="px-5 pt-[22px] pb-3 flex-shrink-0">
        <div className="text-lg font-medium tracking-tight">
          <span className="text-white">aria</span>
          <span className="text-[#1D9E75]">OS</span>
        </div>
        {/* Industry badge */}
        <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)]">
          <span className="text-[10px] text-[rgba(255,255,255,0.45)]">{config.label}</span>
        </div>
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

      {/* Business info */}
      <div className="px-4 py-4 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <div className="text-[13px] font-medium text-[rgba(255,255,255,0.8)] truncate">{business.name}</div>
        <div className="text-[11px] text-[rgba(255,255,255,0.3)] mt-0.5">
          {business.plan}{business.city ? ` · ${business.city}` : ''}
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
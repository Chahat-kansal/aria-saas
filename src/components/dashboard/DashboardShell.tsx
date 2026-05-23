'use client';
import { useState, useEffect, Suspense } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { AriaAwarenessBar } from '@/components/aria/AriaAwarenessBar';
import { AriaCommandBar } from '@/components/aria/AriaCommandBar';
import { showAriaBriefing } from '@/components/dashboard/DailyBriefingModal';
import { usePathname } from 'next/navigation';
import { SetupGuide } from '@/components/dashboard/SetupGuide';
import { TourSpotlight } from '@/components/dashboard/TourSpotlight';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusinessContext();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Lock body scroll when sidebar open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (loading) {
    return (
      <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
        <div className="w-[220px] flex-shrink-0 bg-black h-screen animate-pulse hidden md:block" />
        <div className="flex-1 flex flex-col">
          <div className="h-12 bg-[#13131a] animate-pulse md:hidden" />
          <main className="flex-1 overflow-y-auto" />
        </div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar — fixed overlay */}
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 md:hidden"
        style={{
          background: 'rgba(0,0,0,0.65)',
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
          backdropFilter: mobileOpen ? 'blur(2px)' : 'none',
        }}
        onClick={() => setMobileOpen(false)}
      />
      {/* Sidebar panel */}
      <div
        className="fixed left-0 top-0 bottom-0 z-50 md:hidden"
        style={{
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <div
          className="md:hidden flex-shrink-0 flex items-center gap-3 px-4"
          style={{
            height: 52,
            background: '#13131a',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex items-center justify-center rounded-lg transition-colors"
            style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} width={16} height={16} style={{ color: 'rgba(255,255,255,0.7)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Logo */}
          <span className="text-white font-semibold tracking-tight text-base flex-1">
            aria<span style={{ color: '#1D9E75' }}>OS</span>
          </span>

          {/* Briefing button */}
          <button
            onClick={() => showAriaBriefing()}
            aria-label="Daily briefing"
            className="flex items-center gap-1.5 rounded-lg transition-colors"
            style={{ padding: '6px 12px', background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)', color: '#1D9E75', fontSize: 12, fontWeight: 600 }}
          >
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#1D9E75', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 7, fontWeight: 700, color: '#fff' }}>A</span>
            </span>
            Briefing
          </button>
        </div>

        {/* Desktop top bar */}
        <div className="hidden md:flex items-center justify-end px-4 py-2 flex-shrink-0"
          style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => showAriaBriefing()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[rgba(255,255,255,0.6)] hover:text-white bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] rounded-lg transition-colors"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-[#1D9E75] flex items-center justify-center">
              <span className="text-[7px] font-bold text-white">A</span>
            </span>
            Briefing
          </button>
        </div>

        <AriaAwarenessBar />
        <main className="flex-1 overflow-y-auto relative overscroll-contain">
          {pathname === '/dashboard' && (
            <div className="px-6 pt-6">
              <SetupGuide />
            </div>
          )}
          {children}
          <Suspense fallback={null}><TourSpotlight /></Suspense>
        </main>
        <AriaCommandBar />
      </div>
    </div>
  );
}

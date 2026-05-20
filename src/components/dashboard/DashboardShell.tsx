'use client';
import { useState } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { AriaAwarenessBar } from '@/components/aria/AriaAwarenessBar';
import { AriaCommandBar } from '@/components/aria/AriaCommandBar';
import { showAriaBriefing } from '@/components/dashboard/DailyBriefingModal';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusinessContext();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
        <div className="w-[220px] flex-shrink-0 bg-[#13131a] h-screen animate-pulse hidden md:block" />
        <main className="flex-1 overflow-y-auto" />
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 z-50 md:hidden" style={{ transform: 'translateX(0)', transition: 'transform 0.25s ease' }}>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-white font-medium tracking-tight text-sm">
            aria<span style={{ color: '#1D9E75' }}>OS</span>
          </span>
          <button
            onClick={() => showAriaBriefing()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[rgba(255,255,255,0.6)] hover:text-white bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] rounded-lg transition-colors"
            aria-label="Show Aria daily briefing"
            title="Show today's Aria briefing"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-[#1D9E75] flex items-center justify-center">
              <span className="text-[7px] font-bold text-white">A</span>
            </span>
            Briefing
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            className="text-white p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.08)] transition-colors"
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>

        {/* Desktop briefing button */}
        <div className="hidden md:flex items-center justify-end px-4 py-2 flex-shrink-0"
          style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => showAriaBriefing()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[rgba(255,255,255,0.6)] hover:text-white bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.08)] rounded-lg transition-colors"
            aria-label="Show Aria daily briefing"
            title="Show today's Aria briefing"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-[#1D9E75] flex items-center justify-center">
              <span className="text-[7px] font-bold text-white">A</span>
            </span>
            Briefing
          </button>
        </div>
        <AriaAwarenessBar />
        <main className="flex-1 overflow-y-auto relative">{children}</main>
        <AriaCommandBar />
      </div>
    </div>
  );
}

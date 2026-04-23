'use client';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { Sidebar } from '@/components/dashboard/Sidebar';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { business, loading } = useBusinessContext();

  if (loading) {
    return (
      <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
        <div className="w-[220px] flex-shrink-0 bg-[#13131a] h-screen animate-pulse" />
        <main className="flex-1 overflow-y-auto" />
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
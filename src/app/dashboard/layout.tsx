import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BusinessProvider } from '@/components/providers/BusinessProvider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <BusinessProvider>
      <DashboardShell>{children}</DashboardShell>
      <DailyBriefingModal />
    </BusinessProvider>
  );
}
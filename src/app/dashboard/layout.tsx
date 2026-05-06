import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BusinessProvider } from '@/components/providers/BusinessProvider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DailyBriefingModal } from '@/components/dashboard/DailyBriefingModal';
import AnnouncementBanner from '@/components/dashboard/AnnouncementBanner';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch active announcement (plan check is done client-side via BusinessProvider)
  let announcement: any = null;
  try {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    announcement = data;
  } catch { /* table may not exist yet */ }

  return (
    <BusinessProvider>
      {announcement && <AnnouncementBanner announcement={announcement as any} />}
      <DashboardShell>{children}</DashboardShell>
      <DailyBriefingModal />
    </BusinessProvider>
  );
}
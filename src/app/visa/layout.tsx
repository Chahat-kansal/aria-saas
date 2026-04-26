import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { VisaSidebar } from '@/components/visa/VisaSidebar';

export const metadata = { title: 'VisaAI — Migration Agent' };

export default async function VisaLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { count: alertCount },
    { count: pendingApps },
  ] = await Promise.all([
    supabase.from('immigration_alerts').select('*', { count: 'exact', head: true })
      .eq('agent_id', user!.id).eq('is_read', false),
    supabase.from('visa_applications').select('*', { count: 'exact', head: true })
      .eq('agent_id', user!.id).eq('status', 'lodged'),
  ]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      <VisaSidebar alertCount={alertCount || 0} pendingApps={pendingApps || 0} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

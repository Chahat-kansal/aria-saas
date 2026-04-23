import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BusinessProvider } from '@/components/providers/BusinessProvider';
import { Sidebar } from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: allBusinesses } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (!allBusinesses?.length) redirect('/onboarding/industry');

  // Prefer the server-side active business record, fall back to first
  const { data: activeRecord } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const activeBusiness =
    (activeRecord?.business_id && allBusinesses.find(b => b.id === activeRecord.business_id)) ||
    allBusinesses[0];

  return (
    <BusinessProvider business={activeBusiness} allBusinesses={allBusinesses}>
      <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
        <Sidebar business={activeBusiness} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </BusinessProvider>
  );
}
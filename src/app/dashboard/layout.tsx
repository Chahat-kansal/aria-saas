import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { BusinessProvider } from '@/components/providers/BusinessProvider';
import { Sidebar } from '@/components/dashboard/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle();

  if (!business) redirect('/onboarding/industry');

  return (
    <BusinessProvider business={business}>
      <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
        <Sidebar business={business} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </BusinessProvider>
  );
}

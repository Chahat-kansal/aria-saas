import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PosSidebar } from '@/components/pos/PosSidebar';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (!business) redirect('/onboarding/industry');

  const [{ data: openSession }, { count: pendingSales }] = await Promise.all([
    supabase.from('pos_cash_sessions')
      .select('id')
      .eq('business_id', business.id)
      .is('closed_at', null)
      .single(),
    supabase.from('pos_sales')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .eq('status', 'pending'),
  ]);

  return (
    <div className="flex h-screen bg-[#0a0a0f] overflow-hidden">
      <PosSidebar openSession={!!openSession} pendingSales={pendingSales || 0} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
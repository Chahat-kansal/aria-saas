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
    .maybeSingle();

  if (!business) redirect('/onboarding/industry');

  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('id')
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle();

  return (
    <div className="flex h-screen bg-[#f5f4ef] overflow-hidden">
      <PosSidebar openSession={!!openSession} />
      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
    </div>
  );
}
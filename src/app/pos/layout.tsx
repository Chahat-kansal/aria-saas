import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { POSLayout } from '@/components/pos/POSLayout';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, owner_name')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!business) redirect('/onboarding/industry');

  const userName = business.owner_name || session.user.email || 'User';

  return (
    <POSLayout userName={userName}>
      {children}
    </POSLayout>
  );
}
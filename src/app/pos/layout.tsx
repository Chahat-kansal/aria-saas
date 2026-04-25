import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { POSLayout } from '@/components/pos/POSLayout';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: allBusinesses } = await supabase
    .from('businesses')
    .select('id, name, owner_name, industry, plan, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (!allBusinesses || allBusinesses.length === 0) redirect('/onboarding/industry');

  const { data: activeRecord } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const activeBusiness =
    (activeRecord?.business_id && allBusinesses.find(b => b.id === activeRecord.business_id)) ||
    allBusinesses[0];

  return (
    <POSLayout userName={activeBusiness.owner_name || activeBusiness.name}>
      {children}
    </POSLayout>
  );
}
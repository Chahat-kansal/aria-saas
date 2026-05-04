import '@/styles/pos-design-system.css';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { POSTopNav } from '@/components/pos/POSTopNav';

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

  return <POSTopNav>{children}</POSTopNav>;
}

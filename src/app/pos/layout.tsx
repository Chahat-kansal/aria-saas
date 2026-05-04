import '@/styles/pos-design-system.css';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import POSShell from '@/components/pos/POSShell';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) redirect('/onboarding/industry');

  return (
    <POSShell businessId={biz.id} businessName={biz.name ?? 'AriaPOS'}>
      {children}
    </POSShell>
  );
}

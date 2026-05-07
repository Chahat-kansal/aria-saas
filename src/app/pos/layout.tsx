import '@/styles/pos-design-system.css';
import '@/styles/aria-tokens.css';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import POSShell from '@/components/pos/POSShell';
import { POSThemeProvider } from '@/components/pos/ThemeProvider';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  // /pos/login is a public-facing page — no auth check, no POSShell wrapper.
  // The middleware sets x-next-pathname so we can detect it here.
  const headersList = headers();
  const pathname = headersList.get('x-next-pathname') ?? '';
  if (pathname === '/pos/login') {
    return <POSThemeProvider>{children}</POSThemeProvider>;
  }

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
    <POSThemeProvider>
      <POSShell businessId={biz.id} businessName={biz.name ?? 'AriaPOS'}>
        {children}
      </POSShell>
    </POSThemeProvider>
  );
}

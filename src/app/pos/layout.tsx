import '@/styles/pos-design-system.css';
import '@/styles/aria-tokens.css';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import POSShell from '@/components/pos/POSShell';
import { POSThemeProvider } from '@/components/pos/ThemeProvider';
import AriaBrainPanel from '@/components/aria/AriaBrainPanel';
import { BusinessProvider } from '@/components/providers/BusinessProvider';

export const metadata = { title: 'AriaPOS — Point of Sale' };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  // /pos/login is a public-facing page — no auth check, no POSShell wrapper.
  // The middleware sets x-next-pathname so we can detect it here.
  const headersList = headers();
  const pathname = headersList.get('x-next-pathname') ?? '';
  if (pathname === '/pos/login') {
    return <POSThemeProvider>{children}</POSThemeProvider>;
  }
  // NOTE: /pos/terminal bypass cannot be done here — the middleware matcher
  // deliberately excludes /pos/* routes (see middleware.ts line 117), so the
  // x-next-pathname header is never set and pathname is always ''.
  // POSShell handles the terminal bypass client-side via BYPASS_PATHS.

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, pos_enabled')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!biz) redirect('/onboarding/industry');
  if ((biz as { pos_enabled?: boolean | null }).pos_enabled === false) redirect('/dashboard');

  return (
    <POSThemeProvider>
      <BusinessProvider>
        <POSShell businessId={biz.id} businessName={biz.name ?? 'AriaPOS'}>
          {children}
        </POSShell>
        <AriaBrainPanel businessId={biz.id} />
      </BusinessProvider>
    </POSThemeProvider>
  );
}

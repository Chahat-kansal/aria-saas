import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chat/Sidebar';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  const user = {
    name: session.user.user_metadata?.full_name ?? session.user.email ?? '',
    email: session.user.email ?? '',
    image: session.user.user_metadata?.avatar_url ?? null,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#0e0e12', overflow: 'hidden' }}>
      <Sidebar user={user as any} />
      <main style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
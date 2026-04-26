import { createServerSupabaseClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chat/Sidebar';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const userObj = {
    name: user.user_metadata?.full_name ?? user.email ?? '',
    email: user.email ?? '',
    image: user.user_metadata?.avatar_url ?? null,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#0e0e12', overflow: 'hidden' }}>
      <Sidebar user={userObj as any} />
      <main style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
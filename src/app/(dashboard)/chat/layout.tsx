import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chat/Sidebar';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      height: '100dvh',
      overflow: 'hidden',
      background: '#0e0e12',
    }}>
      <Sidebar user={session.user as any} />
      <main style={{ minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}

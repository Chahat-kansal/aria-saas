import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chat/Sidebar';

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="flex bg-[#0e0e12]" style={{ height: '100dvh', overflow: 'hidden' }}>
      <Sidebar user={session.user as any} />
      <main style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}

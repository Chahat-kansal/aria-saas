import type { Metadata } from 'next';
import { Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Aria — Your AI Assistant',
  description: 'Aria is a powerful AI assistant for real work. Chat, search the web, analyse files, and more.',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'Aria — Your AI Assistant',
    description: 'A powerful AI assistant for real work.',
    type: 'website',
  },
};

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        height: '100dvh',
        overflow: 'hidden',
        background: '#0e0e12',
      }}
    >
      <Sidebar user={session.user as any} />

      <main
        style={{
          minWidth: 0,
          minHeight: 0,      // ✅ IMPORTANT FIX
          height: '100dvh',  // ✅ CRITICAL FIX
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </main>
    </div>
  );
}

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${sora.variable} ${mono.variable} font-sans bg-[#0e0e12] text-[#f0f0f5] antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

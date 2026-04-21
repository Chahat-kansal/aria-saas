import type { Metadata } from 'next';
import { Sora, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Aria OS — AI Operating System for Local Business',
  description: 'Aria OS helps cafes, tradies, salons, and retailers run smarter with AI-powered insights, automation, and customer intelligence.',
  icons: { icon: '/favicon.ico' },
  openGraph: {
    title: 'Aria OS — AI Operating System for Local Business',
    description: 'AI-powered operations for local businesses.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
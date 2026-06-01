import type { Metadata } from 'next';
import { Cormorant, Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import '@/styles/aria-tokens.css';
import '@/styles/aria-landing.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/ThemeProvider';
import PostHogProvider from '@/components/PostHogProvider';

const cormorant = Cormorant({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ariaos.site'),
  title: {
    template: '%s | Aria POS — AI for Australian Retail',
    default: 'Aria POS — AI for Australian Retail',
  },
  description: 'The Australian POS with autonomous AI. Aria reorders stock, adjusts prices, and answers your questions in plain English. From $59/outlet/month.',
  keywords: 'AI POS, Australian POS, bottle shop POS, liquor POS, Shopfront alternative, Square alternative, Lightspeed alternative',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Aria POS — Square sells. Shopfront manages. Aria runs your shop.',
    description: 'The Australian POS with autonomous AI. Aria reorders stock, adjusts prices, and answers your questions in plain English. From $59/outlet/month.',
    url: 'https://ariaos.site',
    siteName: 'Aria POS',
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
    locale: 'en_AU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@ariaos_au',
    title: 'Aria POS — AI for Australian Retail',
    description: 'The first POS with autonomous AI agents. Built for Australian retail.',
  },
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Importmap — must come before any ES module scripts.
            Tells the browser where to find 'three' when TalkingHead imports it. */}
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          imports: {
            "three": "https://cdn.jsdelivr.net/npm/three@0.167.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/",
          }
        }) }} />
      </head>
      <body className={`${cormorant.variable} ${outfit.variable} ${mono.variable} font-sans antialiased`}>
        {/* Anti-flash: restore theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('pos_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()` }} />
        <PostHogProvider>
          <ThemeProvider>
            <Providers>{children}</Providers>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}


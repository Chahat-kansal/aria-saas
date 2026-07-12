import type { Metadata, Viewport } from 'next';
import { Cormorant, Outfit, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import '@/styles/aria-tokens.css';
import '@/styles/aria-landing.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/ThemeProvider';
import PostHogProvider from '@/components/PostHogProvider';
import PWARegister from '@/components/PWARegister';
import dynamic from 'next/dynamic';

// Floating Aria button — client-only, never SSR, never on /pos
const AriaFloatingButton = dynamic(
  () => import('@/components/AriaFloatingButton'),
  { ssr: false },
);

// SPOTLIGHT-TOUR-1 fix (CX-LEAK-1) — SpotlightTour used to mount here at
// root, which also wraps the customer-facing /[slug] CX app. That leaked the
// OWNER'S onboarding tour (and whichever business their own Supabase session
// belongs to) onto a customer's wallet page. It's now mounted only in
// src/app/dashboard/layout.tsx and src/app/pos/layout.tsx — the two owner-only
// layouts, both of which already gate on supabase.auth.getUser() — so it's
// never even in the component tree for /[slug] pages, regardless of session.

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
  icons: { icon: '/favicon.ico', apple: '/icons/icon-192.png' },
  applicationName: 'Aria OS',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Aria OS' },
  formatDetection: { telephone: false },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#7FB897',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
      {/* MONITOR-1 — server-rendered, no JS required to read it. The silent-
          blank synthetic check does a plain headless fetch of '/' and parses
          this out to know the CURRENT buildId, then checks whether any
          hydration beacons for that exact buildId have actually arrived. */}
      <meta name="aria-build" content={process.env.NEXT_PUBLIC_BUILD_ID ?? 'unknown'} />
      {/* BLANK-SCREEN-FIX-2 — every FIX-1 rescue path (PWARegister's unregister
          call, chunk-recovery.ts's error listener) lives inside HASHED JS
          CHUNKS, loaded via <script src> tags the framework injects. A device
          whose stale SW serves an old app shell — or whose cached asset
          manifest points at a chunk a later deploy deleted — requests OLD
          chunk URLs that no longer exist, so NOTHING new ever executes and
          the rescue code itself never runs. This MUST be a plain, literal
          <script> tag — NOT next/script (even strategy="beforeInteractive"):
          that API only queues onto self.__next_s, and the code that actually
          turns the queue into a real, executing script is inside
          main-app-*.js — one of the very async framework chunks that can
          fail to load. A plain <script> is parsed and run synchronously by
          the HTML parser itself, with zero dependency on any /_next/* chunk
          loading — the actual property this sprint requires. Its raw byte
          position after Next's own async framework <script src> tags is
          irrelevant: those are async (don't block parsing, execute only
          once their own network fetch resolves) and are exactly what may
          never load in the failure case this script exists to survive. Same
          sessionStorage guard key as chunk-recovery.ts ('aria_chunk_recover')
          so the two paths can't double-reload. */}
      <script dangerouslySetInnerHTML={{__html: `
(function(){
  try {
    var GUARD_KEY = 'aria_chunk_recover';
    function purgeSW(){
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function(regs){
            for (var i = 0; i < regs.length; i++) {
              var scope = regs[i].scope || '';
              if (scope.indexOf('/community/') === -1 && scope.indexOf('/inventory/') === -1) {
                regs[i].unregister();
              }
            }
          });
        }
      } catch (e) {}
    }
    function purgeCaches(){
      try {
        if (window.caches && caches.keys) {
          caches.keys().then(function(keys){
            for (var i = 0; i < keys.length; i++) {
              if (keys[i].indexOf('aria-os-') === 0) caches['delete'](keys[i]);
            }
          });
        }
      } catch (e) {}
    }
    // Runs on EVERY load, unconditionally — cheap, idempotent, and doesn't
    // wait on or depend on any external chunk loading first.
    purgeSW();
    purgeCaches();

    function isChunkErrorMsg(msg){
      if (!msg) return false;
      return /Loading chunk [\\w.-]+ failed/i.test(msg) ||
             /Loading CSS chunk [\\w.-]+ failed/i.test(msg) ||
             msg.indexOf('ChunkLoadError') !== -1;
    }
    function tryReload(){
      try {
        if (sessionStorage.getItem(GUARD_KEY)) return;
        sessionStorage.setItem(GUARD_KEY, '1');
      } catch (e) {}
      purgeSW();
      purgeCaches();
      location.reload();
    }
    window.addEventListener('error', function(ev){
      var msg = (ev && ev.message) || (ev && ev.error && ev.error.message) || '';
      var isScriptFail = false;
      try {
        if (ev && ev.target && ev.target.tagName === 'SCRIPT' && ev.target.src && ev.target.src.indexOf('/_next/static/') !== -1) {
          isScriptFail = true;
        }
      } catch (e) {}
      if (isChunkErrorMsg(msg) || isScriptFail) tryReload();
    }, true);
    window.addEventListener('unhandledrejection', function(ev){
      var reason = ev && ev.reason;
      var msg = (reason && reason.message) || String(reason || '');
      if (isChunkErrorMsg(msg)) tryReload();
    });

    // Build-stamp check — purge ONLY on mismatch, never force a reload just
    // from this (a mismatch alone isn't evidence of a broken page, just a
    // new deploy since last visit — the SW/cache purge above already keeps
    // this device current going forward).
    try {
      var metaTag = document.querySelector('meta[name="aria-build"]');
      var buildId = metaTag ? metaTag.getAttribute('content') : '';
      if (buildId && buildId !== 'unknown') {
        var storedBuild = localStorage.getItem('aria-build');
        if (storedBuild && storedBuild !== buildId) purgeCaches();
        localStorage.setItem('aria-build', buildId);
      }
    } catch (e) {}
  } catch (e) {}
})();
`}} />
      <script dangerouslySetInnerHTML={{__html: `
(function(){
  try {
    // Only hide body on the landing page (/) — never on /pos, /dashboard, etc.
    // NOTE: intentionally still a plain <script>, not next/script — this one
    // only needs to run before first paint on the landing page, not before
    // the framework bundle, and existing behavior/positioning is unchanged.
    var isLanding = location.pathname === '/' || location.pathname === '';
    if(isLanding && !sessionStorage.getItem('aria_intro_seen')){
      document.documentElement.classList.add('intro-pending');
    }
  } catch(e){}
})();
`}} />
      </head>
      <body className={`${cormorant.variable} ${outfit.variable} ${mono.variable} font-sans antialiased`}>
        {/* Anti-flash: restore theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('pos_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()` }} />
        <PostHogProvider>
          <ThemeProvider>
            <Providers>{children}</Providers>
          </ThemeProvider>
        </PostHogProvider>
        <PWARegister />
        <AriaFloatingButton />
      </body>
    </html>
  );
}


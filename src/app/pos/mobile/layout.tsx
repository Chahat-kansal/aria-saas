import type { Viewport, Metadata } from 'next'

// SEO-HEAD-1 — this layout rendered a raw <head> element. That is invalid in the App Router: Next
// owns <head>, so the tags below were NEVER APPLIED — the POS mobile view has been running without
// its viewport lock and status-bar styling. Moving them to the framework exports is additive in the
// real sense: the tags start working for the first time.
//
// Every tag from the old <head> is carried across, none dropped:
//   viewport + theme-color (#0d0d14)            -> viewport export
//   apple-mobile-web-app-capable + status-bar   -> metadata.appleWebApp
//   mobile-web-app-capable                      -> metadata.other (no first-class Next field)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d0d14',
}

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

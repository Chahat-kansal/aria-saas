import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

const LandingShell = dynamic(
  () => import('@/components/marketing/landing/LandingShell'),
  { ssr: false }
)

export const metadata: Metadata = {
  title: 'Aria — The POS that actually thinks',
  description: 'AI agents that run your shop while you serve customers. Built for Australian retail. 14-day free trial.',
  openGraph: {
    title: 'Aria — The POS that actually thinks',
    description: 'AI agents that run your Australian retail shop while you serve customers.',
    url: 'https://www.ariaos.site',
    siteName: 'Aria POS',
    locale: 'en_AU',
    type: 'website',
    images: [{ url: 'https://www.ariaos.site/og-aria.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aria — The POS that actually thinks',
    description: 'AI POS for Australian retail.',
    images: ['https://www.ariaos.site/og-aria.png'],
  },
  alternates: { canonical: 'https://www.ariaos.site' },
}

export default function MarketingPage() {
  return (
    <>
      <noscript>
        <div style={{ padding: 40, color: '#E8EDE7', background: '#0E1411' }}>
          <h1>Aria — The POS that actually thinks</h1>
          <p>AI-powered POS for Australian retail. 14-day free trial. No credit card. Cancel anytime.</p>
          <a href="/signup" style={{ color: '#7FB897' }}>Start free trial →</a>
        </div>
      </noscript>
      <LandingShell />
    </>
  )
}

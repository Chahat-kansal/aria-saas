import type { Metadata } from 'next'
import dynamic from 'next/dynamic'

const LandingShell = dynamic(
  () => import('@/components/marketing/landing/LandingShell'),
  { ssr: false }
)

export const metadata: Metadata = {
  title: 'Aria OS — The AI co-owner for Australian small business',
  description: 'Aria runs your back office while you run your business. Daily briefings, customer win-back, profit-leak analysis, compliance, bookings, POS and more. Built for Australian SMBs. 14-day free trial.',
  openGraph: {
    title: 'Aria OS — The AI co-owner for Australian small business',
    description: 'Aria runs the back office of your Australian business — daily briefings, customer win-back, profit-leak analysis, compliance, bookings, POS and more.',
    url: 'https://www.ariaos.site',
    siteName: 'Aria OS',
    locale: 'en_AU',
    type: 'website',
    images: [{ url: 'https://www.ariaos.site/og-aria.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aria OS — The AI co-owner for Australian small business',
    description: 'AI business operating system for Australian SMBs. 14-day free trial.',
    images: ['https://www.ariaos.site/og-aria.png'],
  },
  alternates: { canonical: 'https://www.ariaos.site' },
}

export default function MarketingPage() {
  return (
    <>
      <noscript>
        <div style={{ padding: 40, color: '#E8EDE7', background: '#0E1411' }}>
          <h1>Aria OS — The AI co-owner for Australian small business</h1>
          <p>Aria runs the back office of your Australian business. Daily briefings, customer win-back, profit-leak analysis, compliance, bookings, POS and more. 14-day free trial. No credit card. Cancel anytime.</p>
          <a href="/signup" style={{ color: '#7FB897' }}>Start free trial →</a>
        </div>
      </noscript>
      <LandingShell />
    </>
  )
}

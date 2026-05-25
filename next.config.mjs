/** @type {import('next').NextConfig} */
// cache-bust: 2026-05-21T03:09:13.930953
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = {
  generateBuildId: async () => {
    // Force unique build ID every deployment so Vercel never restores stale CSS cache
    return `build-${Date.now()}`
  },
  productionBrowserSourceMaps: false,
  experimental: {
    serverComponentsExternalPackages: ['mongoose'],
    serverSourceMaps: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: [
      'lh3.googleusercontent.com',
      'avatars.githubusercontent.com',
      'oaidalleapiprodscus.blob.core.windows.net',
    ],
  },
  async redirects() {
    return [
      { source: '/pos/closures',                    destination: '/pos/reports/closures',            permanent: false },
      { source: '/pos/void-refund',                 destination: '/pos/void',                        permanent: false },
      { source: '/pos/sales-history',               destination: '/pos/history',                     permanent: false },
      { source: '/pos/dead-stock',                  destination: '/pos/inventory/dead-stock',        permanent: false },
      { source: '/pos/stocktake/new',               destination: '/pos/inventory/stocktake/new',     permanent: false },
      { source: '/pos/mobile-scanner',              destination: '/pos/import/scan',                 permanent: false },
      { source: '/pos/customer-segments',           destination: '/pos/customers/segments',          permanent: false },
      { source: '/pos/reorder',                     destination: '/pos/agents/reorder',              permanent: false },
      { source: '/pos/schedule',                    destination: '/pos/agents/schedule',             permanent: false },
      { source: '/pos/customer-display',            destination: '/pos/display',                     permanent: false },
      { source: '/pos/import-products',             destination: '/pos/import',                      permanent: false },
      { source: '/pos/competitor-prices',           destination: '/pos/competitors',                 permanent: false },
      { source: '/pos/settings/sale-keys',          destination: '/pos/sale-keys',                   permanent: false },
      { source: '/pos/settings/barcodes',           destination: '/pos/utilities/barcodes',          permanent: false },
      { source: '/pos/settings/migrate-data',       destination: '/pos/setup/migrate',               permanent: false },
      { source: '/pos/settings/supplier-integrations', destination: '/pos/settings/vendors',         permanent: false },
    ]
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: allow CDNs needed for live preview (React, Babel, Tailwind, etc.)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.skypack.dev https://esm.sh https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://js.stripe.com https://m.stripe.com https://m.stripe.network",
              // Styles: allow inline + Google Fonts + CDNs
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Fonts
              "font-src 'self' data: https://fonts.gstatic.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Images: allow everything (previews can load any image)
              "img-src 'self' data: blob: https: http:",
              // Media: allow blob for voice
              "media-src 'self' blob: https://*.supabase.co https://nxfzippunqvqsvkmwtjv.supabase.co https://*.public.blob.vercel-storage.com",
              // API connections — includes Sentry ingest (region-specific subdomains)
              "connect-src 'self' blob: https://api.anthropic.com https://api.openai.com https://emkc.org https://api.openweathermap.org https://www.alphavantage.co https://www.googleapis.com https://gmail.googleapis.com https://calendar.googleapis.com https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://js.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://eu.i.posthog.com https://us.i.posthog.com https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://raw.githubusercontent.com https://*.public.blob.vercel-storage.com",
              // Frames: allow blob + data + any origin for srcdoc previews
              "frame-src 'self' blob: data: https: http:",
              // Workers
              "worker-src 'self' blob:",
              "child-src 'self' blob: data:",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: false,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
}

// Only wrap with Sentry when the auth token is present (i.e. on Vercel).
// Local builds skip withSentryConfig to avoid source-map upload failures.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig
// build-cache-bust-css-fix

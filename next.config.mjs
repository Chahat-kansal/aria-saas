/** @type {import('next').NextConfig} */
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    serverComponentsExternalPackages: ['mongoose'],
    serverSourceMaps: true,
  },
  images: {
    domains: [
      'lh3.googleusercontent.com',
      'avatars.githubusercontent.com',
      'oaidalleapiprodscus.blob.core.windows.net',
    ],
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.skypack.dev https://esm.sh",
              // Styles: allow inline + Google Fonts + CDNs
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Fonts
              "font-src 'self' data: https://fonts.gstatic.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Images: allow everything (previews can load any image)
              "img-src 'self' data: blob: https: http:",
              // Media: allow blob for voice
              "media-src 'self' blob:",
              // API connections — includes Sentry ingest (region-specific subdomains)
              "connect-src 'self' https://api.anthropic.com https://api.openai.com https://emkc.org https://api.openweathermap.org https://www.alphavantage.co https://www.googleapis.com https://gmail.googleapis.com https://calendar.googleapis.com https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://js.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
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
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
}

// Only wrap with Sentry when the auth token is present (i.e. on Vercel).
// Local builds skip withSentryConfig to avoid source-map upload failures.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig

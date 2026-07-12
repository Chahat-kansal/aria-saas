/** @type {import('next').NextConfig} */
// cache-bust: 2026-05-21T03:09:13.930953
import { withSentryConfig } from '@sentry/nextjs'

// MONITOR-1 — same value generateBuildId() below already computes per build,
// captured once here so it can ALSO be inlined into the client bundle as
// NEXT_PUBLIC_BUILD_ID (read by the hydration beacon) and read server-side
// by the root layout's <meta name="aria-build"> tag (read by the silent-
// blank synthetic check, no JS execution required). Same source of truth,
// two consumers — not a second build-id mechanism.
const BUILD_ID = `build-${Date.now()}`
process.env.NEXT_PUBLIC_BUILD_ID = BUILD_ID

const nextConfig = {
  // Prevent Node.js-only @huggingface/transformers modules from being bundled
  // in browser chunks (including the kokoro-js Web Worker bundle).
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent Node.js-only modules from being bundled in browser chunks
      config.resolve.alias = {
        ...config.resolve.alias,
        'sharp$': false,
        'onnxruntime-node$': false,
      }
    } else {
      // onnxruntime-node is also not needed server-side (we use WASM transforms client-side)
      config.resolve.alias = {
        ...config.resolve.alias,
        'onnxruntime-node$': false,
      }
    }
    // Preserve ESM import.meta semantics for packages like @imgly/background-removal
    // that ship .mjs bundles using import.meta (which Terser rejects in non-module mode)
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/esm',
    })
    return config
  },
  generateBuildId: async () => {
    // Force unique build ID every deployment so Vercel never restores stale CSS cache.
    // Same value as NEXT_PUBLIC_BUILD_ID above (MONITOR-1) — captured once at module
    // load, not recomputed here, so both stay identical.
    return BUILD_ID
  },
  productionBrowserSourceMaps: false,
  experimental: {
    workerThreads: false,
    cpus: 2,
    serverComponentsExternalPackages: [
      'mongoose',
      'remotion',
      '@remotion/bundler',
      '@remotion/renderer',
      '@remotion/vercel',
      '@vercel/sandbox',
      '@sparticuz/chromium',
      'puppeteer-core',
      'sharp',
    ],
    serverSourceMaps: false,
    outputFileTracingExcludes: {
      '*': [
        './node_modules/puppeteer/**',
        './node_modules/chromium/**',
        './node_modules/@aws-sdk/**',
        './node_modules/canvas/**',
        './node_modules/three/**/*',
        './node_modules/fluent-ffmpeg/**/*',
        './node_modules/@xenova/**/*',
        './node_modules/onnxruntime-node/**/*',
      ],
    },
    outputFileTracingIncludes: {
      '/api/reels/render': ['./src/remotion/**/*'],
      '/api/aria/deliverable-pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
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
        source: '/workers/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Scripts: allow CDNs needed for live preview (React, Babel, Tailwind, etc.)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.skypack.dev https://esm.sh https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://js.stripe.com https://m.stripe.com https://m.stripe.network https://www.gstatic.com",
              // Styles: allow inline + Google Fonts + CDNs
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Fonts
              "font-src 'self' data: https://fonts.gstatic.com https://unpkg.com https://cdnjs.cloudflare.com",
              // Images: allow everything (previews can load any image)
              "img-src 'self' data: blob: https: http:",
              // Media: blob for voice/audio, Bunny Stream + Cloudflare Stream for Go Live/reels
              "media-src 'self' blob: https://*.supabase.co https://nxfzippunqvqsvkmwtjv.supabase.co https://*.public.blob.vercel-storage.com https://*.b-cdn.net https://*.cloudflarestream.com https://videodelivery.net https://d8j0ntlcm91z4.cloudfront.net https://*.cloudfront.net https://v3.fal.media https://v3b.fal.media",
              // API connections — Bunny/CF Stream for Go Live; Upstash for Redis; external AI/payment APIs are server-side
              // *.cloudfront.net added for Three.js GLB fetch (already trusted in media-src)
              "connect-src 'self' blob: https://www.googleapis.com https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://js.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://eu.i.posthog.com https://us.i.posthog.com https://eu-assets.i.posthog.com https://us-assets.i.posthog.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https://raw.githubusercontent.com https://www.gstatic.com https://*.public.blob.vercel-storage.com https://*.b-cdn.net https://*.cloudflarestream.com https://videodelivery.net https://video.bunnycdn.com https://*.upstash.io https://api.higgsfield.ai https://queue.fal.run https://v3.fal.media https://v3b.fal.media https://huggingface.co https://*.huggingface.co https://*.hf.co https://cdn.img.ly https://*.cloudfront.net",
              // Frames: allow blob + data + any origin for srcdoc previews
              "frame-src 'self' blob: data: https: http:",
              // Workers
              "worker-src 'self' blob:",
              "child-src 'self' blob: data:",
            ].join('; '),
          },
          // SEC-H2: the remaining security headers, applied GLOBALLY here (the CSP above already is).
          // They previously lived only in middleware, whose matcher covers ~15 paths, so most routes
          // (most /pos/*, /community/*, public business pages, staff portal, nearly all /api/*) were
          // missing them. next.config headers() on /(.*) covers every route. Values match middleware.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' }, // clickjacking; Aria never frames its own pages
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera=(self) keeps POS barcode scanning (getUserMedia) working on same-origin pages.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
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

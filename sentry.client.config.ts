import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    'Network request failed',
  ],
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies
    return event
  },
})

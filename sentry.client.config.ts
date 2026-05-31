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
    // Scrub PII from request bodies and extra data
    if (event.request?.data && typeof event.request.data === 'object') {
      const d = event.request.data as Record<string, unknown>
      for (const k of ['email', 'phone', 'password', 'card_number', 'cvv']) {
        if (k in d) d[k] = '[Scrubbed]'
      }
    }
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }
    return event
  },
})

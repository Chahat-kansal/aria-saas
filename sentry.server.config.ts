import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === 'production',
  beforeSend(event) {
    // Scrub PII from request bodies and user objects
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
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/observability/logger'

type RouteHandler = (req: any, context?: any) => Promise<Response> | Response

/** Call inside a route handler to attach businessId + operation to the active Sentry scope. */
export function setSentryContext(opts: { businessId?: string; userId?: string; operation?: string; route?: string }) {
  if (opts.businessId) Sentry.setTag('business_id', opts.businessId)
  if (opts.userId)     Sentry.setTag('user_id', opts.userId)
  if (opts.operation)  Sentry.setTag('operation', opts.operation)
  if (opts.route)      Sentry.setTag('route', opts.route)
}

export function withErrorCapture(
  routeName: string,
  handler: RouteHandler
): RouteHandler {
  return async (req, context) => {
    const start = Date.now()
    try {
      const result = await handler(req, context)
      logger.info(routeName + ' ok', { route: routeName, ms: Date.now() - start })
      return result
    } catch (err: any) {
      if (err instanceof Response) return err

      const requestId = req.headers.get('x-vercel-id') ?? undefined
      logger.error(routeName + ' error', { route: routeName, error: err?.message, ms: Date.now() - start })
      Sentry.captureException(err, {
        tags: { route: routeName, method: req.method },
        extra: { url: req.url, requestId },
      })
      console.error(`[${routeName}] unhandled error:`, err?.message ?? err, '\nSTACK:', err?.stack ?? 'no stack', '\nFULL:', JSON.stringify(err, Object.getOwnPropertyNames(err)))

      const pgCode = err?.code
      if (pgCode === '42P01' || pgCode === '42703') {
        return NextResponse.json(
          { data: null, status: 'unavailable',
            message: 'This feature requires a database update. Our team has been notified.' },
          { status: 200 }
        )
      }

      return NextResponse.json(
        { data: null, status: 'error',
          message: 'Something went wrong. Please try again.', requestId },
        { status: 500 }
      )
    }
  }
}

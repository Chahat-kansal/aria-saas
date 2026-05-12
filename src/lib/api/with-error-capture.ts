import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'

type RouteHandler = (req: any, context?: any) => Promise<Response> | Response

export function withErrorCapture(
  routeName: string,
  handler: RouteHandler
): RouteHandler {
  return async (req, context) => {
    try {
      return await handler(req, context)
    } catch (err: any) {
      if (err instanceof Response) return err

      const requestId = req.headers.get('x-vercel-id') ?? undefined
      Sentry.captureException(err, {
        tags: { route: routeName, method: req.method },
        extra: { url: req.url, requestId },
      })
      console.error(`[${routeName}] unhandled error:`, err?.message ?? err)

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

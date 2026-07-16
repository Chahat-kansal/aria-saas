import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/observability/logger'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveOwnerBusinessId } from '@/lib/community/resolveOwnerBusinessId'

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

// CANON-RAIL-1 — the enforcement rail for business-context resolution (ARIA-ARCHAEOLOGY-1's
// top-ranked fix). The report found 6 independently-invented business-id resolvers and 329 files
// still inlining their own copy of the ~5-line "check user_active_business, fall back to the
// oldest owned business" pattern, because every prior fix was an importable helper (9-15% real
// adoption) rather than something riding a wrapper routes already have to use. withErrorCapture
// itself sits at 78.5% adoption — not because it's better documented, but because it's required.
// This function composes withErrorCapture (100% of its error-capture/logging/Sentry behavior is
// reused unmodified, not duplicated) and additionally resolves + owns the standard
// unauthorized/no-business responses, so a migrated route gets the canonical businessId by using
// the wrapper it already imports — not by remembering a second import.
//
// Canonical resolver choice: resolveOwnerBusinessId() (src/lib/community/resolveOwnerBusinessId.ts,
// ARCH-F1-RESOLVE-BID), NOT get-bid.ts. Both check user_active_business first and fall back to the
// oldest active business — but only resolveOwnerBusinessId() re-validates that the active-business
// row still EXISTS, is OWNED by this user, and is ACTIVE before trusting it (get-bid.ts trusts
// user_active_business.business_id directly). That re-validation closes a stale/foreign-row class
// of bug get-bid.ts still has, so it is the more-correct of the two to make canonical — adoption
// count (33 files for get-bid.ts vs 18 for resolveOwnerBusinessId.ts) does not override correctness
// when picking what every future route will inherit through this wrapper.
//
// withErrorCapture itself is untouched above — existing callers get byte-identical behavior.
export interface BusinessContext {
  supabase: ReturnType<typeof createServerSupabaseClient>
  userId: string
  businessId: string
}

type BusinessRouteHandler = (req: any, context: any, biz: BusinessContext) => Promise<Response> | Response

export function withBusinessContext(
  routeName: string,
  handler: BusinessRouteHandler,
): RouteHandler {
  return withErrorCapture(routeName, async (req, context) => {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const businessId = await resolveOwnerBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'No business' }, { status: 400 })

    return handler(req, context, { supabase, userId: user.id, businessId })
  })
}

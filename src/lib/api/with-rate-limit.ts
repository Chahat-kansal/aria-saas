import { checkRateLimit, RateLimitTier } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export function withRateLimit(
  tier: RateLimitTier,
  handler: (req: Request, ctx?: unknown) => Promise<Response>,
) {
  return async (req: Request, ctx?: unknown) => {
    const id = req.headers.get('x-user-id') ?? req.headers.get('x-forwarded-for') ?? 'anon'
    const { ok, reset } = await checkRateLimit(tier, id)
    if (!ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } }
      )
    }
    return handler(req, ctx)
  }
}

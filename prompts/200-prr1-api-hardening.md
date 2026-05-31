# Prompt 200 — PRR-1: API Hardening

First phase of production readiness. Protect the wallet, prevent crashes from bad input,
standardise error responses. This is what Stripe/Twilio do before any public API.

## Pre-flight
```
git pull origin main
npx tsc --noEmit && npm run build
```
After EVERY commit: git push origin main, then git log origin/main..HEAD (must be empty).

## TASK 1 — Rate limiting (protects your Anthropic/Twilio/SendGrid bill)
Install: npm i @upstash/ratelimit @upstash/redis
(Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars — sign up free at upstash.com)

Create src/lib/rate-limit.ts:
```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

// Different limits for different cost tiers
export const limiters = {
  // Expensive AI endpoints — strict
  ai: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 h'), prefix: 'rl:ai' }),
  // SMS/email — very strict (real money per call)
  messaging: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 h'), prefix: 'rl:msg' }),
  // Normal API — generous
  standard: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, '1 m'), prefix: 'rl:std' }),
  // Public (unauthenticated) — by IP, strict
  public: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:pub' }),
}

export async function checkRateLimit(
  limiter: keyof typeof limiters,
  identifier: string,
): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const { success, remaining, reset } = await limiters[limiter].limit(identifier)
  return { ok: success, remaining, reset }
}
```

Create a wrapper src/lib/api/with-rate-limit.ts that wraps route handlers:
```typescript
import { checkRateLimit, limiters } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export function withRateLimit(
  tier: keyof typeof limiters,
  handler: (req: Request) => Promise<Response>,
) {
  return async (req: Request) => {
    // Identify by user id (from auth) or IP for public
    const id = req.headers.get('x-user-id') ?? req.headers.get('x-forwarded-for') ?? 'anon'
    const { ok, reset } = await checkRateLimit(tier, id)
    if (!ok) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)) } }
      )
    }
    return handler(req)
  }
}
```

Apply rate limiting to the cost-sensitive routes:
- AI tier: /api/aria/ask, /api/aria/business-brain, all routes calling Anthropic
- messaging tier: any route calling sendSMS, SendGrid
- public tier: all /api/public/* routes
- standard tier: everything else (apply broadly via a light touch)

Commit per group: "feat(api): rate limiting on [AI/messaging/public] endpoints"

## TASK 2 — Input validation with Zod
Install: npm i zod (likely already present)

Create src/lib/api/validate.ts:
```typescript
import { z } from 'zod'
import { NextResponse } from 'next/server'

export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  try {
    const body = await req.json()
    const result = schema.safeParse(body)
    if (!result.success) {
      return { error: NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      )}
    }
    return { data: result.data }
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  }
}
```

Apply to the highest-risk mutation routes (anything that writes to DB or triggers actions):
- All POST/PATCH routes that take a body
- Especially: price updates, customer creation, post creation, payment-related, messaging
Define a Zod schema per route matching expected input. Reject malformed input with 400.

Priority routes (do these first, then expand):
- /api/aria/ask, /api/community/posts, /api/community/upload-media
- /api/pos/products/* mutations, /api/customers/* mutations
- /api/integrations/* connect routes, any route calling sendSMS/SendGrid

Commit per area: "feat(api): Zod input validation on [area] mutations"

## TASK 3 — Standardised error contract
Create src/lib/api/errors.ts:
```typescript
import { NextResponse } from 'next/server'

export type ApiError = { error: string; code?: string; details?: unknown }

export const apiError = (message: string, status: number, code?: string, details?: unknown) =>
  NextResponse.json({ error: message, code, details } satisfies ApiError, { status })

export const errors = {
  unauthorized: () => apiError('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => apiError('Forbidden', 403, 'FORBIDDEN'),
  notFound: (what = 'Resource') => apiError(`${what} not found`, 404, 'NOT_FOUND'),
  badRequest: (msg = 'Bad request', details?: unknown) => apiError(msg, 400, 'BAD_REQUEST', details),
  rateLimit: () => apiError('Rate limit exceeded', 429, 'RATE_LIMIT'),
  server: (msg = 'Internal error') => apiError(msg, 500, 'INTERNAL'),
}
```

Sweep routes to use consistent error shapes (so the frontend can reliably parse errors).
Don't rewrite everything — apply to routes as you touch them in tasks 1-2.

Commit: "feat(api): standardised error response contract"

## PRR-1 EXIT CHECKLIST (must all be true to advance to PRR-2)
- [ ] Rate limiting live on all AI + messaging + public routes
- [ ] Upstash env vars set in Vercel
- [ ] Zod validation on all body-taking mutation routes
- [ ] Standard error contract applied to touched routes
- [ ] npx tsc --noEmit clean
- [ ] npm run build passes
- [ ] All commits pushed (git log origin/main..HEAD empty)
- [ ] Deploy is green on Vercel

Update PRODUCTION_READINESS.md: check off PRR-1. Then PRR-2 (prompt 201) is next.

## Rules
- One commit per logical group, push + verify after each
- Don't break existing routes — rate limit/validation are additive wrappers
- vercel.json: stay within function + cron limits

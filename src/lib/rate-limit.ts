import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const IS_PROD = process.env.NODE_ENV === 'production'

let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  } else if (IS_PROD) {
    console.error(
      '[rate-limit] FATAL: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in production. ' +
      'Rate limiting DISABLED on all money/PII routes — add env vars to Vercel immediately.',
    )
  } else {
    console.warn('[rate-limit] Upstash env vars not set — rate limiting disabled (dev fail-open)')
  }
} catch (e) {
  console.error('[rate-limit] Redis client init error:', e)
}

// One Ratelimit instance per unique {requests:window} pair — never allocate one per request
const limiterCache = new Map<string, Ratelimit>()

function getLimiter(requests: number, window: string): Ratelimit | null {
  if (!redis) return null
  const k = requests + ':' + window
  let rl = limiterCache.get(k)
  if (!rl) {
    rl = new Ratelimit({
      redis: redis as Redis,
      limiter: Ratelimit.slidingWindow(
        requests,
        window as Parameters<typeof Ratelimit.slidingWindow>[1],
      ),
      prefix: 'rl',
    })
    limiterCache.set(k, rl)
  }
  return rl
}

/**
 * Sliding-window rate limit check.
 * Key format: "{scope}:{tier}:{id}" — e.g. "cx-send:phone:+61412345678:bizId"
 * Window: Upstash Duration string — "15 m", "1 h", "1 d", "1 m", "30 s" etc.
 *
 * Fail-open  (ok: true)  when Redis not configured — dev / CI only.
 * Fail-CLOSED (ok: false) in production when Redis not configured — forces 429
 * so a missing env var can never silently strip rate limiting from prod.
 */
export async function limit(
  key: string,
  opts: { requests: number; window: string },
): Promise<{ ok: boolean; remaining: number; reset: number; retryAfter: number }> {
  const rl = getLimiter(opts.requests, opts.window)
  if (!rl) {
    if (IS_PROD) {
      console.error('[rate-limit] limit() called but Redis unavailable in production — returning 429 for key:', key)
      return { ok: false, remaining: 0, reset: 0, retryAfter: 60 }
    }
    return { ok: true, remaining: 999, reset: 0, retryAfter: 0 }
  }
  const { success, remaining, reset } = await rl.limit(key)
  return {
    ok: success,
    remaining,
    reset,
    retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
  }
}

// ── Named limiters — kept for backward compat (loyalty/auth, ai routes) ─────
function makeLimiter(window: Parameters<typeof Ratelimit.slidingWindow>[0], unit: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string) {
  if (!redis) return null
  return new Ratelimit({ redis: redis as Redis, limiter: Ratelimit.slidingWindow(window, unit), prefix })
}

export const limiters = {
  ai:        makeLimiter(20,  '1 h', 'rl:ai'),
  messaging: makeLimiter(10,  '1 h', 'rl:msg'),
  standard:  makeLimiter(100, '1 m', 'rl:std'),
  public:    makeLimiter(30,  '1 m', 'rl:pub'),
} as const

export type RateLimitTier = keyof typeof limiters

export async function checkRateLimit(
  tier: RateLimitTier,
  identifier: string,
): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const limiter = limiters[tier]
  if (!limiter) {
    // SECURITY-P1 (M-01) — this legacy path used to fail OPEN unconditionally, silently
    // disabling every ai/messaging/standard/public rate limit whenever Upstash env vars were
    // absent, including in production. Match limit()'s behavior above: fail closed in prod so a
    // missing env var can never silently strip rate limiting; fail open only in dev/CI.
    if (IS_PROD) {
      console.error('[rate-limit] checkRateLimit() called but Redis unavailable in production — returning not-ok for tier:', tier)
      return { ok: false, remaining: 0, reset: Date.now() + 60_000 }
    }
    return { ok: true, remaining: 999, reset: 0 }
  }
  const { success, remaining, reset } = await limiter.limit(identifier)
  return { ok: success, remaining, reset }
}
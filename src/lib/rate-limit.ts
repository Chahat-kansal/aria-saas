import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Guard: Redis.fromEnv() throws if UPSTASH_REDIS_REST_URL/TOKEN are missing.
// In dev or environments without Upstash, fall through (no limiting).
let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  }
} catch {
  // no-op: rate limiting disabled
}

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
  if (!limiter) return { ok: true, remaining: 999, reset: 0 }
  const { success, remaining, reset } = await limiter.limit(identifier)
  return { ok: success, remaining, reset }
}

interface Bucket { tokens: number; lastRefill: number }
const buckets = new Map<string, Bucket>()
const MAX_PER_MIN = Number(process.env.ARIA_RATE_LIMIT_PER_MIN) || 30
const REFILL_INTERVAL_MS = 60_000

export function tryConsume(businessId: string, tokens = 1): { allowed: boolean; remaining: number } {
  const now = Date.now()
  let bucket = buckets.get(businessId)
  if (!bucket) {
    bucket = { tokens: MAX_PER_MIN, lastRefill: now }
    buckets.set(businessId, bucket)
  }
  const elapsed = now - bucket.lastRefill
  if (elapsed >= REFILL_INTERVAL_MS) {
    bucket.tokens = MAX_PER_MIN
    bucket.lastRefill = now
  }
  if (bucket.tokens >= tokens) {
    bucket.tokens -= tokens
    return { allowed: true, remaining: bucket.tokens }
  }
  return { allowed: false, remaining: bucket.tokens }
}

// Cleanup cold buckets on Vercel instance reuse
if (typeof setInterval !== 'undefined') {
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of buckets) {
      if (now - v.lastRefill > 10 * 60_000) buckets.delete(k)
    }
  }, 60_000)
  if (typeof cleanup === 'object' && cleanup && 'unref' in cleanup) {
    (cleanup as { unref(): void }).unref()
  }
}

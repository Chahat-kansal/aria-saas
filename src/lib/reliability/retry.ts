import { logger } from '@/lib/observability/logger'

/**
 * General-purpose retry with exponential backoff.
 * Use for idempotent read/sync operations (Xero, Basiq, Square, review fetches).
 * DO NOT use for payments or SMS/email sends — those must use idempotency keys instead.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, label = 'op' } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        logger.warn(label + ' failed, retrying', { label, attempt, delay, error: e instanceof Error ? e.message : String(e) })
        await new Promise(r => setTimeout(r, delay))
      }
    }
  }
  logger.error(label + ' failed after all retries', { label, retries, error: lastErr instanceof Error ? lastErr.message : String(lastErr) })
  throw lastErr
}

import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/observability/logger'

interface RetryOptions {
  attempts?: number      // max attempts (default: 3)
  delayMs?: number       // initial delay between retries in ms (default: 2000)
  backoff?: boolean      // exponential backoff (default: true)
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Retry a function with exponential backoff.
 * Usage: await withRetry(() => someApiCall(), { attempts: 3, delayMs: 2000 })
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { attempts = 3, delayMs = 2000, backoff = true, onRetry } = options
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt === attempts) break

      const wait = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs
      console.warn(`[retry] Attempt ${attempt}/${attempts} failed: ${lastError.message}. Retrying in ${wait}ms...`)

      if (onRetry) onRetry(attempt, lastError)

      await new Promise(resolve => setTimeout(resolve, wait))
    }
  }

  // All attempts failed — capture in Sentry
  Sentry.captureException(lastError, { extra: { attempts } })
  throw lastError
}

/**
 * Wraps a cron handler with retry logic + structured logging.
 * Usage: export const GET = withCronRetry('daily-briefing', async (req) => { ... })
 */
export function withCronRetry(
  cronName: string,
  handler: (req: Request) => Promise<Response>,
  options: RetryOptions = {}
) {
  return async (req: Request): Promise<Response> => {
    const start = Date.now()
    Sentry.setTag('cron', cronName)
    Sentry.setTag('route', 'cron/' + cronName)
    logger.info('cron start', { route: 'cron/' + cronName })

    try {
      const result = await withRetry(() => handler(req), {
        attempts: 3,
        delayMs: 3000,
        backoff: true,
        onRetry: (attempt, err) => {
          console.warn(`[cron:${cronName}] Retry ${attempt}: ${err.message}`)
          Sentry.captureMessage(`[cron:${cronName}] Retry ${attempt}: ${err.message}`, 'warning')
        },
        ...options,
      })

      const duration = Date.now() - start
      logger.info('cron complete', { route: 'cron/' + cronName, ms: duration })
      return result
    } catch (err: unknown) {
      const duration = Date.now() - start
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('cron failed', { route: 'cron/' + cronName, error: error.message, ms: duration })
      Sentry.captureException(error, { tags: { cron: cronName }, extra: { duration } })
      return Response.json({ error: error.message, cron: cronName }, { status: 500 })
    }
  }
}

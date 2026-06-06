import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/observability/logger'

interface TrackOptions {
  metadata?: Record<string, unknown>
}

/**
 * Wraps cron handler logic with persistent run tracking in the cron_runs table.
 * Records start, completion, duration, rows_affected, and any failure.
 * Works alongside withCronRetry (which handles retries + Sentry capture).
 *
 * Usage:
 *   const result = await trackCron('my-cron', async (mark) => {
 *     // ... do work ...
 *     mark({ rowsAffected: 42, metadata: { businesses: 5 } })
 *     return result
 *   })
 */
export async function trackCron<T>(
  cronName: string,
  fn: (mark: (opts: { rowsAffected?: number; metadata?: Record<string, unknown> }) => void) => Promise<T>,
  options: TrackOptions = {},
): Promise<T> {
  const startedAt = new Date().toISOString()
  const start = Date.now()
  let runId: string | null = null
  let markedOpts: { rowsAffected?: number; metadata?: Record<string, unknown> } = {}

  try {
    const { data: run } = await supabaseAdmin
      .from('cron_runs')
      .insert({ cron_name: cronName, started_at: startedAt, status: 'running', metadata: options.metadata ?? null })
      .select('id')
      .maybeSingle()
    runId = run?.id ?? null
  } catch (e) {
    logger.warn('cron_runs insert failed', { route: 'cron/' + cronName, error: (e as Error).message })
  }

  try {
    const result = await fn((opts) => { markedOpts = opts })
    const durationMs = Date.now() - start

    if (runId) {
      await supabaseAdmin.from('cron_runs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        rows_affected: markedOpts.rowsAffected ?? null,
        metadata: markedOpts.metadata ? { ...(options.metadata ?? {}), ...markedOpts.metadata } : (options.metadata ?? null),
      }).eq('id', runId)
    }

    logger.info('cron_runs completed', { route: 'cron/' + cronName, ms: durationMs, rows: markedOpts.rowsAffected })
    return result
  } catch (e) {
    const durationMs = Date.now() - start
    const error = e instanceof Error ? e : new Error(String(e))

    if (runId) {
      try {
        await supabaseAdmin.from('cron_runs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          error: error.message,
        }).eq('id', runId)
      } catch (e) { console.error('[non-fatal]', e) }
    }

    logger.error('cron_runs failed', { route: 'cron/' + cronName, error: error.message, ms: durationMs })
    Sentry.captureException(error, { tags: { cron: cronName, operation: 'cron_run' }, extra: { durationMs } })
    throw error
  }
}

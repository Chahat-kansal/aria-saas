import { routeAndJudge } from './router'
import type { AgentKey, AriaInvokeResult } from './types'

export interface AriaInvokeOptions {
  productId?: string
  taskHint?: string
  includeWeather?: boolean
}

// Module-level in-flight dedup: concurrent calls for the same agent+business reuse one promise.
const _inflight = new Map<string, Promise<AriaInvokeResult>>()

// Per-business/day cache: stores last result per agent+business keyed by date string.
// Prevents redundant re-runs within the same calendar day (e.g. brain + live-intel running in parallel).
const _dayCache = new Map<string, { result: AriaInvokeResult; date: string }>()

/**
 * Public entry point for all Aria intelligence calls.
 * Returns a validated recommendation or null with a reason.
 * Deduplicates concurrent calls and caches per business per day.
 */
export async function ariaInvoke(
  agent: AgentKey,
  businessId: string,
  opts: AriaInvokeOptions = {},
): Promise<AriaInvokeResult> {
  const key = `${agent}:${businessId}`
  const today = new Date().toISOString().slice(0, 10)

  // Return cached result if same agent+business already ran today
  const cached = _dayCache.get(key)
  if (cached && cached.date === today && cached.result.recommendation) {
    return cached.result
  }

  // Return in-flight promise if already computing
  const inflight = _inflight.get(key)
  if (inflight) return inflight

  const promise = routeAndJudge(agent, businessId, opts)
    .then(result => {
      if (result.recommendation) _dayCache.set(key, { result, date: today })
      return result
    })
    .catch((e: unknown) => ({
      recommendation: null,
      reason: `Aria intelligence error: ${(e as Error).message ?? 'Unknown error'}`,
    } as AriaInvokeResult))
    .finally(() => { _inflight.delete(key) })

  _inflight.set(key, promise)
  return promise
}

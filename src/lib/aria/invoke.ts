import { routeAndJudge } from './router'
import type { AgentKey, AriaInvokeResult } from './types'

export interface AriaInvokeOptions {
  productId?: string
  taskHint?: string
  includeWeather?: boolean
}

/**
 * Public entry point for all Aria intelligence calls.
 * Returns a validated recommendation or null with a reason.
 */
export async function ariaInvoke(
  agent: AgentKey,
  businessId: string,
  opts: AriaInvokeOptions = {},
): Promise<AriaInvokeResult> {
  try {
    return await routeAndJudge(agent, businessId, opts)
  } catch (e) {
    return {
      recommendation: null,
      reason: `Aria intelligence error: ${(e as Error).message ?? 'Unknown error'}`,
    }
  }
}

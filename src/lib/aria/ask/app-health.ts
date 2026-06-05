export const runtime = 'nodejs'

export interface RouteHealth {
  name: string
  path: string
  status: 'ok' | 'error' | 'timeout' | 'unknown'
  httpStatus?: number
  ms: number
  note?: string
}

export interface SentryIssue {
  id: string
  title: string
  culprit: string
  level: string
  count: string
  lastSeen: string
  permalink: string
}

export interface AppHealthResult {
  route_health: RouteHealth[]
  broken_routes: RouteHealth[]
  all_routes_ok: boolean
  sentry_issues: SentryIssue[]
  sentry_note?: string
  checked_at: string
}

const CRITICAL_ROUTES: Array<{ name: string; path: string }> = [
  { name: 'POS terminal',          path: '/api/pos/products' },
  { name: 'Sales data',            path: '/api/pos/sales' },
  { name: 'Ask Aria',              path: '/api/aria/ask' },
  { name: 'Agent council',         path: '/api/agents/council/status' },
  { name: 'Dashboard overview',    path: '/api/aria/business-health-quick' },
  { name: 'Staff',                 path: '/api/staff' },
  { name: 'Inventory',             path: '/api/inventory' },
  { name: 'Deep health',           path: '/api/health/deep' },
]

async function pingRoute(baseUrl: string, route: { name: string; path: string }): Promise<RouteHealth> {
  const t = Date.now()
  const url = baseUrl + route.path
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
      headers: { 'x-aria-health-check': '1' },
    })
    const ms = Date.now() - t
    const httpStatus = res.status
    // 200 or 401 = reachable (auth blocks anonymous but route is up)
    if (httpStatus === 200 || httpStatus === 401 || httpStatus === 403) {
      return { name: route.name, path: route.path, status: 'ok', httpStatus, ms }
    }
    if (httpStatus >= 500) {
      return { name: route.name, path: route.path, status: 'error', httpStatus, ms, note: 'Server error ' + httpStatus }
    }
    return { name: route.name, path: route.path, status: 'unknown', httpStatus, ms }
  } catch (e: unknown) {
    const ms = Date.now() - t
    const msg = e instanceof Error ? e.message : String(e)
    const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('abort')
    return {
      name: route.name,
      path: route.path,
      status: isTimeout ? 'timeout' : 'error',
      ms,
      note: isTimeout ? 'Request timed out after 4s' : msg.slice(0, 100),
    }
  }
}

async function fetchSentryIssues(): Promise<{ issues: SentryIssue[]; note?: string }> {
  const token = process.env.SENTRY_AUTH_TOKEN
  const org = process.env.SENTRY_ORG

  if (!token || !org) {
    return {
      issues: [],
      note: 'SENTRY_AUTH_TOKEN or SENTRY_ORG not configured. Add these env vars to enable live error tracking.',
    }
  }

  try {
    const res = await fetch(
      'https://sentry.io/api/0/organizations/' + org + '/issues/?query=is:unresolved&environment=production&limit=5&sort=date',
      {
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(5000),
      },
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        issues: [],
        note: 'Sentry API returned ' + res.status + (text ? ': ' + text.slice(0, 120) : ''),
      }
    }

    const raw = await res.json() as Array<Record<string, unknown>>

    const issues: SentryIssue[] = raw.map(i => ({
      id:        String(i.id ?? ''),
      title:     String(i.title ?? i.culprit ?? 'Unknown error'),
      culprit:   String(i.culprit ?? ''),
      level:     String(i.level ?? 'error'),
      count:     String(i.count ?? '0'),
      lastSeen:  String(i.lastSeen ?? ''),
      permalink: String(i.permalink ?? ''),
    }))

    return { issues }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { issues: [], note: 'Sentry fetch failed: ' + msg.slice(0, 100) }
  }
}

export async function checkAppHealth(): Promise<AppHealthResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'

  // Ping all routes in parallel (independently — one failure must not crash others)
  const settledRoutes = await Promise.allSettled(
    CRITICAL_ROUTES.map(r => pingRoute(baseUrl, r)),
  )

  const route_health: RouteHealth[] = settledRoutes.map((result, i) => {
    if (result.status === 'fulfilled') return result.value
    return {
      name: CRITICAL_ROUTES[i].name,
      path: CRITICAL_ROUTES[i].path,
      status: 'error' as const,
      ms: 0,
      note: 'Internal ping error: ' + String(result.reason).slice(0, 80),
    }
  })

  const broken_routes = route_health.filter(r => r.status === 'error' || r.status === 'timeout')
  const all_routes_ok = broken_routes.length === 0

  const sentryResult = await fetchSentryIssues()

  return {
    route_health,
    broken_routes,
    all_routes_ok,
    sentry_issues: sentryResult.issues,
    sentry_note: sentryResult.note,
    checked_at: new Date().toISOString(),
  }
}

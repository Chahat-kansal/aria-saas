export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkAppHealth } from '@/lib/aria/ask/app-health'
import type { AppHealthResult } from '@/lib/aria/ask/app-health'

export async function GET(): Promise<Response> {
  // Auth check — non-fatal if no user (ask route has its own auth)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json(
      {
        route_health: [],
        broken_routes: [],
        all_routes_ok: true,
        sentry_issues: [],
        sentry_note: 'Not authenticated',
        checked_at: new Date().toISOString(),
      } satisfies AppHealthResult,
      { status: 401 },
    )
  }

  const result = await checkAppHealth()
  return Response.json(result, { status: 200 })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { resolveAutonomy, isPersistable, MODE_EXPLANATION, COPILOT_PARK_REASON } from '@/lib/aria/autonomy'

/**
 * MS16 PHASE 3 — read and write the REAL autonomy setting (agent_settings.mode).
 *
 * Tenant comes from the rail (MS13), never the client. Co-pilot is refused with its reason rather
 * than silently coerced — see src/lib/aria/autonomy.ts for the DDL that would unpark it.
 */
async function _GET(_req: Request, _ctx: unknown, { businessId }: BusinessContext) {
  const { data, error } = await supabaseAdmin
    .from('agent_settings')
    .select('agent_type, mode, enabled')
    .eq('business_id', businessId)

  if (error) {
    console.error('[aria/autonomy] read failed:', error.message)
    // Never guess a mode — say the setting is unreadable and let the UI show that.
    return NextResponse.json({ error: 'unreadable', copilot_parked: COPILOT_PARK_REASON }, { status: 503 })
  }

  const state = resolveAutonomy(data as Array<{ agent_type: string; mode: string | null; enabled: boolean | null }>)
  return NextResponse.json({ ...state, explanations: MODE_EXPLANATION, copilot_parked: COPILOT_PARK_REASON })
}

async function _POST(req: Request, _ctx: unknown, { businessId }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { mode?: string }
  const mode = String(body.mode ?? '')

  if (!isPersistable(mode)) {
    return NextResponse.json(
      { error: 'not_persistable', mode, reason: COPILOT_PARK_REASON },
      { status: 400 },
    )
  }

  // Apply to every agent this business has settings for — the control is per-business.
  const { error } = await supabaseAdmin
    .from('agent_settings')
    .update({ mode, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)

  if (error) {
    console.error('[aria/autonomy] write failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data } = await supabaseAdmin
    .from('agent_settings')
    .select('agent_type, mode, enabled')
    .eq('business_id', businessId)

  return NextResponse.json(resolveAutonomy(data as Array<{ agent_type: string; mode: string | null; enabled: boolean | null }>))
}

export const GET = withBusinessContext('aria/autonomy:get', _GET)
export const POST = withBusinessContext('aria/autonomy:post', _POST)
